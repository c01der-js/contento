from __future__ import annotations
from pydantic import BaseModel


class LoraTrainRequested(BaseModel):
    eventId: str
    workspaceId: str
    timestamp: str
    jobId: str
    assetPrefix: str
