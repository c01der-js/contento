from __future__ import annotations

import asyncio
import os
from pathlib import Path

import boto3
from botocore.client import BaseClient

_s3: BaseClient = boto3.client(
    's3',
    endpoint_url=os.environ.get('MINIO_ENDPOINT', 'http://minio:9000'),
    aws_access_key_id=os.environ.get('MINIO_ROOT_USER', 'contento'),
    aws_secret_access_key=os.environ.get('MINIO_ROOT_PASSWORD', 'contento123'),
)


def _download_prefix(bucket: str, prefix: str, local_dir: Path) -> list[Path]:
    local_dir.mkdir(parents=True, exist_ok=True)
    paginator = _s3.get_paginator('list_objects_v2')
    files = []
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        for obj in page.get('Contents', []):
            key = obj['Key']
            local_path = local_dir / Path(key).name
            _s3.download_file(bucket, key, str(local_path))
            files.append(local_path)
    return files


async def download_assets(bucket: str, prefix: str, local_dir: Path) -> list[Path]:
    return await asyncio.to_thread(_download_prefix, bucket, prefix, local_dir)


def _upload_file(bucket: str, key: str, local_path: Path) -> str:
    _s3.upload_file(str(local_path), bucket, key)
    endpoint = os.environ.get('MINIO_ENDPOINT', 'http://minio:9000')
    return f'{endpoint}/{bucket}/{key}'


async def upload_file(bucket: str, key: str, local_path: Path) -> str:
    return await asyncio.to_thread(_upload_file, bucket, key, local_path)
