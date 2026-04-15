"""
Local config stored at ~/.clave/config.json.

user_id is the Cognito sub, set automatically on `clave login`.
AWS resource names are pre-populated with single-tenant defaults.
"""
import json
from pathlib import Path
from typing import Optional

CONFIG_PATH = Path.home() / ".clave" / "config.json"

_DEFAULTS: dict = {
    "user_id": None,
    "region": "us-east-1",
    "bucket": None,
    "projects_table": "clave-projects",
    "snapshots_table": "clave-snapshots",
    "projects": {},
}


def load() -> dict:
    """Load config from disk, merging with defaults."""
    if CONFIG_PATH.exists():
        with open(CONFIG_PATH) as f:
            saved = json.load(f)
    else:
        saved = {}

    return {**_DEFAULTS, **saved}


def save(updates: dict):
    """Merge updates into the existing config and persist."""
    cfg = load()
    cfg.update(updates)
    _write(cfg)


def get_project_id(cfg: dict, flp_path: str) -> Optional[str]:
    return cfg.get("projects", {}).get(flp_path)


def register_project(flp_path: str, project_id: str):
    """Persist a local flp_path → project_id mapping."""
    cfg = load()
    cfg.setdefault("projects", {})[flp_path] = project_id
    _write(cfg)


def _write(cfg: dict):
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(CONFIG_PATH, "w") as f:
        json.dump(cfg, f, indent=2)
