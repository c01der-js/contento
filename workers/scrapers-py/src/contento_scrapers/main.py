from __future__ import annotations

import asyncio
import os

from dotenv import load_dotenv

load_dotenv()

import asyncpg  # noqa: E402
from aiokafka import AIOKafkaProducer  # noqa: E402

from contento_scrapers.models import TrendDiscovered  # noqa: E402
from contento_scrapers.sources import google_trends, youtube, reddit, rss  # noqa: E402

KAFKA_TOPIC = 'trends'

ALL_SOURCES = (
    ('google_trends', google_trends.scrape),
    ('youtube', youtube.scrape),
    ('reddit', reddit.scrape),
    ('rss', rss.scrape),
)


async def load_enabled_sources(pool: asyncpg.Pool | None) -> set[str]:
    """Return the set of source names that should run this round.

    If a TrendFeedConfig row exists, its 'enabled' flag is authoritative for
    that source. Sources with no row default to enabled (backward-compatible).
    On any DB error, fall back to "all enabled" — the scraper should not crash
    when the config table is unreachable.
    """
    enabled: set[str] = {name for name, _ in ALL_SOURCES}
    if pool is None:
        return enabled
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                'SELECT source, enabled FROM "TrendFeedConfig"'
            )
        for row in rows:
            if not row['enabled']:
                enabled.discard(row['source'])
    except Exception as exc:
        print(f'[main] could not load TrendFeedConfig (using defaults): {exc}', flush=True)
    return enabled


async def scrape_all(workspace_id: str, enabled: set[str]) -> list[TrendDiscovered]:
    """Run enabled scrapers concurrently; failures in one don't stop others."""
    selected = [(name, fn) for name, fn in ALL_SOURCES if name in enabled]
    if not selected:
        return []

    results: list[TrendDiscovered] = []
    tasks = {name: asyncio.create_task(fn(workspace_id)) for name, fn in selected}

    for name, task in tasks.items():
        try:
            events = await task
            results.extend(events)
            print(f'[{name}] got {len(events)} event(s) for workspace {workspace_id}')
        except Exception as exc:
            print(f'[{name}] unhandled error for workspace {workspace_id}: {exc}')

    return results


async def main() -> None:
    workspace_ids = os.getenv('WORKSPACE_IDS', '').split(',')
    workspace_ids = [w.strip() for w in workspace_ids if w.strip()]
    if not workspace_ids:
        print('FATAL: WORKSPACE_IDS is not configured', flush=True)
        raise SystemExit(1)

    interval = int(os.getenv('SCRAPE_INTERVAL_MIN', '30')) * 60
    bootstrap_servers = os.getenv('KAFKA_BOOTSTRAP_SERVERS', 'localhost:9092')
    database_url = os.getenv('DATABASE_URL')

    pool: asyncpg.Pool | None = None
    if database_url:
        try:
            pool = await asyncpg.create_pool(database_url, min_size=1, max_size=2)
        except Exception as exc:
            print(f'[main] DB pool unavailable, source toggles disabled: {exc}', flush=True)
            pool = None
    else:
        print('[main] DATABASE_URL not set, source toggles disabled — all sources will run')

    producer = AIOKafkaProducer(bootstrap_servers=bootstrap_servers)
    await producer.start()
    print(f'Kafka producer started (bootstrap={bootstrap_servers})')

    try:
        while True:
            enabled = await load_enabled_sources(pool)
            print(
                f'Starting scrape round for workspaces {workspace_ids}; '
                f'enabled sources: {sorted(enabled) or "<none>"}'
            )
            for workspace_id in workspace_ids:
                events = await scrape_all(workspace_id, enabled)
                for event in events:
                    try:
                        await producer.send_and_wait(
                            KAFKA_TOPIC,
                            event.model_dump_json().encode('utf-8'),
                        )
                    except Exception as exc:
                        print(f'[kafka] Failed to send event {event.trendId}: {exc}', flush=True)
            print(f'Scrape round complete. Sleeping {interval}s...')
            await asyncio.sleep(interval)
    finally:
        await producer.stop()
        if pool is not None:
            await pool.close()
        print('Kafka producer stopped')


def run() -> None:
    asyncio.run(main())


if __name__ == '__main__':
    run()
