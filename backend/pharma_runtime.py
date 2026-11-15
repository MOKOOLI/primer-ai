"""Shared runtime helpers for Pharma routes: cache, drug load, org membership.

Stale-cache-on-upstream-failure is intentional resilience for research fetches.
Organization membership errors return 404 (no membership enumeration).
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import sqlalchemy
from fastapi import HTTPException
from starlette.concurrency import run_in_threadpool

from pharma_constants import CACHE_TTL, CHEMBL_RE, Q_DRUG
from pharma_helpers import _row, _uid
from pharma_normalize import UpstreamError, _ot_query, normalize_drug
from pharma_observability import cache_event

log = logging.getLogger("primerai.pharma")

WRITERS = ("owner", "admin", "researcher")
MANAGERS = ("owner", "admin")


def build_runtime(*, database, cache, members):
    """Return cached, load_drug, membership, require bound to this app's DB tables."""

    async def cached(key: str, loader, ttl: timedelta = CACHE_TTL):
        """Return (payload, fetched_at). Serves stale cache if upstream fails."""
        row = await database.fetch_one(sqlalchemy.select(cache).where(cache.c.key == key))
        stale = None
        if row:
            r = _row(row)
            fetched = r["fetched_at"]
            if fetched is not None and fetched.tzinfo is None:
                fetched = fetched.replace(tzinfo=timezone.utc)
            stale = (json.loads(r["payload"]), fetched)
            if fetched and datetime.now(timezone.utc) - fetched < ttl:
                cache_event(key=key, outcome="hit", ttl_hours=ttl.total_seconds() / 3600.0)
                return stale
        cache_event(key=key, outcome="miss")
        try:
            payload = await run_in_threadpool(loader)
        except UpstreamError as e:
            if stale:
                cache_event(key=key, outcome="stale", error=str(e))
                return stale
            cache_event(key=key, outcome="error", error=str(e))
            raise HTTPException(502, str(e))
        ts = datetime.now(timezone.utc)
        body = json.dumps(payload, ensure_ascii=False)
        async with database.transaction():
            await database.execute(cache.delete().where(cache.c.key == key))
            await database.execute(cache.insert().values(key=key, payload=body, fetched_at=ts))
        cache_event(key=key, outcome="store", ttl_hours=ttl.total_seconds() / 3600.0)
        return payload, ts

    async def load_drug(chembl_id: str) -> tuple[dict, datetime]:
        cid = chembl_id.strip().upper()
        if not CHEMBL_RE.match(cid):
            raise HTTPException(422, "Drug ID must be a ChEMBL ID such as CHEMBL1487")
        drug, ts = await cached(
            f"drug-v3:{cid}",
            lambda: normalize_drug(_ot_query(Q_DRUG, {"id": cid})),
        )
        if not drug:
            raise HTTPException(404, "Drug not found in Open Targets")
        return drug, ts

    async def membership(organization_id: str, user: Any) -> str:
        row = await database.fetch_one(
            sqlalchemy.select(members.c.role).where(
                members.c.organization_id == organization_id,
                members.c.user_id == _uid(user),
            )
        )
        if not row:
            raise HTTPException(404, "Organization not found")  # no enumeration
        return _row(row)["role"]

    async def require(organization_id: str, user: Any, *roles: str) -> str:
        role = await membership(organization_id, user)
        if roles and role not in roles:
            raise HTTPException(403, "Your role in this organization does not allow this action")
        return role

    return {
        "cached": cached,
        "load_drug": load_drug,
        "membership": membership,
        "require": require,
        "WRITERS": WRITERS,
        "MANAGERS": MANAGERS,
    }
