"""Source-linked regulatory and chemical lookups for the research workbench.

Records are search candidates, not assertions that a product is equivalent
to another database entry or is approved for a particular indication.
"""
from __future__ import annotations

import html
import re
from urllib.parse import quote

import requests

FDA_API = "https://api.fda.gov/drug/drugsfda.json"
EMA_DATA = "https://www.ema.europa.eu/en/documents/report/medicines-output-medicines_json-report_en.json"
PUBCHEM = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/{}/property/MolecularFormula,MolecularWeight,InChIKey/JSON"
HEADERS = {"Accept": "application/json", "User-Agent": "PrimerAI research workbench"}


class SourceUnavailable(Exception):
    pass


def get_json(url: str, params: dict | None = None, allow_missing: bool = False):
    try:
        response = requests.get(url, params=params, headers=HEADERS, timeout=(5, 25))
        if response.status_code == 404 and allow_missing:
            return None
        response.raise_for_status()
        return response.json()
    except (requests.RequestException, ValueError) as exc:
        raise SourceUnavailable("Source unavailable or returned invalid JSON") from exc


def clean_text(value, limit: int = 500):
    # Providers may include search-highlighting tags in otherwise plain text.
    text = html.unescape(re.sub(r"<[^>]*>", "", str(value or "")))
    return re.sub(r"\s+", " ", text).strip()[:limit]


def lookup_fda(name: str):
    # Prevent injection of openFDA query operators, but preserve common names.
    term = re.sub(r"[^A-Za-z0-9 .\-]", " ", name)
    term = re.sub(r"\s+", " ", term).strip()
    if len(term) < 2:
        return {"items": [], "dataset_updated": None}
    data = get_json(FDA_API, {
        "search": f'products.active_ingredients.name:"{term}"',
        "limit": 10,
    }, allow_missing=True)
    if not data:
        return {"items": [], "dataset_updated": None}
    items = []
    for app in data.get("results", []):
        app_id = clean_text(app.get("application_number"), 30)
        if not re.fullmatch(r"(?:ANDA|NDA|BLA)\d+", app_id):
            continue
        for product in app.get("products") or []:
            ingredients = [
                {"name": clean_text(x.get("name"), 120), "strength": clean_text(x.get("strength"), 80)}
                for x in product.get("active_ingredients") or []
            ]
            if not any(term.casefold() in x["name"].casefold() for x in ingredients):
                continue
            items.append({
                "application_number": app_id,
                "brand_name": clean_text(product.get("brand_name"), 200),
                "product_number": clean_text(product.get("product_number"), 20),
                "ingredients": ingredients,
                "marketing_status": clean_text(product.get("marketing_status"), 80) or None,
                "dosage_form": clean_text(product.get("dosage_form"), 80),
                "route": clean_text(product.get("route"), 80),
                "url": "https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&ApplNo="
                       + quote(re.sub(r"^[A-Z]+", "", app_id), safe=""),
            })
    return {"items": items[:20], "dataset_updated": (data.get("meta") or {}).get("last_updated")}


def lookup_ema(name: str):
    data = get_json(EMA_DATA)
    if not isinstance(data, dict) or not isinstance(data.get("data"), list):
        raise SourceUnavailable("EMA data has an unexpected structure")
    term = name.casefold().strip()
    items = []
    for row in data["data"]:
        if not isinstance(row, dict) or str(row.get("category", "")).casefold() != "human":
            continue
        fields = (row.get("name_of_medicine"), row.get("international_non_proprietary_name_common_name"),
                  row.get("active_substance"))
        if not any(term in str(field or "").casefold() for field in fields):
            continue
        link = str(row.get("medicine_url") or "")
        if not link.startswith("https://www.ema.europa.eu/"):
            continue
        items.append({
            "name": clean_text(row.get("name_of_medicine"), 200),
            "id": clean_text(row.get("ema_product_number"), 60),
            "active_substance": clean_text(row.get("active_substance"), 300),
            "status": clean_text(row.get("medicine_status"), 100) or None,
            "opinion_status": clean_text(row.get("opinion_status"), 100) or None,
            "authorisation_date": clean_text(row.get("marketing_authorisation_date"), 30),
            "last_updated": clean_text(row.get("last_updated_date"), 30),
            "indication_excerpt": clean_text(row.get("therapeutic_indication"), 700),
            "url": link,
        })
        if len(items) >= 20:
            break
    return {"items": items, "dataset_updated": (data.get("meta") or {}).get("timestamp")}


def lookup_pubchem(name: str):
    url = PUBCHEM.format(quote(name, safe=""))
    data = get_json(url, allow_missing=True)
    records = ((data or {}).get("PropertyTable") or {}).get("Properties") or []
    if not records:
        return {"item": None}
    row = records[0]
    cid = row.get("CID")
    if not isinstance(cid, int):
        return {"item": None}
    return {"item": {
        "cid": cid,
        "molecular_formula": clean_text(row.get("MolecularFormula"), 100),
        "molecular_weight": clean_text(row.get("MolecularWeight"), 100),
        "inchikey": clean_text(row.get("InChIKey"), 100),
        "url": f"https://pubchem.ncbi.nlm.nih.gov/compound/{cid}",
    }}
