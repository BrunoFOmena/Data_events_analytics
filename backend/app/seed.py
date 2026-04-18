import random
import uuid
from datetime import datetime, timedelta, timezone
from .db import SessionLocal, engine, Base
from .models import Event


SKUS = ["SKU-001", "SKU-002", "SKU-003", "SKU-004", "SKU-005", "SKU-006", "SKU-007"]
USERS = [f"user_{i:04d}" for i in range(300)]


def generate(n_days: int = 30, per_day: int = 400):
    now = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    rows = []
    for d in range(n_days):
        day = now - timedelta(days=n_days - d)
        for _ in range(per_day):
            r = random.random()
            if r < 0.7:
                etype = "page_view"
                props = {"path": random.choice(["/home", "/product", "/about", "/pricing"])}
            elif r < 0.9:
                etype = "signup"
                props = {"source": random.choice(["organic", "paid", "referral"])}
            else:
                etype = "purchase"
                props = {
                    "sku": random.choice(SKUS),
                    "value": round(random.uniform(20, 500), 2),
                }
            rows.append(
                {
                    "event_id": uuid.uuid4(),
                    "event_type": etype,
                    "occurred_at": day + timedelta(seconds=random.randint(0, 86399)),
                    "user_id": random.choice(USERS),
                    "properties": props,
                }
            )
    return rows


def run():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        existing = db.query(Event).count()
        if existing > 0:
            print(f"events already present ({existing}), skipping seed")
            return
        rows = generate()
        db.bulk_insert_mappings(Event, rows)
        db.commit()
        print(f"seeded {len(rows)} events")
    finally:
        db.close()


if __name__ == "__main__":
    run()
