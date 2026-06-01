from __future__ import annotations

import asyncio
import hashlib
import os
import uuid
from datetime import datetime, timezone

from contento_scrapers.models import TrendDiscovered


def _parse_feed(url: str) -> list[dict]:
    """Sync feedparser call — runs in a thread."""
    import feedparser

    feed = feedparser.parse(url)
    entries = []
    for entry in feed.entries[:3]:
        entries.append({
            'title': entry.get('title', ''),
            'url': entry.get('link', ''),
            'summary': entry.get('summary') or None,
        })
    return entries


async def scrape(workspace_id: str) -> list[TrendDiscovered]:
    raw_urls = os.getenv('RSS_FEED_URLS', '')
    if not raw_urls.strip():
        return []

    feed_urls = [u.strip() for u in raw_urls.split(',') if u.strip()]
    now = datetime.now(timezone.utc).isoformat()

    events: list[TrendDiscovered] = []
    for feed_url in feed_urls:
        try:
            entries = await asyncio.to_thread(_parse_feed, feed_url)
        except Exception as exc:
            print(f'[rss] error parsing {feed_url}: {exc}')
            continue

        for entry in entries:
            url = entry['url']
            if not url:
                continue
            trend_id = f'rss:{hashlib.md5(url.encode()).hexdigest()[:16]}'
            events.append(
                TrendDiscovered(
                    eventId=str(uuid.uuid4()),
                    workspaceId=workspace_id,
                    timestamp=now,
                    trendId=trend_id,
                    title=entry['title'],
                    url=url,
                    source='rss',
                    description=entry.get('summary'),
                )
            )
    return events
