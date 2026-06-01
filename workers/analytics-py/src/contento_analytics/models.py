from __future__ import annotations

from typing import Optional
from pydantic import BaseModel


class PublishCompletedEvent(BaseModel):
    eventId: str
    workspaceId: str
    timestamp: str
    publicationId: str
    platform: str
    externalId: str
    publishedAt: str
    url: Optional[str] = None


class PublishFailedEvent(BaseModel):
    eventId: str
    workspaceId: str
    timestamp: str
    publicationId: str
    platform: str
    error: str
    retryable: bool = False
