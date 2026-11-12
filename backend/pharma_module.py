"""Primer AI - Pharma Research module (v1).

Live drug -> target -> pathway data from the Open Targets Platform GraphQL API
(https://platform.opentargets.org). Open Targets data is CC0 1.0; the drug
mechanism-of-action records it serves come from ChEMBL (CC BY-SA 3.0), so the
UI must keep the attribution that this module returns in every payload.

Organization-scoped projects: every project belongs to one organization and is
only visible to that organization's members.

Wire-up in main.py (after get_current_user is defined):
    from pharma_module import create_pharma_router
    app.include_router(create_pharma_router(database, metadata, engine, users_table, get_current_user))

Research use only. Nothing here is a treatment, dosing or diagnostic recommendation.
"""
from __future__ import annotations

import json
import os
import logging
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Literal, Optional

import requests
import sqlalchemy
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

log = logging.getLogger("primerai.pharma")

OT_GRAPHQL = "https://api.platform.opentargets.org/api/v4/graphql"
OT_DRUG_URL = "https://platform.opentargets.org/drug/{id}"
OT_TARGET_URL = "https://platform.opentargets.org/target/{id}"
CACHE_TTL = timedelta(days=7)
MAX_TARGETS_WITH_PATHWAYS = 15
MAX_PATHWAYS_PER_TARGET = 40

SOURCE_INFO = {
    "provider": "Open Targets Platform",
    "url": "https://platform.opentargets.org",
    "license": "Open Targets Platform data: CC0 1.0",
    "upstream": [
        {"name": "ChEMBL (drug mechanisms of action)", "license": "CC BY-SA 3.0", "url": "https://www.ebi.ac.uk/chembl/"},
        {"name": "Reactome (pathways)", "license": "CC BY 4.0", "url": "https://reactome.org"},
    ],
    "citation": "Open Targets Platform, https://platform.opentargets.org (see platform-docs.opentargets.org/citation)",
    "use": "Research use only. Not for diagnosis, treatment or dosing decisions.",
}

CHEMBL_RE = re.compile(r"^CHEMBL\d{1,10}$")
ENSG_RE = re.compile(r"^ENSG\d{11}$")
GENE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9.\-]{0,23}$")

Q_SEARCH = """
query DrugSearch($q: String!) {
  search(queryString: $q, entityNames: ["drug"], page: {index: 0, size: 10}) {
    total
    hits { id entity name description }
  }
}"""

Q_DRUG = """
query DrugDetail($id: String!) {
  drug(chemblId: $id) {
    id
    name
    drugType
    maximumClinicalTrialPhase
    hasBeenWithdrawn
    description
    mechanismsOfAction {
      uniqueActionTypes
      uniqueTargetTypes
      rows {
        mechanismOfAction
        targetName
        targets { id approvedSymbol }
        references { source urls }
      }
    }
  }
}"""

Q_TARGET_PATHWAYS = """
query TargetPathways($id: String!) {
  target(ensemblId: $id) {
    id
    approvedSymbol
    approvedName
    pathways { pathway pathwayId }
  }
}"""


class UpstreamError(Exception):
    pass


def _ot_query(query: str, variables: dict) -> dict:
    """POST one GraphQL query to Open Targets; raise UpstreamError on any failure."""
    try:
        r = requests.post(OT_GRAPHQL, json={"query": query, "variables": variables},
                          headers={"Content-Type": "application/json", "User-Agent": "primer-ai"}, timeout=20)
    except requests.RequestException as e:
        raise UpstreamError(f"Open Targets unreachable: {e.__class__.__name__}") from e
    if r.status_code != 200:
        raise UpstreamError(f"Open Targets HTTP {r.status_code}")
    try:
        body = r.json()
    except ValueError as e:
        raise UpstreamError("Open Targets returned invalid JSON") from e
    if body.get("errors"):
        msg = "; ".join(str(e.get("message", "")) for e in body["errors"])[:300]
        raise UpstreamError(f"Open Targets query error: {msg}")
    return body.get("data") or {}


# ---------------------------------------------------------------- normalizers
def normalize_search(data: dict) -> list[dict]:
    hits = ((data or {}).get("search") or {}).get("hits") or []
    out = []
    for h in hits:
        if h.get("entity") != "drug" or not CHEMBL_RE.match(str(h.get("id", ""))):
            continue
        out.append({"id": h["id"], "name": h.get("name") or h["id"],
                    "description": (h.get("description") or "")[:400]})
    return out


def normalize_drug(data: dict) -> Optional[dict]:
    d = (data or {}).get("drug")
    if not d:
        return None
    moa = d.get("mechanismsOfAction") or {}
    mechanisms, targets = [], {}
    for row in moa.get("rows") or []:
        refs = []
        for ref in row.get("references") or []:
            for u in (ref.get("urls") or [])[:5]:
                if isinstance(u, str) and u.startswith(("http://", "https://")):
                    refs.append({"source": ref.get("source") or "", "url": u})
        row_targets = []
        for t in row.get("targets") or []:
            tid, sym = t.get("id"), t.get("approvedSymbol")
            if not tid or not sym:
                continue
            row_targets.append({"ensembl_id": tid, "symbol": sym})
            entry = targets.setdefault(tid, {"ensembl_id": tid, "symbol": sym, "mechanisms": [],
                                             "references": [], "url": OT_TARGET_URL.format(id=tid)})
            m = row.get("mechanismOfAction") or ""
            if m and m not in entry["mechanisms"]:
                entry["mechanisms"].append(m)
            for ref in refs:
                if ref not in entry["references"]:
                    entry["references"].append(ref)
        mechanisms.append({"mechanism": row.get("mechanismOfAction") or "",
                           "target_name": row.get("targetName") or "",
                           "targets": row_targets, "references": refs[:10]})
    return {
        "id": d.get("id"), "name": d.get("name") or d.get("id"),
        "drug_type": d.get("drugType") or "",
        "max_clinical_phase": d.get("maximumClinicalTrialPhase"),
        "withdrawn": bool(d.get("hasBeenWithdrawn")),
        "description": (d.get("description") or "")[:1200],
        "action_types": moa.get("uniqueActionTypes") or [],
        "target_types": moa.get("uniqueTargetTypes") or [],
        "mechanisms": mechanisms,
        "targets": sorted(targets.values(), key=lambda x: x["symbol"]),
        "url": OT_DRUG_URL.format(id=d.get("id")),
    }


def normalize_pathways(data: dict) -> Optional[dict]:
    t = (data or {}).get("target")
    if not t:
        return None
    seen, pathways = set(), []
    for p in t.get("pathways") or []:
        pid, name = p.get("pathwayId"), p.get("pathway")
        if not pid or not name or pid in seen:
            continue
        seen.add(pid)
        pathways.append({"id": pid, "name": name, "url": f"https://reactome.org/content/detail/{pid}"})
    return {"ensembl_id": t.get("id"), "symbol": t.get("approvedSymbol"),
            "name": t.get("approvedName") or "", "pathways": pathways[:MAX_PATHWAYS_PER_TARGET]}


def clean_gene_list(items: list, allowed_origins=("open_targets", "user")) -> list[dict]:
    out, seen = [], set()
    for g in items:
        sym = str(g.get("symbol", "")).strip().upper()
        if not GENE_RE.match(sym):
            raise HTTPException(422, f"Invalid gene symbol: {g.get('symbol')}")
        if sym in seen:
            continue
        seen.add(sym)
        ens = str(g.get("ensembl_id") or "").strip()
        if ens and not ENSG_RE.match(ens):
            raise HTTPException(422, f"Invalid Ensembl ID: {ens}")
        origin = g.get("origin") or "user"
        if origin not in allowed_origins:
            origin = "user"
        out.append({"symbol": sym, "ensembl_id": ens or None, "origin": origin})
    return out


# ------------------------------------------------------------------- schemas
class PharmaAccessRequest(BaseModel):
    organization_name: str = Field(..., min_length=2, max_length=160)
    purpose: str = Field(..., min_length=5, max_length=1000)


class AccessDecision(BaseModel):
    status: Literal["approved", "rejected", "revoked"]


class OrganizationCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)


class MemberAdd(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    role: Literal["admin", "researcher", "viewer"] = "researcher"


class GeneItem(BaseModel):
    symbol: str = Field(min_length=1, max_length=24)
    ensembl_id: Optional[str] = Field(None, max_length=20)
    origin: Literal["open_targets", "user"] = "user"


class PathwayItem(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=1, max_length=300)


class ProjectCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    drug_chembl_id: str = Field(min_length=7, max_length=20)
    organism: str = Field("Homo sapiens", min_length=2, max_length=100)
    model_system: str = Field("", max_length=200)
    dose_text: str = Field("", max_length=120)
    duration_text: str = Field("", max_length=120)
    hypothesis: str = Field("", max_length=4000)
    genes: list[GeneItem] = Field(..., min_items=1, max_items=40)
    pathways: list[PathwayItem] = Field(default_factory=list, max_items=20)


def _uid(user: Any) -> int:
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


def _row(r) -> dict:
    return dict(r._mapping) if hasattr(r, "_mapping") else dict(r)


def _iso(v):
    return v.isoformat() if hasattr(v, "isoformat") else v


# -------------------------------------------------------------------- router
def create_pharma_router(database, metadata, engine, users_table, get_current_user):
    now = sqlalchemy.func.now()
    organizations = sqlalchemy.Table(
        "pharma_organizations", metadata,
        sqlalchemy.Column("id", sqlalchemy.String(36), primary_key=True),
        sqlalchemy.Column("name", sqlalchemy.String(160), nullable=False),
        sqlalchemy.Column("owner_user_id", sqlalchemy.Integer, nullable=False, index=True),
        sqlalchemy.Column("created_at", sqlalchemy.DateTime(timezone=True), server_default=now, nullable=False),
        extend_existing=True,
    )
    members = sqlalchemy.Table(
        "pharma_organization_members", metadata,
        sqlalchemy.Column("organization_id", sqlalchemy.String(36), primary_key=True),
        sqlalchemy.Column("user_id", sqlalchemy.Integer, primary_key=True),
        sqlalchemy.Column("role", sqlalchemy.String(20), nullable=False),
        sqlalchemy.Column("added_by", sqlalchemy.Integer, nullable=False),
        sqlalchemy.Column("created_at", sqlalchemy.DateTime(timezone=True), server_default=now, nullable=False),
        extend_existing=True,
    )
    # New table name (v2) so earlier MVP deployments need no ALTER TABLE.
    projects = sqlalchemy.Table(
        "pharma_projects_v2", metadata,
        sqlalchemy.Column("id", sqlalchemy.String(36), primary_key=True),
        sqlalchemy.Column("organization_id", sqlalchemy.String(36), nullable=False, index=True),
        sqlalchemy.Column("created_by", sqlalchemy.Integer, nullable=False),
        sqlalchemy.Column("name", sqlalchemy.String(160), nullable=False),
        sqlalchemy.Column("drug_chembl_id", sqlalchemy.String(20), nullable=False, index=True),
        sqlalchemy.Column("drug_name", sqlalchemy.String(200), nullable=False),
        sqlalchemy.Column("organism", sqlalchemy.String(100), nullable=False),
        sqlalchemy.Column("model_system", sqlalchemy.String(200), nullable=False, default=""),
        sqlalchemy.Column("dose_text", sqlalchemy.String(120), nullable=False, default=""),
        sqlalchemy.Column("duration_text", sqlalchemy.String(120), nullable=False, default=""),
        sqlalchemy.Column("hypothesis", sqlalchemy.Text, nullable=False, default=""),
        sqlalchemy.Column("genes", sqlalchemy.Text, nullable=False),
        sqlalchemy.Column("pathways", sqlalchemy.Text, nullable=False, default="[]"),
        sqlalchemy.Column("evidence", sqlalchemy.Text, nullable=False),
        sqlalchemy.Column("created_at", sqlalchemy.DateTime(timezone=True), server_default=now, nullable=False),
        extend_existing=True,
    )
    cache = sqlalchemy.Table(
        "pharma_source_cache", metadata,
        sqlalchemy.Column("key", sqlalchemy.String(120), primary_key=True),
        sqlalchemy.Column("payload", sqlalchemy.Text, nullable=False),
        sqlalchemy.Column("fetched_at", sqlalchemy.DateTime(timezone=True), nullable=False),
        extend_existing=True,
    )
    access = sqlalchemy.Table(
        "pharma_access_requests_v1", metadata,
        sqlalchemy.Column("user_id", sqlalchemy.Integer, primary_key=True),
        sqlalchemy.Column("organization_name", sqlalchemy.String(160), nullable=False),
        sqlalchemy.Column("purpose", sqlalchemy.String(1000), nullable=False),
        sqlalchemy.Column("status", sqlalchemy.String(16), nullable=False, index=True),
        sqlalchemy.Column("reviewed_by", sqlalchemy.Integer, nullable=True),
        sqlalchemy.Column("created_at", sqlalchemy.DateTime(timezone=True), server_default=now, nullable=False),
        sqlalchemy.Column("updated_at", sqlalchemy.DateTime(timezone=True), server_default=now, nullable=False),
        extend_existing=True,
    )
    metadata.create_all(bind=engine, tables=[organizations, members, projects, cache, access])

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
        row = await database.fetch_one(sqlalchemy.select(access.c.status).where(access.c.user_id == _uid(user)))
        if not row or _row(row)["status"] != "approved":
            raise HTTPException(403, "Pharma access has not been approved")
        return user

    # Entry/status and admin actions stay separately authenticated; every
    # existing Pharma API route is covered by the dependency on this router.
    root = APIRouter(prefix="/pharma", tags=["Pharma Research"])
    router = APIRouter(dependencies=[Depends(require_pharma_access)])

    @root.get("/access/status")
    async def access_status(user=Depends(get_current_user)):
        row = await database.fetch_one(sqlalchemy.select(access).where(access.c.user_id == _uid(user)))
        status = _row(row)["status"] if row else "not_requested"
        return {"status": "approved" if is_admin(user) else status, "is_admin": is_admin(user)}

    @root.post("/access/request")
    async def request_access(req: PharmaAccessRequest, user=Depends(get_current_user)):
        if is_admin(user):
            return {"status": "approved"}
        name, purpose = req.organization_name.strip(), req.purpose.strip()
        if len(name) < 2 or len(purpose) < 5:
            raise HTTPException(422, "Organization and purpose are required")
        uid = _uid(user)
        existing = await database.fetch_one(sqlalchemy.select(access.c.status).where(access.c.user_id == uid))
        if existing:
            current = _row(existing)["status"]
            if current in ("pending", "approved"):
                return {"status": current}
            # A revoked approval cannot be regained through resubmitting.
            if current == "revoked":
                raise HTTPException(403, "Access revoked; contact the administrator")
            await database.execute(access.update().where(access.c.user_id == uid, access.c.status == "rejected").values(
                organization_name=name, purpose=purpose, status="pending", reviewed_by=None,
                updated_at=datetime.now(timezone.utc)))
        else:
            try:
                await database.execute(access.insert().values(user_id=uid, organization_name=name, purpose=purpose,
                                                              status="pending", updated_at=datetime.now(timezone.utc)))
            except sqlalchemy.exc.IntegrityError:
                raise HTTPException(409, "A request already exists; refresh status")
        return {"status": "pending"}

    @root.get("/access/admin/requests")
    async def admin_requests(admin=Depends(require_admin)):
        rows = await database.fetch_all(
            sqlalchemy.select(access.c.user_id, access.c.organization_name, access.c.purpose, access.c.status,
                              access.c.created_at, access.c.updated_at, users_table.c.email)
            .select_from(access.join(users_table, access.c.user_id == users_table.c.id))
            .order_by(access.c.updated_at.desc()).limit(500))
        return {"items": [{**_row(r), "created_at": _iso(_row(r)["created_at"]),
                           "updated_at": _iso(_row(r)["updated_at"])} for r in rows]}

    @root.post("/access/admin/requests/{user_id}/decision")
    async def decide_access(user_id: int, req: AccessDecision, admin=Depends(require_admin)):
        if user_id in configured_admin_ids():
            raise HTTPException(403, "Configured administrators cannot be managed here")
        existing = await database.fetch_one(sqlalchemy.select(access.c.status).where(access.c.user_id == user_id))
        if not existing:
            raise HTTPException(404, "Request not found")
        await database.execute(access.update().where(access.c.user_id == user_id).values(
            status=req.status, reviewed_by=_uid(admin), updated_at=datetime.now(timezone.utc)))
        return {"status": req.status}


    # ------------------------------------------------------------- caching
    async def cached(key: str, loader):
        """Return (payload, fetched_at). Serves stale cache if upstream fails."""
        row = await database.fetch_one(sqlalchemy.select(cache).where(cache.c.key == key))
        stale = None
        if row:
            r = _row(row)
            fetched = r["fetched_at"]
            if fetched is not None and fetched.tzinfo is None:
                fetched = fetched.replace(tzinfo=timezone.utc)
            stale = (json.loads(r["payload"]), fetched)
            if fetched and datetime.now(timezone.utc) - fetched < CACHE_TTL:
                return stale
        try:
            payload = await run_in_threadpool(loader)
        except UpstreamError as e:
            if stale:
                log.warning("Serving stale cache for %s: %s", key, e)
                return stale
            raise HTTPException(502, str(e))
        ts = datetime.now(timezone.utc)
        body = json.dumps(payload, ensure_ascii=False)
        async with database.transaction():
            await database.execute(cache.delete().where(cache.c.key == key))
            await database.execute(cache.insert().values(key=key, payload=body, fetched_at=ts))
        return payload, ts

    async def load_drug(chembl_id: str) -> tuple[dict, datetime]:
        cid = chembl_id.strip().upper()
        if not CHEMBL_RE.match(cid):
            raise HTTPException(422, "Drug ID must be a ChEMBL ID such as CHEMBL1487")
        drug, ts = await cached(f"drug:{cid}", lambda: normalize_drug(_ot_query(Q_DRUG, {"id": cid})))
        if not drug:
            raise HTTPException(404, "Drug not found in Open Targets")
        return drug, ts

    # -------------------------------------------------------- permissions
    async def membership(organization_id: str, user: Any) -> str:
        row = await database.fetch_one(sqlalchemy.select(members.c.role).where(
            members.c.organization_id == organization_id, members.c.user_id == _uid(user)))
        if not row:
            raise HTTPException(404, "Organization not found")  # no enumeration
        return _row(row)["role"]

    async def require(organization_id: str, user: Any, *roles: str) -> str:
        role = await membership(organization_id, user)
        if roles and role not in roles:
            raise HTTPException(403, "Your role in this organization does not allow this action")
        return role

    WRITERS = ("owner", "admin", "researcher")
    MANAGERS = ("owner", "admin")

    # ------------------------------------------------------- source data
    @router.get("/sources")
    async def sources():
        return SOURCE_INFO

    @router.get("/drugs/search")
    async def search_drugs(q: str = Query(..., min_length=2, max_length=80), user=Depends(get_current_user)):
        term = re.sub(r"\s+", " ", q).strip()
        if CHEMBL_RE.match(term.upper()):
            drug, ts = await load_drug(term)
            return {"items": [{"id": drug["id"], "name": drug["name"], "description": drug["description"][:400]}],
                    "retrieved_at": _iso(ts), "source": SOURCE_INFO}
        items, ts = await cached(f"search:{term.lower()}", lambda: normalize_search(_ot_query(Q_SEARCH, {"q": term})))
        return {"items": items, "retrieved_at": _iso(ts), "source": SOURCE_INFO}

    @router.get("/drugs/{chembl_id}")
    async def drug_detail(chembl_id: str, user=Depends(get_current_user)):
        drug, ts = await load_drug(chembl_id)
        return {"drug": drug, "retrieved_at": _iso(ts), "source": SOURCE_INFO}

    @router.get("/targets/{ensembl_id}/pathways")
    async def target_pathways(ensembl_id: str, user=Depends(get_current_user)):
        eid = ensembl_id.strip()
        if not ENSG_RE.match(eid):
            raise HTTPException(422, "Target ID must be an Ensembl gene ID such as ENSG00000113161")
        data, ts = await cached(f"pathways:{eid}", lambda: normalize_pathways(_ot_query(Q_TARGET_PATHWAYS, {"id": eid})))
        if not data:
            raise HTTPException(404, "Target not found in Open Targets")
        return {"target": data, "retrieved_at": _iso(ts), "source": SOURCE_INFO}

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

    root.include_router(router)
    return root
