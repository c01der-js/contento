from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel


class TrendDiscovered(BaseModel):
    eventId: str          # UUID
    workspaceId: str
    timestamp: str        # ISO datetime
    trendId: str          # f"{source}:{md5[:8]}"
    title: str
    url: str
    source: Literal['google_trends', 'youtube', 'reddit', 'rss']
    description: Optional[str] = None
