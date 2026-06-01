from __future__ import annotations

import asyncio
import os
import threading
from clickhouse_driver import Client

_client: Client | None = None
_lock = threading.Lock()


def _get_client() -> Client:
    global _client
    with _lock:
        if _client is None:
            host = os.environ.get('CLICKHOUSE_HOST', 'localhost')
            _client = Client(host=host, port=9000)
    return _client


def _run_migrations() -> None:
    client = _get_client()
    client.execute("""
        CREATE TABLE IF NOT EXISTS publication_events (
            workspace_id String,
            publication_id String,
            script_id String,
            platform LowCardinality(String),
            trend_id Nullable(String),
            format LowCardinality(String),
            ab_variant_id Nullable(String),
            status LowCardinality(String) DEFAULT 'published',
            error_message Nullable(String),
            retryable UInt8 DEFAULT 0,
            published_at DateTime,
            ingested_at DateTime DEFAULT now()
        ) ENGINE = MergeTree()
        PARTITION BY toYYYYMM(published_at)
        ORDER BY (workspace_id, published_at)
    """)
    # Best-effort ALTERs for pre-existing tables — ignore "column already exists".
    for stmt in (
        "ALTER TABLE publication_events ADD COLUMN IF NOT EXISTS status LowCardinality(String) DEFAULT 'published'",
        "ALTER TABLE publication_events ADD COLUMN IF NOT EXISTS error_message Nullable(String)",
        "ALTER TABLE publication_events ADD COLUMN IF NOT EXISTS retryable UInt8 DEFAULT 0",
    ):
        try:
            client.execute(stmt)
        except Exception as exc:
            print(f'[analytics] migration step skipped ({stmt[:60]}…): {exc}')

    client.execute("""
        CREATE TABLE IF NOT EXISTS llm_usage_events (
            workspace_id String,
            agent String,
            model LowCardinality(String),
            input_tokens UInt32,
            output_tokens UInt32,
            cache_creation_tokens UInt32,
            cache_read_tokens UInt32,
            cost_usd Float32,
            called_at DateTime
        ) ENGINE = MergeTree()
        PARTITION BY toYYYYMM(called_at)
        ORDER BY (workspace_id, called_at)
    """)


async def run_migrations() -> None:
    await asyncio.to_thread(_run_migrations)


def _insert_publication_event(row: dict) -> None:
    client = _get_client()
    client.execute("INSERT INTO publication_events VALUES", [row])


async def insert_publication_event(row: dict) -> None:
    await asyncio.to_thread(_insert_publication_event, row)
