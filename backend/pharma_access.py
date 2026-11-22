"""Pharma access gate: request, approve/reject/revoke, and route dependency.

Administrators are selected only via PHARMA_ADMIN_USER_IDS (immutable user IDs).
Revoked users cannot regain access by resubmitting a request.
Access routes live on the outer /pharma router; all research routes depend on
require_pharma_access.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone

import sqlalchemy
from fastapi import APIRouter, Depends, HTTPException

from pharma_helpers import _iso, _row, _uid
from pharma_schemas import AccessDecision, PharmaAccessRequest
from pharma_observability import access_event


def build_access_layer(*, database, access, users_table, get_current_user):
    """Return admin helpers and a register(root) that wires /access/* routes."""

    # Privileged accounts are selected by immutable user IDs, configured on the
    # server, not by client input, email domains, or email_verified flag.
    def configured_admin_ids():
        raw = os.getenv("PHARMA_ADMIN_USER_IDS", "")
        return {int(part.strip()) for part in raw.split(",") if part.strip().isdigit() and int(part.strip()) > 0}

    def is_admin(user):
        return _uid(user) in configured_admin_ids()

    async def require_admin(user=Depends(get_current_user)):
        if not is_admin(user):
            raise HTTPException(403, "Pharma administrator access required")
        return user

    async def require_pharma_access(user=Depends(get_current_user)):
        if is_admin(user):
            return user
        row = await database.fetch_one(
            sqlalchemy.select(access.c.status).where(access.c.user_id == _uid(user))
        )
        if not row or _row(row)["status"] != "approved":
            raise HTTPException(403, "Pharma access has not been approved")
        return user

    def register(root: APIRouter) -> None:
        # Entry/status and admin actions stay separately authenticated; every
        # existing Pharma API route is covered by the dependency on the inner router.

        @root.get("/access/status")
        async def access_status(user=Depends(get_current_user)):
            row = await database.fetch_one(
                sqlalchemy.select(access).where(access.c.user_id == _uid(user))
            )
            status = _row(row)["status"] if row else "not_requested"
            out = {"status": "approved" if is_admin(user) else status, "is_admin": is_admin(user)}
            access_event(action="status", status=out["status"], is_admin=out["is_admin"], user_id=_uid(user))
            return out

        @root.post("/access/request")
        async def request_access(req: PharmaAccessRequest, user=Depends(get_current_user)):
            if is_admin(user):
                return {"status": "approved"}
            name, purpose = req.organization_name.strip(), req.purpose.strip()
            if len(name) < 2 or len(purpose) < 5:
                raise HTTPException(422, "Organization and purpose are required")
            uid = _uid(user)
            existing = await database.fetch_one(
                sqlalchemy.select(access.c.status).where(access.c.user_id == uid)
            )
            if existing:
                current = _row(existing)["status"]
                if current in ("pending", "approved"):
                    return {"status": current}
                # A revoked approval cannot be regained through resubmitting.
                if current == "revoked":
                    raise HTTPException(403, "Access revoked; contact the administrator")
                await database.execute(
                    access.update()
                    .where(access.c.user_id == uid, access.c.status == "rejected")
                    .values(
                        organization_name=name,
                        purpose=purpose,
                        status="pending",
                        reviewed_by=None,
                        updated_at=datetime.now(timezone.utc),
                    )
                )
            else:
                try:
                    await database.execute(
                        access.insert().values(
                            user_id=uid,
                            organization_name=name,
                            purpose=purpose,
                            status="pending",
                            updated_at=datetime.now(timezone.utc),
                        )
                    )
                except sqlalchemy.exc.IntegrityError:
                    raise HTTPException(409, "A request already exists; refresh status")
            return {"status": "pending"}

        @root.get("/access/admin/requests")
        async def admin_requests(admin=Depends(require_admin)):
            rows = await database.fetch_all(
                sqlalchemy.select(
                    access.c.user_id,
                    access.c.organization_name,
                    access.c.purpose,
                    access.c.status,
                    access.c.created_at,
                    access.c.updated_at,
                    users_table.c.email,
                )
                .select_from(access.join(users_table, access.c.user_id == users_table.c.id))
                .order_by(access.c.updated_at.desc())
                .limit(500)
            )
            admins = configured_admin_ids()
            return {
                "items": [
                    {
                        **_row(r),
                        "created_at": _iso(_row(r)["created_at"]),
                        "updated_at": _iso(_row(r)["updated_at"]),
                        # Configured administrators never need approval and cannot be managed here.
                        "is_admin": int(_row(r)["user_id"]) in admins,
                    }
                    for r in rows
                ]
            }

        @root.post("/access/admin/requests/{user_id}/decision")
        async def decide_access(user_id: int, req: AccessDecision, admin=Depends(require_admin)):
            if user_id in configured_admin_ids():
                raise HTTPException(403, "Configured administrators cannot be managed here")
            existing = await database.fetch_one(
                sqlalchemy.select(access.c.status).where(access.c.user_id == user_id)
            )
            if not existing:
                raise HTTPException(404, "Request not found")
            await database.execute(
                access.update()
                .where(access.c.user_id == user_id)
                .values(
                    status=req.status,
                    reviewed_by=_uid(admin),
                    updated_at=datetime.now(timezone.utc),
                )
            )
            access_event(action="decision", status=req.status, user_id=user_id)
            return {"status": req.status}

    return {
        "configured_admin_ids": configured_admin_ids,
        "is_admin": is_admin,
        "require_admin": require_admin,
        "require_pharma_access": require_pharma_access,
        "register": register,
    }
