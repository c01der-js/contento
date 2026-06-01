from __future__ import annotations

import hashlib
import os
import uuid
from datetime import datetime, timezone

import httpx

from contento_scrapers.models import TrendDiscovered

_YT_API_BASE = 'https://www.googleapis.com/youtube/v3'


async def scrape(workspace_id: str) -> list[TrendDiscovered]:
    api_key = os.getenv('YOUTUBE_API_KEY', '')
    if not api_key:
        return []

    region = os.getenv('YOUTUBE_REGION_CODE', 'US')
    now = datetime.now(timezone.utc).isoformat()

    params = {
        'part': 'snippet',
        'chart': 'mostPopular',
        'regionCode': region,
        'maxResults': '5',
        'key': api_key,
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(f'{_YT_API_BASE}/videos', params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        print(f'[youtube] scrape error: {exc}')
        return []

    events: list[TrendDiscovered] = []
    for item in data.get('items', []):
        video_id = item.get('id', '')
        snippet = item.get('snippet', {})
        title = snippet.get('title', '')
        description = snippet.get('description', '') or None
        url = f'https://youtube.com/watch?v={video_id}'
        trend_id = f'youtube:{hashlib.md5(url.encode()).hexdigest()[:16]}'
        events.append(
            TrendDiscovered(
                eventId=str(uuid.uuid4()),
                workspaceId=workspace_id,
                timestamp=now,
                trendId=trend_id,
                title=title,
                url=url,
                source='youtube',
                description=description,
            )
        )
    return events
