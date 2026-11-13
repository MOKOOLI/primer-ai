"""Compound source records and target-structure discovery; no docking inference."""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from urllib.parse import urlencode

import requests

from pharma_evidence import _fetch_json

CHEMBL_ID = re.compile(r"^CHEMBL\d{1,10}$")
UNIPROT_ID = re.compile(r"^[A-Z0-9]{6,10}$")
PDB_ID = re.compile(r"^[0-9][A-Z0-9]{3}$")
MAX_SEARCH_RESPONSE = 1024 * 1024


def load_compound_profile(chembl_id: str) -> dict:
    cid = str(chembl_id).strip().upper()
    if not CHEMBL_ID.fullmatch(cid):
        raise ValueError("Invalid ChEMBL ID")
    source_url = f"https://www.ebi.ac.uk/chembl/api/data/molecule/{cid}.json"
    raw = _fetch_json(source_url)
    if raw.get("molecule_chembl_id") != cid:
        raise RuntimeError("ChEMBL returned a different molecule")
    props = raw.get("molecule_properties") or {}
    structures = raw.get("molecule_structures") or {}
    if not isinstance(props, dict) or not isinstance(structures, dict):
        raise RuntimeError("Unexpected ChEMBL molecule response")
    return {
        "id": cid, "name": raw.get("pref_name") or "",
        "molecule_type": raw.get("molecule_type") or "",
        "formula": props.get("full_molformula"),
        "molecular_weight": props.get("full_mwt"),
        "alogp": props.get("alogp"), "polar_surface_area": props.get("psa"),
        "hba": props.get("hba"), "hbd": props.get("hbd"),
        "rotatable_bonds": props.get("rtb"),
        "canonical_smiles": structures.get("canonical_smiles"),
        "standard_inchi_key": structures.get("standard_inchi_key"),
        "source_url": source_url,
        "molecule_url": f"https://www.ebi.ac.uk/chembl/explore/compound/{cid}",
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
        "provider": "ChEMBL",
    }


def search_uniprot_structures(accession: str) -> dict:
    acc = str(accession).strip().upper()
    if not UNIPROT_ID.fullmatch(acc):
        raise ValueError("Invalid UniProt accession")
    query = {
        "query": {"type": "group", "logical_operator": "and", "nodes": [
            {"type": "terminal", "service": "text", "parameters": {
                "attribute": "rcsb_polymer_entity_container_identifiers.reference_sequence_identifiers.database_accession",
                "operator": "exact_match", "value": acc}},
            {"type": "terminal", "service": "text", "parameters": {
                "attribute": "rcsb_polymer_entity_container_identifiers.reference_sequence_identifiers.database_name",
                "operator": "exact_match", "value": "UniProt"}},
        ]},
        "return_type": "entry",
        "request_options": {"paginate": {"start": 0, "rows": 15},
                            "results_content_type": ["experimental"]},
    }
    endpoint = "https://search.rcsb.org/rcsbsearch/v2/query"
    try:
        with requests.post(endpoint, json=query, stream=True, timeout=(5, 30), allow_redirects=False,
                           headers={"Accept": "application/json", "User-Agent": "Primer-AI structure search"}) as response:
            if response.status_code == 204:
                body = {"total_count": 0, "result_set": []}
            else:
                response.raise_for_status()
                if response.status_code != 200:
                    raise RuntimeError("Unexpected RCSB search response")
                chunks, size = [], 0
                for chunk in response.iter_content(65536):
                    size += len(chunk)
                    if size > MAX_SEARCH_RESPONSE:
                        raise RuntimeError("RCSB search response is too large")
                    chunks.append(chunk)
                body = json.loads(b"".join(chunks))
    except (requests.RequestException, ValueError) as exc:
        raise RuntimeError("RCSB search unavailable or response invalid") from exc
    if not isinstance(body, dict) or not isinstance(body.get("result_set"), list):
        raise RuntimeError("Unexpected RCSB result set")
    ids, unsupported = [], 0
    for row in body["result_set"]:
        identifier = str((row or {}).get("identifier") or "").upper() if isinstance(row, dict) else ""
        if PDB_ID.fullmatch(identifier) and identifier not in ids:
            ids.append(identifier)
        elif identifier and not PDB_ID.fullmatch(identifier):
            unsupported += 1
    count = body.get("total_count")
    return {
        "uniprot": acc, "total_count": count if isinstance(count, int) and count >= 0 else None,
        "pdb_ids": ids, "page_size": 15, "unsupported_identifiers": unsupported,
        "source_url": endpoint + "?" + urlencode({"json": json.dumps(query, separators=(",", ":"))}),
        "uniprot_url": f"https://www.uniprot.org/uniprotkb/{acc}",
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
        "provider": "RCSB PDB",
    }
