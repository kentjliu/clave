"""DynamoDB operations. Replaces db.py."""
import json
from datetime import datetime, timezone
from typing import Optional

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError


def _table(table_name: str, region: str):
    return boto3.resource("dynamodb", region_name=region).Table(table_name)


# ── Projects ──────────────────────────────────────────────────────────────────

def upsert_project(
    user_id: str,
    project_id: str,
    name: str,
    flp_path: str,
    s3_prefix: str,
    table_name: str,
    region: str,
):
    _table(table_name, region).put_item(Item={
        "user_id": user_id,
        "project_id": project_id,
        "name": name,
        "flp_path": flp_path,
        "s3_prefix": s3_prefix,
        "created_at": _now(),
    })


def list_projects(user_id: str, table_name: str, region: str) -> list:
    result = _table(table_name, region).query(
        KeyConditionExpression=Key("user_id").eq(user_id)
    )
    return result.get("Items", [])


# ── Snapshots ─────────────────────────────────────────────────────────────────

def insert_snapshot(
    project_id: str,
    timestamp: str,
    user_id: str,
    hash_: str,
    file_size: int,
    s3_key: str,
    metadata: dict,
    table_name: str,
    region: str,
) -> bool:
    """
    Write a snapshot record. Returns False if this timestamp already exists
    (condition expression prevents silent overwrites).
    """
    try:
        _table(table_name, region).put_item(
            Item={
                "project_id": project_id,
                "timestamp": timestamp,
                "user_id": user_id,
                "hash": hash_,
                "file_size": file_size,
                "s3_key": s3_key,
                "metadata": json.dumps(metadata),
                "summary": None,
                "summary_status": "pending",
                "created_at": _now(),
            },
            ConditionExpression="attribute_not_exists(#ts)",
            ExpressionAttributeNames={"#ts": "timestamp"},
        )
        return True
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return False
        raise


def get_latest_snapshot(
    project_id: str, table_name: str, region: str
) -> Optional[dict]:
    result = _table(table_name, region).query(
        KeyConditionExpression=Key("project_id").eq(project_id),
        ScanIndexForward=False,
        Limit=1,
    )
    items = result.get("Items", [])
    return items[0] if items else None


def get_snapshots(
    project_id: str, table_name: str, region: str, limit: int = 20
) -> list:
    result = _table(table_name, region).query(
        KeyConditionExpression=Key("project_id").eq(project_id),
        ScanIndexForward=False,
        Limit=limit,
    )
    return result.get("Items", [])


def get_snapshot_by_timestamp(
    project_id: str, timestamp: str, table_name: str, region: str
) -> Optional[dict]:
    result = _table(table_name, region).get_item(
        Key={"project_id": project_id, "timestamp": timestamp}
    )
    return result.get("Item")


def get_all_snapshots_asc(
    project_id: str, table_name: str, region: str
) -> list:
    """Paginate through all snapshots in ascending order (for retention)."""
    table = _table(table_name, region)
    items = []
    kwargs: dict = dict(
        KeyConditionExpression=Key("project_id").eq(project_id),
        ScanIndexForward=True,
    )
    while True:
        result = table.query(**kwargs)
        items.extend(result.get("Items", []))
        last = result.get("LastEvaluatedKey")
        if not last:
            break
        kwargs["ExclusiveStartKey"] = last
    return items


def delete_snapshot(
    project_id: str, timestamp: str, table_name: str, region: str
):
    _table(table_name, region).delete_item(
        Key={"project_id": project_id, "timestamp": timestamp}
    )


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()
