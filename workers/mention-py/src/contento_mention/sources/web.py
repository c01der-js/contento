from __future__ import annotations

import asyncio
import os
from datetime import datetime, timezone

import feedparser

from contento_mention.sources.reddit import MentionCandidate


def _fetch_rss_mentions(brand: str) -> list[MentionCandidate]:
    feed_urls = [u.strip() for u in os.getenv('MENTION_RSS_URLS', '').split(',') if u.strip()]
    results = []
    for url in feed_urls:
        try:
            feed = feedparser.parse(url)
            for entry in feed.entries[:5]:
                title = getattr(entry, 'title', '')
                summary = getattr(entry, 'summary', '')
                if brand.lower() not in (title + summary).lower():
                    continue
                text = f'{title}. {summary}'[:500]
                results.append(MentionCandidate(
                    source='web',
                    url=getattr(entry, 'link', url),
                    text=text,
                    seen_at=datetime.now(timezone.utc),
                ))
        except Exception as exc:
            print(f'[mention/web] RSS error for {url}: {exc}')
    return results


async def fetch_mentions(brand: str) -> list[MentionCandidate]:
    return await asyncio.to_thread(_fetch_rss_mentions, brand)
