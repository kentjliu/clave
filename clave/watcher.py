import logging
import time
from pathlib import Path
from typing import Callable

from watchdog.events import FileSystemEventHandler, FileSystemEvent
from watchdog.observers import Observer

log = logging.getLogger(__name__)

_DEBOUNCE = 0.8  # seconds


class _FLPHandler(FileSystemEventHandler):
    def __init__(
        self,
        flp_path: Path,
        on_change: Callable[[Path], None],
        start_epoch: float,
    ):
        self._flp = flp_path.resolve()
        self._on_change = on_change
        self._start_epoch = start_epoch  # wall-clock time when the watcher started
        self._last_trigger = 0.0

    def _matches(self, path: str) -> bool:
        return Path(path).resolve() == self._flp

    def _handle(self, path: str):
        now = time.monotonic()
        if now - self._last_trigger < _DEBOUNCE:
            return  # still within debounce window

        # macOS FSEvents can replay up to ~30 s of history on observer start.
        # Discard events whose file mtime pre-dates our start time.
        try:
            mtime = Path(path).stat().st_mtime
        except FileNotFoundError:
            return
        if mtime < self._start_epoch:
            return

        self._last_trigger = now
        time.sleep(_DEBOUNCE)  # let FL Studio finish its atomic rename-and-write

        try:
            self._on_change(self._flp)
        except Exception:
            log.exception("Error handling .flp change")

    def on_modified(self, event: FileSystemEvent):
        if not event.is_directory and self._matches(event.src_path):
            self._handle(event.src_path)

    def on_created(self, event: FileSystemEvent):
        # Some OS/watchdog backends emit Created instead of Modified.
        if not event.is_directory and self._matches(event.src_path):
            self._handle(event.src_path)

    def on_moved(self, event: FileSystemEvent):
        # FL Studio (and most DAWs) write to a temp file then atomically rename
        # it over the original — this shows up as a Moved event with dest_path
        # equal to the target .flp.
        if not event.is_directory and self._matches(event.dest_path):
            self._handle(event.dest_path)


def watch(flp_path: Path, on_change: Callable[[Path], None]) -> None:
    """
    Block and watch flp_path for changes, calling on_change(path) on each save.

    Watches the parent *directory* (watchdog's API requires a directory) and
    filters events by filename. Handles on_modified, on_created, and on_moved
    to cover the full range of save strategies used by FL Studio.
    """
    start_epoch = time.time()
    handler = _FLPHandler(flp_path, on_change, start_epoch)
    observer = Observer()
    observer.schedule(handler, str(flp_path.parent), recursive=False)
    observer.start()
    log.info(f"Watching {flp_path}")

    try:
        while observer.is_alive():
            observer.join(timeout=1)
    except KeyboardInterrupt:
        pass
    finally:
        observer.stop()
        observer.join()
