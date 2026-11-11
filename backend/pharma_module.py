"""Primer AI Pharma Research MVP router.

Integrates with the existing FastAPI app's database, metadata, engine,
users_table, and get_current_user dependency. This is a research-workspace
starter, not a validated clinical or laboratory decision system.
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any, Literal

import sqlalchemy
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field


# Demo candidates are based on the user's proposal and are intentionally NOT
# represented as curated/validated drug-response evidence. Replace with
# reviewed, cited records before production use. No ClinPGx/PharmGKB data is
# bundled here.
DEMO_CATALOG: list[dict[str, Any]] = [
    {
        "id": "statin-lipid-candidate-panel",
        "drug": "Statin class (e.g., atorvastatin, rosuvastatin)",
        "pathway": "Cholesterol synthesis / lipid transport",
        "genes": ["HMGCR", "LDLR", "PCSK9"],
        "curation_status": "candidate_unverified",
        "source_title": "User-provided research proposal",
        "source_url": None,
        "note": "Research candidates only. Add primary literature and verify per drug, model, and assay before use.",
    },
    {
        "id": "fenofibrate-lipid-candidate-panel",
        "drug": "Fenofibrate",
        "pathway": "Lipid metabolism",
        "genes": ["PPARA"],
        "curation_status": "candidate_unverified",
        "source_title": "Initial illustrative candidate; literature review required",
        "source_url": None,
        "note": "Not a clinical recommendation or validated drug-response relationship.",
    },
    {
        "id": "inflammation-research-panel",
        "drug": "Research panel (not drug-specific)",
        "pathway": "Inflammation",
        "genes": ["IL1B", "IL6", "TNF", "NLRP3"],
        "curation_status": "candidate_unverified",
        "source_title": "User-provided research proposal",
        "source_url": None,
        "note": "For exploratory expression studies only; choose targets for the specific model and hypothesis.",
    },
    {
        "id": "cardiovascular-research-panel",
        "drug": "Research panel (not drug-specific)",
        "pathway": "Cardiovascular biology",
        "genes": ["NOS3", "ACE", "CRP"],
        "curation_status": "candidate_unverified",
        "source_title": "User-provided research proposal",
        "source_url": None,
        "note": "CRP gene-expression measurement is distinct from CRP protein measurement.",
    },
]


class OrganizationCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)


class MemberAdd(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    role: Literal["researcher", "viewer"] = "researcher"


class ProjectCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    drug: str = Field(min_length=1, max_length=120)
    pathway: str = Field(min_length=1, max_length=160)
    organism: str = Field(min_length=2, max_length=100)
    genes: list[str] = Field(default_factory=list, max_items=20)
    dose_text: str = Field(default="", max_length=120)
    duration_text: str = Field(default="", max_length=120)
    notes: str = Field(default="", max_length=4000)


def _uid(user: Any) -> int:
    value = user.get("id") if isinstance(user, dict) else getattr(user, "id", None)
    if value is None:
        raise HTTPException(status_code=401, detail="Authenticated user ID missing")
    return int(value)


def create_pharma_router(database, metadata, engine, users_table, get_current_user):
    """Create tables and return an authenticated router for Pharma Research."""
    now = sqlalchemy.func.now()
    organizations = sqlalchemy.Table(
        "pharma_organizations", metadata,
        sqlalchemy.Column("id", sqlalchemy.String(36), primary_key=True),
        sqlalchemy.Column("name", sqlalchemy.String(160), nullable=False),
        sqlalchemy.Column("owner_user_id", sqlalchemy.Integer, nullable=False, index=True),
        sqlalchemy.Column("created_at", sqlalchemy.DateTime(timezone=True), server_default=now, nullable=False),
    )
    members = sqlalchemy.Table(
        "pharma_organization_members", metadata,
        sqlalchemy.Column("organization_id", sqlalchemy.String(36), sqlalchemy.ForeignKey("pharma_organizations.id", ondelete="CASCADE"), primary_key=True),
        sqlalchemy.Column("user_id", sqlalchemy.Integer, sqlalchemy.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sqlalchemy.Column("role", sqlalchemy.String(20), nullable=False),
        sqlalchemy.Column("added_by", sqlalchemy.Integer, nullable=False),
        sqlalchemy.Column("created_at", sqlalchemy.DateTime(timezone=True), server_default=now, nullable=False),
    )
    projects = sqlalchemy.Table(
        "pharma_research_projects", metadata,
        sqlalchemy.Column("id", sqlalchemy.String(36), primary_key=True),
        sqlalchemy.Column("organization_id", sqlalchemy.String(36), sqlalchemy.ForeignKey("pharma_organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sqlalchemy.Column("created_by", sqlalchemy.Integer, nullable=False),
        sqlalchemy.Column("name", sqlalchemy.String(160), nullable=False),
        sqlalchemy.Column("drug", sqlalchemy.String(120), nullable=False),
        sqlalchemy.Column("pathway", sqlalchemy.String(160), nullable=False),
        sqlalchemy.Column("organism", sqlalchemy.String(100), nullable=False),
        sqlalchemy.Column("genes", sqlalchemy.JSON, nullable=False),
        sqlalchemy.Column("dose_text", sqlalchemy.String(120), nullable=False, default=""),
        sqlalchemy.Column("duration_text", sqlalchemy.String(120), nullable=False, default=""),
        sqlalchemy.Column("notes", sqlalchemy.String(4000), nullable=False, default=""),
        sqlalchemy.Column("created_at", sqlalchemy.DateTime(timezone=True), server_default=now, nullable=False),
    )
    # create_all is idempotent for these new tables. For production, use a
    # versioned migration instead of relying on create_all.
    metadata.create_all(bind=engine, tables=[organizations, members, projects])

    router = APIRouter(prefix="/pharma", tags=["Pharma Research"])

    async def require_member(organization_id: str, user: Any, write: bool = False):
        uid = _uid(user)
        row = await database.fetch_one(
            sqlalchemy.select(members.c.role).where(
                members.c.organization_id == organization_id,
                members.c.user_id == uid,
            )
        )
        # Use 404 for non-members so organization IDs cannot be enumerated.
        if not row:
            raise HTTPException(status_code=404, detail="Organization not found")
        role = row["role"]
        if write and role == "viewer":
            raise HTTPException(status_code=403, detail="This account has read-only access")
        return role

    @router.get("/catalog")
    async def get_catalog():
        return {"items": DEMO_CATALOG, "catalog_status": "demo_unverified", "data_source": "No third-party pharmacogenomics dataset included"}

    @router.get("/organizations")
    async def list_organizations(user=Depends(get_current_user)):
        uid = _uid(user)
        stmt = (
            sqlalchemy.select(organizations.c.id, organizations.c.name, members.c.role, organizations.c.created_at)
            .select_from(organizations.join(members, organizations.c.id == members.c.organization_id))
            .where(members.c.user_id == uid)
            .order_by(organizations.c.created_at.desc())
        )
        rows = await database.fetch_all(stmt)
        return {"items": [dict(row) for row in rows]}

    @router.post("/organizations", status_code=201)
    async def create_organization(req: OrganizationCreate, user=Depends(get_current_user)):
        uid = _uid(user)
        org_id = str(uuid.uuid4())
        async with database.transaction():
            await database.execute(organizations.insert().values(id=org_id, name=req.name.strip(), owner_user_id=uid))
            await database.execute(members.insert().values(organization_id=org_id, user_id=uid, role="owner", added_by=uid))
        return {"id": org_id, "name": req.name.strip(), "role": "owner"}

    @router.post("/organizations/{organization_id}/members", status_code=201)
    async def add_member(organization_id: str, req: MemberAdd, user=Depends(get_current_user)):
        uid = _uid(user)
        role = await require_member(organization_id, user, write=True)
        if role not in ("owner", "admin"):
            raise HTTPException(status_code=403, detail="Only an organization owner/admin can add members")
        email = req.email.strip().lower()
        target = await database.fetch_one(
            sqlalchemy.select(users_table.c.id).where(sqlalchemy.func.lower(users_table.c.email) == email)
        )
        if not target:
            raise HTTPException(status_code=404, detail="No registered account with that email")
        target_id = int(target["id"])
        exists = await database.fetch_one(
            sqlalchemy.select(members.c.user_id).where(
                members.c.organization_id == organization_id,
                members.c.user_id == target_id,
            )
        )
        if exists:
            raise HTTPException(status_code=409, detail="That account is already a member")
        await database.execute(members.insert().values(
            organization_id=organization_id, user_id=target_id, role=req.role, added_by=uid
        ))
        return {"organization_id": organization_id, "user_id": target_id, "role": req.role}

    @router.get("/organizations/{organization_id}/projects")
    async def list_projects(organization_id: str, user=Depends(get_current_user)):
        await require_member(organization_id, user)
        rows = await database.fetch_all(
            sqlalchemy.select(projects).where(projects.c.organization_id == organization_id).order_by(projects.c.created_at.desc())
        )
        return {"items": [dict(row) for row in rows]}

    @router.post("/organizations/{organization_id}/projects", status_code=201)
    async def create_project(organization_id: str, req: ProjectCreate, user=Depends(get_current_user)):
        await require_member(organization_id, user, write=True)
        cleaned_genes = []
        for gene in req.genes:
            symbol = gene.strip().upper()
            if not re.fullmatch(r"[A-Z0-9.-]{1,24}", symbol):
                raise HTTPException(status_code=422, detail=f"Invalid gene symbol: {gene}")
            if symbol not in cleaned_genes:
                cleaned_genes.append(symbol)
        project_id = str(uuid.uuid4())
        values = {
            "id": project_id,
            "organization_id": organization_id,
            "created_by": _uid(user),
            "name": req.name.strip(),
            "drug": req.drug.strip(),
            "pathway": req.pathway.strip(),
            "organism": req.organism.strip(),
            "genes": cleaned_genes,
            "dose_text": req.dose_text.strip(),
            "duration_text": req.duration_text.strip(),
            "notes": req.notes.strip(),
        }
        await database.execute(projects.insert().values(**values))
        return {**values, "created_at": datetime.now(timezone.utc).isoformat()}

    return router
