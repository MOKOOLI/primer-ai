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
from typing import Optional
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

    def add_block(kind: str, items: list[str], inner: str, lead: Optional[str]):
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



# ------------------------------------------------- population coverage (local)
_CLASS_I_LOCI = {"A", "B", "C", "E", "F", "G"}


def _locus(allele: str) -> str:
    name = allele.upper().replace("HLA-", "", 1)
    return name.split("*", 1)[0] if "*" in name else name


def coverage_from_frequencies(epitopes: list[dict], frequencies: dict[str, float]) -> dict:
    """Projected population coverage from user-supplied allele frequencies.

    Approach after Bui et al. 2006 (BMC Bioinformatics 7:153): per locus, p = summed frequency of the
    alleles that restrict at least one selected epitope; the chance that at least one of the two
    alleles of an individual responds is 1 - (1 - p)^2 (Hardy-Weinberg); loci are combined as
    independent (linkage equilibrium). Verify against the IEDB tool before publishing.
    """
    if not epitopes or len(epitopes) > 60:
        raise ValueError("Provide 1 to 60 epitopes with their restricting alleles")
    if not frequencies or len(frequencies) > 600:
        raise ValueError("Provide allele frequencies (at most 600 alleles)")
    freq = {}
    for allele, f in frequencies.items():
        if not ALLELE_RE.fullmatch(str(allele)):
            raise ValueError(f"Invalid allele name: {str(allele)[:30]}")
        if isinstance(f, bool) or not isinstance(f, (int, float)) or not 0 <= f <= 1:
            raise ValueError("Allele frequencies must be fractions between 0 and 1")
        freq[str(allele).upper()] = float(f)
    sums: dict[str, float] = {}
    for loc in {_locus(a) for a in freq}:
        total = sum(f for a, f in freq.items() if _locus(a) == loc)
        sums[loc] = total
    restricting: set[str] = set()
    per_epitope = []
    for e in epitopes:
        als = [str(a).upper() for a in (e.get("alleles") or [])]
        if not all(ALLELE_RE.fullmatch(a) for a in als):
            raise ValueError("Invalid allele name in the epitope list")
        restricting.update(als)
        per_epitope.append({"peptide": str(e.get("peptide", ""))[:60], "n_alleles": len(als),
                            "frequency_sum": round(sum(freq.get(a, 0.0) for a in als), 4)})
    missing = sorted(a for a in restricting if a not in freq)
    by_locus: dict[str, float] = {}
    for loc in {_locus(a) for a in restricting}:
        by_locus[loc] = min(1.0, sum(freq.get(a, 0.0) for a in restricting if _locus(a) == loc))

    def combine(loci):
        miss = 1.0
        for loc in loci:
            miss *= (1.0 - by_locus[loc]) ** 2
        return 1.0 - miss

    c1 = [l for l in by_locus if l in _CLASS_I_LOCI]
    c2 = [l for l in by_locus if l not in _CLASS_I_LOCI]
    warnings = []
    for loc, tot in sums.items():
        if tot > 1.02:
            warnings.append(f"Frequencies for locus {loc} sum to {tot:.2f} (>1); check the input")
    if missing:
        warnings.append(f"{len(missing)} restricting allele(s) have no frequency and were counted as 0")
    return {
        "coverage_class_i": round(combine(c1), 4) if c1 else None,
        "coverage_class_ii": round(combine(c2), 4) if c2 else None,
        "coverage_combined": round(combine(list(by_locus)), 4) if by_locus else None,
        "locus_fraction": {k: round(v, 4) for k, v in sorted(by_locus.items())},
        "alleles_without_frequency": missing, "epitopes": per_epitope, "warnings": warnings,
        "method": "1 - prod_loci (1 - p_locus)^2, Hardy-Weinberg per locus, loci independent (after Bui et al. 2006)",
        "limits": "Depends entirely on the supplied frequencies, which must come from a cited population dataset "
                  "(for example Allele Frequency Net). Coverage is a projection, not a measured protection rate.",
    }


# ------------------------------------------------------- structure analysis
import math  # noqa: E402

MAX_PDB_CHARS = 3_000_000


def parse_pdb_atoms(text: str, max_atoms: int = 40000) -> list[tuple]:
    """ATOM records only (first alternate location). Tuple: name,resn,chain,resi,icode,x,y,z,b,elem."""
    if not isinstance(text, str) or not text.strip():
        raise ValueError("PDB text is required")
    if len(text) > MAX_PDB_CHARS:
        raise ValueError("PDB text exceeds the size limit")
    atoms = []
    for ln in text.splitlines():
        if not ln.startswith("ATOM"):
            continue
        try:
            alt = ln[16:17]
            if alt not in (" ", "A", ""):
                continue
            b = float(ln[60:66]) if len(ln) >= 66 and ln[60:66].strip() else 0.0
            name = ln[12:16].strip()
            elem = (ln[76:78].strip() if len(ln) >= 78 else "") or name[:1]
            atoms.append((name, ln[17:20].strip(), ln[21:22].strip() or "_", int(ln[22:26]), ln[26:27].strip(),
                          float(ln[30:38]), float(ln[38:46]), float(ln[46:54]), b, elem.upper()))
        except ValueError:
            continue
        if len(atoms) > max_atoms:
            raise ValueError(f"More than {max_atoms} atoms; the workspace limit was exceeded")
    if not atoms:
        raise ValueError("No ATOM records found")
    return atoms


def _sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def dihedral(p0, p1, p2, p3) -> float:
    b0, b1, b2 = _sub(p0, p1), _sub(p2, p1), _sub(p3, p2)
    n = math.sqrt(_dot(b1, b1)) or 1.0
    b1 = (b1[0] / n, b1[1] / n, b1[2] / n)
    v = tuple(b0[i] - _dot(b0, b1) * b1[i] for i in range(3))
    w = tuple(b2[i] - _dot(b2, b1) * b1[i] for i in range(3))
    return math.degrees(math.atan2(_dot(_cross(b1, v), w), _dot(v, w)))


def rama_class(phi: float, psi: float) -> str:
    """Coarse region classes for non-Gly, non-Pro residues (approximate, not MolProbity contours)."""
    beta = -180 <= phi <= -45 and (psi >= 90 or psi <= -165)
    alpha = -160 <= phi <= -30 and -75 <= psi <= -5
    if beta or alpha:
        return "favored"
    broad = (-180 <= phi <= -20 and -180 <= psi <= 180 and not (-20 > psi > -90 and phi > -45)) \
        or (30 <= phi <= 100 and -20 <= psi <= 90)
    return "allowed" if broad else "outlier"


def structure_qc(pdb: str, bfactor_is_plddt: bool = False) -> dict:
    atoms = parse_pdb_atoms(pdb, max_atoms=60000)
    res: dict[tuple, dict] = {}
    order: list[tuple] = []
    for name, resn, ch, resi, ic, x, y, z, b, _el in atoms:
        key = (ch, resi, ic)
        if key not in res:
            res[key] = {"resn": resn, "ch": ch, "resi": resi}
            order.append(key)
        if name in ("N", "CA", "C"):
            res[key][name] = (x, y, z)
            if name == "CA":
                res[key]["b"] = b
    if len(order) > 3000:
        raise ValueError("More than 3000 residues; the workspace limit was exceeded")
    out = {"n_residues": len(order), "chains": sorted({k[0] for k in order})}
    cas = [res[k]["b"] for k in order if "b" in res[k]]
    if bfactor_is_plddt and cas:
        scale = 100.0 if max(cas) <= 1.5 else 1.0
        pl = [round(v * scale, 1) for v in cas]
        n = len(pl)
        out["plddt"] = {"mean": round(sum(pl) / n, 1), "scale_note": "B-factor column read as pLDDT" + (" (0-1 scaled to 0-100)" if scale == 100 else ""),
                        "very_high_gt90": round(100 * sum(v > 90 for v in pl) / n, 1),
                        "confident_70_90": round(100 * sum(70 < v <= 90 for v in pl) / n, 1),
                        "low_50_70": round(100 * sum(50 < v <= 70 for v in pl) / n, 1),
                        "very_low_le50": round(100 * sum(v <= 50 for v in pl) / n, 1), "per_residue": pl[:3000],
                        "scale_factor": scale}
    counts = {"favored": 0, "allowed": 0, "outlier": 0}
    outliers = []
    for i, key in enumerate(order):
        r = res[key]
        if r["resn"] in ("GLY", "PRO") or not all(a in r for a in ("N", "CA", "C")):
            continue
        if i == 0 or i == len(order) - 1:
            continue
        prev, nxt = res[order[i - 1]], res[order[i + 1]]
        if "C" not in prev or "N" not in nxt or prev["ch"] != r["ch"] or nxt["ch"] != r["ch"]:
            continue
        if math.dist(prev["C"], r["N"]) > 2.0 or math.dist(r["C"], nxt["N"]) > 2.0:
            continue
        phi = dihedral(prev["C"], r["N"], r["CA"], r["C"])
        psi = dihedral(r["N"], r["CA"], r["C"], nxt["N"])
        c = rama_class(phi, psi)
        counts[c] += 1
        if c == "outlier" and len(outliers) < 25:
            outliers.append({"residue": f'{r["ch"]}:{r["resn"]}{r["resi"]}', "phi": round(phi, 1), "psi": round(psi, 1)})
    n = sum(counts.values())
    out["ramachandran"] = {
        "evaluated": n, **({"favored_pct": round(100 * counts["favored"] / n, 1), "allowed_pct": round(100 * counts["allowed"] / n, 1),
                            "outlier_pct": round(100 * counts["outlier"] / n, 1)} if n else {}),
        "outliers": outliers, "excluded": "Gly, Pro, termini and chain breaks",
        "note": "Approximate region-based estimate. Use MolProbity or PROCHECK for formal validation.",
    }
    out["limits"] = "pLDDT is the model's own confidence, not experimental accuracy. Predicted multi-epitope constructs are often partly disordered."
    return out


def interface_analysis(pdb: str, chains_a: list[str], chains_b: list[str], cutoff: float = 5.0) -> dict:
    """Geometry-only contacts between two chain groups of a docked complex."""
    a_set = {c.strip() for c in chains_a if c.strip()}
    b_set = {c.strip() for c in chains_b if c.strip()}
    if not a_set or not b_set or a_set & b_set:
        raise ValueError("Give one or more chain IDs for each partner, with no chain in both")
    if not 3.5 <= cutoff <= 8.0:
        raise ValueError("Contact cutoff must be between 3.5 and 8 angstrom")
    atoms = [a for a in parse_pdb_atoms(pdb) if a[9] != "H"]
    found = sorted({a[2] for a in atoms})
    miss = sorted((a_set | b_set) - set(found))
    if miss:
        raise ValueError("Chain(s) not found in the file: " + ", ".join(miss) + ". Chains present: " + ", ".join(found))
    A = [a for a in atoms if a[2] in a_set]
    B = [a for a in atoms if a[2] in b_set]
    cell = cutoff
    grid: dict[tuple, list] = {}
    for at in B:
        grid.setdefault((int(at[5] // cell), int(at[6] // cell), int(at[7] // cell)), []).append(at)
    rl = lambda a: f"{a[2]}:{a[1]}{a[3]}{a[4]}"  # noqa: E731
    pairs, ra, rb, polar, salt = set(), set(), set(), {}, {}
    acid = {("ASP", "OD1"), ("ASP", "OD2"), ("GLU", "OE1"), ("GLU", "OE2")}
    base = {("LYS", "NZ"), ("ARG", "NH1"), ("ARG", "NH2"), ("ARG", "NE")}
    for a in A:
        cx, cy, cz = int(a[5] // cell), int(a[6] // cell), int(a[7] // cell)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    for b in grid.get((cx + dx, cy + dy, cz + dz), ()):
                        d = math.dist(a[5:8], b[5:8])
                        if d > cutoff:
                            continue
                        pairs.add((rl(a), rl(b)))
                        ra.add(rl(a)), rb.add(rl(b))
                        if a[9] in ("N", "O") and b[9] in ("N", "O") and d <= 3.5:
                            k = (rl(a), a[0], rl(b), b[0])
                            polar[k] = min(d, polar.get(k, 9))
                        if d <= 4.0 and (((a[1], a[0]) in acid and (b[1], b[0]) in base) or ((a[1], a[0]) in base and (b[1], b[0]) in acid)):
                            salt[(rl(a), rl(b))] = min(d, salt.get((rl(a), rl(b)), 9))
    srt = lambda s: sorted(s, key=lambda x: (x.split(":")[0], int("".join(ch for ch in x.split(":")[1] if ch.isdigit()) or 0)))  # noqa: E731
    return {
        "chains_present": found, "cutoff_angstrom": cutoff,
        "residue_pairs_in_contact": len(pairs), "interface_residues_a": srt(ra), "interface_residues_b": srt(rb),
        "n_interface_a": len(ra), "n_interface_b": len(rb),
        "polar_contacts": [{"a": k[0] + " " + k[1], "b": k[2] + " " + k[3], "distance": round(v, 2)} for k, v in sorted(polar.items(), key=lambda kv: kv[1])[:60]],
        "n_polar_contacts": len(polar),
        "salt_bridge_candidates": [{"a": k[0], "b": k[1], "distance": round(v, 2)} for k, v in sorted(salt.items(), key=lambda kv: kv[1])[:40]],
        "method": f"Heavy-atom distance cutoff {cutoff} A between the two chain groups; N/O pairs within 3.5 A listed as polar-contact candidates; "
                  "acidic/basic side-chain atoms within 4.0 A listed as salt-bridge candidates.",
        "limits": "Geometry only: no binding energy, no hydrogen-bond angles, no solvent accessibility. Do not compare docking scores across different servers.",
    }


# ------------------------------------------ codon optimization & cloning design
import random  # noqa: E402
from itertools import product  # noqa: E402

_AA_STR = "FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG"
CODON_TO_AA = {a + b + c: _AA_STR[i] for i, (a, b, c) in enumerate(product("TCAG", repeat=3))}
SENSE_CODONS = [c for c, a in CODON_TO_AA.items() if a != "*"]

# Escherichia coli codon usage, frequency per thousand codons, as listed in GenScript's codon
# frequency table (counts derived from GenBank CDS). Source: https://www.genscript.com/tools/codon-frequency-table
ECOLI_FREQ = {
    "TTT": 22.1, "TTC": 16.0, "TTA": 14.3, "TTG": 13.0, "TCT": 10.4, "TCC": 9.1, "TCA": 8.9, "TCG": 8.5,
    "TAT": 17.5, "TAC": 12.2, "TAA": 2.0, "TAG": 0.3, "TGT": 5.2, "TGC": 6.1, "TGA": 1.0, "TGG": 13.9,
    "CTT": 11.9, "CTC": 10.2, "CTA": 4.2, "CTG": 48.4, "CCT": 7.5, "CCC": 5.4, "CCA": 8.6, "CCG": 20.9,
    "CAT": 12.5, "CAC": 9.3, "CAA": 14.6, "CAG": 28.4, "CGT": 20.0, "CGC": 19.7, "CGA": 3.8, "CGG": 5.9,
    "ATT": 29.8, "ATC": 23.7, "ATA": 6.8, "ATG": 26.4, "ACT": 10.3, "ACC": 22.0, "ACA": 9.3, "ACG": 13.7,
    "AAT": 20.6, "AAC": 21.4, "AAA": 35.3, "AAG": 12.4, "AGT": 9.9, "AGC": 15.2, "AGA": 3.6, "AGG": 2.1,
    "GTT": 19.8, "GTC": 14.3, "GTA": 11.6, "GTG": 24.4, "GCT": 17.1, "GCC": 24.2, "GCA": 21.2, "GCG": 30.1,
    "GAT": 32.7, "GAC": 19.2, "GAA": 39.1, "GAG": 18.7, "GGT": 25.5, "GGC": 27.1, "GGA": 9.5, "GGG": 11.3,
}
ENZYMES = {"NdeI": "CATATG", "NcoI": "CCATGG", "BamHI": "GGATCC", "EcoRI": "GAATTC", "HindIII": "AAGCTT",
           "XhoI": "CTCGAG", "NotI": "GCGGCCGC", "XbaI": "TCTAGA", "SalI": "GTCGAC", "KpnI": "GGTACC",
           "SacI": "GAGCTC", "NheI": "GCTAGC", "BglII": "AGATCT", "PstI": "CTGCAG", "SpeI": "ACTAGT"}
_COMP = str.maketrans("ACGT", "TGCA")
DNA_RE = re.compile(r"^[ACGT]+$")


def revcomp(seq: str) -> str:
    return seq.translate(_COMP)[::-1]


def translate_dna(cds: str) -> str:
    return "".join(CODON_TO_AA[cds[i:i + 3]] for i in range(0, len(cds) - len(cds) % 3, 3))


def parse_codon_table(text: str) -> dict[str, float]:
    """Custom host table: one 'CODON frequency' per line (DNA or RNA letters). All 61 sense codons required."""
    table: dict[str, float] = {}
    for ln in (text or "").splitlines():
        parts = re.split(r"[\s,;]+", ln.strip())
        if len(parts) < 2:
            continue
        codon = parts[0].upper().replace("U", "T")
        if codon not in CODON_TO_AA:
            continue
        try:
            val = float(parts[1])
        except ValueError:
            continue
        if val < 0:
            raise ValueError("Codon frequencies cannot be negative")
        table[codon] = val
    missing = [c for c in SENSE_CODONS if c not in table]
    if missing:
        raise ValueError(f"Custom codon table is missing {len(missing)} sense codons, e.g. {', '.join(missing[:5])}")
    for aa in set(CODON_TO_AA.values()) - {"*"}:
        if sum(v for c, v in table.items() if CODON_TO_AA[c] == aa) <= 0:
            raise ValueError(f"No usable codon for amino acid {aa}")
    return table


def _usage(table: dict[str, float]) -> dict[str, list[tuple[str, float]]]:
    by: dict[str, list[tuple[str, float]]] = {}
    for c, f in table.items():
        if CODON_TO_AA.get(c, "*") != "*":
            by.setdefault(CODON_TO_AA[c], []).append((c, f))
    for aa in by:
        by[aa].sort(key=lambda x: -x[1])
    return by


def cai(cds: str, table: dict[str, float]) -> Optional[float]:
    """Codon Adaptation Index (Sharp & Li 1987) against the supplied table; Met/Trp and stops excluded."""
    use = _usage(table)
    w = {c: (f / use[aa][0][1]) if use[aa][0][1] > 0 else 0.0 for aa, lst in use.items() for c, f in lst}
    logs = []
    for i in range(0, len(cds) - 2, 3):
        c = cds[i:i + 3]
        aa = CODON_TO_AA.get(c)
        if aa in (None, "*", "M", "W"):
            continue
        logs.append(math.log(max(w.get(c, 0.0), 1e-3)))
    return round(math.exp(sum(logs) / len(logs)), 3) if logs else None


def _site_patterns(enzymes: list[str]) -> dict[str, str]:
    pats = {}
    for name in enzymes:
        if name not in ENZYMES:
            raise ValueError("Unknown enzyme: " + str(name)[:20])
        site = ENZYMES[name]
        pats[name] = site
        if revcomp(site) != site:
            pats[name + "(rc)"] = revcomp(site)
    return pats


def _problems(seq: str, pats: dict[str, str], run_len: int) -> list[tuple[int, int, str]]:
    out = []
    for name, p in pats.items():
        i = seq.find(p)
        while i != -1:
            out.append((i, i + len(p), name))
            i = seq.find(p, i + 1)
    if run_len:
        for m in re.finditer(r"(A{%d,}|C{%d,}|G{%d,}|T{%d,})" % ((run_len,) * 4), seq):
            out.append((m.start(), m.end(), "run"))
    return sorted(out)


def _penalty(seq: str, pats: dict[str, str], run_len: int) -> int:
    """Sites cost 1000 each; a run of identical bases costs its length, so splitting a long run counts as progress."""
    return sum(1000 if lab != "run" else (b - a) for a, b, lab in _problems(seq, pats, run_len))


def optimize_codons(protein: str, strategy: str = "weighted", seed: int = 1, avoid: Optional[list[str]] = None,
                    custom_table: str = "", add_start: bool = True, stop: str = "TAA", run_len: int = 8) -> dict:
    prot = clean_seq(protein, max_len=3000, min_len=5)
    if strategy not in ("weighted", "most_frequent"):
        raise ValueError("Strategy must be weighted or most_frequent")
    if stop not in ("TAA", "TGA", "TAG", ""):
        raise ValueError("Invalid stop codon")
    if not isinstance(seed, int) or isinstance(seed, bool) or not 1 <= seed <= 2_147_483_647:
        raise ValueError("Invalid seed")
    avoid = list(avoid or [])
    if len(avoid) > 15:
        raise ValueError("Too many enzymes to avoid")
    table = parse_codon_table(custom_table) if custom_table and custom_table.strip() else dict(ECOLI_FREQ)
    host = "custom table" if custom_table and custom_table.strip() else "Escherichia coli"
    if add_start and not prot.startswith("M"):
        prot = "M" + prot
    use = _usage(table)
    rng = random.Random(seed)
    codons = []
    for aa in prot:
        lst = use[aa]
        if strategy == "most_frequent" or len(lst) == 1:
            codons.append(lst[0][0])
        else:
            top = lst[0][1]
            pool = [(c, f) for c, f in lst if f >= 0.2 * top and f > 0] or lst[:1]
            codons.append(rng.choices([c for c, _ in pool], weights=[f for _, f in pool])[0])
    pats = _site_patterns(avoid)

    def full(cs):
        return "".join(cs) + stop

    skip: set = set()
    seq = full(codons)
    for _ in range(1500):
        probs = _problems(seq, pats, run_len)
        todo = [p for p in probs if p not in skip]
        if not todo:
            break
        a, b, label = todo[0]
        best = None
        cur = _penalty(seq, pats, run_len)
        for ci in range(a // 3, min(len(codons) - 1, (b - 1) // 3) + 1):
            for alt, f in use[prot[ci]]:
                if alt == codons[ci]:
                    continue
                trial = codons[:ci] + [alt] + codons[ci + 1:]
                n = _penalty(full(trial), pats, run_len)
                key = (n, -f)
                if n < cur and (best is None or key < best[0]):
                    best = (key, ci, alt)
        if best:
            codons[best[1]] = best[2]
            seq = full(codons)
        else:
            skip.add((a, b, label))
    cds = seq
    body = cds[:-3] if stop else cds
    if translate_dna(body) != prot:
        raise RuntimeError("Internal error: back-translation does not reproduce the protein")
    remaining = _problems(cds, pats, run_len)
    gc = lambda x: 100.0 * sum(ch in "GC" for ch in x) / max(1, len(x))  # noqa: E731
    wins = [gc(cds[i:i + 50]) for i in range(0, max(1, len(cds) - 49), 10)]
    fmax = {aa: lst[0][1] for aa, lst in use.items()}
    rare = sum(1 for c in codons if table[c] < 0.2 * fmax[CODON_TO_AA[c]] and CODON_TO_AA[c] not in "MW")
    return {
        "cds": cds, "protein_used": prot, "length_nt": len(cds), "host_table": host, "strategy": strategy, "seed": seed,
        "gc_percent": round(gc(cds), 1), "gc_window50_min": round(min(wins), 1), "gc_window50_max": round(max(wins), 1),
        "cai": cai(cds, table), "rare_codon_count": rare,
        "avoided_enzymes": avoid, "unresolved": [{"start": a + 1, "end": b, "type": lab} for a, b, lab in remaining],
        "translation_verified": True,
        "method": ("Most frequent codon per amino acid." if strategy == "most_frequent" else
                   "Frequency-weighted sampling among codons with at least 20% of the best codon's usage (fixed seed).")
                  + " Restriction sites and runs of identical bases are repaired by synonymous swaps. CAI per Sharp & Li (1987).",
        "limits": "Codon usage is one of many factors; mRNA structure, GC content, tRNA supply and the protein itself also "
                  "decide expression and solubility. Validate by experiment.",
    }


def build_insert(cds: str, enzyme5: str, enzyme3: str, clamp5: str = "GCGCGC", clamp3: str = "GCGCGC",
                 spacer5: str = "", spacer3: str = "") -> dict:
    cds = (cds or "").upper().replace(" ", "")
    if not DNA_RE.fullmatch(cds) or len(cds) % 3 or len(cds) > 9300:
        raise ValueError("CDS must be A/C/G/T, a multiple of 3, up to 9300 nt")
    if enzyme5 not in ENZYMES or enzyme3 not in ENZYMES:
        raise ValueError("Choose 5' and 3' enzymes from the list")
    if enzyme5 == enzyme3:
        raise ValueError("Use two different enzymes for directional cloning")
    clean = []
    for name, val in (("5' clamp", clamp5), ("3' clamp", clamp3), ("5' spacer", spacer5), ("3' spacer", spacer3)):
        val = (val or "").upper()
        if len(val) > 12 or (val and not DNA_RE.fullmatch(val)):
            raise ValueError(f"{name} must be up to 12 A/C/G/T bases")
        clean.append(val)
    c5, c3, sp5, sp3 = clean
    s5, s3 = ENZYMES[enzyme5], ENZYMES[enzyme3]
    inside = [n for n in (enzyme5, enzyme3) if ENZYMES[n] in cds or revcomp(ENZYMES[n]) in cds]
    ndei = enzyme5 == "NdeI"
    if ndei:
        if not cds.startswith("ATG") or sp5:
            raise ValueError("With NdeI the start ATG is part of the site: the CDS must begin with ATG and no 5' spacer is used")
        # CATATG overlaps the CDS: only the 'CAT' is added; inside-check ignores the overlap by design.
        inside = [n for n in inside if not (n == "NdeI" and cds.count("CATATG") == 0)]
    if inside:
        raise ValueError("Enzyme site found inside the gene: " + ", ".join(inside) + ". Re-run optimization avoiding it, or choose another enzyme.")
    five = c5 + ("CAT" if ndei else s5 + sp5)
    insert = five + cds + sp3 + s3 + c3
    feats = [{"name": "5' clamp", "start": 1, "end": len(c5)}] if c5 else []
    pos = len(c5)
    feats.append({"name": enzyme5 + " site" + (" (ATG shared with CDS)" if ndei else ""), "start": pos + 1, "end": pos + len(s5) if not ndei else pos + 6})
    cds_start = len(five) + 1 if not ndei else len(c5) + 4
    feats.append({"name": "CDS", "start": cds_start, "end": cds_start + len(cds) - 1})
    pos = len(five) + len(cds)
    if sp3:
        feats.append({"name": "3' spacer", "start": pos + 1, "end": pos + len(sp3)})
    feats.append({"name": enzyme3 + " site", "start": pos + len(sp3) + 1, "end": pos + len(sp3) + len(s3)})
    if c3:
        feats.append({"name": "3' clamp", "start": len(insert) - len(c3) + 1, "end": len(insert)})
    expected = {enzyme5: 1, enzyme3: 1}
    counts = {n: insert.count(ENZYMES[n]) for n in expected}
    ok = all(counts[n] == expected[n] for n in expected)
    return {
        "insert": insert, "length_nt": len(insert), "features": feats, "site_counts": counts, "sites_ok": ok,
        "warnings": ([] if ok else ["A site occurs a different number of times than expected in the final insert"]),
        "frame_note": f"The CDS starts at nucleotide {cds_start} of the insert. The reading frame with the vector, any vector tag and the vector's own "
                      "start/stop codons must be checked against the vector map before ordering.",
        "limits": "In-silico design only. It does not model digestion efficiency, vector sequence, methylation sensitivity or expression.",
    }

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

    class CoverageReq(BaseModel):
        epitopes: list[dict]
        frequencies: dict[str, float]

    class PdbReq(BaseModel):
        pdb: str = Field(min_length=50, max_length=3_000_000)
        bfactor_is_plddt: bool = False

    class InterfaceReq(BaseModel):
        pdb: str = Field(min_length=50, max_length=3_000_000)
        chains_a: list[str]
        chains_b: list[str]
        cutoff: float = 5.0

    class CodonReq(BaseModel):
        protein: str = Field(min_length=5, max_length=60000)
        strategy: str = Field("weighted", max_length=20)
        seed: int = 1
        avoid_enzymes: list[str] = Field(default_factory=list)
        custom_table: str = Field("", max_length=8000)
        add_start: bool = True
        stop: str = Field("TAA", max_length=3)

    class CloneReq(BaseModel):
        cds: str = Field(min_length=9, max_length=12000)
        enzyme5: str = Field(max_length=12)
        enzyme3: str = Field(max_length=12)
        clamp5: str = Field("GCGCGC", max_length=12)
        clamp3: str = Field("GCGCGC", max_length=12)
        spacer5: str = Field("", max_length=12)
        spacer3: str = Field("", max_length=12)

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

    @router.post("/vaccine/coverage")
    async def vaccine_coverage(req: CoverageReq, user=Depends(get_current_user)):
        return await guarded(coverage_from_frequencies, "local", "coverage", req.epitopes, req.frequencies)

    @router.post("/vaccine/structure-qc")
    async def vaccine_structure_qc(req: PdbReq, user=Depends(get_current_user)):
        return await guarded(structure_qc, "local", "structure_qc", req.pdb, req.bfactor_is_plddt)

    @router.post("/vaccine/interface")
    async def vaccine_interface(req: InterfaceReq, user=Depends(get_current_user)):
        if len(req.chains_a) > 8 or len(req.chains_b) > 8:
            raise HTTPException(422, "At most 8 chain IDs per partner")
        return await guarded(interface_analysis, "local", "interface", req.pdb, req.chains_a, req.chains_b, req.cutoff)

    @router.post("/vaccine/codon")
    async def vaccine_codon(req: CodonReq, user=Depends(get_current_user)):
        return await guarded(optimize_codons, "local", "codon", req.protein, req.strategy, req.seed,
                             req.avoid_enzymes, req.custom_table, req.add_start, req.stop)

    @router.post("/vaccine/clone")
    async def vaccine_clone(req: CloneReq, user=Depends(get_current_user)):
        return await guarded(build_insert, "local", "clone", req.cds, req.enzyme5, req.enzyme3,
                             req.clamp5, req.clamp3, req.spacer5, req.spacer3)

    @router.get("/vaccine/enzymes")
    async def vaccine_enzymes(user=Depends(get_current_user)):
        return {"enzymes": ENZYMES, "host_tables": ["Escherichia coli (built in)", "custom table (paste codon frequencies)"]}
