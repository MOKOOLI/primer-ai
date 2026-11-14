"""Open Targets / catalog normalization and upstream fetch helpers.

Extracted from pharma_module without behavior change. Research-use data only.
"""
from __future__ import annotations

import re
from typing import Any, Optional
from urllib.parse import quote

import requests
from fastapi import HTTPException

from pharma_intelligence import clean_text

# Shared with pharma_module (kept here so this file is self-contained for deploy).
import os
OT_GRAPHQL = "https://api.platform.opentargets.org/api/v4/graphql"
OT_DRUG_URL = "https://platform.opentargets.org/drug/{id}"
OT_TARGET_URL = "https://platform.opentargets.org/target/{id}"
CHEMBL_RE = re.compile(r"^CHEMBL\d{1,10}$")
ENSG_RE = re.compile(r"^ENSG\d{11}$")
GENE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9.\-]{0,23}$")
CATALOG_SOURCES = {
    "Open Targets Platform": {
        "url": "https://platform.opentargets.org",
        "license": "Open Targets Platform data: CC0 1.0; upstream records retain their own terms",
    },
    "Reactome": {"url": "https://reactome.org", "license": "CC BY 4.0"},
    "ClinicalTrials.gov": {
        "url": "https://clinicaltrials.gov",
        "license": "Public registry; review record-level terms and attribution",
    },
    "Europe PMC": {
        "url": "https://europepmc.org",
        "license": "Varies by publication; follow the linked record's terms",
    },
}

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
