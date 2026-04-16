"""
Clave background agent.

Polls the web API for the list of files to watch, then snapshots them on
every save — no local configuration required beyond a login token.
"""
import hashlib
import logging
import threading
import time
from pathlib import Path
from typing import Callable

import requests
from watchdog.events import FileSystemEventHandler, FileSystemEvent
from watchdog.observers import Observer

from . import auth, config, parser, renderer

log = logging.getLogger(__name__)

API_BASE = "https://d5c6dw9mu45ok.cloudfront.net"
POLL_INTERVAL = 30  # seconds between watch-list refreshes
DEBOUNCE = 0.8      # seconds to wait for file to stabilise after a change


# ── HTTP helpers ──────────────────────────────────────────────────────────────

def _headers() -> dict:
    token = auth.get_access_token()
    if not token:
        raise RuntimeError("Not logged in. Run `clave login` first.")
    return {"Authorization": f"Bearer {token}"}


def _get(path: str) -> dict:
    r = requests.get(f"{API_BASE}{path}", headers=_headers(), timeout=15)
    r.raise_for_status()
    return r.json()


def _post(path: str, body: dict) -> dict:
    r = requests.post(f"{API_BASE}{path}", json=body, headers=_headers(), timeout=15)
    r.raise_for_status()
    return r.json()


# ── Snapshot logic ────────────────────────────────────────────────────────────

def _hash_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _upload(url: str, path: Path) -> None:
    with open(path, "rb") as f:
        r = requests.put(url, data=f, headers={"Content-Type": "application/octet-stream"}, timeout=120)
    r.raise_for_status()


def _on_change(flp_path: Path, project_id: str, prev_hash: list[str | None]) -> None:
    """Called from the watchdog thread when a file changes."""
    time.sleep(DEBOUNCE)

    if not flp_path.exists():
        return

    try:
        current_hash = _hash_file(flp_path)
    except OSError:
        return

    if current_hash == prev_hash[0]:
        log.info(f"[{flp_path.name}] Unchanged — skipping.")
        return

    prev_hash[0] = current_hash
    file_size = flp_path.stat().st_size
    metadata = parser.extract_metadata(flp_path)

    log.info(f"[{flp_path.name}] Change detected — uploading…")

    try:
        result = _post("/api/agent/snapshots", {
            "project_id": project_id,
            "hash": current_hash,
            "file_size": file_size,
            "metadata": metadata,
        })
        _upload(result["upload_url"], flp_path)
        log.info(f"[{flp_path.name}] Snapshot uploaded [{current_hash[:12]}]")

        # Kick off audio render in background — never blocks the watcher.
        timestamp = result.get("timestamp")
        token = auth.get_access_token()
        if timestamp and token:
            t = threading.Thread(
                target=renderer.render_preview,
                args=(flp_path, token, project_id, timestamp, API_BASE),
                daemon=True,
            )
            t.start()

    except Exception as e:
        log.error(f"[{flp_path.name}] Upload failed: {e}")


# ── Watchdog handler ──────────────────────────────────────────────────────────

class _FlpHandler(FileSystemEventHandler):
    """Watches a directory and fires a callback when the target .flp changes."""

    def __init__(self, flp_path: Path, callback: Callable):
        self._target = str(flp_path)
        self._callback = callback
        self._timer: threading.Timer | None = None
        self._lock = threading.Lock()

    def _matches(self, event: FileSystemEvent) -> bool:
        return not event.is_directory and (
            event.src_path == self._target
            or getattr(event, "dest_path", "") == self._target
        )

    def _schedule(self):
        with self._lock:
            if self._timer:
                self._timer.cancel()
            self._timer = threading.Timer(DEBOUNCE, self._callback)
            self._timer.daemon = True
            self._timer.start()

    def on_modified(self, event):
        if self._matches(event):
            self._schedule()

    def on_created(self, event):
        if self._matches(event):
            self._schedule()

    def on_moved(self, event):
        if self._matches(event):
            self._schedule()


# ── Agent ─────────────────────────────────────────────────────────────────────

class Agent:
    def __init__(self):
        self._observer = Observer()
        self._observer.start()
        # project_id -> (watch_path, prev_hash, watchdog_watch)
        self._watched: dict[str, tuple[str, list[str | None], object]] = {}
        self._lock = threading.Lock()

    def run(self):
        log.info("Clave agent started.")
        try:
            while True:
                self._sync_watch_list()
                time.sleep(POLL_INTERVAL)
        except KeyboardInterrupt:
            pass
        finally:
            self._observer.stop()
            self._observer.join()
            log.info("Clave agent stopped.")

    def _sync_watch_list(self):
        try:
            files = _get("/api/agent/watched-files")
        except Exception as e:
            log.warning(f"Could not fetch watch list: {e}")
            return

        desired = {f["project_id"]: f["watch_path"] for f in files}

        with self._lock:
            # Remove entries no longer in the list.
            for pid in list(self._watched):
                if pid not in desired:
                    _, _, watch = self._watched.pop(pid)
                    self._observer.unschedule(watch)
                    log.info(f"Stopped watching project {pid}")

            # Add new entries.
            for pid, path_str in desired.items():
                if pid in self._watched:
                    continue
                flp_path = Path(path_str)
                if not flp_path.exists():
                    log.warning(f"Path not found, skipping: {path_str}")
                    continue

                prev_hash: list[str | None] = [None]
                handler = _FlpHandler(
                    flp_path,
                    lambda p=flp_path, pid=pid, h=prev_hash: _on_change(p, pid, h),
                )
                watch = self._observer.schedule(handler, str(flp_path.parent), recursive=False)
                self._watched[pid] = (path_str, prev_hash, watch)
                log.info(f"Watching {path_str}")


def run():
    """Entry point called by `clave start`."""
    Agent().run()
