"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from "react";

type Props = { call: (path: string, init?: RequestInit) => Promise<any>; lang?: string };

const ENZ = ["EcoRI", "BamHI", "HindIII", "XhoI", "NdeI", "NcoI", "NotI", "XbaI", "SalI", "KpnI", "SacI", "PstI", "SpeI", "NheI", "BglII", "SmaI", "EcoRV", "ClaI"];
const ORGS = [["hsapiens", "Homo sapiens"], ["mmusculus", "Mus musculus"], ["rnorvegicus", "Rattus norvegicus"], ["scerevisiae", "S. cerevisiae"], ["dmelanogaster", "D. melanogaster"], ["drerio", "Danio rerio"]];
const card = "rounded-xl border border-slate-200 bg-white p-4 shadow-sm";
const inp = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";
const mono = `${inp} font-mono text-xs`;
const btn = "rounded-lg bg-[#16233f] px-4 py-2 text-sm font-semibold text-white hover:bg-[#22345f] disabled:opacity-50";
const ghost = "rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50";
const note = "text-xs text-slate-500";
const nums = (s: string) => s.split(/[\s,;\t]+/).filter(Boolean).map(Number);

export default function BioToolsPanel({ call, lang }: Props) {
  const fa = lang === "fa";
  const L = (en: string, f: string) => (fa ? f : en);
  const TABS = [L("Sequence", "توالی"), L("Alignment & conservation", "هم‌ترازی و حفاظت‌شدگی"), L("Enrichment & network", "غنی‌سازی و شبکه"), L("GEO datasets", "داده‌های GEO"),
    L("qPCR development", "توسعهٔ qPCR"), L("Variants & primers", "واریانت و پرایمر")];
  const [tab, setTab] = useState(0);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState("");

  const post = async (key: string, path: string, body: any, ok: (r: any) => void) => {
    setBusy(key); setErr("");
    try { ok(await call(path, { method: "POST", body: JSON.stringify(body) })); }
    catch (e: any) { setErr(`${L("Request failed", "درخواست ناموفق بود")}: ${String(e?.message || e)}`); }
    finally { setBusy(""); }
  };
  const copy = async (k: string, s: string) => { try { await navigator.clipboard.writeText(s); setCopied(k); setTimeout(() => setCopied(""), 1400); } catch { /* ignore */ } };
  const CopyBtn = ({ k, s }: { k: string; s: string }) => <button type="button" className={ghost} onClick={() => void copy(k, s)}>{copied === k ? L("Copied", "کپی شد") : L("Copy", "کپی")}</button>;
  const Src = ({ r }: { r: any }) => <p className={note}>{r.provider ? `${r.provider} · ` : ""}{r.retrieved_at ? `${L("retrieved", "دریافت")} ${String(r.retrieved_at).slice(0, 19)} · ` : ""}{r.limits || r.method}</p>;
  const Table = ({ head, rows }: { head: string[]; rows: any[][] }) => <div className="overflow-x-auto rounded-lg border border-slate-200"><table className="w-full text-start text-xs" dir="ltr">
    <thead className="bg-slate-50 text-slate-600"><tr>{head.map((h) => <th key={h} className="px-3 py-2 text-start">{h}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-slate-100">{r.map((c, j) => <td key={j} className="px-3 py-1.5 align-top">{c}</td>)}</tr>)}</tbody></table></div>;

  /* ---- 1. sequence ---- */
  const [dna, setDna] = useState(""); const [minOrf, setMinOrf] = useState(50); const [dig, setDig] = useState<string[]>([]); const [seqRes, setSeqRes] = useState<any>(null);
  /* ---- 2. alignment ---- */
  const [fasta, setFasta] = useState(""); const [mode, setMode] = useState("protein"); const [aln, setAln] = useState<any>(null); const [eps, setEps] = useState(""); const [cons, setCons] = useState<any>(null);
  /* ---- 3. enrichment ---- */
  const [genes, setGenes] = useState(""); const [org, setOrg] = useState("hsapiens"); const [enr, setEnr] = useState<any>(null); const [net, setNet] = useState<any>(null); const [score, setScore] = useState(700);
  /* ---- 4. GEO ---- */
  const [term, setTerm] = useState(""); const [geo, setGeo] = useState<any>(null);
  /* ---- 5. qPCR ---- */
  const [curveTxt, setCurveTxt] = useState(""); const [curve, setCurve] = useState<any>(null); const [gnTxt, setGnTxt] = useState(""); const [gn, setGn] = useState<any>(null);
  /* ---- 6. variants ---- */
  const [hgvs, setHgvs] = useState(""); const [vep, setVep] = useState<any>(null); const [snpTxt, setSnpTxt] = useState(""); const [snp, setSnp] = useState<any>(null);

  const geneList = genes.split(/[\s,;]+/).filter(Boolean);
  const runCurve = () => {
    const pts = curveTxt.split(/\r?\n/).map((l) => nums(l)).filter((n) => n.length >= 2).map((n) => ({ quantity: n[0], ct: n.length > 2 ? n.slice(1) : n[1] }));
    void post("curve", "/bio/qpcr/standard-curve", { points: pts }, setCurve);
  };
  const runGn = () => {
    const lines = gnTxt.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const names = (lines[0] || "").split(/[\s,;\t]+/).filter(Boolean);
    const rows = lines.slice(1).map((l) => nums(l));
    const g: Record<string, number[]> = {};
    names.forEach((n, i) => { g[n] = rows.map((r) => r[i]); });
    void post("gn", "/bio/qpcr/genorm", { genes: g }, setGn);
  };
  const runSnp = () => {
    const pr = snpTxt.split(/\r?\n/).map((l) => l.trim().split(/[\s,;\t]+/)).filter((p) => p.length >= 5).map((p) => ({ name: p[0], chrom: p[1], start: p[2], end: p[3], strand: p[4] }));
    void post("snp", "/bio/primer-snp", { primers: pr }, setSnp);
  };

  return <section id="bio-tools" dir={fa ? "rtl" : "ltr"} aria-labelledby="bio-title" className="space-y-4">
    <div>
      <h2 id="bio-title" className="text-xl font-bold text-[#16233f]">{L("Bioinformatics tools", "ابزارهای بیوانفورماتیک")}</h2>
      <p className="mt-1 text-sm text-slate-600">{L("Local calculations and public data services. Results show their source and limits. Research and teaching use only.",
        "محاسبات محلی و سرویس‌های دادهٔ عمومی. هر نتیجه منبع و محدودیتش را نشان می‌دهد. فقط برای پژوهش و آموزش.")}</p>
    </div>
    <nav aria-label="tools" className="flex flex-wrap gap-1.5">{TABS.map((n, i) => <button key={n} type="button" aria-current={tab === i ? "page" : undefined} onClick={() => { setTab(i); setErr(""); }}
      className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${tab === i ? "border-[#16233f] bg-[#16233f] text-white" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}>{n}</button>)}</nav>
    {err && <p role="alert" className="text-sm text-red-700">{err}</p>}

    {tab === 0 && <div className="space-y-3">
      <div className={`${card} space-y-3`}>
        <label htmlFor="bt-dna" className="text-sm font-semibold">{L("DNA sequence (raw or FASTA, up to 200 kb)", "توالی DNA (خام یا FASTA، تا ۲۰۰ کیلوباز)")}</label>
        <textarea id="bt-dna" dir="ltr" rows={5} className={mono} value={dna} onChange={(e) => setDna(e.target.value)} placeholder=">my_gene&#10;ATGGCT…" />
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">{L("Minimum ORF (aa)", "حداقل طول ORF (aa)")}<input type="number" min={10} max={2000} dir="ltr" className={`${inp} mt-1 w-28`} value={minOrf} onChange={(e) => setMinOrf(parseInt(e.target.value || "50", 10))} /></label>
          <fieldset className="min-w-0 flex-1"><legend className="text-sm">{L("Digest with (optional, up to 6)", "هضم با (اختیاری، تا ۶ آنزیم)")}</legend>
            <div className="mt-1 flex flex-wrap gap-1.5" dir="ltr">{ENZ.map((n) => <label key={n} className="flex items-center gap-1 rounded-full border border-slate-300 px-2 py-0.5 text-xs">
              <input type="checkbox" checked={dig.includes(n)} disabled={!dig.includes(n) && dig.length >= 6} onChange={() => setDig((d) => (d.includes(n) ? d.filter((x) => x !== n) : [...d, n]))} />{n}</label>)}</div></fieldset>
          <button type="button" className={btn} disabled={!!busy || dna.trim().length < 10} onClick={() => void post("seq", "/bio/sequence", { sequence: dna, min_orf_aa: minOrf, digest: dig }, setSeqRes)}>{busy === "seq" ? L("Running…", "در حال اجرا…") : L("Analyze", "تحلیل")}</button>
        </div>
      </div>
      {seqRes && <div className={`${card} space-y-3 text-sm`}>
        <p dir="ltr"><b>{seqRes.length} nt</b> · GC {seqRes.gc_percent}% · Tm≈{seqRes.basic_tm_c} °C · A{seqRes.composition.A} C{seqRes.composition.C} G{seqRes.composition.G} T{seqRes.composition.T}</p>
        <p className={note}>{seqRes.tm_note}</p>
        {seqRes.reverse_complement && <div><p className="font-semibold">{L("Reverse complement", "معکوس مکمل")}</p><textarea readOnly rows={2} dir="ltr" className={mono} value={seqRes.reverse_complement} /><CopyBtn k="rc" s={seqRes.reverse_complement} /></div>}
        <div><p className="mb-1 font-semibold">ORFs ({seqRes.orfs.length})</p>
          {seqRes.orfs.length ? <Table head={["Strand", "Frame", "Start–End", "aa", "Protein"]} rows={seqRes.orfs.slice(0, 15).map((o: any) => [o.strand, o.frame, `${o.start}–${o.end}`, o.length_aa, <span key={o.start} className="font-mono">{o.protein.slice(0, 40)}{o.protein.length > 40 ? "…" : ""}</span>])} /> : <p className={note}>—</p>}
          <p className={note}>{seqRes.orf_note}</p></div>
        <div><p className="mb-1 font-semibold">{L("Restriction map", "نقشهٔ آنزیم‌های برشی")}</p>
          <p dir="ltr" className="text-xs">{L("Unique cutters", "برش‌دهندهٔ یکتا")}: {seqRes.restriction.unique_cutters.join(", ") || "—"}</p>
          <p dir="ltr" className="text-xs text-slate-500">{L("Non-cutters", "بدون برش")}: {seqRes.restriction.non_cutters.join(", ") || "—"}</p>
          {Object.keys(seqRes.restriction.sites).length > 0 && <Table head={["Enzyme", "Site", "Count", "Positions"]} rows={Object.entries(seqRes.restriction.sites).map(([k, v]: any) => [k, v.site, v.count, v.positions.join(", ")])} />}</div>
        {seqRes.digest && <p dir="ltr"><b>{L("Digest fragments (bp)", "قطعات هضم (bp)")}:</b> {seqRes.digest.fragments_bp.join(" + ")} <span className={note}>({seqRes.digest.assumes})</span></p>}
      </div>}
    </div>}

    {tab === 1 && <div className="space-y-3">
      <div className={`${card} space-y-3`}>
        <label htmlFor="bt-fa" className="text-sm font-semibold">{L("Sequences (multi-FASTA)", "توالی‌ها (multi-FASTA)")}</label>
        <textarea id="bt-fa" dir="ltr" rows={7} className={mono} value={fasta} onChange={(e) => setFasta(e.target.value)} placeholder=">strain_A&#10;MKTAYIAK…&#10;>strain_B&#10;MKTAYIAR…" />
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">{L("Type", "نوع")}<select className={`${inp} mt-1`} value={mode} onChange={(e) => setMode(e.target.value)}><option value="protein">Protein</option><option value="dna">DNA</option></select></label>
          <button type="button" className={btn} disabled={!!busy || fasta.length < 10} onClick={() => void post("aln", "/bio/align", { sequences: fasta, mode }, setAln)}>{busy === "aln" ? L("Aligning…", "در حال هم‌ترازی…") : L("Align (2–8 sequences)", "هم‌ترازی (۲ تا ۸ توالی)")}</button>
        </div>
        <p className={note}>{L("Aligner is approximate and meant for closely related sequences (strains). For distant homologs use Clustal Omega or MAFFT.", "هم‌تراز‌کننده تقریبی است و برای توالی‌های نزدیک (سویه‌ها) مناسب است. برای توالی‌های دور از Clustal Omega یا MAFFT استفاده کنید.")}</p>
      </div>
      {aln && <div className={`${card} space-y-2 text-sm`}>
        <p dir="ltr">{L("Mean identity", "میانگین تشابه")} <b>{aln.mean_identity}</b> · {L("fully conserved columns", "ستون کاملاً حفاظت‌شده")} <b>{aln.fully_conserved_columns}</b> / {aln.alignment_length}</p>
        <svg viewBox="0 0 400 60" className="h-14 w-full" role="img" aria-label="identity per column" style={{ direction: "ltr" }}>
          <polyline fill="none" stroke="#059669" strokeWidth="1.5" points={aln.identity_per_column.filter((_: any, i: number) => i % Math.max(1, Math.ceil(aln.identity_per_column.length / 400)) === 0).map((v: number, i: number, a: number[]) => `${(i / Math.max(1, a.length - 1)) * 400},${58 - v * 56}`).join(" ")} /></svg>
        <p className="font-semibold">{L("Conserved windows (no gaps, identical in all sequences)", "پنجره‌های حفاظت‌شده (بدون گپ، یکسان در همهٔ توالی‌ها)")}</p>
        {aln.conserved_windows.length ? <Table head={["Aln start–end", "Length", "Peptide"]} rows={aln.conserved_windows.slice(0, 12).map((w: any) => [`${w.alignment_start}–${w.alignment_end}`, w.length, <span key={w.peptide} className="font-mono">{w.peptide}</span>])} /> : <p className={note}>—</p>}
        {aln.alignment && <details><summary className="cursor-pointer text-xs">{L("Show alignment", "نمایش هم‌ترازی")}</summary><pre dir="ltr" className="mt-2 max-h-60 overflow-auto rounded bg-slate-50 p-2 text-[11px]">{aln.names.map((n: string, i: number) => `${n.padEnd(14).slice(0, 14)} ${aln.alignment[i]}`).join("\n")}</pre></details>}
        <Src r={aln} />
      </div>}
      <div className={`${card} space-y-3`}>
        <label htmlFor="bt-eps" className="text-sm font-semibold">{L("Epitope conservancy: one epitope per line (uses the sequences above, up to 200)", "حفاظت‌شدگی اپی‌توپ: هر خط یک اپی‌توپ (از توالی‌های بالا، تا ۲۰۰ توالی)")}</label>
        <textarea id="bt-eps" dir="ltr" rows={3} className={mono} value={eps} onChange={(e) => setEps(e.target.value)} placeholder="MKTAYIAKQR" />
        <button type="button" className={btn} disabled={!!busy || !eps.trim() || fasta.length < 10} onClick={() => void post("cons", "/bio/conservancy", { epitopes: eps.split(/\s+/).filter(Boolean), sequences: fasta, mode }, setCons)}>{busy === "cons" ? L("Running…", "در حال اجرا…") : L("Check conservancy", "بررسی حفاظت‌شدگی")}</button>
        {cons && <><Table head={["Epitope", "Sequences", "Exact", "≤1 mismatch"]} rows={cons.results.map((r: any) => [<span key={r.epitope} className="font-mono">{r.epitope}</span>, r.n_sequences, `${r.exact_count} (${r.exact_percent}%)`, `${r.within_1_mismatch_count} (${r.within_1_mismatch_percent}%)`])} /><Src r={cons} /></>}
      </div>
    </div>}

    {tab === 2 && <div className="space-y-3">
      <div className={`${card} space-y-3`}>
        <label htmlFor="bt-genes" className="text-sm font-semibold">{L("Gene symbols (2 to 500, separated by space, comma or new line)", "نماد ژن‌ها (۲ تا ۵۰۰، جداشده با فاصله، کاما یا خط جدید)")}</label>
        <textarea id="bt-genes" dir="ltr" rows={4} className={mono} value={genes} onChange={(e) => setGenes(e.target.value)} placeholder="TP53 MDM2 CDKN1A BAX" />
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">{L("Organism", "ارگانیسم")}<select className={`${inp} mt-1`} value={org} onChange={(e) => setOrg(e.target.value)}>{ORGS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></label>
          <label className="text-sm">{L("STRING min. score", "حداقل امتیاز STRING")}<input type="number" min={150} max={999} dir="ltr" className={`${inp} mt-1 w-24`} value={score} onChange={(e) => setScore(parseInt(e.target.value || "700", 10))} /></label>
          <button type="button" className={btn} disabled={!!busy || geneList.length < 2} onClick={() => void post("enr", "/bio/enrichment", { genes: geneList, organism: org }, setEnr)}>{busy === "enr" ? L("Running…", "در حال اجرا…") : L("Enrichment (g:Profiler)", "غنی‌سازی (g:Profiler)")}</button>
          <button type="button" className={ghost} disabled={!!busy || geneList.length < 2 || geneList.length > 100} onClick={() => void post("net", "/bio/string", { genes: geneList, organism: org, min_score: score }, setNet)}>{busy === "net" ? L("Running…", "در حال اجرا…") : L("Network (STRING, ≤100 genes)", "شبکه (STRING، حداکثر ۱۰۰ ژن)")}</button>
        </div>
      </div>
      {enr && <div className={`${card} space-y-2 text-sm`}><p className="font-semibold">{enr.n_terms} {L("enriched terms", "اصطلاح غنی‌شده")}</p>
        {enr.terms.length ? <Table head={["Source", "Term", "p-value", "Hits / term size"]} rows={enr.terms.slice(0, 25).map((t: any) => [t.source, `${t.name} (${t.term_id})`, Number(t.p_value).toExponential(2), `${t.intersection_size} / ${t.term_size}`])} /> : <p className={note}>—</p>}<Src r={enr} /></div>}
      {net && <div className={`${card} space-y-2 text-sm`}><p dir="ltr"><b>{net.n_nodes}</b> nodes · <b>{net.n_edges}</b> edges · <a className="text-emerald-700 underline" href={net.string_url} target="_blank" rel="noreferrer">STRING ↗</a></p>
        {net.hubs.length > 0 && <p dir="ltr" className="text-xs">{L("Hubs", "گره‌های مرکزی")}: {net.hubs.map((h: any) => `${h.gene} (${h.degree})`).join(", ")}</p>}
        {net.isolated_queries.length > 0 && <p dir="ltr" className="text-xs text-slate-500">{L("No interactions above the cutoff", "بدون برهم‌کنش بالاتر از آستانه")}: {net.isolated_queries.join(", ")}</p>}
        {net.edges.length > 0 && <Table head={["A", "B", "Score"]} rows={net.edges.slice(0, 25).map((e: any) => [e.a, e.b, e.score])} />}<Src r={net} /></div>}
    </div>}

    {tab === 3 && <div className="space-y-3">
      <form className={`${card} flex flex-wrap items-end gap-3`} onSubmit={(e) => { e.preventDefault(); void post("geo", "/bio/geo", { term, retmax: 15 }, setGeo); }}>
        <label className="min-w-56 flex-1 text-sm">{L("Search GEO series (GSE)", "جست‌وجوی سری‌های GEO (GSE)")}<input className={`${inp} mt-1`} value={term} onChange={(e) => setTerm(e.target.value)} placeholder="breast cancer RNA-seq Homo sapiens" /></label>
        <button type="submit" className={btn} disabled={!!busy || term.trim().length < 2}>{busy === "geo" ? L("Searching…", "در حال جست‌وجو…") : L("Search", "جست‌وجو")}</button>
      </form>
      {geo && <div className={`${card} space-y-2 text-sm`}><p>{geo.total} {L("series found; showing", "سری یافت شد؛ نمایش")} {geo.items.length}</p>
        {geo.items.map((g: any) => <div key={g.accession} className="rounded-lg border border-slate-200 p-3"><a href={g.url} target="_blank" rel="noreferrer" className="font-semibold text-emerald-700 underline" dir="ltr">{g.accession} ↗</a>
          <span className="ms-2 text-xs text-slate-500">{g.organism} · {g.type} · n={g.n_samples} · {g.date}</span><p className="mt-1 font-medium">{g.title}</p><p className="text-xs text-slate-600">{g.summary}</p></div>)}<Src r={geo} /></div>}
    </div>}

    {tab === 4 && <div className="space-y-3">
      <div className={`${card} space-y-3`}>
        <label htmlFor="bt-curve" className="text-sm font-semibold">{L("Standard curve: one dilution per line: quantity, Ct (replicates allowed)", "منحنی استاندارد: هر خط یک رقت: مقدار، Ct (تکرارها مجاز)")}</label>
        <textarea id="bt-curve" dir="ltr" rows={5} className={mono} value={curveTxt} onChange={(e) => setCurveTxt(e.target.value)} placeholder={"100000, 16.9, 17.0\n10000, 20.3, 20.2\n1000, 23.6, 23.7\n100, 27.0, 26.9\n10, 30.3, 30.4"} />
        <button type="button" className={btn} disabled={!!busy || curveTxt.trim().length < 5} onClick={runCurve}>{busy === "curve" ? L("Running…", "در حال اجرا…") : L("Fit curve", "برازش منحنی")}</button>
        {curve && <div className="space-y-2 text-sm"><div className="grid gap-2 sm:grid-cols-4" dir="ltr">{[["Efficiency", `${curve.efficiency_percent}%`], ["Slope", curve.slope], ["R²", curve.r_squared], ["Intercept", curve.intercept]].map(([k, v]) =>
          <div key={String(k)} className="rounded-lg border border-slate-200 p-3"><p className="text-lg font-bold text-emerald-700">{String(v)}</p><p className="text-xs text-slate-500">{k}</p></div>)}</div>
          {curve.flags.map((f: string) => <p key={f} className="text-amber-700">⚠ {f}</p>)}<Table head={["Quantity", "Mean Ct", "SD", "n"]} rows={curve.points.map((p: any) => [p.quantity, p.mean_ct, p.sd_ct ?? "—", p.n])} /><Src r={curve} /></div>}
      </div>
      <div className={`${card} space-y-3`}>
        <label htmlFor="bt-gn" className="text-sm font-semibold">{L("Reference-gene stability (geNorm): first line = gene names, then one line of Ct values per sample", "پایداری ژن مرجع (geNorm): خط اول نام ژن‌ها، سپس هر خط Ct یک نمونه")}</label>
        <textarea id="bt-gn" dir="ltr" rows={6} className={mono} value={gnTxt} onChange={(e) => setGnTxt(e.target.value)} placeholder={"GAPDH ACTB B2M HPRT1\n18.1 19.0 20.2 24.1\n18.4 19.2 20.1 24.5"} />
        <button type="button" className={btn} disabled={!!busy || gnTxt.trim().length < 10} onClick={runGn}>{busy === "gn" ? L("Running…", "در حال اجرا…") : L("Rank genes", "رتبه‌بندی ژن‌ها")}</button>
        {gn && <div className="space-y-2 text-sm"><p dir="ltr"><b>{L("Most → least stable", "پایدارترین → ناپایدارترین")}:</b> {gn.ranking_most_to_least_stable.map((r: any) => r.gene).join(" > ")}</p>
          <Table head={["Comparison", "V", "< 0.15"]} rows={gn.pairwise_variation.map((p: any) => [p.comparison, p.value, p.below_0_15 ? "✓" : "—"])} /><Src r={gn} /></div>}
      </div>
    </div>}

    {tab === 5 && <div className="space-y-3">
      <form className={`${card} space-y-3`} onSubmit={(e) => { e.preventDefault(); void post("vep", "/bio/variant", { hgvs }, setVep); }}>
        <label htmlFor="bt-hgvs" className="text-sm font-semibold">{L("Variant annotation (Ensembl VEP, human, GRCh38), HGVS notation", "حاشیه‌نویسی واریانت (Ensembl VEP، انسان، GRCh38)، نشانه‌گذاری HGVS")}</label>
        <input id="bt-hgvs" dir="ltr" className={mono} value={hgvs} onChange={(e) => setHgvs(e.target.value)} placeholder="17:g.7674220C>T  or  ENST00000269305:c.743G>A" />
        <button type="submit" className={btn} disabled={!!busy || hgvs.trim().length < 5}>{busy === "vep" ? L("Annotating…", "در حال حاشیه‌نویسی…") : L("Annotate", "حاشیه‌نویسی")}</button>
        {vep && <div className="space-y-2 text-sm" dir="ltr"><p><b>{vep.location}</b> · {vep.alleles} · {vep.assembly} · <b>{vep.most_severe_consequence}</b></p>
          <Table head={["Gene", "Transcript", "Consequence", "Impact", "Protein change"]} rows={vep.transcripts.map((t: any) => [t.gene, `${t.transcript}${t.canonical ? " ★" : ""}`, (t.consequences || []).join(", "), t.impact, t.hgvsp || t.amino_acids || "—"])} />
          {vep.known_variants.length > 0 && <p className="text-xs">Known: {vep.known_variants.map((k: any) => `${k.id}${k.clinical_significance ? ` (${[].concat(k.clinical_significance).join(", ")})` : ""}`).join("; ")}</p>}<Src r={vep} /></div>}
      </form>
      <div className={`${card} space-y-3`}>
        <label htmlFor="bt-snp" className="text-sm font-semibold">{L("Primer SNP check: one primer per line: name, chromosome, start, end, strand (GRCh38 coordinates from your primer mapping)", "بررسی SNP پرایمر: هر خط یک پرایمر: نام، کروموزوم، شروع، پایان، رشته (مختصات GRCh38 از نگاشت پرایمر)")}</label>
        <textarea id="bt-snp" dir="ltr" rows={3} className={mono} value={snpTxt} onChange={(e) => setSnpTxt(e.target.value)} placeholder={"F1, 17, 7674200, 7674219, +\nR1, 17, 7674350, 7674369, -"} />
        <button type="button" className={btn} disabled={!!busy || snpTxt.trim().length < 10} onClick={runSnp}>{busy === "snp" ? L("Checking…", "در حال بررسی…") : L("Check variants under primers", "بررسی واریانت زیر پرایمرها")}</button>
        {snp && <div className="space-y-2 text-sm" dir="ltr">{snp.primers.map((p: any) => <div key={p.name + p.region}><p><b>{p.name || p.region}</b> {p.region} · {p.n_variants} variant(s)</p>
          {p.variants.length > 0 && <Table head={["ID", "Position", "Alleles", "Distance from 3′ end", "Risk"]} rows={p.variants.map((v: any) => [v.id, v.start, (v.alleles || []).join("/"), v.distance_from_3prime_end, v.risk])} />}</div>)}<Src r={snp} /></div>}
      </div>
    </div>}
  </section>;
}
