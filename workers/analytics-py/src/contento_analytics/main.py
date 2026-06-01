from __future__ import annotations

import asyncio
import json
import os

import asyncpg
from aiokafka import AIOKafkaConsumer
from dotenv import load_dotenv
from datetime import datetime, timezone

from contento_analytics.models import PublishCompletedEvent, PublishFailedEvent
from contento_analytics.clickhouse_client import run_migrations, insert_publication_event

load_dotenv()

KAFKA_BOOTSTRAP = os.environ['KAFKA_BOOTSTRAP_SERVERS']
KAFKA_GROUP = os.environ.get('KAFKA_GROUP_ID', 'contento-analytics')
DATABASE_URL = os.environ['DATABASE_URL']

TOPIC_COMPLETED = 'publish'
TOPIC_FAILED = 'publish.failed'


async def enrich(pool: asyncpg.Pool, publication_id: str) -> dict:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT p.script_id, s.format, i.trend_id
            FROM "Publication" p
            JOIN "Script" s ON s.id = p.script_id
            LEFT JOIN "Idea" i ON i.id = s.idea_id
            WHERE p.id = $1
            """,
            publication_id,
        )
    if row is None:
        return {}
    return {
        'script_id': row['script_id'] or '',
        'format': row['format'] or '',
        'trend_id': row['trend_id'],
    }


async def process_completed(event_data: dict, pool: asyncpg.Pool) -> None:
    try:
        event = PublishCompletedEvent.model_validate(event_data)
    except Exception as exc:
        print(f'[analytics] invalid completed event: {exc}')
        return

    extra = await enrich(pool, event.publicationId)
    if not extra.get('script_id'):
        print(f'[analytics] publication {event.publicationId} not found in Postgres, skipping')
        return

    published_at = datetime.fromisoformat(event.publishedAt.replace('Z', '+00:00')).replace(tzinfo=None)
    row = {
        'workspace_id': event.workspaceId,
        'publication_id': event.publicationId,
        'script_id': extra['script_id'],
        'platform': event.platform,
        'trend_id': extra.get('trend_id'),
        'format': extra.get('format', ''),
        'ab_variant_id': None,
        'status': 'published',
        'error_message': None,
        'retryable': 0,
        'published_at': published_at,
        'ingested_at': datetime.now(timezone.utc).replace(tzinfo=None),
    }
    await insert_publication_event(row)
    print(f'[analytics] ingested completed publication {event.publicationId}')


async def process_failed(event_data: dict, pool: asyncpg.Pool) -> None:
    try:
        event = PublishFailedEvent.model_validate(event_data)
    except Exception as exc:
        print(f'[analytics] invalid failed event: {exc}')
        return

    extra = await enrich(pool, event.publicationId)
    if not extra.get('script_id'):
        print(f'[analytics] failed publication {event.publicationId} not found in Postgres, skipping')
        return

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    failed_at = datetime.fromisoformat(event.timestamp.replace('Z', '+00:00')).replace(tzinfo=None)
    row = {
        'workspace_id': event.workspaceId,
        'publication_id': event.publicationId,
        'script_id': extra['script_id'],
        'platform': event.platform,
        'trend_id': extra.get('trend_id'),
        'format': extra.get('format', ''),
        'ab_variant_id': None,
        'status': 'failed',
        'error_message': event.error[:2000],
        'retryable': 1 if event.retryable else 0,
        'published_at': failed_at,
        'ingested_at': now,
    }
    await insert_publication_event(row)
    print(f'[analytics] ingested failed publication {event.publicationId}: {event.error[:80]}')


async def main() -> None:
    await run_migrations()
    pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=5)

    consumer = AIOKafkaConsumer(
        TOPIC_COMPLETED,
        TOPIC_FAILED,
        bootstrap_servers=KAFKA_BOOTSTRAP,
        group_id=KAFKA_GROUP,
        value_deserializer=lambda v: json.loads(v.decode()),
        auto_offset_reset='earliest',
        enable_auto_commit=False,
    )
    await consumer.start()
    try:
        async for msg in consumer:
            data = msg.value
            try:
                if msg.topic == TOPIC_FAILED or 'error' in data:
                    await process_failed(data, pool)
                elif 'externalId' in data:
                    await process_completed(data, pool)
                else:
                    # publish.requested or other event types we don't care about
                    pass
            except Exception as exc:
                print(f'[analytics] failed to process event ({msg.topic}), will not commit offset: {exc}')
                continue
            await consumer.commit()
    finally:
        await consumer.stop()
        await pool.close()


def run() -> None:
    asyncio.run(main())


if __name__ == '__main__':
    run()
