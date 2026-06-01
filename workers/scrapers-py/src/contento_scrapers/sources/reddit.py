from __future__ import annotations

import asyncio
import hashlib
import os
import uuid
from datetime import datetime, timezone

from contento_scrapers.models import TrendDiscovered


def _fetch_posts(client_id: str, client_secret: str, user_agent: str, subreddit: str) -> list[dict]:
    """Sync PRAW call — runs in a thread."""
    import praw

    reddit = praw.Reddit(
        client_id=client_id,
        client_secret=client_secret,
        user_agent=user_agent,
    )
    posts = []
    for submission in reddit.subreddit(subreddit).top(time_filter='day', limit=5):
        posts.append({
            'title': submission.title,
            'url': submission.url,
            'permalink': f'https://reddit.com{submission.permalink}',
            'selftext': submission.selftext or None,
        })
    return posts


async def scrape(workspace_id: str) -> list[TrendDiscovered]:
    client_id = os.getenv('REDDIT_CLIENT_ID', '')
    client_secret = os.getenv('REDDIT_CLIENT_SECRET', '')
    user_agent = os.getenv('REDDIT_USER_AGENT', 'contento-scrapers/0.1')
    if not (client_id and client_secret and user_agent):
        return []

    subreddit = os.getenv('REDDIT_SUBREDDIT', 'technology')
    now = datetime.now(timezone.utc).isoformat()

    try:
        posts = await asyncio.to_thread(
            _fetch_posts, client_id, client_secret, user_agent, subreddit
        )
    except Exception as exc:
        print(f'[reddit] scrape error: {exc}')
        return []

    events: list[TrendDiscovered] = []
    for post in posts:
        # Use the reddit permalink as the canonical URL for trend identity
        permalink = post['permalink']
        trend_id = f'reddit:{hashlib.md5(permalink.encode()).hexdigest()[:16]}'
        events.append(
            TrendDiscovered(
                eventId=str(uuid.uuid4()),
                workspaceId=workspace_id,
                timestamp=now,
                trendId=trend_id,
                title=post['title'],
                url=permalink,
                source='reddit',
                description=post.get('selftext'),
            )
        )
    return events
