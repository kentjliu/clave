"""
Snapshot helpers.

Local responsibilities: stability check + hash computation.
The actual file copy now lives in storage.py (S3 upload).
"""
import hashlib
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional


def file_hash(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def wait_stable(path: Path, attempts: int = 5, interval: float = 0.1) -> bool:
    """
    Return True once the file size is stable across two consecutive reads.
    Guards against reading mid-write when FL Studio does atomic rename-on-save.
    """
    for _ in range(attempts):
        try:
            s1 = path.stat().st_size
            time.sleep(interval)
            s2 = path.stat().st_size
            if s1 == s2 and s1 > 0:
                return True
        except FileNotFoundError:
            time.sleep(interval)
    return False


def compute(flp_path: Path, previous_hash: Optional[str] = None) -> Optional[dict]:
    """
    Compute hash and file size for flp_path.

    Returns a dict with timestamp, hash, and file_size,
    or None if the file is unstable or hash matches previous_hash (no change).
    """
    if not wait_stable(flp_path):
        return None

    try:
        hash_ = file_hash(flp_path)
        file_size = flp_path.stat().st_size
    except FileNotFoundError:
        return None

    if previous_hash and hash_ == previous_hash:
        return None

    return {
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S"),
        "hash": hash_,
        "file_size": file_size,
    }
