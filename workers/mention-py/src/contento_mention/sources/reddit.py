from __future__ import annotations

import asyncio
import os
from dataclasses import dataclass
from datetime import datetime, timezone

import praw

_reddit: praw.Reddit | None = None


@dataclass
class MentionCandidate:
    source: str
    url: str
    text: str
    seen_at: datetime


def _get_reddit() -> praw.Reddit | None:
    global _reddit
    client_id = os.getenv('REDDIT_CLIENT_ID', '')
    client_secret = os.getenv('REDDIT_CLIENT_SECRET', '')
    if not client_id or not client_secret:
        return None
    if _reddit is None:
        _reddit = praw.Reddit(
            client_id=client_id,
            client_secret=client_secret,
            user_agent=os.getenv('REDDIT_USER_AGENT', 'contento-mention/0.1'),
        )
    return _reddit


def _fetch_reddit_mentions(brand: str) -> list[MentionCandidate]:
    reddit = _get_reddit()
    if reddit is None:
        return []
    results = []
    for submission in reddit.subreddit('all').search(brand, limit=10, sort='new'):
        text = f'{submission.title}. {submission.selftext}'[:500]
        results.append(MentionCandidate(
            source='reddit',
            url=f'https://reddit.com{submission.permalink}',
            text=text,
            seen_at=datetime.now(timezone.utc),
        ))
    return results


async def fetch_mentions(brand: str) -> list[MentionCandidate]:
    return await asyncio.to_thread(_fetch_reddit_mentions, brand)
