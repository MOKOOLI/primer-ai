"""Organization workspace routes: members, projects, research library.

Role gates use WRITERS / MANAGERS from pharma_runtime. Gene origin for projects
is server-decided from Open Targets targets when the drug is loaded.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

import sqlalchemy
from fastapi import APIRouter, Depends, HTTPException

from pharma_constants import SOURCE_INFO
from pharma_helpers import _iso, _row, _uid
from pharma_normalize import clean_gene_list
from pharma_runtime import MANAGERS, WRITERS
from pharma_schemas import LibraryItemCreate, MemberAdd, OrganizationCreate, ProjectCreate


def register_org_routes(
    router: APIRouter,
    *,
    database,
    organizations,
    members,
    projects,
    library,
    users_table,
    get_current_user,
    require,
    load_drug,
):
    """Attach /organizations* routes onto the access-gated router."""
    # ----------------------------------------------------- organizations
    @router.get("/organizations")
    async def list_organizations(user=Depends(get_current_user)):
        rows = await database.fetch_all(
            sqlalchemy.select(organizations.c.id, organizations.c.name, members.c.role, organizations.c.created_at)
            .select_from(organizations.join(members, organizations.c.id == members.c.organization_id))
            .where(members.c.user_id == _uid(user)).order_by(organizations.c.created_at.desc()))
        return {"items": [{**_row(r), "created_at": _iso(_row(r)["created_at"])} for r in rows]}

    @router.post("/organizations", status_code=201)
    async def create_organization(req: OrganizationCreate, user=Depends(get_current_user)):
        uid, oid, name = _uid(user), str(uuid.uuid4()), req.name.strip()
        async with database.transaction():
            await database.execute(organizations.insert().values(id=oid, name=name, owner_user_id=uid))
            await database.execute(members.insert().values(organization_id=oid, user_id=uid, role="owner", added_by=uid))
        return {"id": oid, "name": name, "role": "owner"}

    @router.get("/organizations/{organization_id}/members")
    async def list_members(organization_id: str, user=Depends(get_current_user)):
        await require(organization_id, user)
        rows = await database.fetch_all(
            sqlalchemy.select(members.c.user_id, members.c.role, users_table.c.email)
            .select_from(members.join(users_table, users_table.c.id == members.c.user_id))
            .where(members.c.organization_id == organization_id).order_by(members.c.created_at))
        return {"items": [_row(r) for r in rows]}

    @router.post("/organizations/{organization_id}/members", status_code=201)
    async def add_member(organization_id: str, req: MemberAdd, user=Depends(get_current_user)):
        role = await require(organization_id, user, *MANAGERS)
        if req.role == "admin" and role != "owner":
            raise HTTPException(403, "Only the owner can add admins")
        email = req.email.strip().lower()
        target = await database.fetch_one(sqlalchemy.select(users_table.c.id)
                                          .where(sqlalchemy.func.lower(users_table.c.email) == email))
        if not target:
            raise HTTPException(404, "No registered account with that email. Ask them to sign up first.")
        tid = int(_row(target)["id"])
        exists = await database.fetch_one(sqlalchemy.select(members.c.user_id).where(
            members.c.organization_id == organization_id, members.c.user_id == tid))
        if exists:
            raise HTTPException(409, "That account is already a member")
        await database.execute(members.insert().values(organization_id=organization_id, user_id=tid,
                                                       role=req.role, added_by=_uid(user)))
        return {"user_id": tid, "email": email, "role": req.role}

    @router.delete("/organizations/{organization_id}/members/{member_id}")
    async def remove_member(organization_id: str, member_id: int, user=Depends(get_current_user)):
        role = await require(organization_id, user, *MANAGERS)
        row = await database.fetch_one(sqlalchemy.select(members.c.role).where(
            members.c.organization_id == organization_id, members.c.user_id == member_id))
        if not row:
            raise HTTPException(404, "Member not found")
        target_role = _row(row)["role"]
        if target_role == "owner":
            raise HTTPException(403, "The owner cannot be removed")
        if target_role == "admin" and role != "owner":
            raise HTTPException(403, "Only the owner can remove admins")
        await database.execute(members.delete().where(
            members.c.organization_id == organization_id, members.c.user_id == member_id))
        return {"status": "removed"}

    # ---------------------------------------------------------- projects
    def project_out(r) -> dict:
        d = _row(r)
        for k in ("genes", "pathways", "evidence"):
            d[k] = json.loads(d[k] or ("{}" if k == "evidence" else "[]"))
        d["created_at"] = _iso(d["created_at"])
        return d

    @router.get("/organizations/{organization_id}/projects")
    async def list_projects(organization_id: str, user=Depends(get_current_user)):
        await require(organization_id, user)
        rows = await database.fetch_all(sqlalchemy.select(projects)
                                        .where(projects.c.organization_id == organization_id)
                                        .order_by(projects.c.created_at.desc()))
        return {"items": [project_out(r) for r in rows]}

    @router.post("/organizations/{organization_id}/projects", status_code=201)
    async def create_project(organization_id: str, req: ProjectCreate, user=Depends(get_current_user)):
        await require(organization_id, user, *WRITERS)
        drug, ts = await load_drug(req.drug_chembl_id)
        known = {t["symbol"].upper(): t for t in drug["targets"]}
        genes = clean_gene_list([g.dict() for g in req.genes])
        for g in genes:  # origin is decided by the server, not the client
            if g["symbol"] in known:
                g["origin"] = "open_targets"
                g["ensembl_id"] = known[g["symbol"]]["ensembl_id"]
            else:
                g["origin"] = "user"
        evidence = {
            "drug": {k: drug[k] for k in ("id", "name", "drug_type", "max_clinical_phase", "withdrawn", "url")},
            "mechanisms": [m for m in drug["mechanisms"]
                           if any(t["symbol"].upper() in {g["symbol"] for g in genes} for t in m["targets"])],
            "retrieved_at": _iso(ts),
            "source": {"provider": SOURCE_INFO["provider"], "license": SOURCE_INFO["license"],
                       "upstream": SOURCE_INFO["upstream"]},
        }
        evidence["drug"]["clinical_stage"] = drug.get("clinical_stage")
        pid = str(uuid.uuid4())
        values = dict(
            id=pid, organization_id=organization_id, created_by=_uid(user), name=req.name.strip(),
            drug_chembl_id=drug["id"], drug_name=drug["name"], organism=req.organism.strip(),
            model_system=req.model_system.strip(), dose_text=req.dose_text.strip(),
            duration_text=req.duration_text.strip(), hypothesis=req.hypothesis.strip(),
            genes=json.dumps(genes), pathways=json.dumps([p.dict() for p in req.pathways], ensure_ascii=False),
            evidence=json.dumps(evidence, ensure_ascii=False),
        )
        await database.execute(projects.insert().values(**values))
        row = await database.fetch_one(sqlalchemy.select(projects).where(projects.c.id == pid))
        return project_out(row)

    @router.delete("/organizations/{organization_id}/projects/{project_id}")
    async def delete_project(organization_id: str, project_id: str, user=Depends(get_current_user)):
        role = await require(organization_id, user, *WRITERS)
        row = await database.fetch_one(sqlalchemy.select(projects.c.created_by).where(
            projects.c.id == project_id, projects.c.organization_id == organization_id))
        if not row:
            raise HTTPException(404, "Project not found")
        if role not in MANAGERS and int(_row(row)["created_by"]) != _uid(user):
            raise HTTPException(403, "Only the creator or an organization admin can delete this project")
        await database.execute(projects.delete().where(projects.c.id == project_id,
                                                       projects.c.organization_id == organization_id))
        return {"status": "deleted"}

    def library_item_out(row, user=None, role: str = "") -> dict:
        item = _row(row)
        item["details"] = json.loads(item.get("details") or "{}")
        item["created_at"] = _iso(item.get("created_at"))
        if user is not None:
            item["can_delete"] = role in MANAGERS or int(item["created_by"]) == _uid(user)
        return item

    @router.get("/organizations/{organization_id}/library")
    async def list_library(organization_id: str, user=Depends(get_current_user)):
        role = await require(organization_id, user)
        rows = await database.fetch_all(
            sqlalchemy.select(library).where(library.c.organization_id == organization_id)
            .order_by(library.c.created_at.desc()).limit(500)
        )
        return {"items": [library_item_out(row, user, role) for row in rows]}

    @router.post("/organizations/{organization_id}/library", status_code=201)
    async def save_library_item(
        organization_id: str, req: LibraryItemCreate, user=Depends(get_current_user)
    ):
        role = await require(organization_id, user, *WRITERS)
        url = req.url.strip()
        if not url.startswith("https://"):
            raise HTTPException(422, "Saved research links must use HTTPS")
        details = json.dumps(req.details, ensure_ascii=False)
        if len(details) > 12000:
            raise HTTPException(422, "Saved record details are too large")
        existing = await database.fetch_one(sqlalchemy.select(library.c.id).where(
            library.c.organization_id == organization_id,
            library.c.kind == req.kind,
            library.c.source_id == req.source_id,
        ))
        if existing:
            return {"item": library_item_out(await database.fetch_one(
                sqlalchemy.select(library).where(
                    library.c.organization_id == organization_id,
                    library.c.kind == req.kind,
                    library.c.source_id == req.source_id,
                )
            ), user, role), "already_saved": True}
        item_id = str(uuid.uuid4())
        try:
            await database.execute(library.insert().values(
                id=item_id, organization_id=organization_id, created_by=_uid(user),
                kind=req.kind, source_id=req.source_id, title=req.title.strip(),
                summary=req.summary.strip(), url=url, provider=req.provider.strip(),
                license=req.license.strip(), retrieved_at=req.retrieved_at.strip(),
                details=details,
            ))
        except sqlalchemy.exc.IntegrityError:
            row = await database.fetch_one(sqlalchemy.select(library).where(
                library.c.organization_id == organization_id,
                library.c.kind == req.kind,
                library.c.source_id == req.source_id,
            ))
            if row:
                return {"item": library_item_out(row, user, role), "already_saved": True}
            raise HTTPException(409, "Could not save this research record")
        row = await database.fetch_one(sqlalchemy.select(library).where(library.c.id == item_id))
        return {"item": library_item_out(row, user, role), "already_saved": False}

    @router.delete("/organizations/{organization_id}/library/{item_id}")
    async def delete_library_item(
        organization_id: str, item_id: str, user=Depends(get_current_user)
    ):
        role = await require(organization_id, user, *WRITERS)
        row = await database.fetch_one(sqlalchemy.select(library.c.created_by).where(
            library.c.id == item_id, library.c.organization_id == organization_id
        ))
        if not row:
            raise HTTPException(404, "Saved record not found")
        if role not in MANAGERS and int(_row(row)["created_by"]) != _uid(user):
            raise HTTPException(403, "Only the creator or an organization admin can remove this record")
        await database.execute(library.delete().where(
            library.c.id == item_id, library.c.organization_id == organization_id
        ))
        return {"status": "deleted"}
