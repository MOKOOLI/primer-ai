"""Pydantic request contracts for the Pharma research module.

Field limits are part of the public API contract. Do not relax them without
a coordinated frontend and documentation change.
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


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
