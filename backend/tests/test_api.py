import os
import uuid
from datetime import datetime, timezone, timedelta

os.environ["DATABASE_URL"] = "sqlite:///./test.db"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import db as app_db
from app.db import Base
from app.main import app


@pytest.fixture(autouse=True)
def _setup_db(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path/'test.db'}"
    engine = create_engine(url, connect_args={"check_same_thread": False})
    TestSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)

    monkeypatch.setattr(app_db, "engine", engine)
    monkeypatch.setattr(app_db, "SessionLocal", TestSession)

    def override_get_db():
        s = TestSession()
        try:
            yield s
        finally:
            s.close()

    from app.db import get_db
    app.dependency_overrides[get_db] = override_get_db
    yield
    app.dependency_overrides.clear()


@pytest.fixture
def client():
    return TestClient(app)


def _event(etype="page_view", **extra):
    return {
        "event_id": str(uuid.uuid4()),
        "event_type": etype,
        "occurred_at": datetime.now(timezone.utc).isoformat(),
        "user_id": "user_test",
        "properties": extra,
    }


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200


def test_ingest_single(client):
    r = client.post("/events", json=_event())
    assert r.status_code == 201
    assert r.json() == {"accepted": 1, "duplicates": 0}


def test_ingest_batch_and_dedup(client):
    e = _event()
    r1 = client.post("/events", json=[e, e])
    assert r1.status_code == 201
    body = r1.json()
    assert body["accepted"] == 1
    assert body["duplicates"] == 1


def test_invalid_event_type(client):
    bad = _event()
    bad["event_type"] = "not_valid"
    r = client.post("/events", json=bad)
    assert r.status_code == 422


def test_list_events(client):
    client.post("/events", json=_event("signup"))
    r = client.get("/events?event_type=signup")
    assert r.status_code == 200
    assert len(r.json()) >= 1
