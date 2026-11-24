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
from pharma_normalize import (
    UpstreamError,
    _ot_query,
    _external_json,
    normalize_search,
    normalize_catalog_search,
    normalize_reactome,
    normalize_clinical_trials,
    normalize_publications,
    normalize_drug,
    normalize_pathways,
    clean_gene_list,
)
from pharma_schemas import (
    PharmaAccessRequest,
    AccessDecision,
    DockingRequest,
    OrganizationCreate,
    MemberAdd,
    GeneItem,
    PathwayItem,
    ProjectCreate,
    LibraryItemCreate,
)
from pharma_constants import (
    OT_GRAPHQL,
    OT_DRUG_URL,
    OT_TARGET_URL,
    CACHE_TTL,
    CATALOG_CACHE_TTL,
    MAX_TARGETS_WITH_PATHWAYS,
    MAX_PATHWAYS_PER_TARGET,
    SOURCE_INFO,
    CATALOG_SOURCES,
    CHEMBL_RE,
    ENSG_RE,
    GENE_RE,
    Q_SEARCH,
    Q_CATALOG_SEARCH,
    Q_DRUG,
    Q_TARGET_PATHWAYS,
    Q_TARGET_PROTEINS,
    Q_TARGET_ASSOCIATIONS,
)
from pharma_helpers import _uid, _row, _iso
from pharma_db import define_pharma_tables
from pharma_access import build_access_layer
from pharma_runtime import build_runtime
from pharma_routes_org import register_org_routes
from pharma_routes_research import register_research_routes
try:  # optional modules: never block the core Pharma API
    from pharma_vaccine import register_vaccine_routes
    from pharma_workspace import register_workspace_routes
    from egress import build_egress
except Exception:  # pragma: no cover
    logging.getLogger("primerai.pharma").exception("Optional vaccine/workspace modules could not be imported")
    register_vaccine_routes = register_workspace_routes = build_egress = None

from pharma_structures import load_experimental_structure
from pharma_evidence import load_chembl_activities, load_clinical_study
from pharma_discovery import load_compound_profile, search_uniprot_structures
from pharma_docking import (docking_status, run_docking, DockingDisabled, DockingUnavailable,
                            DockingBusy, DockingTimedOut, DockingFailed)

log = logging.getLogger("primerai.pharma")

def create_pharma_router(database, metadata, engine, users_table, get_current_user, egress=None):
    tables = define_pharma_tables(metadata)
    organizations = tables["organizations"]
    members = tables["members"]
    projects = tables["projects"]
    library = tables["library"]
    cache = tables["cache"]
    access = tables["access"]
    metadata.create_all(bind=engine, tables=[organizations, members, projects, library, cache, access])


    access_layer = build_access_layer(
        database=database,
        access=access,
        users_table=users_table,
        get_current_user=get_current_user,
    )
    require_pharma_access = access_layer["require_pharma_access"]
    # Entry/status and admin actions stay separately authenticated; every
    # existing Pharma API route is covered by the dependency on this router.
    root = APIRouter(prefix="/pharma", tags=["Pharma Research"])
    router = APIRouter(dependencies=[Depends(require_pharma_access)])
    access_layer["register"](root)

    runtime = build_runtime(database=database, cache=cache, members=members)
    cached = runtime["cached"]
    load_drug = runtime["load_drug"]
    membership = runtime["membership"]
    require = runtime["require"]
    WRITERS = runtime["WRITERS"]
    MANAGERS = runtime["MANAGERS"]

    register_research_routes(
        router,
        get_current_user=get_current_user,
        cached=cached,
        load_drug=load_drug,
    )

    if egress is None and build_egress is not None:
        try:
            egress = build_egress(database, metadata, engine)
        except Exception:  # pragma: no cover
            log.exception("Egress ledger could not be initialised")

    if register_vaccine_routes is not None:
        try:
            register_vaccine_routes(router, get_current_user=get_current_user, egress=egress)
        except Exception:  # pragma: no cover
            log.exception("Vaccine routes could not be registered; continuing without them")

    register_org_routes(
        router,
        database=database,
        organizations=organizations,
        members=members,
        projects=projects,
        library=library,
        users_table=users_table,
        get_current_user=get_current_user,
        require=require,
        load_drug=load_drug,
    )

    if register_workspace_routes is not None and egress is not None:
        try:
            register_workspace_routes(
                router, database=database, metadata=metadata, engine=engine, get_current_user=get_current_user,
                require=require, WRITERS=WRITERS, MANAGERS=MANAGERS, egress=egress,
            )
        except Exception:  # pragma: no cover
            log.exception("Workspace routes could not be registered; continuing without them")

    root.include_router(router)
    return root
