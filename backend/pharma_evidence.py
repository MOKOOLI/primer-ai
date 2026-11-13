"""Source-linked ChEMBL activity and ClinicalTrials.gov registry data."""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from urllib.parse import urlencode

import requests

CHEMBL_ID = re.compile(r"^CHEMBL\d{1,10}$")
NCT_ID = re.compile(r"^NCT\d{8}$")
ASSAY_TYPES = frozenset({"A", "T", "P", "B", "F"})
PAGE_SIZE = 25
MAX_OFFSET = 10000
MAX_RESPONSE_BYTES = 8 * 1024 * 1024


def _fetch_json(url: str, params: dict | None = None) -> dict:
    """Fetch only caller-supplied, fixed service URLs, with a bounded response."""
    try:
        with requests.get(url, params=params, timeout=(5, 30), stream=True,
                          allow_redirects=False,
                          headers={"Accept": "application/json", "User-Agent": "Primer-AI research evidence"}) as response:
            if response.status_code == 404:
                raise LookupError("Record not found")
            response.raise_for_status()
            if response.status_code != 200:
                raise RuntimeError("Unexpected response from source")
            chunks, size = [], 0
            for chunk in response.iter_content(65536):
                size += len(chunk)
                if size > MAX_RESPONSE_BYTES:
                    raise RuntimeError("Source response exceeds size limit")
                chunks.append(chunk)
        data = json.loads(b"".join(chunks))
    except (requests.RequestException, ValueError) as exc:
        raise RuntimeError("Research source is unavailable or returned invalid JSON") from exc
    if not isinstance(data, dict):
        raise RuntimeError("Research source returned an unexpected response")
    return data


def _chembl_link(kind: str, identifier: str) -> str:
    if kind not in {"assay", "document", "target"} or not CHEMBL_ID.fullmatch(identifier or ""):
        return ""
    return f"https://www.ebi.ac.uk/chembl/api/data/{kind}/{identifier}.json"


def load_chembl_activities(chembl_id: str, assay_type: str, offset: int = 0) -> dict:
    cid = str(chembl_id).strip().upper()
    category = str(assay_type).strip().upper()
    if not CHEMBL_ID.fullmatch(cid) or category not in ASSAY_TYPES:
        raise ValueError("Invalid ChEMBL ID or assay category")
    if not isinstance(offset, int) or offset < 0 or offset > MAX_OFFSET or offset % PAGE_SIZE:
        raise ValueError("Invalid page offset")
    source_url = "https://www.ebi.ac.uk/chembl/api/data/activity.json"
    params = {"molecule_chembl_id": cid, "assay_type": category, "limit": PAGE_SIZE, "offset": offset}
    body = _fetch_json(source_url, params)
    raw_rows = body.get("activities")
    meta = body.get("page_meta")
    if not isinstance(raw_rows, list) or not isinstance(meta, dict):
        raise RuntimeError("Unexpected ChEMBL activity response")
    rows = []
    fields = ("activity_id", "molecule_chembl_id", "assay_chembl_id", "assay_type",
              "assay_description", "bao_label", "standard_type", "standard_relation",
              "standard_value", "standard_upper_value", "standard_text_value", "standard_units",
              "standard_flag", "type", "relation", "value", "upper_value", "text_value", "units",
              "target_chembl_id", "target_pref_name", "target_organism", "document_chembl_id",
              "document_journal", "document_year", "data_validity_comment",
              "data_validity_description", "potential_duplicate", "activity_comment")
    for row in raw_rows:
        if not isinstance(row, dict) or row.get("molecule_chembl_id") != cid or row.get("assay_type") != category:
            raise RuntimeError("ChEMBL returned a record outside the requested filter")
        item = {field: row.get(field) for field in fields}
        item["assay_url"] = _chembl_link("assay", str(row.get("assay_chembl_id") or ""))
        item["document_url"] = _chembl_link("document", str(row.get("document_chembl_id") or ""))
        item["target_url"] = _chembl_link("target", str(row.get("target_chembl_id") or ""))
        rows.append(item)
    total = meta.get("total_count")
    total = total if isinstance(total, int) and total >= 0 else None
    return {
        "chembl_id": cid, "assay_type": category, "offset": offset, "limit": PAGE_SIZE,
        "total_count": total, "has_next": bool(meta.get("next")) and offset + PAGE_SIZE <= MAX_OFFSET,
        "page_cap_reached": bool(meta.get("next")) and offset + PAGE_SIZE > MAX_OFFSET,
        "max_offset": MAX_OFFSET, "items": rows,
        "source_url": source_url + "?" + urlencode(params),
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
        "provider": "ChEMBL",
    }


def load_clinical_study(nct_id: str) -> dict:
    nid = str(nct_id).strip().upper()
    if not NCT_ID.fullmatch(nid):
        raise ValueError("Invalid NCT ID")
    body = _fetch_json(f"https://clinicaltrials.gov/api/v2/studies/{nid}")
    protocol = body.get("protocolSection") or {}
    if not isinstance(protocol, dict):
        raise RuntimeError("Unexpected ClinicalTrials.gov response")
    ident = protocol.get("identificationModule") or {}
    if ident.get("nctId") != nid:
        raise RuntimeError("ClinicalTrials.gov returned a different study")
    status = protocol.get("statusModule") or {}
    design = protocol.get("designModule") or {}
    eligibility = protocol.get("eligibilityModule") or {}
    conditions = protocol.get("conditionsModule") or {}
    sponsors = protocol.get("sponsorCollaboratorsModule") or {}
    interventions = protocol.get("armsInterventionsModule") or {}
    outcomes = protocol.get("outcomesModule") or {}
    enrollment = design.get("enrollmentInfo") or {}
    criteria = str(eligibility.get("eligibilityCriteria") or "")
    primary = outcomes.get("primaryOutcomes") or []
    return {
        "id": nid, "title": ident.get("briefTitle") or ident.get("officialTitle") or "",
        "official_title": ident.get("officialTitle") or "",
        "status": status.get("overallStatus") or "",
        "last_update_posted": (status.get("lastUpdatePostDateStruct") or {}).get("date") or "",
        "start_date": status.get("startDateStruct") or {},
        "completion_date": status.get("completionDateStruct") or {},
        "results_first_posted": (status.get("resultsFirstPostDateStruct") or {}).get("date") or "",
        "study_type": design.get("studyType") or "",
        "phases": design.get("phases") or [],
        "enrollment_count": enrollment.get("count"),
        "enrollment_type": enrollment.get("type") or "",
        "conditions": conditions.get("conditions") or [],
        "sponsor": (sponsors.get("leadSponsor") or {}).get("name") or "",
        "sex": eligibility.get("sex") or "",
        "minimum_age": eligibility.get("minimumAge") or "",
        "maximum_age": eligibility.get("maximumAge") or "",
        "eligibility_criteria": criteria[:30000],
        "eligibility_truncated": len(criteria) > 30000,
        "interventions": [{"type": row.get("type") or "", "name": row.get("name") or ""}
                          for row in (interventions.get("interventions") or [])[:30] if isinstance(row, dict)],
        "interventions_truncated": len(interventions.get("interventions") or []) > 30,
        "primary_outcomes": [{"measure": row.get("measure") or "", "time_frame": row.get("timeFrame") or ""}
                             for row in primary[:20] if isinstance(row, dict)],
        "outcomes_truncated": len(primary) > 20,
        "provider": "ClinicalTrials.gov",
        "source_url": f"https://clinicaltrials.gov/study/{nid}",
        "api_url": f"https://clinicaltrials.gov/api/v2/studies/{nid}",
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
    }
