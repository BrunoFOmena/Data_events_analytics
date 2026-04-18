from sqlalchemy import Column, String, DateTime, JSON, Index, Uuid
from .db import Base


class Event(Base):
    __tablename__ = "events"

    event_id = Column(Uuid, primary_key=True)
    event_type = Column(String(50), nullable=False, index=True)
    occurred_at = Column(DateTime(timezone=True), nullable=False, index=True)
    user_id = Column(String(100), nullable=True, index=True)
    properties = Column(JSON, nullable=False, default=dict)

    __table_args__ = (
        Index("ix_events_type_occurred", "event_type", "occurred_at"),
    )
