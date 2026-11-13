"""Read-only, bounded access to experimentally deposited RCSB PDB structures."""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from urllib.parse import quote

import requests

PDB_ID = re.compile(r"^[0-9][A-Z0-9]{3}$")
MAX_METADATA_BYTES = 2 * 1024 * 1024
MAX_CIF_BYTES = 8 * 1024 * 1024


def _get_bounded(url: str, max_bytes: int) -> bytes:
    # Both hosts and the URL path are constructed locally; no user URL is fetched.
    try:
        with requests.get(url, timeout=(5, 30), stream=True, allow_redirects=False,
                          headers={"User-Agent": "Primer-AI pharma structure viewer"}) as response:
            if response.status_code == 404:
                raise LookupError("PDB entry not found")
            response.raise_for_status()
            if response.status_code != 200:
                raise RuntimeError("Unexpected upstream response")
            chunks, total = [], 0
            for chunk in response.iter_content(65536):
                total += len(chunk)
                if total > max_bytes:
                    raise RuntimeError("Structure exceeds the viewer size limit")
                chunks.append(chunk)
            return b"".join(chunks)
    except requests.RequestException as exc:
        raise RuntimeError("RCSB PDB could not be reached") from exc


def load_experimental_structure(pdb_id: str) -> dict:
    """Fetch a specific deposited entry, not an automatic drug/target match."""
    entry_id = str(pdb_id).strip().upper()
    if not PDB_ID.fullmatch(entry_id):
        raise ValueError("Enter a four-character PDB ID, e.g. 4HHB")
    try:
        raw = _get_bounded(f"https://data.rcsb.org/rest/v1/core/entry/{entry_id}", MAX_METADATA_BYTES)
        metadata = json.loads(raw)
        cif = _get_bounded(f"https://files.rcsb.org/download/{entry_id}.cif", MAX_CIF_BYTES).decode("utf-8")
    except (UnicodeDecodeError, json.JSONDecodeError, TypeError) as exc:
        raise RuntimeError("Invalid response from RCSB PDB") from exc
    if not isinstance(metadata, dict) or not cif.strip():
        raise RuntimeError("Incomplete response from RCSB PDB")

    info = metadata.get("rcsb_entry_info") or {}
    citation = metadata.get("rcsb_primary_citation") or {}
    accession = metadata.get("rcsb_accession_info") or {}
    methods = [item.get("method") for item in (metadata.get("exptl") or [])
               if isinstance(item, dict) and item.get("method")]
    resolution = info.get("resolution_combined") or []
    doi = citation.get("pdbx_database_id_DOI") or ""
    return {
        "id": entry_id,
        "title": (metadata.get("struct") or {}).get("title") or "",
        "method": ", ".join(methods) or info.get("experimental_method") or "",
        "resolution_angstrom": resolution[0] if resolution and isinstance(resolution, list) else None,
        "release_date": accession.get("initial_release_date") or "",
        "revision_date": accession.get("revision_date") or "",
        "citation_title": citation.get("title") or "",
        "doi": doi,
        "doi_url": "https://doi.org/" + quote(str(doi), safe="/") if doi else "",
        "source_url": f"https://www.rcsb.org/structure/{entry_id}",
        "coordinate_url": f"https://files.rcsb.org/download/{entry_id}.cif",
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
        "cif": cif,
    }
