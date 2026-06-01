from __future__ import annotations

import asyncio
import json
import os
import tempfile
import uuid
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

import asyncpg
from aiokafka import AIOKafkaConsumer, AIOKafkaProducer
from dotenv import load_dotenv

from contento_ml.models import LoraTrainRequested
from contento_ml.minio_client import download_assets, upload_file

load_dotenv()

KAFKA_BOOTSTRAP = os.environ['KAFKA_BOOTSTRAP_SERVERS']
KAFKA_GROUP = os.environ.get('KAFKA_GROUP_ID', 'contento-ml')
DATABASE_URL = os.environ['DATABASE_URL']
MINIO_BUCKET = os.environ.get('MINIO_BUCKET', 'contento')
TOPIC = 'lora'

_executor: ProcessPoolExecutor | None = None


def _get_executor() -> ProcessPoolExecutor:
    global _executor
    if _executor is None:
        _executor = ProcessPoolExecutor(max_workers=1)
    return _executor


def _train_in_process(image_dir_str: str, output_dir_str: str) -> str:
    from contento_ml.trainer import train_lora
    weights_path = train_lora(Path(image_dir_str), Path(output_dir_str))
    return str(weights_path)


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def handle_job(
    event: LoraTrainRequested,
    pool: asyncpg.Pool,
    producer: AIOKafkaProducer,
) -> None:
    job_id = event.jobId
    workspace_id = event.workspaceId

    try:
        async with pool.acquire() as conn:
            await conn.execute(
                'UPDATE "LoraJob" SET status = $1, "startedAt" = $2, "updatedAt" = $3 WHERE id = $4',
                'RUNNING', _now(), _now(), job_id,
            )

        with tempfile.TemporaryDirectory() as tmpdir:
            image_dir = Path(tmpdir) / 'images'
            output_dir = Path(tmpdir) / 'output'

            await download_assets(MINIO_BUCKET, event.assetPrefix, image_dir)

            loop = asyncio.get_running_loop()
            weights_path_str = await loop.run_in_executor(
                _get_executor(),
                _train_in_process,
                str(image_dir),
                str(output_dir),
            )

            weights_key = f'lora/{workspace_id}/{job_id}/lora_weights.pt'
            weights_url = await upload_file(MINIO_BUCKET, weights_key, Path(weights_path_str))

        async with pool.acquire() as conn:
            await conn.execute(
                'UPDATE "LoraJob" SET status = $1, "weightsUrl" = $2, "completedAt" = $3, "updatedAt" = $4 WHERE id = $5',
                'DONE', weights_url, _now(), _now(), job_id,
            )

        event_out = {
            'eventId': str(uuid.uuid4()),
            'workspaceId': workspace_id,
            'timestamp': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
            'jobId': job_id,
            'weightsUrl': weights_url,
        }
        await producer.send_and_wait(TOPIC, json.dumps(event_out).encode())
        print(f'[ml] Job {job_id} completed, weights at {weights_url}')

    except Exception as exc:
        print(f'[ml] Job {job_id} failed: {exc}')
        try:
            async with pool.acquire() as conn:
                await conn.execute(
                    'UPDATE "LoraJob" SET status = $1, "errorMessage" = $2, "completedAt" = $3, "updatedAt" = $4 WHERE id = $5',
                    'FAILED', str(exc), _now(), _now(), job_id,
                )
        except Exception as db_exc:
            print(f'[ml] Failed to update job {job_id} to FAILED: {db_exc}')


async def main() -> None:
    pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=3)

    producer = AIOKafkaProducer(bootstrap_servers=KAFKA_BOOTSTRAP)
    await producer.start()

    consumer = AIOKafkaConsumer(
        TOPIC,
        bootstrap_servers=KAFKA_BOOTSTRAP,
        group_id=KAFKA_GROUP,
        value_deserializer=lambda v: json.loads(v.decode()),
        auto_offset_reset='earliest',
        enable_auto_commit=False,
    )
    await consumer.start()
    print('[ml] LoRA worker started')

    try:
        async for msg in consumer:
            data = msg.value
            # Only handle train_requested events (they have assetPrefix field)
            if 'assetPrefix' not in data:
                await consumer.commit()
                continue
            try:
                event = LoraTrainRequested.model_validate(data)
            except Exception as exc:
                print(f'[ml] Invalid event: {exc}')
                await consumer.commit()
                continue
            await handle_job(event, pool, producer)
            await consumer.commit()
    finally:
        await consumer.stop()
        await producer.stop()
        await pool.close()
        if _executor:
            _executor.shutdown(wait=True)


def run() -> None:
    asyncio.run(main())


if __name__ == '__main__':
    run()
