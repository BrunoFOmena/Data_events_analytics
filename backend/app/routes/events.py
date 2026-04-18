from typing import Union
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from ..db import get_db
from ..models import Event
from ..schemas import EventIn, EventOut, IngestResult

router = APIRouter(prefix="/events", tags=["events"])


@router.post("", response_model=IngestResult, status_code=201)
def ingest(payload: Union[EventIn, list[EventIn]], db: Session = Depends(get_db)):
    items = payload if isinstance(payload, list) else [payload]
    if not items:
        raise HTTPException(status_code=400, detail="empty payload")

    accepted = 0
    duplicates = 0
    for item in items:
        data = item.model_dump(mode="python")
        existing = db.get(Event, data["event_id"])
        if existing is not None:
            duplicates += 1
            continue
        try:
            db.add(Event(**data))
            db.flush()
            accepted += 1
        except IntegrityError:
            db.rollback()
            duplicates += 1
    db.commit()
    return IngestResult(accepted=accepted, duplicates=duplicates)


@router.get("", response_model=list[EventOut])
def list_events(
    event_type: str | None = None,
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
):
    q = db.query(Event)
    if event_type:
        q = q.filter(Event.event_type == event_type)
    return q.order_by(Event.occurred_at.desc()).limit(limit).all()
