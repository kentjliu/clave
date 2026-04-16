"""
FL Studio render → 90-second MP3 preview pipeline.

Runs in a daemon thread after each successful snapshot upload.
All errors are caught and logged; nothing ever propagates to the caller.
"""
import glob
import logging
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from urllib.parse import quote

import requests

log = logging.getLogger(__name__)

# Render output dir (confirmed by user)
RENDER_DIR = os.path.expanduser(
    "~/Documents/Image-Line/FL Studio/Audio/Rendered"
)
PREVIEW_DURATION = 90   # seconds of audio to keep
RENDER_TIMEOUT   = 300  # give FL Studio up to 5 min


def _find_fl_studio() -> str | None:
    """Return the path to the FL Studio binary for whichever version is installed."""
    for version in range(25, 19, -1):
        path = f"/Applications/FL Studio {version}.app/Contents/MacOS/FL Studio"
        if os.path.exists(path):
            return path
    return None


def _wait_for_new_wav(before: set[str], deadline: float) -> str | None:
    """
    Poll RENDER_DIR until a WAV that wasn't there before appears,
    or deadline (monotonic) passes.
    """
    while time.monotonic() < deadline:
        after = set(glob.glob(os.path.join(RENDER_DIR, "*.wav")))
        new = after - before
        if new:
            return max(new, key=os.path.getmtime)
        time.sleep(1)
    return None


def render_preview(
    flp_path: Path,
    token: str,
    project_id: str,
    timestamp: str,
    api_base: str,
) -> None:
    """
    Full pipeline:
      1. PATCH status=rendering
      2. FL Studio CLI render → WAV
      3. ffmpeg: WAV → 90-second MP3
      4. POST /audio/upload → presigned S3 URL
      5. PUT MP3 → S3
      6. PATCH status=done (or failed on any error)

    Safe to call from a daemon thread.
    """
    encoded_ts = quote(timestamp, safe="")
    audio_base  = f"{api_base}/api/agent/snapshots/{encoded_ts}/audio"
    headers     = {"Authorization": f"Bearer {token}"}

    def set_status(status: str, s3_key: str | None = None) -> None:
        body: dict = {"project_id": project_id, "status": status}
        if s3_key:
            body["s3_key"] = s3_key
        try:
            requests.patch(audio_base, json=body, headers=headers, timeout=10)
        except Exception as exc:
            log.warning(f"[render] PATCH status={status} failed: {exc}")

    try:
        set_status("rendering")

        fl = _find_fl_studio()
        if not fl:
            log.warning("[render] FL Studio not found — skipping audio preview")
            set_status("failed")
            return

        if not shutil.which("ffmpeg"):
            log.warning("[render] ffmpeg not found — skipping audio preview")
            set_status("failed")
            return

        # ── Run FL Studio render ──────────────────────────────────────────────

        os.makedirs(RENDER_DIR, exist_ok=True)
        before   = set(glob.glob(os.path.join(RENDER_DIR, "*.wav")))
        deadline = time.monotonic() + RENDER_TIMEOUT

        log.info(f"[render] Rendering {flp_path.name}…")
        try:
            subprocess.run(
                [fl, "/R", str(flp_path)],
                timeout=RENDER_TIMEOUT,
                capture_output=True,
            )
        except subprocess.TimeoutExpired:
            log.error("[render] FL Studio render timed out")
            set_status("failed")
            return
        except Exception as exc:
            log.error(f"[render] FL Studio exited with error: {exc}")
            set_status("failed")
            return

        wav_path = _wait_for_new_wav(before, deadline)
        if not wav_path:
            log.error("[render] No new WAV appeared after render")
            set_status("failed")
            return

        log.info(f"[render] WAV ready: {wav_path}")

        # ── ffmpeg: WAV → 90-second MP3 ──────────────────────────────────────

        tmp_fd, mp3_path = tempfile.mkstemp(suffix=".mp3")
        os.close(tmp_fd)

        try:
            result = subprocess.run(
                [
                    "ffmpeg", "-y",
                    "-i", wav_path,
                    "-t", str(PREVIEW_DURATION),
                    "-codec:a", "libmp3lame",
                    "-b:a", "128k",
                    "-ar", "44100",
                    mp3_path,
                ],
                capture_output=True,
                timeout=120,
            )
            if result.returncode != 0:
                log.error(f"[render] ffmpeg failed:\n{result.stderr.decode()}")
                set_status("failed")
                return
        except Exception as exc:
            log.error(f"[render] ffmpeg error: {exc}")
            set_status("failed")
            return

        log.info(f"[render] MP3 preview created ({PREVIEW_DURATION}s)")

        # ── Get presigned upload URL ──────────────────────────────────────────

        try:
            r = requests.post(
                f"{audio_base}/upload",
                json={"project_id": project_id},
                headers=headers,
                timeout=15,
            )
            r.raise_for_status()
            data      = r.json()
            upload_url = data["upload_url"]
            s3_key     = data["s3_key"]
        except Exception as exc:
            log.error(f"[render] Could not get upload URL: {exc}")
            set_status("failed")
            return

        # ── Upload MP3 to S3 ─────────────────────────────────────────────────

        try:
            with open(mp3_path, "rb") as f:
                put = requests.put(
                    upload_url, data=f,
                    headers={"Content-Type": "audio/mpeg"},
                    timeout=120,
                )
            put.raise_for_status()
        except Exception as exc:
            log.error(f"[render] S3 upload failed: {exc}")
            set_status("failed")
            return
        finally:
            try:
                os.unlink(mp3_path)
            except OSError:
                pass

        # ── Mark done ────────────────────────────────────────────────────────

        set_status("done", s3_key=s3_key)
        log.info(f"[render] Audio preview ready for {flp_path.name}")

    except Exception as exc:
        log.error(f"[render] Unexpected error: {exc}", exc_info=True)
        set_status("failed")
