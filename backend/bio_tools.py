"""Bioinformatics toolbox (research and teaching use only).

Computed locally: sequence analysis (ORFs, 6-frame translation, restriction map), approximate
multiple alignment + conservation for closely related sequences, exact/near-exact epitope conservancy,
qPCR standard curves and geNorm reference-gene stability.
Forwarded to public services (never invented locally): g:Profiler enrichment, STRING network, NCBI GEO
search, Ensembl VEP and Ensembl variation overlap.

Nothing here is a clinical, diagnostic or treatment recommendation.
"""
from typing import Optional
import logging
import math
import re
import statistics
from datetime import datetime, timezone
from urllib.parse import quote

import requests

from pharma_vaccine import CODON_TO_AA, revcomp, translate_dna

log = logging.getLogger("primerai.bio")
UA = {"User-Agent": "Primer-AI bioinformatics toolbox (info@bioaiflow.ir)"}
AA20 = set("ACDEFGHIKLMNPQRSTVWY")
MAX_DNA = 200_000


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ------------------------------------------------------------------ parsing
def parse_fasta(text: str, *, alphabet: set[str], max_seqs: int, max_len: int, min_len: int = 1) -> list[tuple[str, str]]:
    if not isinstance(text, str) or not text.strip():
        raise ValueError("Sequences are required")
    records, name, buf = [], None, []

    def flush():
        if name is not None or buf:
            seq = re.sub(r"[\s\d*\-]", "", "".join(buf)).upper()
            records.append((name or f"seq{len(records) + 1}", seq))

    for ln in text.splitlines():
        if ln.startswith(">"):
            flush()
            name, buf = ln[1:].strip()[:60] or f"seq{len(records) + 1}", []
        else:
            buf.append(ln)
    flush()
    records = [r for r in records if r[1]]
    if not records or len(records) > max_seqs:
        raise ValueError(f"Provide 1 to {max_seqs} sequences")
    for n, s in records:
        bad = sorted(set(s) - alphabet)
        if bad:
            raise ValueError(f"{n}: unsupported characters {', '.join(bad[:6])}")
        if not min_len <= len(s) <= max_len:
            raise ValueError(f"{n}: length must be {min_len} to {max_len}")
    return records


def clean_dna(text: str, min_len: int = 10) -> str:
    recs = parse_fasta((text or "").replace("U", "T").replace("u", "t"), alphabet=set("ACGT"), max_seqs=1, max_len=MAX_DNA, min_len=min_len)
    return recs[0][1]


# ------------------------------------------------------- 1. sequence toolbox
# name: (recognition site, cut offset on the top strand after which the cut is made)
RESTRICTION = {
    "AgeI": ("ACCGGT", 1), "ApaI": ("GGGCCC", 5), "AscI": ("GGCGCGCC", 2), "BamHI": ("GGATCC", 1), "BclI": ("TGATCA", 1),
    "BglII": ("AGATCT", 1), "BspEI": ("TCCGGA", 1), "BsrGI": ("TGTACA", 1), "ClaI": ("ATCGAT", 2), "EcoRI": ("GAATTC", 1),
    "EcoRV": ("GATATC", 3), "FseI": ("GGCCGGCC", 6), "HindIII": ("AAGCTT", 1), "HpaI": ("GTTAAC", 3), "KpnI": ("GGTACC", 5),
    "MluI": ("ACGCGT", 1), "NcoI": ("CCATGG", 1), "NdeI": ("CATATG", 2), "NheI": ("GCTAGC", 1), "NotI": ("GCGGCCGC", 2),
    "NruI": ("TCGCGA", 3), "PacI": ("TTAATTAA", 5), "PstI": ("CTGCAG", 5), "PvuI": ("CGATCG", 4), "PvuII": ("CAGCTG", 3),
    "SacI": ("GAGCTC", 5), "SalI": ("GTCGAC", 1), "SbfI": ("CCTGCAGG", 6), "ScaI": ("AGTACT", 3), "SmaI": ("CCCGGG", 3),
    "SphI": ("GCATGC", 5), "SpeI": ("ACTAGT", 1), "StuI": ("AGGCCT", 3), "XbaI": ("TCTAGA", 1), "XhoI": ("CTCGAG", 1),
}


def find_orfs(seq: str, min_aa: int) -> list[dict]:
    """ATG-to-stop ORFs in all six frames (a stop codon is required). Coordinates are 1-based on the input strand."""
    n, found = len(seq), []
    for strand, s in (("+", seq), ("-", revcomp(seq))):
        for frame in range(3):
            start = None
            for i in range(frame, n - 2, 3):
                cod = s[i:i + 3]
                if start is None and cod == "ATG":
                    start = i
                elif start is not None and CODON_TO_AA[cod] == "*":
                    aa = (i - start) // 3
                    if aa >= min_aa:
                        a, b = (start + 1, i + 3) if strand == "+" else (n - (i + 3) + 1, n - start)
                        found.append({"strand": strand, "frame": frame + 1, "start": a, "end": b, "length_aa": aa,
                                      "protein": translate_dna(s[start:i])})
                    start = None
    found.sort(key=lambda o: -o["length_aa"])
    return found


def analyze_sequence(text: str, min_orf_aa: int = 50, digest: Optional[list[str]] = None) -> dict:
    seq = clean_dna(text)
    if not 10 <= min_orf_aa <= 2000:
        raise ValueError("Minimum ORF length must be between 10 and 2000 amino acids")
    n = len(seq)
    comp = {b: seq.count(b) for b in "ACGT"}
    gc = 100.0 * (comp["G"] + comp["C"]) / n
    tm = 2 * (comp["A"] + comp["T"]) + 4 * (comp["G"] + comp["C"]) if n < 14 else 64.9 + 41 * ((comp["G"] + comp["C"]) - 16.4) / n
    sites: dict[str, dict] = {}
    cuts_all: dict[str, list[int]] = {}
    for name, (site, off) in RESTRICTION.items():
        pos = [m.start() for m in re.finditer(f"(?={site})", seq)]
        cuts_all[name] = [p + off for p in pos]
        sites[name] = {"site": site, "count": len(pos), "positions": [p + 1 for p in pos[:30]], "cut_after": [p + off for p in pos[:30]]}
    digest = digest or []
    if len(digest) > 6 or any(d not in RESTRICTION for d in digest):
        raise ValueError("Choose up to 6 known enzymes for the digest")
    fragments = None
    if digest:
        cuts = sorted({c for d in digest for c in cuts_all[d] if 0 < c < n})
        edges = [0] + cuts + [n]
        fragments = [edges[i + 1] - edges[i] for i in range(len(edges) - 1)]
    out = {
        "length": n, "composition": comp, "gc_percent": round(gc, 2), "basic_tm_c": round(tm, 1),
        "tm_note": "Basic length/GC estimate. Use the Toolbox Tm calculator for nearest-neighbor Tm.",
        "reverse_complement": revcomp(seq) if n <= 5000 else None,
        "orfs": find_orfs(seq, min_orf_aa)[:40],
        "orf_note": "ATG-to-stop ORFs in six frames; ORFs without a stop codon are not reported.",
        "restriction": {"unique_cutters": sorted(k for k, v in sites.items() if v["count"] == 1),
                        "non_cutters": sorted(k for k, v in sites.items() if v["count"] == 0), "sites": {k: v for k, v in sites.items() if v["count"]}},
        "digest": {"enzymes": digest, "fragments_bp": fragments, "assumes": "linear DNA, complete digestion, no methylation effects"} if digest else None,
    }
    if n <= 30000:
        out["frames"] = {f"{st}{fr + 1}": translate_dna((seq if st == "+" else revcomp(seq))[fr:]) for st in "+-" for fr in range(3)}
    return out


# ------------------------------------------- 2. alignment + conservation (local)
def nw_align(a: str, b: str, match: int = 2, mismatch: int = -1, gap: int = -2) -> tuple[str, str]:
    n, m = len(a), len(b)
    prev = [j * gap for j in range(m + 1)]
    trace = [bytearray(m + 1) for _ in range(n + 1)]  # 0 diag, 1 up, 2 left
    for j in range(1, m + 1):
        trace[0][j] = 2
    for i in range(1, n + 1):
        cur = [i * gap] + [0] * m
        trace[i][0] = 1
        ai = a[i - 1]
        row = trace[i]
        for j in range(1, m + 1):
            d = prev[j - 1] + (match if ai == b[j - 1] else mismatch)
            u = prev[j] + gap
            l = cur[j - 1] + gap
            if d >= u and d >= l:
                cur[j], row[j] = d, 0
            elif u >= l:
                cur[j], row[j] = u, 1
            else:
                cur[j], row[j] = l, 2
        prev = cur
    i, j, ra, rb = n, m, [], []
    while i > 0 or j > 0:
        t = trace[i][j]
        if i > 0 and j > 0 and t == 0:
            ra.append(a[i - 1]); rb.append(b[j - 1]); i -= 1; j -= 1
        elif i > 0 and (t == 1 or j == 0):
            ra.append(a[i - 1]); rb.append("-"); i -= 1
        else:
            ra.append("-"); rb.append(b[j - 1]); j -= 1
    return "".join(reversed(ra)), "".join(reversed(rb))


def _kmers(s: str, k: int = 3) -> set[str]:
    return {s[i:i + k] for i in range(len(s) - k + 1)}


def center_star_msa(seqs: list[str]) -> list[str]:
    """Approximate MSA for closely related sequences (center-star). Not a substitute for Clustal Omega / MAFFT."""
    if len(seqs) == 1:
        return seqs[:]
    km = [_kmers(s) for s in seqs]
    score = [sum(len(km[i] & km[j]) / max(1, len(km[i] | km[j])) for j in range(len(seqs)) if j != i) for i in range(len(seqs))]
    c = max(range(len(seqs)), key=lambda i: (score[i], len(seqs[i])))
    center = seqs[c]
    L = len(center)
    ins: dict[int, list[list[str]]] = {}
    mat: dict[int, list[str]] = {}
    for k, s in enumerate(seqs):
        if k == c:
            continue
        ca, sa = nw_align(center, s)
        ins_k, mat_k, pending, ci = [[] for _ in range(L + 1)], ["-"] * L, [], 0
        for x, y in zip(ca, sa):
            if x == "-":
                ins_k[ci].append(y)
            else:
                mat_k[ci] = y
                ci += 1
        ins[k], mat[k] = ins_k, mat_k
    maxins = [max([len(ins[k][i]) for k in ins] + [0]) for i in range(L + 1)]
    rows = []
    for k, s in enumerate(seqs):
        out = []
        for i in range(L + 1):
            if k == c:
                out.append("-" * maxins[i])
                if i < L:
                    out.append(center[i])
            else:
                block = "".join(ins[k][i])
                out.append(block + "-" * (maxins[i] - len(block)))
                if i < L:
                    out.append(mat[k][i])
        rows.append("".join(out))
    return rows


def conservation(rows: list[str], min_window: int = 9) -> dict:
    n, L = len(rows), len(rows[0])
    ident, consensus = [], []
    for j in range(L):
        col = [r[j] for r in rows]
        res = [x for x in col if x != "-"]
        top = max(set(res), key=res.count) if res else "-"
        ident.append(round(col.count(top) / n, 3) if res else 0.0)
        consensus.append(top)
    windows, start = [], None
    for j in range(L + 1):
        full = j < L and ident[j] == 1.0 and consensus[j] != "-"
        if full and start is None:
            start = j
        if not full and start is not None:
            if j - start >= min_window:
                windows.append({"alignment_start": start + 1, "alignment_end": j, "length": j - start, "peptide": "".join(consensus[start:j])})
            start = None
    windows.sort(key=lambda w: -w["length"])
    return {"alignment_length": L, "mean_identity": round(sum(ident) / L, 3), "fully_conserved_columns": sum(1 for v in ident if v == 1.0),
            "identity_per_column": ident[:6000], "consensus": "".join(consensus)[:6000], "conserved_windows": windows[:30]}


def align_and_conserve(fasta: str, mode: str = "protein") -> dict:
    if mode not in ("protein", "dna"):
        raise ValueError("Mode must be protein or dna")
    alpha = AA20 if mode == "protein" else set("ACGT")
    recs = parse_fasta(fasta, alphabet=alpha, max_seqs=8, max_len=1500 if mode == "protein" else 3000, min_len=5)
    if len(recs) < 2:
        raise ValueError("Provide at least two sequences")
    rows = center_star_msa([s for _, s in recs])
    out = conservation(rows)
    out.update({"names": [n for n, _ in recs], "alignment": rows if len(rows[0]) <= 4000 else None, "mode": mode,
                "method": "Center-star progressive alignment with Needleman-Wunsch (match +2, mismatch -1, gap -2). "
                          "Suitable for closely related sequences such as strains; use Clustal Omega or MAFFT for distant homologs.",
                "limits": "Identity counts gaps as non-matching. Conservation is a sequence property, not evidence of immunogenicity."})
    return out


def epitope_conservancy(epitopes: list[str], fasta: str, mode: str = "protein") -> dict:
    alpha = AA20 if mode == "protein" else set("ACGT")
    recs = parse_fasta(fasta, alphabet=alpha, max_seqs=200, max_len=6000, min_len=5)
    eps = []
    for e in epitopes[:40]:
        e = re.sub(r"\s", "", e or "").upper()
        if not 5 <= len(e) <= 40 or set(e) - alpha:
            raise ValueError("Each epitope must be 5 to 40 valid residues")
        eps.append(e)
    if not eps:
        raise ValueError("Provide at least one epitope")
    res = []
    for e in eps:
        exact = near = 0
        for _, s in recs:
            best = len(e)
            if e in s:
                best = 0
            else:
                for i in range(len(s) - len(e) + 1):
                    d = sum(1 for x, y in zip(e, s[i:i + len(e)]) if x != y)
                    if d < best:
                        best = d
                        if best <= 1:
                            break
            exact += best == 0
            near += best <= 1
        k = len(recs)
        res.append({"epitope": e, "n_sequences": k, "exact_count": exact, "exact_percent": round(100 * exact / k, 1),
                    "within_1_mismatch_count": near, "within_1_mismatch_percent": round(100 * near / k, 1)})
    return {"results": res, "method": "Exact substring match, and best ungapped window with at most one mismatch, in each unaligned sequence.",
            "limits": "Conservancy across the sequences you supplied only. It does not imply broad protection."}


# ------------------------------------------------------------- 5. qPCR tools
def standard_curve(points: list[dict]) -> dict:
    xs, ys, rows = [], [], []
    for p in points:
        q, ct = p.get("quantity"), p.get("ct")
        cts = ct if isinstance(ct, list) else [ct]
        if isinstance(q, bool) or not isinstance(q, (int, float)) or q <= 0 or not cts or len(cts) > 6:
            raise ValueError("Each point needs a positive quantity and 1 to 6 Ct values")
        vals = []
        for c in cts:
            if isinstance(c, bool) or not isinstance(c, (int, float)) or not 0 < c < 60:
                raise ValueError("Ct values must be numbers between 0 and 60")
            vals.append(float(c))
        m = statistics.fmean(vals)
        rows.append({"quantity": q, "mean_ct": round(m, 3), "sd_ct": round(statistics.stdev(vals), 3) if len(vals) > 1 else None, "n": len(vals)})
        xs.append(math.log10(q)); ys.append(m)
    if len(set(xs)) < 3:
        raise ValueError("Use at least 3 different quantities (5 or more is recommended)")
    n, mx, my = len(xs), statistics.fmean(xs), statistics.fmean(ys)
    sxx = sum((x - mx) ** 2 for x in xs)
    slope = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sxx
    inter = my - slope * mx
    ss_tot = sum((y - my) ** 2 for y in ys)
    ss_res = sum((y - (slope * x + inter)) ** 2 for x, y in zip(xs, ys))
    r2 = 1 - ss_res / ss_tot if ss_tot else 1.0
    if slope >= 0:
        raise ValueError("The slope must be negative (Ct falls as quantity rises); check the input order")
    eff = 10 ** (-1 / slope) - 1
    return {"points": rows, "slope": round(slope, 4), "intercept": round(inter, 4), "r_squared": round(r2, 4),
            "efficiency_percent": round(100 * eff, 1), "range_log10": [round(min(xs), 2), round(max(xs), 2)],
            "flags": ([] if 0.90 <= eff <= 1.10 else ["Efficiency is outside the commonly used 90-110% range"]) + ([] if r2 >= 0.98 else ["R squared is below 0.98"])
                     + (["Fewer than 5 dilution points"] if len(set(xs)) < 5 else []),
            "limits": "Acceptance ranges are common conventions, not universal rules. Report your own criteria (MIQE). Efficiency above 100% often signals inhibition or pipetting error."}


def genorm(genes: dict[str, list[float]]) -> dict:
    """geNorm M and pairwise variation (Vandesompele et al. 2002), assuming equal amplification efficiency of 2."""
    names = list(genes)
    if not 3 <= len(names) <= 12:
        raise ValueError("Provide 3 to 12 candidate genes")
    ns = {len(v) for v in genes.values()}
    if len(ns) != 1 or next(iter(ns)) < 3:
        raise ValueError("Every gene needs the same number of samples (at least 3)")
    for g, v in genes.items():
        if any(isinstance(c, bool) or not isinstance(c, (int, float)) or not 0 < c < 60 for c in v):
            raise ValueError(f"Invalid Ct value in {g}")
    ns = next(iter(ns))

    def m_values(active):
        out = {}
        for j in active:
            sds = [statistics.pstdev([genes[j][s] - genes[k][s] for s in range(ns)]) if ns > 1 else 0.0 for k in active if k != j]
            out[j] = statistics.fmean(sds)
        return out

    active, removed, steps = names[:], [], []
    while len(active) > 2:
        m = m_values(active)
        worst = max(active, key=lambda g: m[g])
        steps.append({"n_genes": len(active), "m_values": {g: round(v, 4) for g, v in m.items()}, "removed": worst})
        removed.append(worst)
        active.remove(worst)
    last = m_values(active)
    ranking = [{"gene": g, "rank_note": "most stable pair"} for g in active] + [{"gene": g} for g in reversed(removed)]
    order = active + list(reversed(removed))  # most stable first
    for i, r in enumerate(ranking):
        r["order"] = i + 1
    final_m = {g: round(v, 4) for g, v in last.items()}
    # pairwise variation V(n/n+1) from geometric-mean normalisation factors (log2 scale, E = 2)
    pv = []
    for k in range(2, len(order)):
        d = [statistics.fmean([genes[g][s] for g in order[:k + 1]]) - statistics.fmean([genes[g][s] for g in order[:k]]) for s in range(ns)]
        pv.append({"comparison": f"V{k}/{k + 1}", "value": round(statistics.pstdev(d), 4), "below_0_15": statistics.pstdev(d) < 0.15})
    return {"ranking_most_to_least_stable": ranking, "m_final_pair": final_m, "elimination_steps": steps, "pairwise_variation": pv,
            "n_samples": ns, "method": "geNorm: M = mean over other genes of the SD of the per-sample Ct difference (equal to log2 ratio SD when efficiency is 2).",
            "limits": "Needs samples that span your experimental conditions; with few samples the ranking is unreliable. The 0.15 variation cut-off is a convention."}


# --------------------------------------------------------- external services
def _get(url: str, *, params=None, headers=None, timeout=(6, 40), as_json=True):
    try:
        r = requests.get(url, params=params, headers={**UA, **(headers or {})}, timeout=timeout)
    except requests.RequestException as exc:
        raise RuntimeError("The external service could not be reached") from exc
    if r.status_code in (400, 404):
        raise LookupError(f"The service reported no match or an invalid request ({r.status_code})")
    if r.status_code != 200:
        raise RuntimeError(f"The external service returned HTTP {r.status_code}")
    try:
        return r.json() if as_json else r.text
    except ValueError as exc:
        raise RuntimeError("Invalid response from the external service") from exc


GP_ORGS = {"hsapiens": 9606, "mmusculus": 10090, "rnorvegicus": 10116, "scerevisiae": 4932, "dmelanogaster": 7227, "drerio": 7955}
SYMBOL = re.compile(r"^[A-Za-z0-9._\-]{1,30}$")


def _genes(genes: list[str], cap: int) -> list[str]:
    out = []
    for g in genes:
        g = str(g).strip()
        if g and g not in out:
            if not SYMBOL.fullmatch(g):
                raise ValueError(f"Invalid gene identifier: {g[:20]}")
            out.append(g)
    if len(out) < 2 or len(out) > cap:
        raise ValueError(f"Provide 2 to {cap} unique gene identifiers")
    return out


def gprofiler_enrich(genes: list[str], organism: str = "hsapiens", sources: Optional[list[str]] = None, threshold: float = 0.05) -> dict:
    if organism not in GP_ORGS:
        raise ValueError("Unsupported organism")
    genes = _genes(genes, 500)
    sources = sources or ["GO:BP", "KEGG", "REAC"]
    if not set(sources) <= {"GO:BP", "GO:MF", "GO:CC", "KEGG", "REAC", "WP"}:
        raise ValueError("Unsupported source")
    if not 0 < threshold <= 0.5:
        raise ValueError("Threshold must be between 0 and 0.5")
    try:
        r = requests.post("https://biit.cs.ut.ee/gprofiler/api/gost/profile/", headers={**UA, "Content-Type": "application/json"},
                          json={"organism": organism, "query": genes, "sources": sources, "user_threshold": threshold}, timeout=(6, 60))
    except requests.RequestException as exc:
        raise RuntimeError("g:Profiler could not be reached") from exc
    if r.status_code != 200:
        raise RuntimeError(f"g:Profiler returned HTTP {r.status_code}")
    try:
        data = r.json()
    except ValueError as exc:
        raise RuntimeError("Invalid response from g:Profiler") from exc
    rows = []
    for t in (data.get("result") or []):
        rows.append({"source": t.get("source"), "term_id": t.get("native"), "name": t.get("name"), "p_value": t.get("p_value"),
                     "term_size": t.get("term_size"), "query_size": t.get("query_size"), "intersection_size": t.get("intersection_size")})
    rows = [x for x in rows if isinstance(x["p_value"], (int, float))]
    rows.sort(key=lambda x: x["p_value"])
    return {"organism": organism, "n_genes": len(genes), "n_terms": len(rows), "terms": rows[:60], "provider": "g:Profiler",
            "url": "https://biit.cs.ut.ee/gprofiler/", "retrieved_at": now_iso(),
            "limits": "P-values are corrected by g:Profiler's default method for the chosen sources; enrichment depends on the background set and is hypothesis-generating."}


def string_network(genes: list[str], organism: str = "hsapiens", min_score: int = 700) -> dict:
    if organism not in GP_ORGS:
        raise ValueError("Unsupported organism")
    genes = _genes(genes, 100)
    if not 150 <= min_score <= 999:
        raise ValueError("Minimum score must be between 150 and 999")
    data = _get("https://string-db.org/api/json/network", params={"identifiers": "\r".join(genes), "species": GP_ORGS[organism],
                                                                 "required_score": min_score, "caller_identity": "bioaiflow.ir"})
    if not isinstance(data, list):
        raise RuntimeError("Unexpected response from STRING")
    edges, deg = [], {}
    for e in data:
        a, b, s = e.get("preferredName_A"), e.get("preferredName_B"), e.get("score")
        if a and b and isinstance(s, (int, float)):
            edges.append({"a": a, "b": b, "score": s})
            deg[a] = deg.get(a, 0) + 1
            deg[b] = deg.get(b, 0) + 1
    edges.sort(key=lambda e: -e["score"])
    hubs = sorted(deg.items(), key=lambda kv: -kv[1])[:10]
    return {"organism": organism, "n_edges": len(edges), "n_nodes": len(deg), "edges": edges[:400], "hubs": [{"gene": g, "degree": d} for g, d in hubs],
            "isolated_queries": [g for g in genes if g.upper() not in {k.upper() for k in deg}],
            "string_url": "https://string-db.org/cgi/network?identifiers=" + quote("\r".join(genes)) + f"&species={GP_ORGS[organism]}",
            "provider": "STRING", "retrieved_at": now_iso(),
            "limits": "STRING scores combine evidence types, including text mining and predictions; an edge is not proof of a physical interaction."}


def geo_search(term: str, retmax: int = 15) -> dict:
    term = (term or "").strip()
    if not 2 <= len(term) <= 200 or re.search(r"[\x00-\x1f]", term):
        raise ValueError("Search term must be 2 to 200 printable characters")
    if not 1 <= retmax <= 30:
        raise ValueError("Result count must be between 1 and 30")
    common = {"tool": "bioaiflow", "email": "info@bioaiflow.ir", "retmode": "json"}
    s = _get("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi", params={**common, "db": "gds", "term": f"({term}) AND gse[ETYP]", "retmax": retmax, "sort": "relevance"})
    ids = ((s.get("esearchresult") or {}).get("idlist")) or []
    total = int((s.get("esearchresult") or {}).get("count") or 0)
    items = []
    if ids:
        d = _get("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi", params={**common, "db": "gds", "id": ",".join(ids)})
        res = d.get("result") or {}
        for uid in res.get("uids", ids):
            r = res.get(str(uid)) or {}
            acc = r.get("accession")
            if acc:
                items.append({"accession": acc, "title": r.get("title") or "", "summary": (r.get("summary") or "")[:400], "organism": r.get("taxon") or "",
                              "type": r.get("gdstype") or "", "n_samples": r.get("n_samples"), "date": r.get("pdat") or "",
                              "url": f"https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc={quote(acc)}"})
    return {"query": term, "total": total, "items": items, "provider": "NCBI GEO (E-utilities)", "retrieved_at": now_iso(),
            "limits": "Search results are not curated for quality. Check the platform, design and sample metadata before reusing any dataset."}


HGVS_RE = re.compile(r"^[A-Za-z0-9_.]{1,30}:[cgnmp]\.[A-Za-z0-9_>*?=+\-().]{2,80}$")
CHROM_RE = re.compile(r"^(?:[1-9]|1[0-9]|2[0-2]|X|Y|MT)$")


def vep_annotate(hgvs: str) -> dict:
    hgvs = (hgvs or "").strip()
    if not HGVS_RE.fullmatch(hgvs):
        raise ValueError("Use HGVS notation such as 9:g.22125504G>C or ENST00000366667:c.803C>T")
    data = _get(f"https://rest.ensembl.org/vep/human/hgvs/{quote(hgvs, safe='')}", params={"content-type": "application/json", "canonical": 1, "hgvs": 1})
    if not isinstance(data, list) or not data:
        raise LookupError("No annotation returned")
    v = data[0]
    tcs = v.get("transcript_consequences") or []
    tcs.sort(key=lambda t: (not t.get("canonical"), t.get("transcript_id") or ""))
    out_t = [{"gene": t.get("gene_symbol"), "transcript": t.get("transcript_id"), "canonical": bool(t.get("canonical")), "consequences": t.get("consequence_terms"),
              "impact": t.get("impact"), "biotype": t.get("biotype"), "amino_acids": t.get("amino_acids"), "protein_position": t.get("protein_start"),
              "hgvsc": t.get("hgvsc"), "hgvsp": t.get("hgvsp")} for t in tcs[:8]]
    co = [{"id": c.get("id"), "clinical_significance": c.get("clin_sig")} for c in (v.get("colocated_variants") or [])[:10]]
    return {"input": v.get("input") or hgvs, "assembly": v.get("assembly_name"), "location": f'{v.get("seq_region_name")}:{v.get("start")}-{v.get("end")}',
            "alleles": v.get("allele_string"), "most_severe_consequence": v.get("most_severe_consequence"), "transcripts": out_t, "known_variants": co,
            "provider": "Ensembl VEP", "url": "https://www.ensembl.org/info/docs/tools/vep/index.html", "retrieved_at": now_iso(),
            "limits": "Functional annotation for research. It is not a clinical interpretation or diagnosis. Clinical significance fields come from public databases and may be incomplete or outdated."}


def primer_snp_check(primers: list[dict]) -> dict:
    if not 1 <= len(primers) <= 12:
        raise ValueError("Provide 1 to 12 primers")
    out = []
    for p in primers:
        chrom = str(p.get("chrom", "")).replace("chr", "")
        try:
            start, end = int(p.get("start")), int(p.get("end"))
        except (TypeError, ValueError):
            raise ValueError("Start and end must be integers (GRCh38, 1-based)")
        strand = p.get("strand")
        if not CHROM_RE.fullmatch(chrom) or strand not in ("+", "-") or not 10 <= end - start + 1 <= 60:
            raise ValueError("Each primer needs chromosome, strand (+ or -), and a 10 to 60 bp GRCh38 interval")
        data = _get(f"https://rest.ensembl.org/overlap/region/human/{chrom}:{start}-{end}", params={"feature": "variation", "content-type": "application/json"})
        if not isinstance(data, list):
            raise RuntimeError("Unexpected response from Ensembl")
        hits = []
        for v in data:
            vs, ve = v.get("start"), v.get("end")
            if not isinstance(vs, int) or not isinstance(ve, int):
                continue
            d = (end - ve) if strand == "+" else (vs - start)  # 0 = the 3' terminal base
            hits.append({"id": v.get("id"), "start": vs, "end": ve, "alleles": v.get("alleles"), "consequence": v.get("consequence_type"),
                         "distance_from_3prime_end": max(d, 0), "risk": "3' critical (within 5 bases of the 3' end)" if d <= 5 else "inside primer"})
        hits.sort(key=lambda h: h["distance_from_3prime_end"])
        out.append({"name": str(p.get("name") or "")[:40], "region": f"{chrom}:{start}-{end}:{strand}", "n_variants": len(hits), "variants": hits[:25]})
    return {"primers": out, "assembly": "GRCh38", "provider": "Ensembl variation overlap", "retrieved_at": now_iso(),
            "limits": "Lists known variants regardless of frequency. Check population frequency (dbSNP, gnomAD) before redesigning; rare variants rarely matter. "
                      "Coordinates must come from your primer-to-genome mapping (for example Primer-BLAST)."}


# ---------------------------------------------------------- 8. qPCR plate planner
def plate_layout(samples: list, genes: list, replicates: int = 3, fmt: int = 384, ntc: bool = True, standards: int = 0, fill: str = "row") -> dict:
    """Assign wells so that each gene's replicate groups stay together on one plate and replicates share a row (or column)."""
    if fmt not in (96, 384) or fill not in ("row", "column") or not 1 <= replicates <= 4 or not 0 <= standards <= 8:
        raise ValueError("Check plate format, fill direction, replicates (1-4) and standards (0-8)")
    samples, genes = _unique(samples, 192, "samples"), _unique(genes, 60, "genes")
    rows, cols = (8, 12) if fmt == 96 else (16, 24)
    letters = "ABCDEFGHIJKLMNOP"
    order = [(r, c) for r in range(rows) for c in range(cols)] if fill == "row" else [(r, c) for c in range(cols) for r in range(rows)]
    run_len = cols if fill == "row" else rows
    groups = [("sample", s) for s in samples] + [("standard", f"STD{i + 1}") for i in range(standards)] + ([("NTC", "NTC")] if ntc else [])

    def place_gene(gene: str, start: int):
        """Return (wells, next_pointer) or None if the gene does not fit after `start`."""
        wells, ptr = [], start
        for kind, name in groups:
            pos = ptr % run_len
            if pos + replicates > run_len:  # keep the replicates of one group on the same row/column
                ptr += run_len - pos
            if ptr + replicates > len(order):
                return None
            for rep in range(1, replicates + 1):
                r, c = order[ptr]
                wells.append({"well": f"{letters[r]}{c + 1}", "row": letters[r], "col": c + 1, "type": kind, "gene": gene, "sample": name, "replicate": rep})
                ptr += 1
        return wells, ptr

    plates, cur, ptr = [], [], 0
    for gene in genes:
        res = place_gene(gene, ptr)
        if res is None and cur:  # start a new plate; genes are never split across plates
            plates.append(cur)
            cur, ptr = [], 0
            res = place_gene(gene, 0)
        if res is None:
            raise ValueError(f"Gene {gene} needs more wells than one {fmt}-well plate holds; use fewer samples or the 384-well format")
        cur.extend(res[0])
        ptr = res[1]
    if cur:
        plates.append(cur)
    out = [{"plate": i + 1, "format": fmt, "wells": w, "genes": sorted({x["gene"] for x in w}), "wells_used": len(w)} for i, w in enumerate(plates)]
    csv = "plate,well,type,gene,sample,replicate\n" + "\n".join(f'{p["plate"]},{w["well"]},{w["type"]},{w["gene"]},{w["sample"]},{w["replicate"]}' for p in out for w in p["wells"])
    return {"plates": out, "n_plates": len(out), "csv": csv, "format": fmt, "rows": rows, "cols": cols,
            "notes": ["Every gene is kept on a single plate with all its samples, so comparisons between samples are not confounded by plate-to-plate variation.",
                      "Include an inter-run calibrator if one experiment spans several plates.",
                      "Layout assists planning only; adapt it to your instrument and reaction-volume rules."]}


def _unique(xs, cap: int, what: str) -> list:
    out = []
    for x in xs:
        x = str(x).strip()[:40]
        if x and x not in out:
            out.append(x)
    if not 1 <= len(out) <= cap:
        raise ValueError(f"Provide 1 to {cap} unique {what}")
    return out


# ------------------------------------------------- 9. GenBank / FASTA import and export
FEATURE_TYPES = {"CDS", "gene", "misc_feature", "primer_bind", "promoter", "terminator", "rep_origin", "regulatory", "protein_bind", "sig_peptide", "misc_binding"}
QUAL_KEYS = {"label", "note", "gene", "product", "translation", "codon_start", "standard_name"}
MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
IUPAC = set("ACGTRYKMSWBDHVN")
_IND = " " * 21


def _safe_name(name: str) -> str:
    return (re.sub(r"[^A-Za-z0-9_.\-]", "_", str(name or "sequence"))[:16]) or "sequence"


def _qual_lines(key: str, value) -> list:
    value = str(value).replace('"', "'").replace("\n", " ").replace("\r", " ").strip()
    if key == "codon_start":
        return [f"{_IND}/{key}={value}"]
    text, width = f'/{key}="{value}"', 58
    if key == "translation" or " " not in value:
        return [_IND + text[i:i + width] for i in range(0, len(text), width)]
    out, line = [], ""
    for word in text.split(" "):
        if line and len(line) + 1 + len(word) > width:
            out.append(_IND + line)
            line = word
        else:
            line = f"{line} {word}".strip()
    out.append(_IND + line)
    return out


def _location(start: int, end: int, strand: int) -> str:
    base = f"{start}..{end}" if end != start else f"{start}"
    return f"complement({base})" if strand == -1 else base


def clean_features(features: list, n: int) -> list:
    out = []
    for f in (features or [])[:500]:
        if not isinstance(f, dict):
            raise ValueError("Each feature must be an object")
        typ = f.get("type", "misc_feature")
        try:
            start, end, strand = int(f.get("start")), int(f.get("end")), int(f.get("strand", 1))
        except (TypeError, ValueError):
            raise ValueError("Feature start, end and strand must be integers")
        if typ not in FEATURE_TYPES or strand not in (1, -1) or not 1 <= start <= end <= n:
            raise ValueError("Invalid feature type, strand or coordinates")
        q = {k: v for k, v in (f.get("qualifiers") or {}).items() if k in QUAL_KEYS and v not in (None, "")}
        out.append({"type": typ, "start": start, "end": end, "strand": strand, "qualifiers": q})
    return sorted(out, key=lambda f: (f["start"], f["end"]))


def genbank_text(name: str, sequence: str, features: list, definition: str = "", topology: str = "linear") -> str:
    seq = re.sub(r"\s", "", sequence or "").upper()
    if not re.fullmatch(r"[ACGT]+", seq) or len(seq) > MAX_DNA:
        raise ValueError("GenBank export needs an A/C/G/T sequence of at most 200 kb")
    if topology not in ("linear", "circular"):
        raise ValueError("Topology must be linear or circular")
    feats = clean_features(features, len(seq))
    d = datetime.now(timezone.utc)
    lines = [f"LOCUS       {_safe_name(name):<16}{len(seq):>11} bp    DNA     {topology:<8} SYN {d.day:02d}-{MONTHS[d.month - 1]}-{d.year}",
             f"DEFINITION  {(definition or 'Sequence exported from Primer AI').strip()[:200]}.", "ACCESSION   .", "VERSION     .", "KEYWORDS    .",
             "SOURCE      synthetic DNA construct", "  ORGANISM  synthetic DNA construct", "            other sequences; artificial sequences.",
             "FEATURES             Location/Qualifiers", f"     {'source':<16}1..{len(seq)}", f'{_IND}/organism="synthetic DNA construct"', f'{_IND}/mol_type="other DNA"']
    for f in feats:
        lines.append(f"     {f['type']:<16}{_location(f['start'], f['end'], f['strand'])}")
        for k, v in f["qualifiers"].items():
            lines.extend(_qual_lines(k, v))
    lines.append("ORIGIN")
    low = seq.lower()
    for i in range(0, len(low), 60):
        chunk = low[i:i + 60]
        lines.append(f"{i + 1:>9} " + " ".join(chunk[j:j + 10] for j in range(0, len(chunk), 10)))
    lines.append("//")
    return "\n".join(lines) + "\n"


_LOC_NUM = re.compile(r"\d+")


def _parse_location(loc: str):
    nums = [int(x) for x in _LOC_NUM.findall(loc)]
    if not nums:
        return None
    return min(nums), max(nums), -1 if loc.startswith("complement") else 1, loc.startswith("join") or "join(" in loc


def parse_genbank(text: str) -> list:
    records = []
    for block in re.split(r"^//\s*$", text, flags=re.M):
        if "LOCUS" not in block:
            continue
        head = re.search(r"^LOCUS\s+(\S+)\s+(\d+)\s*bp(.*)$", block, re.M)
        name = head.group(1) if head else "sequence"
        topology = "circular" if head and "circular" in head.group(3) else "linear"
        feats, cur, warnings = [], None, []
        in_feat = False
        seq_part = ""
        in_origin = False
        for ln in block.splitlines():
            if ln.startswith("FEATURES"):
                in_feat, in_origin = True, False
                continue
            if ln.startswith("ORIGIN"):
                in_feat, in_origin = False, True
                continue
            if in_origin:
                seq_part += re.sub(r"[^A-Za-z]", "", ln)
            elif in_feat:
                if re.match(r"^ {5}\S", ln):
                    if cur:
                        feats.append(cur)
                    typ, loc = ln[5:21].strip(), ln[21:].strip()
                    cur = {"type": typ, "loc": loc, "qualifiers": {}, "_key": None}
                elif cur is not None and ln.startswith(" " * 21):
                    body = ln[21:].rstrip()
                    if body.startswith("/"):
                        k, _, v = body[1:].partition("=")
                        cur["qualifiers"][k] = v.strip('"')
                        cur["_key"] = k
                    elif cur["_key"]:
                        k = cur["_key"]
                        cur["qualifiers"][k] += ("" if k == "translation" else " ") + body.strip('"')
                    else:
                        cur["loc"] += body.strip()
        if cur:
            feats.append(cur)
        seq = seq_part.upper().replace("U", "T")
        bad = sum(1 for ch in seq if ch not in "ACGT")
        if bad:
            warnings.append(f"{bad} ambiguous or unsupported bases (kept as written; replace them before analysis)")
        out_f = []
        for f in feats:
            if f["type"] == "source":
                continue
            p = _parse_location(f["loc"])
            if not p:
                continue
            start, end, strand, joined = p
            q = {k: v for k, v in f["qualifiers"].items() if k in QUAL_KEYS}
            if joined:
                warnings.append(f"{f['type']} {f['loc'][:40]} is a joined feature; shown as its outer span")
            out_f.append({"type": f["type"] if f["type"] in FEATURE_TYPES else "misc_feature", "original_type": f["type"], "start": start, "end": end, "strand": strand, "qualifiers": q})
        records.append({"name": name, "topology": topology, "length": len(seq), "sequence": seq[:MAX_DNA], "features": out_f[:500], "warnings": warnings[:10]})
    return records


def parse_sequence_file(text: str) -> dict:
    if not isinstance(text, str) or not text.strip():
        raise ValueError("The file is empty")
    if re.match(r"^\s*LOCUS\b", text):
        recs = parse_genbank(text)
        fmt = "GenBank"
    else:
        raw = parse_fasta(text, alphabet=IUPAC, max_seqs=10, max_len=MAX_DNA, min_len=1)
        recs = [{"name": n, "topology": "linear", "length": len(s), "sequence": s, "features": [],
                 "warnings": ([f"{sum(c not in 'ACGT' for c in s)} ambiguous bases"] if set(s) - set("ACGT") else [])} for n, s in raw]
        fmt = "FASTA"
    if not recs or not recs[0]["sequence"]:
        raise ValueError("No sequence found. Supported formats: FASTA and GenBank (SnapGene .dna files are not supported; export GenBank from SnapGene first).")
    return {"format": fmt, "records": recs[:10], "note": "Parsed locally; nothing was sent to external services."}


def export_genbank(name: str, sequence: str, features: list, definition: str = "", topology: str = "linear", auto: bool = False, min_orf_aa: int = 50) -> dict:
    seq = re.sub(r"\s", "", sequence or "").upper()
    feats = list(features or [])
    if auto:
        if not re.fullmatch(r"[ACGT]+", seq):
            raise ValueError("Auto-annotation needs an A/C/G/T sequence")
        for i, o in enumerate(find_orfs(seq, min_orf_aa)[:20], 1):
            feats.append({"type": "CDS", "start": o["start"], "end": o["end"], "strand": 1 if o["strand"] == "+" else -1,
                          "qualifiers": {"label": f"ORF{i}", "note": "predicted ORF (ATG to stop)", "codon_start": 1, "translation": o["protein"]}})
        for name_e, (site, off) in RESTRICTION.items():
            pos = [m.start() + 1 for m in re.finditer(f"(?={site})", seq)]
            if len(pos) == 1:
                feats.append({"type": "misc_feature", "start": pos[0], "end": pos[0] + len(site) - 1, "strand": 1, "qualifiers": {"label": name_e, "note": f"{name_e} site (unique cutter)"}})
    text = genbank_text(name, seq, feats, definition, topology)
    return {"text": text, "filename": f"{_safe_name(name)}.gb", "n_features": len(clean_features(feats, len(seq)))}


# ------------------------------------------------------------------- routes
def create_bio_router(limiter, get_optional_user, egress=None):
    from fastapi import APIRouter, Depends, HTTPException, Request
    from pydantic import BaseModel, Field
    from starlette.concurrency import run_in_threadpool

    router = APIRouter(prefix="/bio", tags=["Bioinformatics tools"])

    async def current_user(user=Depends(get_optional_user)):
        if egress is not None:
            egress.CURRENT_USER.set(user)
        return user

    class SeqReq(BaseModel):
        sequence: str = Field(min_length=10, max_length=400_000)
        min_orf_aa: int = 50
        digest: list[str] = Field(default_factory=list)

    class AlignReq(BaseModel):
        sequences: str = Field(min_length=10, max_length=60_000)
        mode: str = Field("protein", max_length=8)

    class ConsReq(BaseModel):
        epitopes: list[str]
        sequences: str = Field(min_length=10, max_length=1_200_000)
        mode: str = Field("protein", max_length=8)

    class GenesReq(BaseModel):
        genes: list[str]
        organism: str = Field("hsapiens", max_length=20)
        sources: list[str] = Field(default_factory=list)
        threshold: float = 0.05
        min_score: int = 700

    class GeoReq(BaseModel):
        term: str = Field(min_length=2, max_length=200)
        retmax: int = 15

    class CurveReq(BaseModel):
        points: list[dict]

    class GenormReq(BaseModel):
        genes: dict[str, list[float]]

    class VepReq(BaseModel):
        hgvs: str = Field(min_length=5, max_length=120)

    class SnpReq(BaseModel):
        primers: list[dict]

    class PlateReq(BaseModel):
        samples: list[str]
        genes: list[str]
        replicates: int = 3
        format: int = 384
        ntc: bool = True
        standards: int = 0
        fill: str = Field("row", max_length=8)

    class GbReq(BaseModel):
        name: str = Field("sequence", max_length=60)
        sequence: str = Field(min_length=10, max_length=400_000)
        definition: str = Field("", max_length=300)
        topology: str = Field("linear", max_length=8)
        features: list[dict] = Field(default_factory=list)
        auto: bool = False
        min_orf_aa: int = 50

    class ParseReq(BaseModel):
        text: str = Field(min_length=10, max_length=2_500_000)

    async def guarded(fn, provider: str, *args):
        try:
            if egress is not None and provider != "local":
                return await egress.run_external(fn, provider, fn.__name__, args)
            return await run_in_threadpool(fn, *args)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        except LookupError as exc:
            raise HTTPException(404, str(exc)) from exc
        except RuntimeError as exc:
            log.warning("bio tool %s failed: %s", provider, exc)
            raise HTTPException(502, str(exc)) from exc

    @router.post("/sequence")
    @limiter.limit("30/minute")
    async def r_sequence(request: Request, req: SeqReq, user=Depends(current_user)):
        return await guarded(analyze_sequence, "local", req.sequence, req.min_orf_aa, req.digest)

    @router.post("/align")
    @limiter.limit("6/minute")
    async def r_align(request: Request, req: AlignReq, user=Depends(current_user)):
        return await guarded(align_and_conserve, "local", req.sequences, req.mode)

    @router.post("/conservancy")
    @limiter.limit("12/minute")
    async def r_cons(request: Request, req: ConsReq, user=Depends(current_user)):
        return await guarded(epitope_conservancy, "local", req.epitopes, req.sequences, req.mode)

    @router.post("/enrichment")
    @limiter.limit("10/minute")
    async def r_enrich(request: Request, req: GenesReq, user=Depends(current_user)):
        return await guarded(gprofiler_enrich, "g:Profiler", req.genes, req.organism, req.sources or None, req.threshold)

    @router.post("/string")
    @limiter.limit("10/minute")
    async def r_string(request: Request, req: GenesReq, user=Depends(current_user)):
        return await guarded(string_network, "STRING", req.genes, req.organism, req.min_score)

    @router.post("/geo")
    @limiter.limit("12/minute")
    async def r_geo(request: Request, req: GeoReq, user=Depends(current_user)):
        return await guarded(geo_search, "NCBI", req.term, req.retmax)

    @router.post("/qpcr/standard-curve")
    @limiter.limit("30/minute")
    async def r_curve(request: Request, req: CurveReq, user=Depends(current_user)):
        return await guarded(standard_curve, "local", req.points)

    @router.post("/qpcr/genorm")
    @limiter.limit("30/minute")
    async def r_genorm(request: Request, req: GenormReq, user=Depends(current_user)):
        return await guarded(genorm, "local", req.genes)

    @router.post("/variant")
    @limiter.limit("12/minute")
    async def r_variant(request: Request, req: VepReq, user=Depends(current_user)):
        return await guarded(vep_annotate, "Ensembl", req.hgvs)

    @router.post("/primer-snp")
    @limiter.limit("6/minute")
    async def r_snp(request: Request, req: SnpReq, user=Depends(current_user)):
        return await guarded(primer_snp_check, "Ensembl", req.primers)

    @router.post("/plate")
    @limiter.limit("30/minute")
    async def r_plate(request: Request, req: PlateReq, user=Depends(current_user)):
        return await guarded(plate_layout, "local", req.samples, req.genes, req.replicates, req.format, req.ntc, req.standards, req.fill)

    @router.post("/genbank")
    @limiter.limit("30/minute")
    async def r_genbank(request: Request, req: GbReq, user=Depends(current_user)):
        return await guarded(export_genbank, "local", req.name, req.sequence, req.features, req.definition, req.topology, req.auto, req.min_orf_aa)

    @router.post("/parse")
    @limiter.limit("30/minute")
    async def r_parse(request: Request, req: ParseReq, user=Depends(current_user)):
        return await guarded(parse_sequence_file, "local", req.text)

    class PrivacyReq(BaseModel):
        private_mode: bool

    def need_user(user):
        if user is None or egress is None:
            raise HTTPException(401, "Sign in to use this feature")
        return int(user["id"] if not hasattr(user, "id") else user.id)

    @router.get("/privacy")
    async def r_privacy(user=Depends(current_user)):
        uid = need_user(user)
        return {"private_mode": await egress.is_private(uid)}

    @router.post("/privacy")
    async def r_privacy_set(req: PrivacyReq, user=Depends(current_user)):
        uid = need_user(user)
        await egress.set_private(uid, req.private_mode)
        return {"private_mode": req.private_mode}

    @router.get("/egress-log")
    async def r_egress(limit: int = 100, user=Depends(current_user)):
        uid = need_user(user)
        return {"items": await egress.entries(uid, limit),
                "note": "Only provider, operation, a SHA-256 of the payload and its size are recorded; the data itself is not stored. Anonymous use and the ESMFold route are not logged here."}

    return router
