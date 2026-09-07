"""A durable DB queue. PostgreSQL in production; SQLite for a single local worker."""

from __future__ import annotations

import time
import uuid
from builtins import list as ListType
from typing import Any

from sqlalchemy import (
    JSON,
    Column,
    Float,
    Integer,
    MetaData,
    String,
    Table,
    create_engine,
    insert,
    or_,
    select,
    update,
)

from .models import JobState, now

metadata = MetaData()
jobs = Table(
    "forge_jobs",
    metadata,
    Column("id", String(64), primary_key=True),
    Column("state", String(40), nullable=False),
    Column("revision", Integer, nullable=False),
    Column("payload", JSON, nullable=False),
    Column("lease", String(64)),
    Column("lease_until", Float, nullable=False, default=0),
)
history = Table(
    "forge_review_history",
    metadata,
    Column("id", String(64), primary_key=True),
    Column("job_id", String(64), index=True),
    Column("event", JSON, nullable=False),
)


class Conflict(Exception):
    pass


class JobStore:
    def __init__(self, url: str):
        self.engine = create_engine(url, pool_pre_ping=True)

    def initialize(self):
        # Additive Forge-owned tables only; never touch Elapse migrations.
        metadata.create_all(self.engine)

    def create(self, payload: dict[str, Any]) -> dict:
        row: dict[str, Any] = {
            "id": uuid.uuid4().hex,
            "state": JobState.UPLOADED.value,
            "revision": 0,
            "payload": {
                **payload,
                "created_at": now(),
                "checkpoints": payload.get("checkpoints", {}),
            },
            "lease": None,
            "lease_until": 0,
        }
        with self.engine.begin() as conn:
            conn.execute(insert(jobs).values(**row))
            conn.execute(
                update(jobs)
                .where(jobs.c.id == row["id"])
                .values(state=JobState.QUEUED.value)
            )
        return self.get(row["id"])

    def get(self, job_id: str) -> dict:
        with self.engine.connect() as conn:
            row = (
                conn.execute(select(jobs).where(jobs.c.id == job_id)).mappings().first()
            )
        if row is None:
            raise KeyError(job_id)
        return dict(row)

    def list(self) -> list[dict]:
        with self.engine.connect() as conn:
            return [
                dict(r)
                for r in conn.execute(
                    select(jobs).order_by(jobs.c.id).limit(100)
                ).mappings()
            ]

    def claim(self) -> dict | None:
        terminal = ["completed", "review_required", "failed", "uploaded"]
        with self.engine.begin() as conn:
            row = (
                conn.execute(
                    select(jobs)
                    .where(
                        jobs.c.state.not_in(terminal),
                        or_(jobs.c.lease.is_(None), jobs.c.lease_until < time.time()),
                    )
                    .limit(1)
                )
                .mappings()
                .first()
            )
            if row is None:
                return None
            lease = uuid.uuid4().hex
            result = conn.execute(
                update(jobs)
                .where(
                    jobs.c.id == row["id"],
                    jobs.c.revision == row["revision"],
                    or_(jobs.c.lease.is_(None), jobs.c.lease_until < time.time()),
                )
                .values(
                    lease=lease,
                    lease_until=time.time() + 60,
                    revision=row["revision"] + 1,
                )
            )
            if result.rowcount != 1:
                return None
        return self.get(row["id"])

    def heartbeat(self, job_id: str, lease: str):
        with self.engine.begin() as conn:
            result = conn.execute(
                update(jobs)
                .where(jobs.c.id == job_id, jobs.c.lease == lease)
                .values(lease_until=time.time() + 60)
            )
            if result.rowcount != 1:
                raise Conflict("Worker lease lost")

    def checkpoint(self, job_id: str, lease: str, state: str, payload: dict):
        terminal = state in ("failed", "completed", "review_required")
        with self.engine.begin() as conn:
            result = conn.execute(
                update(jobs)
                .where(jobs.c.id == job_id, jobs.c.lease == lease)
                .values(
                    state=state,
                    payload=payload,
                    revision=jobs.c.revision + 1,
                    lease=None if terminal else lease,
                    lease_until=0 if terminal else time.time() + 60,
                )
            )
            if result.rowcount != 1:
                raise Conflict("Stale worker cannot overwrite a newer attempt")

    def review(self, job_id: str, revision: int, payload: dict, event: dict):
        with self.engine.begin() as conn:
            result = conn.execute(
                update(jobs)
                .where(
                    jobs.c.id == job_id,
                    jobs.c.revision == revision,
                    jobs.c.lease.is_(None),
                    jobs.c.state.in_(["completed", "review_required"]),
                )
                .values(payload=payload, revision=revision + 1)
            )
            if result.rowcount != 1:
                raise Conflict("Job changed or is processing; reload before saving")
            conn.execute(
                insert(history).values(
                    id=uuid.uuid4().hex, job_id=job_id, event={**event, "at": now()}
                )
            )

    def events(self, job_id: str) -> ListType[dict]:
        with self.engine.connect() as conn:
            return list(
                conn.execute(
                    select(history.c.event).where(history.c.job_id == job_id)
                ).scalars()
            )

    def retry(self, parent_id: str, revision: int, payload: dict, event: dict) -> dict:
        child_id = uuid.uuid4().hex
        with self.engine.begin() as conn:
            result = conn.execute(
                update(jobs)
                .where(
                    jobs.c.id == parent_id,
                    jobs.c.revision == revision,
                    jobs.c.lease.is_(None),
                    jobs.c.state.in_(["failed", "completed", "review_required"]),
                )
                .values(revision=revision + 1)
            )
            if result.rowcount != 1:
                raise Conflict(
                    "Parent job changed or is processing; reload before retrying"
                )
            conn.execute(
                insert(jobs).values(
                    id=child_id,
                    state="queued",
                    revision=0,
                    payload={
                        **payload,
                        "parent_job_id": parent_id,
                        "created_at": now(),
                    },
                    lease=None,
                    lease_until=0,
                )
            )
            conn.execute(
                insert(history).values(
                    id=uuid.uuid4().hex,
                    job_id=parent_id,
                    event={
                        **event,
                        "child_job_id": child_id,
                        "at": now(),
                        "base_revision": revision,
                    },
                )
            )
        return self.get(child_id)
