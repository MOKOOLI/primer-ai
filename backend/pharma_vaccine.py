"""Immunoinformatics helpers for the Vaccine Design workspace (research use only).

What is computed here, and what is not:
  * UniProt protein fetch (sequence + signal/transmembrane annotation): real records.
  * Linear B-cell and MHC-I / MHC-II predictions: forwarded to the public IEDB
    Analysis Resource REST API; scores are IEDB's, never invented locally.
  * Multi-epitope assembly and physicochemical profile: computed locally
    (Biopython ProtParam + the published Ikai aliphatic-index formula).
  * Antigenicity, allergenicity, toxicity, solubility, population coverage and
    docking are NOT computed here. The UI points to the original tools instead.

Predictions are hypotheses that need experimental validation. Nothing here is a
clinical, dosing or safety recommendation.
"""
from __future__ import annotations

import logging
import os
import re
import threading
from datetime import datetime, timezone

import requests

log = logging.getLogger("primerai.pharma.vaccine")

AA = set("ACDEFGHIKLMNPQRSTVWY")
ACC_RE = re.compile(r"^(?:[OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9](?:[A-Z][A-Z0-9]{2}[0-9]){1,2})$")
ALLELE_RE = re.compile(r"^[A-Za-z0-9*:/_.\-]{3,40}$")
METHOD_RE = re.compile(r"^[A-Za-z0-9_.\-]{2,40}$")

IEDB_BASE = os.getenv("IEDB_API_BASE", "https://tools-cluster-interface.iedb.org/tools_api").rstrip("/")
IEDB_HOME = "https://tools.iedb.org/"
UA = {"User-Agent": "Primer-AI vaccine workspace (research)"}

MAX_SEQ_BCELL = 5000
MAX_SEQ_TCELL = 1500
MAX_ALLELES = 30
MAX_CONSTRUCT = 2000
BCELL_METHODS = {"Bepipred", "Emini", "Kolaskar-Tongaonkar", "Parker", "Chou-Fasman", "Karplus-Schulz"}
RANK_COLUMNS = ("percentile_rank", "rank", "consensus_percentile_rank", "adjusted_rank")

# ExPASy ProtParam N-end-rule estimates (mammalian reticulocytes, in vitro), hours.
HALF_LIFE_H = {"A": 4.4, "R": 1, "N": 1.4, "D": 1.1, "C": 1.2, "Q": 0.8, "E": 1, "G": 30, "H": 3.5,
               "I": 20, "L": 5.5, "K": 1.3, "M": 30, "F": 1.1, "P": 20, "S": 1.9, "T": 7.2, "V": 100,
               "W": 2.8, "Y": 2.8}

_SLOT = threading.BoundedSemaphore(2)


class Busy(Exception):
    pass


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ----------------------------------------------------------------- sequences
def clean_seq(text: str, *, max_len: int, min_len: int = 1) -> str:
    """Accept raw or FASTA text; return an uppercase standard-amino-acid sequence."""
    if not isinstance(text, str):
        raise ValueError("Sequence must be text")
    lines = [ln for ln in text.splitlines() if not ln.lstrip().startswith(">")]
    seq = re.sub(r"[\s\d*\-]", "", "".join(lines)).upper()
    bad = sorted(set(seq) - AA)
    if bad:
        raise ValueError("Only the 20 standard amino-acid letters are accepted; found: " + ", ".join(bad[:6]))
    if len(seq) < min_len:
        raise ValueError(f"Sequence must have at least {min_len} residues")
    if len(seq) > max_len:
        raise ValueError(f"Sequence exceeds the limit of {max_len} residues")
    return seq


# ------------------------------------------------------------------- UniProt
def load_uniprot(accession: str) -> dict:
    acc = str(accession).strip().upper()
    if not ACC_RE.fullmatch(acc):
        raise ValueError("Enter a UniProt accession such as P0DTC2")
    url = f"https://rest.uniprot.org/uniprotkb/{acc}.json"
    try:
        with requests.get(url, timeout=(5, 25), stream=True, headers=UA) as r:
            if r.status_code in (400, 404):
                raise LookupError("UniProt entry not found")
            r.raise_for_status()
            chunks, total = [], 0
            for chunk in r.iter_content(65536):
                total += len(chunk)
                if total > 6 * 1024 * 1024:
                    raise RuntimeError("UniProt record exceeds the size limit")
                chunks.append(chunk)
            data = __import__("json").loads(b"".join(chunks))
    except requests.RequestException as exc:
        raise RuntimeError("UniProt could not be reached") from exc
    except ValueError as exc:
        raise RuntimeError("Invalid response from UniProt") from exc
    seq = ((data.get("sequence") or {}).get("value") or "").upper()
    if not seq or set(seq) - AA:
        raise ValueError("This entry has no standard-amino-acid sequence that the workspace can use")
    pd = data.get("proteinDescription") or {}
    name = ((pd.get("recommendedName") or {}).get("fullName") or {}).get("value") \
        or (((pd.get("submissionNames") or [{}])[0]).get("fullName") or {}).get("value") or ""
    genes = data.get("genes") or []
    gene = ((genes[0].get("geneName") or {}).get("value") if genes else "") or ""
    keep = {"Signal", "Transmembrane", "Topological domain", "Chain", "Propeptide", "Transit peptide"}
    feats = []
    for f in data.get("features") or []:
        if f.get("type") in keep:
            loc = f.get("location") or {}
            try:
                feats.append({"type": f["type"], "start": int(loc["start"]["value"]), "end": int(loc["end"]["value"]),
                              "description": f.get("description") or ""})
            except (KeyError, TypeError, ValueError):
                continue
    return {
        "accession": data.get("primaryAccession") or acc, "name": name, "gene": gene,
        "organism": (data.get("organism") or {}).get("scientificName") or "",
        "reviewed": "Swiss-Prot" in str(data.get("entryType") or ""),
        "length": len(seq), "sequence": seq, "features": feats[:150],
        "provider": "UniProt", "source_url": f"https://www.uniprot.org/uniprotkb/{acc}/entry",
        "license": "CC BY 4.0", "retrieved_at": now_iso(),
    }


# ---------------------------------------------------------------------- IEDB
def _iedb_post(tool: str, data: dict) -> str:
    if not _SLOT.acquire(blocking=False):
        raise Busy()
    try:
        r = requests.post(f"{IEDB_BASE}/{tool}/", data=data, timeout=(8, 170), headers=UA)
    except requests.RequestException as exc:
        raise RuntimeError("IEDB Analysis Resource could not be reached") from exc
    finally:
        _SLOT.release()
    if r.status_code != 200:
        raise RuntimeError(f"IEDB Analysis Resource returned HTTP {r.status_code}")
    return r.text


def parse_table(text: str) -> tuple[list[str], list[dict]]:
    lines = [ln for ln in (text or "").splitlines() if ln.strip()]
    if len(lines) < 2 or "\t" not in lines[0]:
        hint = lines[0][:160] if lines else "empty response"
        raise RuntimeError("Unexpected IEDB response: " + hint)
    head = [h.strip().lower().replace(" ", "_") for h in lines[0].split("\t")]
    rows = []
    for ln in lines[1:]:
        cells = [c.strip() for c in ln.split("\t")]
        if len(cells) >= len(head) - 1:
            rows.append(dict(zip(head, cells)))
    return head, rows


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def bcell_segments(rows: list[dict], seq: str, min_len: int = 6, max_len: int = 30) -> list[dict]:
    """Group consecutive residues called 'E' (epitope) by BepiPred into peptides."""
    out, run = [], []

    def flush():
        nonlocal run
        if len(run) >= min_len:
            for i in range(0, len(run), max_len):
                part = run[i:i + max_len]
                if len(part) >= min_len:
                    s, e = part[0][0], part[-1][0]
                    scores = [p[1] for p in part if p[1] is not None]
                    out.append({"start": s, "end": e, "peptide": seq[s - 1:e],
                                "mean_score": round(sum(scores) / len(scores), 3) if scores else None})
        run = []

    expected = None
    for r in rows:
        pos = _num(r.get("position"))
        if pos is None:
            continue
        pos = int(pos)
        called = (r.get("assignment") or "").strip().upper() == "E"
        if called and (expected is None or pos == expected):
            run.append((pos, _num(r.get("score"))))
            expected = pos + 1
        else:
            flush()
            expected = None
            if called:
                run.append((pos, _num(r.get("score"))))
                expected = pos + 1
    flush()
    return out


def predict_bcell(sequence: str, method: str) -> dict:
    seq = clean_seq(sequence, max_len=MAX_SEQ_BCELL, min_len=8)
    if method not in BCELL_METHODS:
        raise ValueError("Unsupported B-cell method")
    text = _iedb_post("bcell", {"method": method, "sequence_text": seq})
    cols, rows = parse_table(text)
    segments = bcell_segments(rows, seq) if "assignment" in cols else []
    return {
        "method": method, "columns": cols, "rows": rows[:6000], "total_rows": len(rows),
        "segments": segments[:200], "sequence_length": len(seq),
        "provenance": {"provider": "IEDB Analysis Resource", "url": IEDB_HOME, "retrieved_at": now_iso(),
                       "note": "Linear B-cell predictions are hypotheses; antibody binding must be tested experimentally."},
    }


def predict_tcell(mhc_class: str, sequence: str, alleles: list[str], lengths: list[int],
                  method: str, cutoff: float) -> dict:
    if mhc_class not in ("I", "II"):
        raise ValueError("MHC class must be I or II")
    seq = clean_seq(sequence, max_len=MAX_SEQ_TCELL, min_len=9)
    if not alleles or len(alleles) > MAX_ALLELES or not all(ALLELE_RE.fullmatch(a) for a in alleles):
        raise ValueError(f"Provide 1 to {MAX_ALLELES} valid allele names")
    if not METHOD_RE.fullmatch(method):
        raise ValueError("Invalid method name")
    if not 0.01 <= cutoff <= 20:
        raise ValueError("Percentile-rank cutoff must be between 0.01 and 20")
    data = {"method": method, "sequence_text": seq, "allele": ",".join(alleles)}
    if mhc_class == "I":
        if not lengths or not all(8 <= n <= 14 for n in lengths):
            raise ValueError("MHC-I peptide lengths must be between 8 and 14")
        data["length"] = ",".join(str(n) for n in sorted(set(lengths)))
    text = _iedb_post("mhci" if mhc_class == "I" else "mhcii", data)
    cols, rows = parse_table(text)
    rank_col = next((c for c in RANK_COLUMNS if c in cols), None)
    kept = rows
    if rank_col:
        kept = [r for r in rows if (_num(r.get(rank_col)) is not None and _num(r.get(rank_col)) <= cutoff)]
    groups: dict[str, dict] = {}
    for r in kept:
        pep = r.get("peptide") or ""
        if not pep:
            continue
        g = groups.setdefault(pep, {"peptide": pep, "start": r.get("start"), "end": r.get("end"),
                                    "length": len(pep), "alleles": [], "best_rank": None})
        if r.get("allele") and r["allele"] not in g["alleles"]:
            g["alleles"].append(r["allele"])
        rk = _num(r.get(rank_col)) if rank_col else None
        if rk is not None and (g["best_rank"] is None or rk < g["best_rank"]):
            g["best_rank"] = rk
    peptides = sorted(groups.values(), key=lambda g: (-len(g["alleles"]), g["best_rank"] if g["best_rank"] is not None else 99))
    for g in peptides:
        g["n_alleles"] = len(g["alleles"])
    return {
        "mhc_class": mhc_class, "method": method, "rank_column": rank_col, "cutoff": cutoff,
        "alleles": alleles, "total_rows": len(rows), "kept_rows": len(kept),
        "peptides": peptides[:150], "sequence_length": len(seq),
        "provenance": {"provider": "IEDB Analysis Resource", "url": IEDB_HOME, "retrieved_at": now_iso(),
                       "note": "Binding prediction is not proof of immunogenicity; validate experimentally."},
        "warning": None if rank_col else "No percentile-rank column was returned, so results are not filtered.",
    }


# ------------------------------------------------------------- local compute
def physchem_profile(sequence: str) -> dict:
    from Bio.SeqUtils.ProtParam import ProteinAnalysis  # lazy: keeps this module importable without Biopython

    seq = clean_seq(sequence, max_len=MAX_CONSTRUCT, min_len=5)
    pa = ProteinAnalysis(seq)
    n = len(seq)
    instability = float(pa.instability_index())
    aliphatic = (seq.count("A") + 2.9 * seq.count("V") + 3.9 * (seq.count("I") + seq.count("L"))) / n * 100
    return {
        "length": n,
        "molecular_weight_kda": round(pa.molecular_weight() / 1000, 2),
        "theoretical_pi": round(float(pa.isoelectric_point()), 2),
        "instability_index": round(instability, 2),
        "instability_class": "stable" if instability < 40 else "unstable",
        "aliphatic_index": round(aliphatic, 2),
        "gravy": round(float(pa.gravy()), 3),
        "negative_residues_DE": seq.count("D") + seq.count("E"),
        "positive_residues_RK": seq.count("R") + seq.count("K"),
        "n_terminal_residue": seq[0],
        "half_life_hours_mammalian_in_vitro": HALF_LIFE_H.get(seq[0]),
        "methods": "Biopython ProtParam (Guruprasad instability index, Kyte-Doolittle GRAVY); "
                   "aliphatic index per Ikai (1980); half-life from the N-end rule table used by ExPASy ProtParam.",
        "limits": "Sequence-based estimates only. They say nothing about antigenicity, allergenicity, toxicity or real-world stability.",
    }


def assemble_construct(adjuvant: str, ctl: list[str], htl: list[str], bcell: list[str], his_tag: bool,
                       adjuvant_label: str = "Adjuvant") -> dict:
    def pep_list(items, kind):
        if len(items) > 30:
            raise ValueError(f"At most 30 {kind} epitopes are allowed")
        return [clean_seq(p, max_len=60, min_len=5) for p in items]

    adj = clean_seq(adjuvant, max_len=400, min_len=5) if adjuvant and adjuvant.strip() else ""
    ctl, htl, bcell = pep_list(ctl, "CTL"), pep_list(htl, "HTL"), pep_list(bcell, "B-cell")
    if not (ctl or htl or bcell):
        raise ValueError("Add at least one epitope")
    parts: list[tuple[str, str, str]] = []  # (kind, label, sequence)

    def add_block(kind: str, items: list[str], inner: str, lead: str | None):
        if not items:
            return
        if parts and lead:
            parts.append(("linker", lead, lead))
        for i, p in enumerate(items):
            if i:
                parts.append(("linker", inner, inner))
            parts.append((kind, f"{kind} {i + 1}", p))

    if adj:
        parts.append(("adjuvant", adjuvant_label, adj))
    add_block("CTL", ctl, "AAY", "EAAAK" if adj else None)
    add_block("HTL", htl, "GPGPG", "GPGPG" if (adj or ctl) else None)
    add_block("B-cell", bcell, "KK", "KK" if parts else None)
    if his_tag:
        parts.append(("tag", "His-tag", "HHHHHH"))
    seq, pos, segs = "", 1, []
    for kind, label, s in parts:
        seq += s
        segs.append({"kind": kind, "label": label, "start": pos, "end": pos + len(s) - 1, "sequence": s})
        pos += len(s)
    if len(seq) > MAX_CONSTRUCT:
        raise ValueError(f"Construct is {len(seq)} residues; the limit is {MAX_CONSTRUCT}")
    return {"sequence": seq, "length": len(seq), "segments": segs, "profile": physchem_profile(seq),
            "layout": "adjuvant - EAAAK - CTL (AAY) - GPGPG - HTL (GPGPG) - KK - B-cell (KK) - His-tag",
            "note": "A conventional layout for illustration. Linkers and order should be justified in your methods."}


# ------------------------------------------------------------------- routes
def register_vaccine_routes(router, *, get_current_user):
    from fastapi import Depends, HTTPException, Query
    from pydantic import BaseModel, Field
    from starlette.concurrency import run_in_threadpool

    from pharma_observability import upstream_event

    class SeqReq(BaseModel):
        sequence: str = Field(min_length=5, max_length=60000)

    class BcellReq(SeqReq):
        method: str = Field("Bepipred", max_length=40)

    class TcellReq(SeqReq):
        mhc_class: str = Field(max_length=2)
        alleles: list[str]
        lengths: list[int] = Field(default_factory=lambda: [9])
        method: str = Field("recommended", max_length=40)
        percentile_cutoff: float = Field(1.0)

    class AssembleReq(BaseModel):
        adjuvant: str = Field("", max_length=3000)
        adjuvant_label: str = Field("Adjuvant", max_length=60)
        ctl: list[str] = Field(default_factory=list)
        htl: list[str] = Field(default_factory=list)
        bcell: list[str] = Field(default_factory=list)
        his_tag: bool = True

    async def guarded(fn, provider: str, op: str, *args):
        try:
            return await run_in_threadpool(fn, *args)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        except LookupError as exc:
            raise HTTPException(404, str(exc)) from exc
        except Busy as exc:
            raise HTTPException(429, "The prediction service is busy; try again shortly") from exc
        except RuntimeError as exc:
            upstream_event(provider=provider, operation=op, ok=False, error=str(exc))
            raise HTTPException(502, str(exc)) from exc

    @router.get("/vaccine/protein")
    async def vaccine_protein(accession: str = Query(..., min_length=6, max_length=10), user=Depends(get_current_user)):
        return await guarded(load_uniprot, "UniProt", "vaccine_protein", accession)

    @router.post("/vaccine/bcell")
    async def vaccine_bcell(req: BcellReq, user=Depends(get_current_user)):
        return await guarded(predict_bcell, "IEDB", "bcell", req.sequence, req.method)

    @router.post("/vaccine/tcell")
    async def vaccine_tcell(req: TcellReq, user=Depends(get_current_user)):
        return await guarded(predict_tcell, "IEDB", "tcell", req.mhc_class, req.sequence, req.alleles,
                             req.lengths, req.method, req.percentile_cutoff)

    @router.post("/vaccine/profile")
    async def vaccine_profile(req: SeqReq, user=Depends(get_current_user)):
        return await guarded(physchem_profile, "local", "profile", req.sequence)

    @router.post("/vaccine/assemble")
    async def vaccine_assemble(req: AssembleReq, user=Depends(get_current_user)):
        return await guarded(assemble_construct, "local", "assemble", req.adjuvant, req.ctl, req.htl,
                             req.bcell, req.his_tag, req.adjuvant_label)
