"""Data-egress ledger and private mode.

Every call that sends user-supplied data to an external service (IEDB, UniProt, g:Profiler, STRING, NCBI,
Ensembl, ClinicalTrials.gov) goes through Egress.run_external. For logged-in users it:
  * refuses the call when the user switched Private mode on, and
  * records provider, operation, a SHA-256 of the payload and its size. The payload itself is never stored.

Anonymous calls are not recorded (there is no account to attach them to). The ESMFold route in main.py
keeps its own consent record and is not routed through this ledger.
"""
import contextvars
import hashlib
import json
import logging
from datetime import datetime, timezone

import sqlalchemy
from starlette.concurrency import run_in_threadpool

log = logging.getLogger("primerai.egress")
CURRENT_USER = contextvars.ContextVar("primer_current_user", default=None)


def _user_id(user):
    if user is None:
        return None
    try:
        value = user["id"] if not hasattr(user, "id") else user.id
        return int(value)
    except (KeyError, TypeError, ValueError):
        return None


def _as_dict(row):
    return dict(row._mapping) if hasattr(row, "_mapping") else dict(row)


class Egress:
    CURRENT_USER = CURRENT_USER

    def __init__(self, database, metadata, engine):
        self.db = database
        self.log = sqlalchemy.Table(
            "egress_log", metadata,
            sqlalchemy.Column("id", sqlalchemy.Integer, primary_key=True, autoincrement=True),
            sqlalchemy.Column("user_id", sqlalchemy.Integer, nullable=False, index=True),
            sqlalchemy.Column("provider", sqlalchemy.String(60), nullable=False),
            sqlalchemy.Column("operation", sqlalchemy.String(60), nullable=False),
            sqlalchemy.Column("payload_sha256", sqlalchemy.String(64), nullable=False),
            sqlalchemy.Column("payload_bytes", sqlalchemy.Integer, nullable=False),
            sqlalchemy.Column("status", sqlalchemy.String(20), nullable=False),
            sqlalchemy.Column("created_at", sqlalchemy.DateTime(timezone=True), server_default=sqlalchemy.func.now()),
            extend_existing=True,
        )
        self.settings = sqlalchemy.Table(
            "egress_user_settings", metadata,
            sqlalchemy.Column("user_id", sqlalchemy.Integer, primary_key=True, autoincrement=False),
            sqlalchemy.Column("private_mode", sqlalchemy.Boolean, nullable=False, default=False),
            sqlalchemy.Column("updated_at", sqlalchemy.DateTime(timezone=True)),
            extend_existing=True,
        )
        metadata.create_all(bind=engine, tables=[self.log, self.settings])

    async def is_private(self, uid: int) -> bool:
        row = await self.db.fetch_one(sqlalchemy.select(self.settings.c.private_mode).where(self.settings.c.user_id == uid))
        return bool(row and _as_dict(row)["private_mode"])

    async def set_private(self, uid: int, value: bool) -> None:
        now = datetime.now(timezone.utc)
        exists = await self.db.fetch_one(sqlalchemy.select(self.settings.c.user_id).where(self.settings.c.user_id == uid))
        if exists:
            await self.db.execute(self.settings.update().where(self.settings.c.user_id == uid).values(private_mode=bool(value), updated_at=now))
        else:
            await self.db.execute(self.settings.insert().values(user_id=uid, private_mode=bool(value), updated_at=now))

    async def record(self, uid: int, provider: str, operation: str, payload, status: str) -> None:
        raw = json.dumps(payload, sort_keys=True, default=str).encode("utf-8")
        await self.db.execute(self.log.insert().values(user_id=uid, provider=str(provider)[:60], operation=str(operation)[:60],
                                                       payload_sha256=hashlib.sha256(raw).hexdigest(), payload_bytes=len(raw), status=status))

    async def entries(self, uid: int, limit: int = 100) -> list:
        rows = await self.db.fetch_all(sqlalchemy.select(self.log).where(self.log.c.user_id == uid).order_by(self.log.c.id.desc()).limit(max(1, min(limit, 500))))
        out = []
        for r in rows:
            d = _as_dict(r)
            d["created_at"] = d["created_at"].isoformat() if hasattr(d.get("created_at"), "isoformat") else d.get("created_at")
            out.append(d)
        return out

    async def _safe_record(self, uid, provider, operation, args, status) -> None:
        try:
            await self.record(uid, provider, operation, args, status)
        except Exception:  # logging must never break a tool
            log.exception("could not write egress log entry")

    async def run_external(self, fn, provider: str, operation: str, args: tuple):
        from fastapi import HTTPException

        uid = _user_id(CURRENT_USER.get())
        if uid is not None:
            try:
                private = await self.is_private(uid)
            except Exception:
                log.exception("could not read private-mode setting; treating as off")
                private = False
            if private:
                raise HTTPException(403, "Private mode is on: calls to external services are disabled for your account")
        try:
            result = await run_in_threadpool(fn, *args)
        except Exception:
            if uid is not None:
                await self._safe_record(uid, provider, operation, args, "error")
            raise
        if uid is not None:
            await self._safe_record(uid, provider, operation, args, "ok")
        return result


def build_egress(database, metadata, engine) -> Egress:
    return Egress(database, metadata, engine)
