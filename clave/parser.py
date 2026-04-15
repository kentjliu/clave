import logging
from pathlib import Path
from typing import Any, Optional

log = logging.getLogger(__name__)


def _import_pyflp() -> Optional[Any]:
    """
    Lazy-import pyflp inside a function so that an import-time crash (known
    Python 3.12 Enum bug in pyflp 2.2.1) never kills the watcher process.
    """
    try:
        import pyflp
        return pyflp
    except Exception as e:
        log.warning(f"pyflp unavailable: {e}")
        return None


def extract_metadata(flp_path: Path) -> dict:
    """
    Extract structured metadata from a .flp file.

    Every field is wrapped in its own try/except because pyflp raises domain
    exceptions (e.g. NoModelsFound, ChannelNotFound) on empty collections
    rather than returning an empty list — so a single top-level catch is not
    sufficient.

    Returns a dict; always includes at least {"parse_error": ...} on failure.
    """
    pyflp = _import_pyflp()
    if pyflp is None:
        return {"parse_error": "pyflp not available"}

    try:
        project = pyflp.parse(str(flp_path))
    except Exception as e:
        log.warning(f"pyflp failed to parse {flp_path.name}: {e}")
        return {"parse_error": str(e)}

    meta: dict = {}

    try:
        meta["tempo"] = float(project.tempo)
    except Exception:
        pass

    try:
        channels = list(project.channels)
        meta["channel_count"] = len(channels)
        meta["channel_names"] = [
            c.name for c in channels if hasattr(c, "name") and c.name
        ]
    except Exception:
        pass

    try:
        patterns = list(project.patterns)
        meta["pattern_count"] = len(patterns)
        meta["pattern_names"] = [
            p.name for p in patterns if hasattr(p, "name") and p.name
        ]
    except Exception:
        pass

    try:
        markers = list(project.timemarkers)
        meta["marker_count"] = len(markers)
        meta["markers"] = [
            m.name for m in markers if hasattr(m, "name") and m.name
        ]
    except Exception:
        pass

    return meta
