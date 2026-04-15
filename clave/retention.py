"""
Retention policy applied per-project on each new snapshot.

  - Keep ALL snapshots from the last 7 days
  - Keep the LATEST snapshot per hour for days 7–30
  - Keep the LATEST snapshot per day for snapshots older than 30 days

"Latest per bucket" preserves the most-developed state in each window.
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

log = logging.getLogger(__name__)

_KEEP_ALL_DAYS = 7
_KEEP_HOURLY_DAYS = 30


def _parse_ts(ts: str) -> datetime:
    for fmt in ("%Y-%m-%dT%H-%M-%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%S%z"):
        try:
            dt = datetime.strptime(ts, fmt)
            return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt
        except ValueError:
            continue
    dt = datetime.fromisoformat(ts)
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def apply(
    project_id: str,
    user_id: str,
    bucket: str,
    registry: Any,
    storage: Any,
    cfg: dict,
) -> None:
    """Prune snapshots outside the retention window from DynamoDB and S3."""
    region = cfg["region"]
    snapshots_table = cfg["snapshots_table"]

    snapshots = registry.get_all_snapshots_asc(project_id, snapshots_table, region)
    if len(snapshots) <= 1:
        return

    now = datetime.now(timezone.utc)
    cutoff_all = now - timedelta(days=_KEEP_ALL_DAYS)
    cutoff_hourly = now - timedelta(days=_KEEP_HOURLY_DAYS)

    # Build keep-set. Iterating ascending means later snapshots overwrite
    # earlier ones in each bucket — so only the latest per bucket is kept.
    keep_ids: set[str] = set()  # composite "project_id#timestamp"
    hourly: dict[str, str] = {}
    daily: dict[str, str] = {}

    def _id(row: dict) -> str:
        return f"{row['project_id']}#{row['timestamp']}"

    for row in snapshots:
        ts = _parse_ts(row["timestamp"])
        rid = _id(row)

        if ts >= cutoff_all:
            keep_ids.add(rid)
        elif ts >= cutoff_hourly:
            hourly[ts.strftime("%Y-%m-%dT%H")] = rid
        else:
            daily[ts.strftime("%Y-%m-%d")] = rid

    keep_ids |= set(hourly.values())
    keep_ids |= set(daily.values())

    for row in snapshots:
        if _id(row) in keep_ids:
            continue
        try:
            storage.delete_object(bucket, row["s3_key"], region)
            registry.delete_snapshot(project_id, row["timestamp"], snapshots_table, region)
            log.debug(f"Retention pruned: {row['s3_key']}")
        except Exception as e:
            log.warning(f"Could not prune {row.get('s3_key')}: {e}")
