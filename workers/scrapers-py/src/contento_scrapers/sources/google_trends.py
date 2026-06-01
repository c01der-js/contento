from __future__ import annotations

import asyncio
import hashlib
import os
import uuid
from datetime import datetime, timezone

from pytrends.request import TrendReq

from contento_scrapers.models import TrendDiscovered


def _fetch_trends(geo: str) -> list[dict]:
    """Sync call to pytrends — runs in a thread."""
    pt = TrendReq(hl='en-US', tz=0)
    df = pt.trending_searches(pn=geo)
    # trending_searches returns a single-column DataFrame of trend strings
    return df[0].tolist()[:5]


async def scrape(workspace_id: str) -> list[TrendDiscovered]:
    geo = os.getenv('GOOGLE_TRENDS_GEO', 'US')
    now = datetime.now(timezone.utc).isoformat()

    try:
        trends = await asyncio.to_thread(_fetch_trends, geo)
    except Exception as exc:
        print(f'[google_trends] scrape error: {exc}')
        return []

    events: list[TrendDiscovered] = []
    for title in trends:
        url = f'https://trends.google.com/trends/trendingsearches/daily?geo={geo}'
        trend_id = f'google_trends:{hashlib.md5(title.encode()).hexdigest()[:16]}'
        events.append(
            TrendDiscovered(
                eventId=str(uuid.uuid4()),
                workspaceId=workspace_id,
                timestamp=now,
                trendId=trend_id,
                title=title,
                url=url,
                source='google_trends',
            )
        )
    return events
