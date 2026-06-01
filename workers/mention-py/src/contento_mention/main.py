from __future__ import annotations

import asyncio
import json
import os
import uuid
from datetime import datetime, timezone

import asyncpg
from aiokafka import AIOKafkaProducer
from dotenv import load_dotenv

from contento_mention.sources import reddit, web
from contento_mention.analyzer import analyze_mention

load_dotenv()

KAFKA_BOOTSTRAP = os.environ['KAFKA_BOOTSTRAP_SERVERS']
DATABASE_URL = os.environ['DATABASE_URL']
BRAND_NAME = os.environ['BRAND_NAME']
WORKSPACE_IDS = [w.strip() for w in os.environ['WORKSPACE_IDS'].split(',') if w.strip()]
POLL_INTERVAL = int(os.getenv('MENTION_POLL_INTERVAL_MIN', '15')) * 60
TOPIC = 'mentions'


async def process_workspace(
    workspace_id: str,
    pool: asyncpg.Pool,
    producer: AIOKafkaProducer,
) -> None:
    candidates = []
    for fetch in (reddit.fetch_mentions, web.fetch_mentions):
        try:
            results = await fetch(BRAND_NAME)
            candidates.extend(results)
        except Exception as exc:
            print(f'[mention] source error: {exc}')

    for candidate in candidates:
        try:
            analysis = await analyze_mention(candidate.text, BRAND_NAME)
        except Exception as exc:
            print(f'[mention] analyze error: {exc}')
            continue

        sentiment = analysis.get('sentiment', 'neutral')
        urgency = int(analysis.get('urgency', 0))
        summary = analysis.get('summary')

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO "Mention" (id, "workspaceId", source, url, text, sentiment, urgency, summary, "seenAt", "createdAt")
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
                ON CONFLICT ("workspaceId", url) DO NOTHING
                RETURNING id
                """,
                f'cm{uuid.uuid4().hex[:24]}',
                workspace_id,
                candidate.source,
                candidate.url,
                candidate.text,
                sentiment,
                urgency,
                summary,
                candidate.seen_at,
            )

        if row is None:
            continue

        mention_id = row['id']
        event = {
            'eventId': str(uuid.uuid4()),
            'workspaceId': workspace_id,
            'timestamp': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
            'mentionId': mention_id,
            'source': candidate.source,
            'url': candidate.url,
            'sentiment': sentiment,
            'urgency': urgency,
        }
        try:
            await producer.send_and_wait(TOPIC, json.dumps(event).encode())
        except Exception as exc:
            print(f'[mention] kafka send error: {exc}')


async def main() -> None:
    if not WORKSPACE_IDS:
        print('FATAL: WORKSPACE_IDS is not configured', flush=True)
        raise SystemExit(1)

    pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=3)
    producer = AIOKafkaProducer(bootstrap_servers=KAFKA_BOOTSTRAP)
    await producer.start()

    try:
        while True:
            for workspace_id in WORKSPACE_IDS:
                await process_workspace(workspace_id, pool, producer)
            await asyncio.sleep(POLL_INTERVAL)
    finally:
        await producer.stop()
        await pool.close()


def run() -> None:
    asyncio.run(main())


if __name__ == '__main__':
    run()
