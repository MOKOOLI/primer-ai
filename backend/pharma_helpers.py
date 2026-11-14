"""Small shared helpers for the Pharma module."""
from __future__ import annotations

from typing import Any

from fastapi import HTTPException


def uid(user: Any) -> int:
    if isinstance(user, dict):
        value = user.get("id")
    else:
        try:
            value = user["id"]
        except Exception:
            value = getattr(user, "id", None)
    if value is None:
        raise HTTPException(401, "Authenticated user ID missing")
    return int(value)


def row(r) -> dict:
    return dict(r._mapping) if hasattr(r, "_mapping") else dict(r)


def iso(v):
    return v.isoformat() if hasattr(v, "isoformat") else v


# -------------------------------------------------------------------- router

# Back-compat aliases used throughout create_pharma_router
_uid = uid
_row = row
_iso = iso
