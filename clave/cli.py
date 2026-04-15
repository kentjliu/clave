import logging
import sys
import tempfile
import uuid
from pathlib import Path
from typing import Optional

import click

from . import auth, config, parser, registry, retention, snapshot, storage

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

_LOCK_SUBPATH = ".clave/watch.lock"


# ── Lock helpers ──────────────────────────────────────────────────────────────

def _lockfile(flp_path: Path) -> Path:
    return flp_path.parent / _LOCK_SUBPATH


def _acquire_lock(flp_path: Path):
    lf = _lockfile(flp_path)
    lf.parent.mkdir(parents=True, exist_ok=True)
    lf.write_text(str(flp_path))


def _release_lock(flp_path: Path):
    lf = _lockfile(flp_path)
    if lf.exists():
        lf.unlink()


def _is_locked(flp_path: Path) -> bool:
    return _lockfile(flp_path).exists()


# ── Auth guard ────────────────────────────────────────────────────────────────

def _require_login(cfg: dict):
    if not cfg.get("user_id") or not cfg.get("access_token"):
        click.echo(
            "Error: not logged in.\nRun `clave login` to authenticate.",
            err=True,
        )
        sys.exit(1)

    if not cfg.get("bucket"):
        click.echo(
            "Error: no S3 bucket configured.\n"
            "Run `clave configure --bucket <name>` with the value from `cdk deploy` output.",
            err=True,
        )
        sys.exit(1)


# ── Change handler ────────────────────────────────────────────────────────────

def _on_change(flp_path: Path, project_id: str, cfg: dict):
    log.info(f"Change detected: {flp_path.name}")

    region = cfg["region"]
    snapshots_table = cfg["snapshots_table"]

    latest = registry.get_latest_snapshot(project_id, snapshots_table, region)
    previous_hash = latest["hash"] if latest else None

    snap = snapshot.compute(flp_path, previous_hash=previous_hash)
    if snap is None:
        log.info("Skipped — file unchanged or still being written.")
        return

    meta = parser.extract_metadata(flp_path)

    s3_key = storage.s3_key(cfg["user_id"], project_id, snap["hash"])

    # Write to DynamoDB first so the Lambda has a record to update when S3
    # fires the event notification.
    inserted = registry.insert_snapshot(
        project_id=project_id,
        timestamp=snap["timestamp"],
        user_id=cfg["user_id"],
        hash_=snap["hash"],
        file_size=snap["file_size"],
        s3_key=s3_key,
        metadata=meta,
        table_name=snapshots_table,
        region=region,
    )

    if not inserted:
        log.info("Duplicate timestamp — skipping.")
        return

    # Upload triggers the Lambda summarizer.
    storage.upload(flp_path, cfg["bucket"], s3_key, region)

    retention.apply(
        project_id=project_id,
        user_id=cfg["user_id"],
        bucket=cfg["bucket"],
        registry=registry,
        storage=storage,
        cfg=cfg,
    )

    log.info(f"Snapshot uploaded [{snap['hash'][:12]}] ({snap['file_size']:,} bytes)")


# ── CLI ───────────────────────────────────────────────────────────────────────

@click.group()
def main():
    """Clave — lightweight version control for FL Studio projects."""


@main.command()
@click.option("--email", prompt=True, help="Your Clave account email.")
@click.option(
    "--password", prompt=True, hide_input=True, help="Your Clave account password."
)
def login(email: str, password: str):
    """Log in to your Clave account."""
    try:
        cfg = auth.login(email, password)
    except ValueError as e:
        click.echo(f"Error: {e}", err=True)
        sys.exit(1)

    click.echo(f"Logged in as {email}  (user_id: {cfg['user_id']})")


@main.command()
def logout():
    """Log out and clear stored credentials."""
    if not auth.is_logged_in():
        click.echo("Not logged in.")
        return
    auth.logout()
    click.echo("Logged out.")


@main.command()
@click.option("--bucket", default=None, help="S3 bucket name (from cdk deploy output).")
@click.option("--region", default=None, help="AWS region.")
@click.option("--projects-table", default=None, help="DynamoDB projects table name.")
@click.option("--snapshots-table", default=None, help="DynamoDB snapshots table name.")
def configure(bucket, region, projects_table, snapshots_table):
    """Show or update AWS resource configuration."""
    updates: dict = {}
    if bucket:
        updates["bucket"] = bucket
    if region:
        updates["region"] = region
    if projects_table:
        updates["projects_table"] = projects_table
    if snapshots_table:
        updates["snapshots_table"] = snapshots_table

    if not updates:
        cfg = config.load()
        email = cfg.get("email") or "(not logged in)"
        click.echo(f"email          : {email}")
        click.echo(f"user_id        : {cfg.get('user_id') or '(not set — run clave login)'}")
        click.echo(f"bucket         : {cfg.get('bucket') or '(not set)'}")
        click.echo(f"region         : {cfg.get('region')}")
        click.echo(f"projects_table : {cfg.get('projects_table')}")
        click.echo(f"snapshots_table: {cfg.get('snapshots_table')}")
        return

    config.save(updates)
    click.echo("Configuration saved.")


@main.command()
@click.argument("flp_path", type=click.Path(exists=True, path_type=Path))
def watch(flp_path: Path):
    """Watch an .flp file and snapshot on every save."""
    from . import watcher as watcher_mod

    flp_path = flp_path.resolve()
    if flp_path.suffix.lower() != ".flp":
        click.echo("Error: path must point to a .flp file.", err=True)
        sys.exit(1)

    cfg = config.load()
    _require_login(cfg)

    if _is_locked(flp_path):
        click.echo(
            f"A watch session appears to be active.\n  Lock: {_lockfile(flp_path)}\n"
            "Stop it before starting a new one.",
            err=True,
        )
        sys.exit(1)

    flp_str = str(flp_path)
    project_id = config.get_project_id(cfg, flp_str) or str(uuid.uuid4())
    config.register_project(flp_str, project_id)

    registry.upsert_project(
        user_id=cfg["user_id"],
        project_id=project_id,
        name=flp_path.stem,
        flp_path=flp_str,
        s3_prefix=f"{cfg['user_id']}/{project_id}/",
        table_name=cfg["projects_table"],
        region=cfg["region"],
    )

    _acquire_lock(flp_path)
    click.echo(f"Watching : {flp_path}")
    click.echo(f"Project  : {project_id}")
    click.echo(f"Account  : {cfg.get('email')}")
    click.echo("Press Ctrl+C to stop.")

    try:
        watcher_mod.watch(flp_path, lambda p: _on_change(p, project_id, cfg))
    finally:
        _release_lock(flp_path)


@main.command("log")
@click.argument("flp_path", type=click.Path(path_type=Path), required=False)
@click.option("--limit", default=20, show_default=True, help="Max snapshots to display.")
def log_cmd(flp_path: Optional[Path], limit: int):
    """List recent snapshots. Optionally filter to a specific .flp file."""
    cfg = config.load()
    _require_login(cfg)

    if flp_path:
        project_id = config.get_project_id(cfg, str(flp_path.resolve()))
        if not project_id:
            click.echo("No snapshots found for that file.", err=True)
            sys.exit(1)
        project_ids = [(flp_path.stem, project_id, str(flp_path.resolve()))]
    else:
        projects = registry.list_projects(cfg["user_id"], cfg["projects_table"], cfg["region"])
        if not projects:
            click.echo("No projects tracked yet.")
            return
        project_ids = [(p["name"], p["project_id"], p["flp_path"]) for p in projects]

    for name, project_id, path_str in project_ids:
        snaps = registry.get_snapshots(project_id, cfg["snapshots_table"], cfg["region"], limit=limit)
        click.echo(f"\n{name}  ({path_str})")
        click.echo("─" * 70)
        if not snaps:
            click.echo("  No snapshots yet.")
            continue
        for snap in snaps:
            status = snap.get("summary_status", "?")
            summary = snap.get("summary") or f"({status})"
            size_kb = int(snap.get("file_size", 0)) // 1024
            ts = snap["timestamp"]
            short_hash = snap["hash"][:12]
            click.echo(f"  {ts}  {short_hash}  {size_kb:>6} KB  {summary}")


@main.command()
@click.argument("flp_path", type=click.Path(exists=True, path_type=Path))
@click.argument("timestamp")
@click.option("--yes", "-y", is_flag=True, help="Skip confirmation prompt.")
def restore(flp_path: Path, timestamp: str, yes: bool):
    """
    Restore a snapshot over the active .flp file.

    TIMESTAMP is shown in `clave log` output (e.g. 2026-04-14T14-32-10).
    """
    flp_path = flp_path.resolve()
    cfg = config.load()
    _require_login(cfg)

    if _is_locked(flp_path):
        click.echo(
            "A watch session is active. Stop it before restoring.", err=True
        )
        sys.exit(1)

    project_id = config.get_project_id(cfg, str(flp_path))
    if not project_id:
        click.echo("No snapshots found for that file.", err=True)
        sys.exit(1)

    snap = registry.get_snapshot_by_timestamp(
        project_id, timestamp, cfg["snapshots_table"], cfg["region"]
    )
    if not snap:
        click.echo(f"No snapshot found for timestamp: {timestamp}", err=True)
        sys.exit(1)

    if not yes:
        click.confirm(
            f"Restore snapshot {timestamp} over {flp_path.name}?", abort=True
        )

    with tempfile.NamedTemporaryFile(suffix=".flp", delete=False) as tmp:
        tmp_path = Path(tmp.name)

    try:
        storage.download(cfg["bucket"], snap["s3_key"], tmp_path, cfg["region"])
        tmp_path.replace(flp_path)
    except Exception:
        tmp_path.unlink(missing_ok=True)
        raise

    click.echo(f"Restored {timestamp} → {flp_path}")


@main.command()
def projects():
    """List all tracked projects."""
    cfg = config.load()
    _require_login(cfg)
    all_projects = registry.list_projects(cfg["user_id"], cfg["projects_table"], cfg["region"])
    if not all_projects:
        click.echo("No projects tracked yet.")
        return
    for p in all_projects:
        click.echo(f"  {p['name']:30s}  {p['project_id']}  {p['flp_path']}")
