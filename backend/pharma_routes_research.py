"""Federated research data routes: drugs, targets, catalog, docking, structures.

Provenance (provider, license, retrieved_at) must stay on every public record.
Docking remains opt-in, bounded, and non-persisted.
"""
from __future__ import annotations

import asyncio
import hashlib  # <--- این خط اضافه شد
import time
import json
import logging
import re
from datetime import datetime, timezone
from typing import Any, Literal, Optional
from urllib.parse import quote

import requests
import sqlalchemy
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool

from pharma_constants import (
    SOURCE_INFO,
    CATALOG_SOURCES,
    CACHE_TTL,
    CATALOG_CACHE_TTL,
    CHEMBL_RE,
    ENSG_RE,
    Q_SEARCH,
    Q_CATALOG_SEARCH,
    Q_TARGET_PATHWAYS,
    Q_TARGET_PROTEINS,
    Q_TARGET_ASSOCIATIONS,
    OT_TARGET_URL,
)
from pharma_helpers import _iso, _row
from pharma_normalize import (
    UpstreamError,
    _external_json,
    _ot_query,
    normalize_catalog_search,
    normalize_clinical_trials,
    normalize_publications,
    normalize_reactome,
    normalize_search,
    normalize_pathways,
)
from pharma_schemas import DockingRequest
from pharma_structures import load_experimental_structure
from pharma_evidence import load_chembl_activities, load_clinical_study
from pharma_discovery import load_compound_profile, search_uniprot_structures
from pharma_docking import (
    docking_status,
    run_docking,
    DockingDisabled,
    DockingUnavailable,
    DockingBusy,
    DockingTimedOut,
    DockingFailed,
)
from pharma_intelligence import lookup_fda, lookup_ema, lookup_pubchem
from pharma_observability import docking_event, upstream_event

log = logging.getLogger("primerai.pharma")


def register_research_routes(
    router: APIRouter,
    *,
    get_current_user,
    cached,
    load_drug,
):
    """Attach federated research routes onto the access-gated router."""
    # ------------------------------------------------------- source data
    @router.get("/sources")
    async def sources():
        return {**SOURCE_INFO, "catalog": CATALOG_SOURCES}

    @router.get("/docking/status")
    async def get_docking_status(user=Depends(get_current_user)):
        status = docking_status()
        docking_event(phase="status", ok=bool(status.get("ready")))
        return status

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
        docking_event(phase="run_start", seed=payload.get("seed"), poses=payload.get("num_poses"))
        _t0 = time.perf_counter()
        try:
            result = await run_in_threadpool(run_docking, payload)
            docking_event(phase="run_done", ok=True, duration_ms=int((time.perf_counter()-_t0)*1000),
                           seed=payload.get("seed"), poses=len(result.get("scores") or []))
            return result
        except ValueError as exc:
            docking_event(phase="run_fail", ok=False, error_type="ValueError", error=str(exc))
            raise HTTPException(422, str(exc)) from exc
        except DockingDisabled as exc:
            docking_event(phase="run_fail", ok=False, error_type="DockingDisabled", error=str(exc))
            raise HTTPException(503, "Docking is disabled by the server administrator") from exc
        except DockingUnavailable as exc:
            docking_event(phase="run_fail", ok=False, error_type="DockingUnavailable", error=str(exc))
            raise HTTPException(503, "Docking engine or worker is unavailable") from exc
        except DockingBusy as exc:
            docking_event(phase="run_fail", ok=False, error_type="DockingBusy", error=str(exc))
            raise HTTPException(429, "The docking worker is busy; try later") from exc
        except DockingTimedOut as exc:
            docking_event(phase="run_fail", ok=False, error_type="DockingTimedOut", error=str(exc))
            raise HTTPException(504, "Docking timed out; reduce the search complexity") from exc
        except DockingFailed as exc:
            docking_event(phase="run_fail", ok=False, error_type="DockingFailed", error=str(exc))
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
            upstream_event(provider="RCSB", operation="structure", ok=False, error=str(exc))
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
            upstream_event(provider="ChEMBL", operation="activities", ok=False, error=str(exc))
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
            upstream_event(provider="ChEMBL", operation="compound_profile", ok=False, error=str(exc))
            raise HTTPException(502, "ChEMBL molecule data unavailable") from exc

    @router.get("/structure-search")
    async def structure_search(uniprot: str = Query(..., min_length=6, max_length=10),
                               user=Depends(get_current_user)):
        try:
            return await run_in_threadpool(search_uniprot_structures, uniprot)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        except RuntimeError as exc:
            upstream_event(provider="RCSB", operation="structure_search", ok=False, error=str(exc))
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
            upstream_event(provider="ClinicalTrials.gov", operation="study", ok=False, error=str(exc))
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
                upstream_event(provider=provider, operation="intelligence", ok=False, error="lookup_failed")
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
                upstream_event(provider=provider, operation="catalog", ok=False, error="source_failed")
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