from datetime import datetime
from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session
from ..db import get_db

router = APIRouter(prefix="/metrics", tags=["metrics"])


def _date_range(start: datetime, end: datetime):
    if start >= end:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="start must be before end")


@router.get("/timeseries")
def timeseries(
    start: datetime = Query(...),
    end: datetime = Query(...),
    granularity: str = Query("day", pattern="^(day|week)$"),
    db: Session = Depends(get_db),
):
    _date_range(start, end)
    sql = text(
        """
        select
            date_trunc(:granularity, occurred_at) as bucket,
            event_type,
            count(*) as total
        from events
        where occurred_at >= :start and occurred_at < :end
        group by 1, 2
        order by 1, 2
        """
    )
    rows = db.execute(sql, {"granularity": granularity, "start": start, "end": end}).all()
    return [
        {"bucket": r.bucket.isoformat(), "event_type": r.event_type, "total": r.total}
        for r in rows
    ]


@router.get("/kpis")
def kpis(
    start: datetime = Query(...),
    end: datetime = Query(...),
    db: Session = Depends(get_db),
):
    _date_range(start, end)
    sql = text(
        """
        select
            count(*) filter (where event_type = 'page_view') as page_views,
            count(*) filter (where event_type = 'signup') as signups,
            count(*) filter (where event_type = 'purchase') as purchases,
            coalesce(sum((properties->>'value')::numeric) filter (where event_type = 'purchase'), 0) as revenue,
            count(distinct user_id) as unique_users
        from events
        where occurred_at >= :start and occurred_at < :end
        """
    )
    r = db.execute(sql, {"start": start, "end": end}).one()
    pv, su, pu = r.page_views or 0, r.signups or 0, r.purchases or 0
    return {
        "page_views": pv,
        "signups": su,
        "purchases": pu,
        "revenue": float(r.revenue or 0),
        "unique_users": r.unique_users or 0,
        "signup_rate": (su / pv) if pv else 0.0,
        "purchase_rate": (pu / su) if su else 0.0,
    }


@router.get("/funnel")
def funnel(
    start: datetime = Query(...),
    end: datetime = Query(...),
    db: Session = Depends(get_db),
):
    _date_range(start, end)
    sql = text(
        """
        select event_type, count(*) as total
        from events
        where occurred_at >= :start and occurred_at < :end
          and event_type in ('page_view', 'signup', 'purchase')
        group by event_type
        """
    )
    rows = {r.event_type: r.total for r in db.execute(sql, {"start": start, "end": end})}
    return [
        {"step": "page_view", "total": rows.get("page_view", 0)},
        {"step": "signup", "total": rows.get("signup", 0)},
        {"step": "purchase", "total": rows.get("purchase", 0)},
    ]


@router.get("/top-skus")
def top_skus(
    start: datetime = Query(...),
    end: datetime = Query(...),
    limit: int = Query(5, ge=1, le=50),
    db: Session = Depends(get_db),
):
    _date_range(start, end)
    sql = text(
        """
        select properties->>'sku' as sku, count(*) as total,
               coalesce(sum((properties->>'value')::numeric), 0) as revenue
        from events
        where event_type = 'purchase'
          and occurred_at >= :start and occurred_at < :end
          and properties ? 'sku'
        group by 1
        order by total desc
        limit :limit
        """
    )
    rows = db.execute(sql, {"start": start, "end": end, "limit": limit}).all()
    return [{"sku": r.sku, "total": r.total, "revenue": float(r.revenue)} for r in rows]
