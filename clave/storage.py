"""S3 operations for snapshot files."""
import boto3
from pathlib import Path


def s3_key(user_id: str, project_id: str, hash_: str) -> str:
    """Canonical S3 key: {user_id}/{project_id}/{hash}.flp"""
    return f"{user_id}/{project_id}/{hash_}.flp"


def upload(flp_path: Path, bucket: str, key: str, region: str):
    boto3.client("s3", region_name=region).upload_file(
        str(flp_path), bucket, key
    )


def download(bucket: str, key: str, dest_path: Path, region: str):
    boto3.client("s3", region_name=region).download_file(
        bucket, key, str(dest_path)
    )


def delete_object(bucket: str, key: str, region: str):
    boto3.client("s3", region_name=region).delete_object(
        Bucket=bucket, Key=key
    )
