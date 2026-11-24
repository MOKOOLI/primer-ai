"""Workspace helpers (research and teaching use only).

* Dossier integrity: canonical JSON + SHA-256, so an approval can be bound to exact content.
* Methods text and a documentation checklist generated ONLY from what the dossier actually contains.
* Challenge scoring with a transparent, fully computable rubric.
* Clinical-trial landscape from ClinicalTrials.gov (counts and distributions, no invented scores).

Nothing here is a regulatory claim. A checklist is a documentation aid, not a compliance certificate.
"""
import hashlib
import json
import re
import statistics
from collections import Counter
from datetime import datetime, timezone
from typing import Optional

from pharma_vaccine import ECOLI_FREQ, ENZYMES, _problems, _site_patterns, cai, clean_seq, physchem_profile, translate_dna

MAX_SECTIONS = 60
MAX_CONTENT_BYTES = 1_500_000
KINDS = {"uniprot", "bcell", "tcell", "coverage", "construct", "structure_qc", "interface", "codon", "clone", "enrichment", "string", "geo",
         "variant", "standard_curve", "genorm", "alignment", "conservancy", "primer_snp", "landscape", "vaccine_report", "primer", "sample_qc",
         "qpcr_analysis", "note"}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ------------------------------------------------------------------ integrity
def canonical_json(obj) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def content_hash(obj) -> str:
    return hashlib.sha256(canonical_json(obj).encode("utf-8")).hexdigest()


def clean_sections(sections) -> list:
    if not isinstance(sections, list) or not 1 <= len(sections) <= MAX_SECTIONS:
        raise ValueError(f"A dossier version needs 1 to {MAX_SECTIONS} sections")
    out = []
    for s in sections:
        if not isinstance(s, dict):
            raise ValueError("Each section must be an object")
        kind = str(s.get("kind") or "note")[:30]
        kind = kind if kind in KINDS else "note"
        data = s.get("data")
        if data is not None and not isinstance(data, (dict, list)):
            raise ValueError("Section data must be an object or list")
        out.append({"kind": kind, "title": str(s.get("title") or kind)[:160], "text": str(s.get("text") or "")[:60000],
                    "data": data if data is not None else {}, "added_at": str(s.get("added_at") or "")[:40]})
    if len(canonical_json({"sections": out}).encode("utf-8")) > MAX_CONTENT_BYTES:
        raise ValueError("This dossier version is too large")
    return out


# ------------------------------------------------------- methods + checklist
def _v(d, key, default="n/a"):
    x = d.get(key) if isinstance(d, dict) else None
    return default if x is None or x == "" else x


def _on(d) -> str:
    when = (d.get("retrieved_at") or (d.get("provenance") or {}).get("retrieved_at") or "") if isinstance(d, dict) else ""
    return f" (accessed {str(when)[:10]})" if when else ""


def _pct(x) -> str:
    return f"{x * 100:.1f}%" if isinstance(x, (int, float)) else "n/a"


def _list(x, n=4) -> str:
    return ", ".join(str(i) for i in (x or [])[:n]) or "n/a"


METHOD_TEMPLATES = {
    "uniprot": lambda d: f"The target sequence was taken from UniProt entry {_v(d, 'accession')} ({_v(d, 'name', '')}, {_v(d, 'organism', '')}; {_v(d, 'length')} amino acids){_on(d)}.",
    "bcell": lambda d: f"Linear B-cell epitopes were predicted with the {_v(d, 'method')} method of the IEDB Analysis Resource{_on(d)}.",
    "tcell": lambda d: (f"Binding to MHC class {_v(d, 'mhc_class')} was predicted for {len(d.get('alleles') or [])} HLA alleles with the IEDB '{_v(d, 'method')}' method{_on(d)}; "
                        f"peptides with a percentile rank of {_v(d, 'cutoff')} or lower were retained ({_v(d, 'kept_rows')} of {_v(d, 'total_rows')} predictions)."),
    "coverage": lambda d: f"Projected population coverage was calculated from user-supplied allele frequencies ({_v(d, 'method', 'Hardy-Weinberg per locus')}); combined coverage was {_pct(d.get('coverage_combined'))}.",
    "construct": lambda d: (f"A multi-epitope construct of {_v(d, 'length')} amino acids was assembled ({_v(d, 'layout', 'layout not recorded')})."
                            + (f" Physicochemical properties were computed with Biopython ProtParam: molecular weight {_v(d.get('profile') or {}, 'molecular_weight_kda')} kDa, "
                               f"theoretical pI {_v(d.get('profile') or {}, 'theoretical_pi')}, instability index {_v(d.get('profile') or {}, 'instability_index')}." if d.get("profile") else "")),
    "structure_qc": lambda d: ("Model quality was assessed"
                               + (f" by mean pLDDT ({_v(d.get('plddt') or {}, 'mean')})" if d.get("plddt") else "")
                               + f" and an approximate region-based Ramachandran analysis (favored {_v(d.get('ramachandran') or {}, 'favored_pct')}%, outliers {_v(d.get('ramachandran') or {}, 'outlier_pct')}%)."),
    "interface": lambda d: f"The docked-complex interface was analysed geometrically (cutoff {_v(d, 'cutoff_angstrom')} A): {_v(d, 'residue_pairs_in_contact')} residue pairs in contact and {_v(d, 'n_polar_contacts')} polar-contact candidates.",
    "codon": lambda d: (f"The coding sequence was back-translated using {_v(d, 'host_table')} codon usage ({_v(d, 'strategy')}, seed {_v(d, 'seed')}); "
                        f"CAI {_v(d, 'cai')}, GC content {_v(d, 'gc_percent')}%; restriction sites avoided: {_list(d.get('avoided_enzymes'), 15)}."),
    "clone": lambda d: f"An in-silico cloning insert of {_v(d, 'length_nt')} nt was designed; site counts: {json.dumps(d.get('site_counts') or {})}.",
    "enrichment": lambda d: f"Over-representation analysis of {_v(d, 'n_genes')} genes ({_v(d, 'organism')}) was performed with g:Profiler{_on(d)}, yielding {_v(d, 'n_terms')} enriched terms.",
    "string": lambda d: f"Protein-protein associations were retrieved from STRING{_on(d)}: {_v(d, 'n_nodes')} nodes and {_v(d, 'n_edges')} edges above the score cutoff.",
    "geo": lambda d: f"Public expression datasets were searched in NCBI GEO{_on(d)} with the query '{_v(d, 'query')}' ({_v(d, 'total')} series).",
    "variant": lambda d: f"Variant {_v(d, 'input')} was annotated with Ensembl VEP{_on(d)}; most severe consequence: {_v(d, 'most_severe_consequence')}.",
    "standard_curve": lambda d: f"A standard curve gave a slope of {_v(d, 'slope')}, R squared {_v(d, 'r_squared')} and an amplification efficiency of {_v(d, 'efficiency_percent')}%.",
    "genorm": lambda d: f"Reference-gene stability was ranked with geNorm over {_v(d, 'n_samples')} samples; most stable: {_list([r.get('gene') for r in d.get('ranking_most_to_least_stable') or []], 2)}.",
    "alignment": lambda d: f"Sequences were aligned with an approximate center-star method ({_v(d, 'mode')}); mean identity {_v(d, 'mean_identity')}.",
    "conservancy": lambda d: f"Epitope conservancy was evaluated by exact and one-mismatch matching across the supplied sequences ({len(d.get('results') or [])} epitopes).",
    "primer_snp": lambda d: f"Known variants overlapping primer binding sites were listed with Ensembl ({_v(d, 'assembly', 'GRCh38')}){_on(d)}.",
    "landscape": lambda d: f"The clinical-trial landscape was summarised from ClinicalTrials.gov{_on(d)}: {_v(d, 'total')} matching studies, of which {_v(d, 'sampled')} were analysed.",
}

REQUIRED_NOTE = ("All results are computational predictions or public-database annotations and are hypotheses that require experimental validation. "
                 "Tool and database access dates are given where recorded.")


def generate_methods(sections: list) -> dict:
    sentences, used, unknown = [], [], []
    for s in sections:
        fn, d = METHOD_TEMPLATES.get(s.get("kind")), s.get("data")
        if fn and isinstance(d, dict) and d:
            try:
                sentences.append(fn(d))
                used.append(s.get("title"))
            except (TypeError, AttributeError, ValueError):
                unknown.append(s.get("title"))
        elif s.get("kind") not in ("note", "vaccine_report"):
            unknown.append(s.get("title"))
    text = " ".join(sentences + ([REQUIRED_NOTE] if sentences else []))
    return {"text": text, "sections_used": used, "sections_without_methods_text": unknown,
            "limits": "Generated only from recorded fields. Check wording and add anything the dossier does not capture (reagents, instruments, software versions)."}


def miqe_checklist(sections: list) -> dict:
    kinds = {s.get("kind") for s in sections}
    sc = next((s["data"] for s in sections if s.get("kind") == "standard_curve" and isinstance(s.get("data"), dict)), {})
    items = [
        ("Standard curve / amplification efficiency", "standard_curve" in kinds and sc.get("efficiency_percent") is not None),
        ("Linearity (R squared) reported", "standard_curve" in kinds and sc.get("r_squared") is not None),
        ("Reference-gene stability assessed", "genorm" in kinds),
        ("Primer sequences and amplicon details", "primer" in kinds),
        ("Sample quality and reverse-transcription details", "sample_qc" in kinds),
        ("Data-analysis method (for example delta-delta Ct) and replicates", "qpcr_analysis" in kinds),
    ]
    return {"items": [{"item": i, "status": "documented" if ok else "not documented"} for i, ok in items],
            "note": "A documentation aid built from dossier sections of the matching kind. It is not a MIQE compliance certificate; add 'primer', 'sample_qc' and 'qpcr_analysis' sections to document the rest."}


# ------------------------------------------------------------- challenge scoring
def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def validate_challenge_config(kind: str, cfg: dict) -> dict:
    if not isinstance(cfg, dict):
        raise ValueError("Config must be an object")
    if kind == "codon":
        prot = clean_seq(cfg.get("protein", ""), max_len=800, min_len=20)
        sites = [s for s in (cfg.get("forbidden_sites") or []) if s in ENZYMES]
        lo, hi = float(cfg.get("gc_min", 40)), float(cfg.get("gc_max", 60))
        if not 0 <= lo < hi <= 100:
            raise ValueError("GC bounds must satisfy 0 <= min < max <= 100")
        return {"protein": prot, "forbidden_sites": sites[:10], "gc_min": lo, "gc_max": hi}
    if kind == "construct":
        refs = [clean_seq(r, max_len=3000, min_len=20) for r in (cfg.get("references") or [])]
        if not 1 <= len(refs) <= 50:
            raise ValueError("Provide 1 to 50 reference sequences")
        lo, hi, mx = int(cfg.get("min_epitopes", 3)), int(cfg.get("max_epitopes", 12)), int(cfg.get("length_max", 400))
        if not 1 <= lo <= hi <= 40 or not 30 <= mx <= 1500:
            raise ValueError("Check epitope-count and length limits")
        return {"references": refs, "min_epitopes": lo, "max_epitopes": hi, "length_max": mx}
    raise ValueError("Unknown challenge type")


def rubric(kind: str) -> list:
    if kind == "codon":
        return ["Gate: the CDS must encode the protein exactly (a trailing stop codon is allowed); otherwise 0",
                "CAI against the Escherichia coli table: up to 50 points", "GC content inside the allowed window: up to 20 points",
                "No forbidden restriction sites: 20 points", "No run of 8 or more identical bases: 10 points"]
    return ["Gate: standard amino acids only, length within the limit, and every listed epitope must occur in the construct; otherwise 0",
            "Mean exact conservancy of the epitopes across the reference sequences: up to 45 points",
            "Instability index below 40: up to 25 points (partial credit up to 80)", "Number of epitopes inside the allowed range: 15 points",
            "Average hydropathy (GRAVY) at or below 0: up to 15 points"]


def score_codon(cfg: dict, payload: dict) -> dict:
    cds = re.sub(r"\s", "", str(payload.get("cds", ""))).upper().replace("U", "T")
    if not re.fullmatch(r"[ACGT]+", cds) or len(cds) % 3:
        return {"score": 0.0, "valid": False, "reason": "CDS must be A/C/G/T with a length that is a multiple of 3", "parts": {}}
    body = cds[:-3] if cds[-3:] in ("TAA", "TAG", "TGA") else cds
    if translate_dna(body) != cfg["protein"]:
        return {"score": 0.0, "valid": False, "reason": "The CDS does not encode the required protein", "parts": {}}
    c = cai(body, ECOLI_FREQ) or 0.0
    gc = 100.0 * sum(ch in "GC" for ch in cds) / len(cds)
    dist = 0.0 if cfg["gc_min"] <= gc <= cfg["gc_max"] else min(abs(gc - cfg["gc_min"]), abs(gc - cfg["gc_max"]))
    sites = len([p for p in _problems(cds, _site_patterns(cfg["forbidden_sites"]), 0)]) if cfg["forbidden_sites"] else 0
    runs = len([p for p in _problems(cds, {}, 8) if p[2] == "run"])
    parts = {"cai": round(50 * c, 2), "gc": round(20 * (1 - _clamp01(dist / 20)), 2), "sites": 20.0 if sites == 0 else 0.0, "runs": 10.0 if runs == 0 else 0.0}
    return {"score": round(sum(parts.values()), 2), "valid": True, "reason": "", "parts": parts,
            "metrics": {"cai": c, "gc_percent": round(gc, 1), "forbidden_sites_found": sites, "long_runs": runs}}


def score_construct(cfg: dict, payload: dict) -> dict:
    try:
        seq = clean_seq(payload.get("construct", ""), max_len=1500, min_len=20)
        eps = [clean_seq(e, max_len=60, min_len=5) for e in (payload.get("epitopes") or [])]
    except ValueError as exc:
        return {"score": 0.0, "valid": False, "reason": str(exc), "parts": {}}
    if len(seq) > cfg["length_max"]:
        return {"score": 0.0, "valid": False, "reason": f"Construct is longer than {cfg['length_max']} residues", "parts": {}}
    if not eps or any(e not in seq for e in eps):
        return {"score": 0.0, "valid": False, "reason": "Every listed epitope must occur in the construct", "parts": {}}
    cons = statistics.fmean([100.0 * sum(e in r for r in cfg["references"]) / len(cfg["references"]) for e in eps]) / 100.0
    prof = physchem_profile(seq)
    ii = prof["instability_index"]
    stab = 25.0 if ii < 40 else 25.0 * _clamp01(1 - (ii - 40) / 40)
    n = len(set(eps))
    count_pts = 15.0 if cfg["min_epitopes"] <= n <= cfg["max_epitopes"] else 0.0
    hyd = 15.0 if prof["gravy"] <= 0 else 15.0 * _clamp01(1 - prof["gravy"] / 1.0)
    parts = {"conservancy": round(45 * cons, 2), "stability": round(stab, 2), "epitope_count": count_pts, "hydropathy": round(hyd, 2)}
    return {"score": round(sum(parts.values()), 2), "valid": True, "reason": "", "parts": parts,
            "metrics": {"mean_conservancy_percent": round(100 * cons, 1), "instability_index": ii, "gravy": prof["gravy"], "n_epitopes": n}}


def score_submission(kind: str, cfg: dict, payload: dict) -> dict:
    if not isinstance(payload, dict):
        raise ValueError("Payload must be an object")
    return score_codon(cfg, payload) if kind == "codon" else score_construct(cfg, payload)


def leaderboard(rows: list, limit: int = 50) -> list:
    """Best submission per user; ties broken by the earliest time."""
    best = {}
    for r in rows:
        cur = best.get(r["user_id"])
        if cur is None or (r["score"], -r["ts"]) > (cur["score"], -cur["ts"]):
            best[r["user_id"]] = r
    ranked = sorted(best.values(), key=lambda r: (-r["score"], r["ts"]))[:limit]
    return [{**r, "rank": i + 1} for i, r in enumerate(ranked)]


# ------------------------------------------------------------ trial landscape
def _g(o, *path):
    for p in path:
        o = o.get(p) if isinstance(o, dict) else None
        if o is None:
            return None
    return o


def aggregate_studies(studies: list) -> dict:
    phases, status, sclass, sponsors, years, intervs = Counter(), Counter(), Counter(), Counter(), Counter(), Counter()
    enroll, items = [], []
    for st in studies:
        ps = st.get("protocolSection") or {}
        nct, title = _g(ps, "identificationModule", "nctId"), _g(ps, "identificationModule", "briefTitle")
        if not nct:
            continue
        ph = "/".join(sorted(_g(ps, "designModule", "phases") or ["NA"]))
        ov = _g(ps, "statusModule", "overallStatus") or "UNKNOWN"
        sp = _g(ps, "sponsorCollaboratorsModule", "leadSponsor") or {}
        start = str(_g(ps, "statusModule", "startDateStruct", "date") or "")
        n = _g(ps, "designModule", "enrollmentInfo", "count")
        phases[ph] += 1
        status[ov] += 1
        sclass[sp.get("class") or "UNKNOWN"] += 1
        if sp.get("name"):
            sponsors[sp["name"]] += 1
        if re.match(r"^\d{4}", start):
            years[start[:4]] += 1
        for i in _g(ps, "armsInterventionsModule", "interventions") or []:
            if isinstance(i, dict) and i.get("name"):
                intervs[i["name"]] += 1
        if isinstance(n, (int, float)):
            enroll.append(n)
        items.append({"nct_id": nct, "title": title or "", "status": ov, "phase": ph, "sponsor": sp.get("name") or "", "start": start,
                      "enrollment": n, "url": f"https://clinicaltrials.gov/study/{nct}"})
    return {"n_analysed": len(items), "by_phase": dict(phases.most_common()), "by_status": dict(status.most_common()), "by_sponsor_class": dict(sclass.most_common()),
            "top_sponsors": [{"name": k, "studies": v} for k, v in sponsors.most_common(10)], "by_start_year": dict(sorted(years.items())),
            "top_interventions": [{"name": k, "studies": v} for k, v in intervs.most_common(10)],
            "median_enrollment": statistics.median(enroll) if enroll else None, "studies": items[:25]}


def trial_landscape(condition: str, intervention: str, term: str) -> dict:
    from bio_tools import _get

    q = {k: (v or "").strip() for k, v in (("query.cond", condition), ("query.intr", intervention), ("query.term", term))}
    q = {k: v for k, v in q.items() if v}
    if not q or any(len(v) > 150 or re.search(r"[\x00-\x1f]", v) for v in q.values()):
        raise ValueError("Give at least one of condition, intervention or free text (150 characters at most each)")
    data = _get("https://clinicaltrials.gov/api/v2/studies", params={**q, "format": "json", "pageSize": 150, "countTotal": "true"}, timeout=(6, 60))
    if not isinstance(data, dict):
        raise RuntimeError("Unexpected response from ClinicalTrials.gov")
    agg = aggregate_studies(data.get("studies") or [])
    return {"query": q, "total": data.get("totalCount"), "sampled": len(data.get("studies") or []), **agg, "provider": "ClinicalTrials.gov", "url": "https://clinicaltrials.gov/",
            "retrieved_at": now_iso(),
            "limits": "Distributions describe the first 150 studies returned by ClinicalTrials.gov (relevance order), not all matches. Registration is not evidence of efficacy; "
                      "no attractiveness or success score is computed."}
