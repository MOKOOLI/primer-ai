"""Primer AI - Research Data Bank module (v2).

Federated, source-linked records from Open Targets, Reactome, ClinicalTrials.gov
and Europe PMC, with the drug-mechanism workspace retained as a focused view.
External records are cached and saved to organization-scoped research banks with
their provider, link, retrieval time and record-level licensing note.

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
import asyncio
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Any, Literal, Optional
from urllib.parse import quote

import requests
import sqlalchemy
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field, ValidationError
from starlette.concurrency import run_in_threadpool

from pharma_intelligence import clean_text, lookup_fda, lookup_ema, lookup_pubchem
from pharma_structures import load_experimental_structure
from pharma_evidence import load_chembl_activities, load_clinical_study
from pharma_discovery import load_compound_profile, search_uniprot_structures
from pharma_docking import (docking_status, run_docking, DockingDisabled, DockingUnavailable,
                            DockingBusy, DockingTimedOut, DockingFailed)

log = logging.getLogger("primerai.pharma")

OT_GRAPHQL = "https://api.platform.opentargets.org/api/v4/graphql"
OT_DRUG_URL = "https://platform.opentargets.org/drug/{id}"
OT_TARGET_URL = "https://platform.opentargets.org/target/{id}"
CACHE_TTL = timedelta(days=7)
CATALOG_CACHE_TTL = timedelta(hours=12)
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

CATALOG_SOURCES = {
    "Open Targets Platform": {
        "url": "https://platform.opentargets.org",
        "license": "Open Targets Platform data: CC0 1.0; upstream records retain their own terms",
    },
    "Reactome": {
        "url": "https://reactome.org",
        "license": "CC BY 4.0",
    },
    "ClinicalTrials.gov": {
        "url": "https://clinicaltrials.gov",
        "license": "Public registry; review record-level terms and attribution",
    },
    "Europe PMC": {
        "url": "https://europepmc.org",
        "license": "Varies by publication; follow the linked record's terms",
    },
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

Q_CATALOG_SEARCH = """
query CatalogSearch($q: String!, $entities: [String!], $size: Int!) {
  search(queryString: $q, entityNames: $entities, page: {index: 0, size: $size}) {
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
    maximumClinicalStage
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

Q_TARGET_PROTEINS = """
query TargetProteins($id: String!) {
  target(ensemblId: $id) {
    id
    approvedSymbol
    proteinIds { id source }
  }
}"""

Q_TARGET_ASSOCIATIONS = """
query TargetDiseaseScores($id: String!) {
  target(ensemblId: $id) {
    id
    approvedSymbol
    associatedDiseases(page: {index: 0, size: 10}) {
      count
      rows {
        score
        disease { id name }
        datatypeScores { id score }
        datasourceScores { id score }
      }
    }
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


def normalize_catalog_search(data: dict) -> list[dict]:
    """Normalize Open Targets' cross-entity search into bank-style records."""
    hits = ((data or {}).get("search") or {}).get("hits") or []
    out = []
    for hit in hits:
        entity = str(hit.get("entity") or "").lower()
        item_id = str(hit.get("id") or "").strip()
        if not item_id or entity not in {"drug", "target", "disease"}:
            continue
        if entity == "drug" and not CHEMBL_RE.match(item_id):
            continue
        if entity == "target" and not ENSG_RE.match(item_id):
            continue
        out.append({
            "id": item_id,
            "type": entity,
            "title": (hit.get("name") or item_id)[:300],
            "summary": (hit.get("description") or "")[:1200],
            "url": f"https://platform.opentargets.org/{entity}/{item_id}",
            "provider": "Open Targets Platform",
            "license": CATALOG_SOURCES["Open Targets Platform"]["license"],
        })
    return out


def _external_json(provider: str, url: str, params: dict) -> dict:
    try:
        response = requests.get(
            url, params=params, headers={"Accept": "application/json", "User-Agent": "Primer-AI research catalog"},
            timeout=20,
        )
    except requests.RequestException as exc:
        raise UpstreamError(f"{provider} unreachable: {exc.__class__.__name__}") from exc
    if response.status_code != 200:
        raise UpstreamError(f"{provider} HTTP {response.status_code}")
    try:
        return response.json()
    except ValueError as exc:
        raise UpstreamError(f"{provider} returned invalid JSON") from exc


def normalize_reactome(data: Any) -> list[dict]:
    rows = data.get("results", []) if isinstance(data, dict) else data
    if not isinstance(rows, list):
        return []
    out = []
    seen = set()
    for group in rows:
        if not isinstance(group, dict):
            continue
        entries = group.get("entries")
        for row in entries if isinstance(entries, list) else [group]:
            if not isinstance(row, dict):
                continue
            item_id = str(row.get("stId") or row.get("stableId") or row.get("id") or "").strip()
            name = clean_text(row.get("name") or row.get("displayName"), 300)
            if row.get("type") != "Pathway" or not re.fullmatch(r"R-HSA-\d+", item_id):
                continue
            if not name or item_id in seen:
                continue
            seen.add(item_id)
            out.append({
                "id": item_id, "type": "pathway", "title": name[:300],
                "summary": str(row.get("speciesName") or "Reactome biological pathway")[:500],
                "url": f"https://reactome.org/content/detail/{quote(item_id, safe='')}",
                "provider": "Reactome", "license": CATALOG_SOURCES["Reactome"]["license"],
            })
    return out[:10]


def normalize_clinical_trials(data: dict) -> list[dict]:
    studies = (data or {}).get("studies") or []
    out = []
    for study in studies:
        protocol = study.get("protocolSection") or {}
        ident = protocol.get("identificationModule") or {}
        status = protocol.get("statusModule") or {}
        design = protocol.get("designModule") or {}
        desc = protocol.get("descriptionModule") or {}
        conditions = protocol.get("conditionsModule") or {}
        item_id = str(ident.get("nctId") or "").strip()
        title = str(ident.get("briefTitle") or ident.get("officialTitle") or item_id).strip()
        if not item_id or not title:
            continue
        pieces = [status.get("overallStatus"), ", ".join(conditions.get("conditions") or []),
                  ", ".join(design.get("phases") or [])]
        summary = str(desc.get("briefSummary") or "").strip()
        context = " · ".join(str(piece) for piece in pieces if piece)
        if context:
            summary = f"{context}. {summary}" if summary else context
        out.append({
            "id": item_id, "type": "trial", "title": title[:400], "summary": summary[:1600],
            "url": f"https://clinicaltrials.gov/study/{item_id}",
            "provider": "ClinicalTrials.gov", "license": CATALOG_SOURCES["ClinicalTrials.gov"]["license"],
        })
    return out


def normalize_publications(data: dict, query: str) -> list[dict]:
    results = ((data or {}).get("resultList") or {}).get("result") or []
    out = []
    for row in results:
        item_id = str(row.get("pmid") or row.get("pmcid") or row.get("id") or "").strip()
        title = clean_text(row.get("title"), 500)
        if not item_id or not title:
            continue
        pmid, pmcid = row.get("pmid"), row.get("pmcid")
        if pmid:
            url = f"https://europepmc.org/article/MED/{quote(str(pmid), safe='')}"
        elif pmcid:
            url = f"https://europepmc.org/article/PMC/{quote(str(pmcid).removeprefix('PMC'), safe='')}"
        else:
            url = f"https://europepmc.org/search?query={quote(query, safe='')}"
        summary = " · ".join(str(value) for value in (
            row.get("authorString"), row.get("journalTitle"), row.get("pubYear")
        ) if value)
        out.append({
            "id": item_id, "type": "publication", "title": title[:500], "summary": summary[:1200],
            "url": url, "provider": "Europe PMC",
            "license": CATALOG_SOURCES["Europe PMC"]["license"],
        })
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
        "clinical_stage": d.get("maximumClinicalStage"),
        "withdrawn": d.get("hasBeenWithdrawn"),
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


class DockingRequest(BaseModel):
    receptor_pdbqt: str = Field(min_length=1, max_length=2_000_000)
    ligand_pdbqt: str = Field(min_length=1, max_length=300_000)
    center: list[float]
    size: list[float]
    seed: int = Field(ge=1, le=2_147_483_647)
    exhaustiveness: int = Field(ge=1, le=8)
    num_poses: int = Field(ge=1, le=5)


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


class LibraryItemCreate(BaseModel):
    kind: Literal["drug", "target", "disease", "pathway", "trial", "publication"]
    source_id: str = Field(min_length=1, max_length=200)
    title: str = Field(min_length=1, max_length=500)
    summary: str = Field("", max_length=2000)
    url: str = Field(min_length=9, max_length=1000)
    provider: str = Field(min_length=1, max_length=100)
    license: str = Field("", max_length=300)
    retrieved_at: str = Field("", max_length=60)
    details: dict = Field(default_factory=dict)


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
    library = sqlalchemy.Table(
        "pharma_library_items_v1", metadata,
        sqlalchemy.Column("id", sqlalchemy.String(36), primary_key=True),
        sqlalchemy.Column("organization_id", sqlalchemy.String(36), nullable=False, index=True),
        sqlalchemy.Column("created_by", sqlalchemy.Integer, nullable=False),
        sqlalchemy.Column("kind", sqlalchemy.String(24), nullable=False),
        sqlalchemy.Column("source_id", sqlalchemy.String(200), nullable=False),
        sqlalchemy.Column("title", sqlalchemy.String(500), nullable=False),
        sqlalchemy.Column("summary", sqlalchemy.Text, nullable=False, default=""),
        sqlalchemy.Column("url", sqlalchemy.String(1000), nullable=False),
        sqlalchemy.Column("provider", sqlalchemy.String(100), nullable=False),
        sqlalchemy.Column("license", sqlalchemy.String(300), nullable=False, default=""),
        sqlalchemy.Column("retrieved_at", sqlalchemy.String(60), nullable=False, default=""),
        sqlalchemy.Column("details", sqlalchemy.Text, nullable=False, default="{}"),
        sqlalchemy.Column("created_at", sqlalchemy.DateTime(timezone=True), server_default=now, nullable=False),
        sqlalchemy.UniqueConstraint("organization_id", "kind", "source_id", name="uq_pharma_library_source"),
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
    metadata.create_all(bind=engine, tables=[organizations, members, projects, library, cache, access])

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
        drug, ts = await cached(f"drug-v3:{cid}", lambda: normalize_drug(_ot_query(Q_DRUG, {"id": cid})))
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
        return {**SOURCE_INFO, "catalog": CATALOG_SOURCES}

    @router.get("/docking/status")
    async def get_docking_status(user=Depends(get_current_user)):
        return docking_status()

    @router.post("/docking/run")
    async def dock_prepared_inputs(request: Request, user=Depends(get_current_user)):
        if not docking_status()["ready"]:
            raise HTTPException(503, "Docking is disabled or the engine is unavailable")
        # Do not let automatic body parsing buffer an unbounded upload.
        max_body = 2_600_000
        declared = request.headers.get("content-length", "")
        if declared.isdigit() and int(declared) > max_body:
            raise HTTPException(413, "Docking request exceeds the size limit")
        chunks, total = [], 0
        async for chunk in request.stream():
            total += len(chunk)
            if total > max_body:
                raise HTTPException(413, "Docking request exceeds the size limit")
            chunks.append(chunk)
        try:
            body = json.loads(b"".join(chunks))
            req = DockingRequest(**body) if isinstance(body, dict) else None
            if req is None:
                raise ValueError("Expected a JSON object")
        except (ValueError, TypeError, ValidationError) as exc:
            raise HTTPException(422, "Invalid docking request") from exc
        payload = req.model_dump() if hasattr(req, "model_dump") else req.dict()
        try:
            return await run_in_threadpool(run_docking, payload)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        except DockingDisabled as exc:
            raise HTTPException(503, "Docking is disabled by the server administrator") from exc
        except DockingUnavailable as exc:
            raise HTTPException(503, "Docking engine or worker is unavailable") from exc
        except DockingBusy as exc:
            raise HTTPException(429, "The docking worker is busy; try later") from exc
        except DockingTimedOut as exc:
            raise HTTPException(504, "Docking timed out; reduce the search complexity") from exc
        except DockingFailed as exc:
            raise HTTPException(422, "Docking failed; check prepared PDBQT files and box") from exc

    @router.get("/structures/{pdb_id}")
    async def experimental_structure(pdb_id: str, user=Depends(get_current_user)):
        """Retrieve a user-selected experimental PDB entry; no drug match is inferred."""
        try:
            return await run_in_threadpool(load_experimental_structure, pdb_id)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        except LookupError as exc:
            raise HTTPException(404, "PDB structure not found") from exc
        except RuntimeError as exc:
            log.warning("RCSB PDB structure retrieval failed: %s", exc)
            raise HTTPException(502, "Structure source unavailable or file exceeds size limit") from exc

    @router.get("/drugs/{chembl_id}/activities")
    async def drug_activities(chembl_id: str, assay_type: Literal["A", "T", "P", "B", "F"] = "A",
                              offset: int = Query(0, ge=0, le=10000), user=Depends(get_current_user)):
        try:
            return await run_in_threadpool(load_chembl_activities, chembl_id, assay_type, offset)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        except LookupError as exc:
            raise HTTPException(404, "ChEMBL record not found") from exc
        except RuntimeError as exc:
            log.warning("ChEMBL evidence retrieval failed: %s", exc)
            raise HTTPException(502, "ChEMBL activity data unavailable") from exc

    @router.get("/drugs/{chembl_id}/compound-profile")
    async def compound_profile(chembl_id: str, user=Depends(get_current_user)):
        try:
            return await run_in_threadpool(load_compound_profile, chembl_id)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        except LookupError as exc:
            raise HTTPException(404, "ChEMBL molecule not found") from exc
        except RuntimeError as exc:
            log.warning("ChEMBL molecule retrieval failed: %s", exc)
            raise HTTPException(502, "ChEMBL molecule data unavailable") from exc

    @router.get("/structure-search")
    async def structure_search(uniprot: str = Query(..., min_length=6, max_length=10),
                               user=Depends(get_current_user)):
        try:
            return await run_in_threadpool(search_uniprot_structures, uniprot)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        except RuntimeError as exc:
            log.warning("RCSB structure search failed: %s", exc)
            raise HTTPException(502, "RCSB structure search unavailable") from exc

    @router.get("/targets/{ensembl_id}/proteins")
    async def target_proteins(ensembl_id: str, user=Depends(get_current_user)):
        eid = ensembl_id.strip()
        if not ENSG_RE.fullmatch(eid):
            raise HTTPException(422, "Target ID must be an Ensembl gene ID")
        result, ts = await cached(f"target-proteins:{eid}",
                                  lambda: _ot_query(Q_TARGET_PROTEINS, {"id": eid}),
                                  CATALOG_CACHE_TTL)
        target = result.get("target")
        if not target or target.get("id") != eid:
            raise HTTPException(404, "Target not found")
        valid = []
        seen = set()
        for row in target.get("proteinIds") or []:
            if not isinstance(row, dict):
                continue
            identifier, source = str(row.get("id") or "").upper(), row.get("source") or ""
            if source not in {"uniprot_swissprot", "uniprot_trembl"} or not re.fullmatch(r"[A-Z0-9]{6,10}", identifier):
                continue
            if (identifier, source) not in seen:
                seen.add((identifier, source))
                valid.append({"id": identifier, "source": source})
        valid.sort(key=lambda item: (item["source"] != "uniprot_swissprot", item["id"]))
        return {"target_id": eid, "symbol": target.get("approvedSymbol") or "",
                "proteins": valid[:30], "truncated": len(valid) > 30,
                "source_url": OT_TARGET_URL.format(id=eid), "retrieved_at": _iso(ts)}

    @router.get("/clinical-studies/{nct_id}")
    async def clinical_study(nct_id: str, user=Depends(get_current_user)):
        try:
            return await run_in_threadpool(load_clinical_study, nct_id)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        except LookupError as exc:
            raise HTTPException(404, "Clinical study not found") from exc
        except RuntimeError as exc:
            log.warning("ClinicalTrials.gov retrieval failed: %s", exc)
            raise HTTPException(502, "Clinical study data unavailable") from exc

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

    @router.get("/targets/{ensembl_id}/associations")
    async def target_associations(ensembl_id: str, user=Depends(get_current_user)):
        eid = ensembl_id.strip()
        if not ENSG_RE.match(eid):
            raise HTTPException(422, "Target ID must be an Ensembl gene ID")
        raw, ts = await cached(
            f"target-associations:{eid}",
            lambda: _ot_query(Q_TARGET_ASSOCIATIONS, {"id": eid}),
            CATALOG_CACHE_TTL,
        )
        target = raw.get("target")
        if not target:
            raise HTTPException(404, "Target not found")
        return {
            "target": target,
            "retrieved_at": _iso(ts),
            "source": SOURCE_INFO,
            "score_method": "https://platform-docs.opentargets.org/associations",
            "note": "Association scores are not probabilities, treatment recommendations, or drug efficacy.",
        }

    @router.get("/intelligence")
    async def research_intelligence(
        q: str = Query(..., min_length=2, max_length=80),
        user=Depends(get_current_user),
    ):
        """Independent searches, not verified mappings between source records."""
        term = re.sub(r"\s+", " ", q).strip()
        if len(term) < 2:
            raise HTTPException(422, "Search term must contain at least two characters")
        digest = hashlib.sha256(term.casefold().encode()).hexdigest()

        async def run_source(provider, loader):
            try:
                result, ts = await cached(
                    f"intelligence:{provider}:{digest}", loader, CATALOG_CACHE_TTL
                )
                return {"provider": provider, "data": result, "retrieved_at": _iso(ts), "error": None}
            except Exception:
                log.exception("Research intelligence lookup failed for %s", provider)
                return {"provider": provider, "data": None, "retrieved_at": None,
                        "error": "Source unavailable; no conclusion can be drawn"}

        results = await asyncio.gather(
            run_source("FDA", lambda: lookup_fda(term)),
            run_source("EMA", lambda: lookup_ema(term)),
            run_source("PubChem", lambda: lookup_pubchem(term)),
        )
        return {
            "query": term,
            "results": results,
            "notice": "Name matches are candidates, not confirmed chemical or regulatory equivalence. "
                      "EMA covers centrally evaluated products, not all national products.",
        }

    async def catalog_open_targets(term: str, entities: list[str]):
        cache_token = hashlib.sha256(
            json.dumps([term.casefold(), entities], separators=(",", ":")).encode("utf-8")
        ).hexdigest()
        return await cached(
            f"catalog:ot:{cache_token}",
            lambda: normalize_catalog_search(_ot_query(
                Q_CATALOG_SEARCH, {"q": term, "entities": entities, "size": 10}
            )),
            CATALOG_CACHE_TTL,
        )

    async def catalog_reactome(term: str):
        cache_token = hashlib.sha256(term.casefold().encode("utf-8")).hexdigest()
        return await cached(
            f"catalog:reactome-v2:{cache_token}",
            lambda: normalize_reactome(_external_json(
                "Reactome",
                "https://reactome.org/ContentService/search/query",
                {"query": term, "types": "Pathways", "species": "Homo sapiens", "cluster": "true", "rows": 10},
            )),
            CATALOG_CACHE_TTL,
        )

    async def catalog_trials(term: str):
        cache_token = hashlib.sha256(term.casefold().encode("utf-8")).hexdigest()
        return await cached(
            f"catalog:trials:{cache_token}",
            lambda: normalize_clinical_trials(_external_json(
                "ClinicalTrials.gov",
                "https://clinicaltrials.gov/api/v2/studies",
                {"query.term": term, "pageSize": 10, "format": "json"},
            )),
            CATALOG_CACHE_TTL,
        )

    async def catalog_publications(term: str):
        cache_token = hashlib.sha256(term.casefold().encode("utf-8")).hexdigest()
        return await cached(
            f"catalog:papers:{cache_token}",
            lambda: normalize_publications(_external_json(
                "Europe PMC",
                "https://www.ebi.ac.uk/europepmc/webservices/rest/search",
                {"query": term, "format": "json", "pageSize": 10, "resultType": "lite"},
            ), term),
            CATALOG_CACHE_TTL,
        )

    @router.get("/catalog/search")
    async def search_catalog(
        q: str = Query(..., min_length=2, max_length=120),
        kind: Literal["all", "drug", "target", "disease", "pathway", "trial", "publication"] = "all",
        user=Depends(get_current_user),
    ):
        term = re.sub(r"\s+", " ", q).strip()
        if len(term) < 2:
            raise HTTPException(422, "Search term must contain at least two characters")

        providers = {}
        if kind == "all":
            providers = {
                "Open Targets Platform": catalog_open_targets(term, ["drug", "target", "disease"]),
                "Reactome": catalog_reactome(term),
                "ClinicalTrials.gov": catalog_trials(term),
                "Europe PMC": catalog_publications(term),
            }
        elif kind in {"drug", "target", "disease"}:
            providers = {"Open Targets Platform": catalog_open_targets(term, [kind])}
        elif kind == "pathway":
            providers = {"Reactome": catalog_reactome(term)}
        elif kind == "trial":
            providers = {"ClinicalTrials.gov": catalog_trials(term)}
        elif kind == "publication":
            providers = {"Europe PMC": catalog_publications(term)}

        async def safe_fetch(provider: str, work):
            try:
                payload, fetched_at = await work
                return provider, payload, fetched_at, None
            except Exception:
                log.exception("Research catalog source failed: %s", provider)
                return provider, [], None, "Source temporarily unavailable"

        fetched = await asyncio.gather(
            *(safe_fetch(provider, work) for provider, work in providers.items())
        )
        items, sources, errors, timestamps = [], [], [], []
        for provider, records, fetched_at, error in fetched:
            source = dict(CATALOG_SOURCES[provider])
            source["provider"] = provider
            if fetched_at:
                source["retrieved_at"] = _iso(fetched_at)
                timestamps.append(fetched_at)
            sources.append(source)
            if error:
                errors.append({"provider": provider, "message": error})
            for record in records:
                record["retrieved_at"] = _iso(fetched_at)
                items.append(record)
        return {
            "query": term,
            "kind": kind,
            "items": items[:40],
            "sources": sources,
            "source_errors": errors,
            "retrieved_at": _iso(max(timestamps)) if timestamps else None,
        }

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

    root.include_router(router)
    return root
