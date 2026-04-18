from datetime import datetime
from typing import Optional, Literal, Any
from uuid import UUID
from pydantic import BaseModel, Field

EventType = Literal["page_view", "signup", "purchase"]


class EventIn(BaseModel):
    event_id: UUID
    event_type: EventType
    occurred_at: datetime
    user_id: Optional[str] = None
    properties: dict[str, Any] = Field(default_factory=dict)


class EventOut(BaseModel):
    event_id: UUID
    event_type: str
    occurred_at: datetime
    user_id: Optional[str]
    properties: dict[str, Any]

    class Config:
        from_attributes = True


class IngestResult(BaseModel):
    accepted: int
    duplicates: int
