"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useState } from "react";
import { addToQueue, clearQueue, readQueue, removeFromQueue, type QueueItem } from "./dossierBridge";

type Props = { call: (path: string, init?: RequestInit) => Promise<any>; lang?: string; orgId?: string };

const card = "rounded-xl border border-slate-600 bg-[#172743] p-4";
const field = "w-full rounded-lg border border-slate-500 bg-[#0c182a] px-3 py-2 text-sm text-white placeholder:text-slate-400";
const btn = "rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed";
const btnP = `${btn} bg-emerald-300 text-slate-950 hover:bg-emerald-200`;
const btnG = `${btn} border border-slate-500 text-slate-100 hover:bg-slate-700`;
const sub = "text-xs text-slate-300";
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" } as Record<string, string>)[c]);
const save = (name: string, text: string, type = "text/plain") => {
  const url = URL.createObjectURL(new Blob([text], { type })); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
};

function Bars({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data || {}); const max = Math.max(1, ...entries.map(([, v]) => v));
  if (!entries.length) return <p className={sub}>—</p>;
  return <div className="space-y-1" dir="ltr">{entries.map(([k, v]) => <div key={k} className="flex items-center gap-2 text-xs"><span className="w-36 shrink-0 truncate text-slate-300" title={k}>{k}</span>
    <div className="h-3 flex-1 rounded bg-slate-700"><div className="h-3 rounded bg-emerald-400" style={{ width: `${(100 * v) / max}%` }} /></div><span className="w-8 text-end tabular-nums">{v}</span></div>)}</div>;
}

export default function PharmaWorkspacePanel({ call, lang, orgId }: Props) {
  const fa = lang === "fa";
  const L = (en: string, f: string) => (fa ? f : en);
  const TABS = [L("Dossiers", "پرونده‌ها"), L("Trial landscape", "چشم‌انداز کارآزمایی‌ها"), L("Challenges", "چالش‌ها"), L("Privacy & ledger", "حریم خصوصی و دفتر خروج داده")];
  const [tab, setTab] = useState(0);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const fail = (e: any) => setErr(`${L("Request failed", "درخواست ناموفق بود")}: ${String(e?.message || e)}`);
  const run = async (key: string, fn: () => Promise<void>) => { setBusy(key); setErr(""); setMsg(""); try { await fn(); } catch (e) { fail(e); } finally { setBusy(""); } };
  const api = (path: string, body?: any) => call(`/pharma${path}`, body === undefined ? undefined : { method: "POST", body: JSON.stringify(body) });

  /* ---------------- queue + dossiers ---------------- */
  const [queue, setQueue] = useState<QueueItem[]>([]);
  useEffect(() => { const sync = () => setQueue(readQueue()); sync(); window.addEventListener("primer-dossier-queue", sync); window.addEventListener("storage", sync); return () => { window.removeEventListener("primer-dossier-queue", sync); window.removeEventListener("storage", sync); }; }, []);
  const [list, setList] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [noteText, setNoteText] = useState("");
  const [open, setOpen] = useState<any>(null);
  const [versionNote, setVersionNote] = useState("");
  const [methods, setMethods] = useState<any>(null);
  const [audit, setAudit] = useState<any[] | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [reviewer, setReviewer] = useState("");
  const [comments, setComments] = useState<Record<string, string>>({});

  const loadList = useCallback(async () => { if (orgId) setList((await api(`/organizations/${orgId}/dossiers`)).items); }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (orgId && tab === 0) { void loadList().catch(fail); void api(`/organizations/${orgId}/members`).then((r) => setMembers(r.items || [])).catch(() => setMembers([])); } }, [orgId, tab]); // eslint-disable-line react-hooks/exhaustive-deps
  const sectionsFromQueue = () => [...queue.map((q) => ({ kind: q.kind, title: q.title, data: q.data, text: q.text, added_at: q.added_at })), ...(noteText.trim() ? [{ kind: "note", title: L("Note", "یادداشت"), text: noteText.trim() }] : [])];
  const openDossier = (id: string) => run("open", async () => { setMethods(null); setAudit(null); setOpen(await api(`/organizations/${orgId}/dossiers/${id}`)); });
  const createDossier = () => run("create", async () => {
    const r = await api(`/organizations/${orgId}/dossiers`, { title, sections: sectionsFromQueue() });
    clearQueue(); setTitle(""); setNoteText(""); await loadList(); await openDossier(r.id); setMsg(L("Dossier created (version 1).", "پرونده ساخته شد (نسخهٔ ۱)."));
  });
  const addVersion = () => run("ver", async () => {
    await api(`/organizations/${orgId}/dossiers/${open.id}/versions`, { sections: [...(open.latest?.content?.sections || []), ...sectionsFromQueue()], note: versionNote });
    clearQueue(); setNoteText(""); setVersionNote(""); await openDossier(open.id); await loadList(); setMsg(L("New version saved.", "نسخهٔ جدید ذخیره شد."));
  });
  const loadMethods = () => run("methods", async () => setMethods(await api(`/organizations/${orgId}/dossiers/${open.id}/methods`)));
  const loadAudit = () => run("audit", async () => setAudit((await api(`/organizations/${orgId}/dossiers/${open.id}/audit`)).items));
  const requestReview = () => run("rev", async () => {
    await api(`/organizations/${orgId}/dossiers/${open.id}/reviews`, { version: open.latest_version, reviewer_user_id: parseInt(reviewer, 10) });
    await openDossier(open.id); setMsg(L("Review requested for the latest version.", "درخواست بازبینی برای آخرین نسخه ثبت شد."));
  });
  const decide = (rid: string, status: string) => run("dec", async () => { await api(`/organizations/${orgId}/reviews/${rid}/decision`, { status, comment: comments[rid] || "" }); await openDossier(open.id); });
  const markdown = () => {
    const c = open.latest; const out = [`# ${open.title}`, "", `Version ${c.version} · SHA-256 ${c.sha256}`, `Integrity check: ${c.integrity_ok ? "OK" : "MISMATCH"}`, ""];
    for (const s of c.content.sections || []) {
      out.push(`## ${s.title} (${s.kind})`, "");
      if (s.text) out.push(s.text, "");
      if (s.data && Object.keys(s.data).length) out.push("```json", JSON.stringify(s.data, null, 2).slice(0, 20000), "```", "");
    }
    return out.join("\n");
  };
  const printDossier = () => {
    const w = window.open("", "_blank"); if (!w) { setErr(L("The browser blocked the print window.", "مرورگر پنجرهٔ چاپ را مسدود کرد.")); return; }
    w.document.write(`<html><head><title>${esc(open.title)}</title><style>body{font:14px/1.5 system-ui,sans-serif;max-width:800px;margin:24px auto;padding:0 16px}pre{white-space:pre-wrap;background:#f3f4f6;padding:8px;font-size:11px}h2{margin-top:24px}</style></head><body><pre>${esc(markdown())}</pre></body></html>`);
    w.document.close(); w.focus(); w.print();
  };
  const statusColor = (s: string) => (s === "approved" ? "text-emerald-300" : s === "changes_requested" ? "text-amber-200" : "text-slate-300");

  /* ---------------- landscape ---------------- */
  const [lc, setLc] = useState(""); const [li, setLi] = useState(""); const [lt, setLt] = useState(""); const [land, setLand] = useState<any>(null);

  /* ---------------- challenges ---------------- */
  const [chs, setChs] = useState<any[]>([]); const [sel, setSel] = useState<any>(null); const [board, setBoard] = useState<any>(null); const [lab, setLab] = useState(""); const [cds, setCds] = useState("");
  const [cons, setCons] = useState(""); const [eps, setEps] = useState(""); const [res, setRes] = useState<any>(null);
  const [nk, setNk] = useState("codon"); const [nt, setNt] = useState(""); const [nd, setNd] = useState(""); const [nProt, setNProt] = useState(""); const [nSites, setNSites] = useState("NdeI, XhoI"); const [nGc, setNGc] = useState("40,60");
  const [nRefs, setNRefs] = useState(""); const [nLim, setNLim] = useState("3,12,400"); const [nClose, setNClose] = useState("");
  const loadCh = useCallback(async () => { if (orgId) setChs((await api(`/organizations/${orgId}/challenges`)).items); }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (orgId && tab === 2) void loadCh().catch(fail); }, [orgId, tab]); // eslint-disable-line react-hooks/exhaustive-deps
  const loadBoard = (id: string) => run("board", async () => setBoard(await api(`/organizations/${orgId}/challenges/${id}/leaderboard`)));
  const pick = (c: any) => { setSel(c); setRes(null); setBoard(null); void loadBoard(c.id); };
  const submit = () => run("submit", async () => {
    const payload = sel.kind === "codon" ? { cds } : { construct: cons, epitopes: eps.split(/\s+/).filter(Boolean) };
    setRes(await api(`/organizations/${orgId}/challenges/${sel.id}/submit`, { label: lab, payload })); await loadBoard(sel.id);
  });
  const createCh = () => run("newch", async () => {
    const [a, b2] = nGc.split(",").map(Number); const [mn, mx, ln] = nLim.split(",").map(Number);
    const config = nk === "codon" ? { protein: nProt, forbidden_sites: nSites.split(/[\s,]+/).filter(Boolean), gc_min: a, gc_max: b2 }
      : { references: nRefs.split(/\s+/).filter(Boolean), min_epitopes: mn, max_epitopes: mx, length_max: ln };
    await api(`/organizations/${orgId}/challenges`, { title: nt, description: nd, kind: nk, config, closes_at: nClose ? new Date(nClose).toISOString() : null });
    setNt(""); setNd(""); await loadCh(); setMsg(L("Challenge created.", "چالش ساخته شد."));
  });

  /* ---------------- privacy + ledger ---------------- */
  const [priv, setPriv] = useState<boolean | null>(null); const [ledger, setLedger] = useState<any>(null);
  const loadPriv = () => run("priv", async () => { setPriv((await call("/bio/privacy")).private_mode); setLedger(await call("/bio/egress-log?limit=100")); });
  useEffect(() => { if (tab === 3) void loadPriv(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  const togglePriv = () => run("privset", async () => { const r = await call("/bio/privacy", { method: "POST", body: JSON.stringify({ private_mode: !priv }) }); setPriv(r.private_mode); });

  const noOrg = !orgId;
  return <section id="pharma-workspace" dir={fa ? "rtl" : "ltr"} aria-labelledby="ws-title" className="space-y-4 rounded-2xl border border-slate-600 bg-[#111c34] p-4 text-slate-100">
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">{L("Workspace · research use only", "فضای کار · فقط پژوهشی")}</p>
      <h3 id="ws-title" className="mt-1 text-xl font-bold">{L("Dossiers, review, landscape and challenges", "پرونده، بازبینی، چشم‌انداز و چالش‌ها")}</h3>
      <p className="mt-1 text-sm text-slate-300">{L("Keep every result with its source, parameters and an integrity hash. Versions are append-only and every action is audited. This is a documentation workflow, not a regulatory system.",
        "هر نتیجه را با منبع، پارامترها و هش یکپارچگی نگه دارید. نسخه‌ها فقط اضافه می‌شوند و هر اقدام ثبت می‌شود. این یک گردش‌کار مستندسازی است، نه سامانهٔ نظارتی.")}</p>
    </div>
    <nav aria-label="workspace" className="flex flex-wrap gap-1.5">{TABS.map((n, i) => <button key={n} type="button" aria-current={tab === i ? "page" : undefined} onClick={() => { setTab(i); setErr(""); setMsg(""); }}
      className={`rounded-full border px-3 py-1 text-xs font-semibold ${tab === i ? "border-emerald-300 bg-emerald-300 text-slate-950" : "border-slate-500 text-slate-200 hover:bg-slate-700"}`}>{n}</button>)}</nav>
    {err && <p role="alert" className="text-sm text-amber-200">{err}</p>}
    {msg && <p role="status" className="text-sm text-emerald-300">{msg}</p>}
    {noOrg && tab !== 1 && tab !== 3 && <p className="text-sm text-slate-300">{L("Select or create an organization first (above).", "ابتدا یک سازمان انتخاب یا ایجاد کنید (بالای صفحه).")}</p>}

    {tab === 0 && !noOrg && <div className="space-y-3">
      <div className={card}>
        <div className="flex items-center justify-between gap-2"><h4 className="font-bold text-emerald-200">{L("Queue", "صف")} ({queue.length})</h4>{queue.length > 0 && <button type="button" className={btnG} onClick={clearQueue}>{L("Clear", "پاک کردن")}</button>}</div>
        <p className={sub}>{L("Use “Add to dossier queue” in the vaccine and bioinformatics tools, then file the items here.", "در ابزارهای واکسن و بیوانفورماتیک «افزودن به صف پرونده» را بزنید و اینجا ثبتشان کنید.")}</p>
        <ul className="mt-2 space-y-1 text-sm">{queue.map((q) => <li key={q.id} className="flex items-center justify-between gap-2"><span>{q.title} <span className={sub}>({q.kind})</span></span>
          <button type="button" aria-label={L("Remove", "حذف")} className="text-amber-200" onClick={() => removeFromQueue(q.id)}>×</button></li>)}</ul>
        <label htmlFor="ws-note" className="mt-3 block text-sm">{L("Add a note section (optional)", "افزودن بخش یادداشت (اختیاری)")}</label>
        <textarea id="ws-note" rows={2} className={field} value={noteText} onChange={(e) => setNoteText(e.target.value)} />
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="min-w-48 flex-1 text-sm">{L("New dossier title", "عنوان پروندهٔ جدید")}<input className={`${field} mt-1`} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          <button type="button" className={btnP} disabled={!!busy || title.trim().length < 2 || sectionsFromQueue().length === 0} onClick={createDossier}>{L("Create dossier", "ساخت پرونده")}</button>
        </div>
      </div>
      <div className={card}>
        <h4 className="font-bold text-emerald-200">{L("Dossiers", "پرونده‌ها")}</h4>
        {list.length === 0 ? <p className={sub}>{L("No dossiers yet.", "هنوز پرونده‌ای نیست.")}</p> : <ul className="mt-2 divide-y divide-slate-700 text-sm">{list.map((d) => <li key={d.id} className="flex items-center justify-between gap-2 py-1.5">
          <span>{d.title} <span className={sub}>v{d.latest_version} · {String(d.updated_at || "").slice(0, 10)}</span></span><button type="button" className={btnG} onClick={() => void openDossier(d.id)}>{L("Open", "باز کردن")}</button></li>)}</ul>}
      </div>
      {open && <div className={`${card} space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-lg font-bold">{open.title}</h4>
          {open.latest && <span className={`text-xs ${open.latest.integrity_ok ? "text-emerald-300" : "text-amber-200"}`} dir="ltr">v{open.latest.version} · {open.latest.sha256.slice(0, 16)}… · {open.latest.integrity_ok ? L("integrity OK", "یکپارچگی تأیید شد") : L("INTEGRITY MISMATCH", "ناسازگاری یکپارچگی")}</span>}</div>
        {open.latest && <div className="flex flex-wrap gap-2">
          <button type="button" className={btnG} onClick={() => save(`${open.title.replace(/\W+/g, "-")}-v${open.latest.version}.md`, markdown(), "text/markdown")}>{L("Markdown", "Markdown")}</button>
          <button type="button" className={btnG} onClick={printDossier}>{L("Print / Save as PDF", "چاپ / ذخیره PDF")}</button>
          <button type="button" className={btnG} disabled={!!busy} onClick={loadMethods}>{L("Methods text + checklist", "متن روش‌ها + چک‌لیست")}</button>
          <button type="button" className={btnG} disabled={!!busy} onClick={loadAudit}>{L("Audit trail", "ردپای ممیزی")}</button></div>}
        {open.latest && <div className="space-y-1">{(open.latest.content.sections || []).map((s: any, i: number) => <details key={i} className="rounded-lg border border-slate-600 px-3 py-2"><summary className="cursor-pointer text-sm">{s.title} <span className={sub}>({s.kind})</span></summary>
          {s.text && <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-slate-300" dir="ltr">{s.text.slice(0, 3000)}</pre>}
          {s.data && Object.keys(s.data).length > 0 && <pre className="mt-2 max-h-48 overflow-auto text-[11px] text-slate-400" dir="ltr">{JSON.stringify(s.data, null, 1).slice(0, 3000)}</pre>}</details>)}</div>}
        <div className="flex flex-wrap items-end gap-2"><label className="min-w-48 flex-1 text-sm">{L("Add queue as a new version, note", "افزودن صف به‌عنوان نسخهٔ جدید، یادداشت")}<input className={`${field} mt-1`} value={versionNote} onChange={(e) => setVersionNote(e.target.value)} /></label>
          <button type="button" className={btnP} disabled={!!busy || sectionsFromQueue().length === 0} onClick={addVersion}>{L("Save new version", "ذخیرهٔ نسخهٔ جدید")}</button></div>
        {methods && <div className="space-y-2 rounded-lg border border-slate-600 p-3 text-sm"><p className="font-semibold text-emerald-200">{L("Methods (version", "روش‌ها (نسخهٔ")} {methods.version})</p>
          <p className="whitespace-pre-wrap text-slate-200">{methods.methods.text || L("No section contained enough structured data to write methods.", "هیچ بخشی دادهٔ ساختاریافتهٔ کافی برای نوشتن روش‌ها نداشت.")}</p>
          <p className={sub}>{methods.methods.limits}</p><button type="button" className={btnG} onClick={() => save("methods.txt", methods.methods.text)}>{L("Download .txt", "دانلود .txt")}</button>
          <table className="mt-2 w-full text-start text-xs"><tbody>{methods.checklist.items.map((c: any) => <tr key={c.item} className="border-t border-slate-700"><td className="py-1 pe-3">{c.item}</td>
            <td className={c.status === "documented" ? "text-emerald-300" : "text-amber-200"}>{c.status}</td></tr>)}</tbody></table><p className={sub}>{methods.checklist.note}</p></div>}
        {audit && <ul className="space-y-1 text-xs text-slate-300" dir="ltr">{audit.map((a, i) => <li key={i}>{String(a.at).slice(0, 19)} · user {a.actor_id} · {a.action} · {a.detail}</li>)}</ul>}
        <div className="space-y-2 border-t border-slate-700 pt-3"><h5 className="font-semibold text-emerald-200">{L("Review", "بازبینی")}</h5>
          <div className="flex flex-wrap items-end gap-2"><label className="text-sm">{L("Reviewer", "بازبین")}<select className={`${field} mt-1`} value={reviewer} onChange={(e) => setReviewer(e.target.value)}><option value="">—</option>
            {members.filter((m) => m.role !== "viewer").map((m) => <option key={m.user_id} value={m.user_id}>{m.email} ({m.role})</option>)}</select></label>
            <button type="button" className={btnG} disabled={!!busy || !reviewer || !open.latest_version} onClick={requestReview}>{L("Request review of latest version", "درخواست بازبینی آخرین نسخه")}</button></div>
          <ul className="space-y-2 text-sm">{open.reviews.map((r: any) => <li key={r.id} className="rounded-lg border border-slate-600 p-2"><span dir="ltr">v{r.version} · {r.sha256.slice(0, 10)}…</span> · <span className={statusColor(r.status)}>{r.status}</span>{r.comment && <span className={sub}> · {r.comment}</span>}
            {r.mine && r.status === "requested" && <div className="mt-2 flex flex-wrap items-center gap-2"><input aria-label={L("Comment", "توضیح")} className={`${field} max-w-xs`} placeholder={L("Comment", "توضیح")} value={comments[r.id] || ""} onChange={(e) => setComments((c) => ({ ...c, [r.id]: e.target.value }))} />
              <button type="button" className={btnP} disabled={!!busy} onClick={() => void decide(r.id, "approved")}>{L("Approve", "تأیید")}</button>
              <button type="button" className={btnG} disabled={!!busy} onClick={() => void decide(r.id, "changes_requested")}>{L("Request changes", "درخواست اصلاح")}</button></div>}</li>)}</ul>
          <p className={sub}>{L("An approval is bound to the exact version and hash that was reviewed. Newer versions need a new review.", "تأیید به همان نسخه و هش بازبینی‌شده وابسته است. نسخه‌های جدید بازبینی جدید می‌خواهند.")}</p></div>
      </div>}
    </div>}

    {tab === 1 && <div className="space-y-3">
      <form className={`${card} flex flex-wrap items-end gap-2`} onSubmit={(e) => { e.preventDefault(); void run("land", async () => setLand(await api("/workspace/landscape", { condition: lc, intervention: li, term: lt }))); }}>
        <label className="min-w-40 flex-1 text-sm">{L("Condition", "بیماری / وضعیت")}<input className={`${field} mt-1`} value={lc} onChange={(e) => setLc(e.target.value)} placeholder="triple negative breast cancer" /></label>
        <label className="min-w-40 flex-1 text-sm">{L("Intervention / target", "مداخله / هدف")}<input className={`${field} mt-1`} value={li} onChange={(e) => setLi(e.target.value)} placeholder="pembrolizumab" /></label>
        <label className="min-w-40 flex-1 text-sm">{L("Free text", "متن آزاد")}<input className={`${field} mt-1`} value={lt} onChange={(e) => setLt(e.target.value)} /></label>
        <button type="submit" className={btnP} disabled={!!busy || !(lc || li || lt).trim()}>{busy === "land" ? L("Searching…", "در حال جست‌وجو…") : L("Analyze landscape", "تحلیل چشم‌انداز")}</button>
      </form>
      {land && <div className={`${card} space-y-3 text-sm`}>
        <p dir="ltr"><b>{land.total ?? "?"}</b> {L("matching studies; analysed", "مطالعهٔ مطابق؛ تحلیل‌شده")} <b>{land.n_analysed}</b> · {L("median enrollment", "میانهٔ ثبت‌نام")} {land.median_enrollment ?? "—"}</p>
        <div className="grid gap-4 md:grid-cols-2"><div><p className="mb-1 font-semibold">{L("By phase", "بر اساس فاز")}</p><Bars data={land.by_phase} /></div><div><p className="mb-1 font-semibold">{L("By status", "بر اساس وضعیت")}</p><Bars data={land.by_status} /></div>
          <div><p className="mb-1 font-semibold">{L("Sponsor class", "نوع حامی")}</p><Bars data={land.by_sponsor_class} /></div><div><p className="mb-1 font-semibold">{L("Start year", "سال شروع")}</p><Bars data={land.by_start_year} /></div>
          <div><p className="mb-1 font-semibold">{L("Top sponsors", "حامیان اصلی")}</p><Bars data={Object.fromEntries(land.top_sponsors.map((s: any) => [s.name, s.studies]))} /></div>
          <div><p className="mb-1 font-semibold">{L("Top interventions", "مداخله‌های اصلی")}</p><Bars data={Object.fromEntries(land.top_interventions.map((s: any) => [s.name, s.studies]))} /></div></div>
        <div className="overflow-x-auto"><table className="w-full text-start text-xs" dir="ltr"><thead className="text-slate-400"><tr><th className="p-1 text-start">NCT</th><th className="p-1 text-start">Title</th><th className="p-1 text-start">Phase</th><th className="p-1 text-start">Status</th><th className="p-1 text-start">Sponsor</th></tr></thead>
          <tbody>{land.studies.map((s: any) => <tr key={s.nct_id} className="border-t border-slate-700"><td className="p-1"><a href={s.url} target="_blank" rel="noreferrer" className="text-emerald-200 underline">{s.nct_id} ↗</a></td><td className="p-1">{s.title}</td><td className="p-1">{s.phase}</td><td className="p-1">{s.status}</td><td className="p-1">{s.sponsor}</td></tr>)}</tbody></table></div>
        <p className={sub}>{land.provider} · {String(land.retrieved_at).slice(0, 19)} · {land.limits}</p>
        <button type="button" className={btnG} onClick={() => setMsg(addToQueue({ kind: "landscape", title: L("Trial landscape", "چشم‌انداز کارآزمایی‌ها"), data: land }).ok ? L("Added to the dossier queue.", "به صف پرونده افزوده شد.") : L("Could not queue.", "افزودن ممکن نشد."))}>{L("Add to dossier queue", "افزودن به صف پرونده")}</button>
      </div>}
    </div>}

    {tab === 2 && !noOrg && <div className="space-y-3">
      <div className={card}><h4 className="font-bold text-emerald-200">{L("Challenges in this organization", "چالش‌های این سازمان")}</h4>
        {chs.length === 0 ? <p className={sub}>{L("No challenges yet.", "هنوز چالشی نیست.")}</p> : <ul className="mt-2 space-y-1 text-sm">{chs.map((c) => <li key={c.id} className="flex items-center justify-between gap-2"><span>{c.title} <span className={sub}>({c.kind} · {c.open ? L("open", "باز") : L("closed", "بسته")})</span></span>
          <button type="button" className={btnG} onClick={() => pick(c)}>{L("Open", "باز کردن")}</button></li>)}</ul>}
      </div>
      {sel && <div className={`${card} space-y-3 text-sm`}><h4 className="text-lg font-bold">{sel.title}</h4><p className="text-slate-300">{sel.description}</p>
        <div><p className="font-semibold text-emerald-200">{L("How you are scored", "نحوهٔ امتیازدهی")}</p><ul className="list-disc ps-5 text-xs text-slate-300">{sel.rubric.map((r: string) => <li key={r}>{r}</li>)}</ul></div>
        {sel.kind === "codon" ? <p className="text-xs" dir="ltr">Protein ({sel.task.protein.length} aa): <span className="break-all font-mono">{sel.task.protein}</span> · forbidden: {(sel.task.forbidden_sites || []).join(", ") || "—"} · GC {sel.task.gc_min}–{sel.task.gc_max}%</p>
          : <details className="text-xs"><summary className="cursor-pointer">{sel.task.n_references} {L("reference sequences", "توالی مرجع")} · {sel.task.min_epitopes}–{sel.task.max_epitopes} {L("epitopes", "اپی‌توپ")} · ≤{sel.task.length_max} aa</summary><pre className="mt-1 max-h-40 overflow-auto font-mono text-[11px]" dir="ltr">{(sel.task.references || []).join("\n")}</pre></details>}
        {sel.open && <div className="space-y-2">
          <label className="block">{L("Team or participant label", "نام تیم یا شرکت‌کننده")}<input className={`${field} mt-1`} value={lab} onChange={(e) => setLab(e.target.value)} /></label>
          {sel.kind === "codon" ? <label className="block">{L("Your coding sequence (DNA)", "توالی کدکنندهٔ شما (DNA)")}<textarea rows={4} dir="ltr" className={`${field} mt-1 font-mono text-xs`} value={cds} onChange={(e) => setCds(e.target.value)} /></label>
            : <><label className="block">{L("Construct (amino acids)", "سازه (اسیدآمینه)")}<textarea rows={3} dir="ltr" className={`${field} mt-1 font-mono text-xs`} value={cons} onChange={(e) => setCons(e.target.value)} /></label>
              <label className="block">{L("Epitopes used (one per line)", "اپی‌توپ‌های استفاده‌شده (هر خط یکی)")}<textarea rows={3} dir="ltr" className={`${field} mt-1 font-mono text-xs`} value={eps} onChange={(e) => setEps(e.target.value)} /></label></>}
          <button type="button" className={btnP} disabled={!!busy || lab.trim().length < 2} onClick={submit}>{busy === "submit" ? L("Scoring…", "در حال امتیازدهی…") : L("Submit", "ارسال")}</button></div>}
        {res && <div className="rounded-lg border border-slate-600 p-3"><p className="text-2xl font-bold text-emerald-300" dir="ltr">{res.score}</p>{!res.valid && <p className="text-amber-200">{res.reason}</p>}
          <p className="text-xs text-slate-300" dir="ltr">{Object.entries(res.parts || {}).map(([k, v]) => `${k}: ${v}`).join(" · ")}</p></div>}
        {board && <div><p className="font-semibold text-emerald-200">{L("Leaderboard", "جدول امتیاز")} ({board.n_participants})</p><ol className="mt-1 space-y-0.5 text-sm" dir="ltr">{board.items.map((b: any) => <li key={b.rank} className={b.mine ? "font-bold text-emerald-300" : ""}>{b.rank}. {b.label} — {b.score}</li>)}</ol>
          <p className={sub}>{L("Best valid score per participant; ties go to the earlier submission.", "بهترین امتیاز معتبر هر شرکت‌کننده؛ در تساوی، ارسال زودتر برنده است.")}</p></div>}
      </div>}
      <details className={card}><summary className="cursor-pointer font-bold text-emerald-200">{L("Create a challenge (organization owners and admins)", "ساخت چالش (مالک و مدیر سازمان)")}</summary>
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex flex-wrap gap-2"><label className="min-w-48 flex-1">{L("Title", "عنوان")}<input className={`${field} mt-1`} value={nt} onChange={(e) => setNt(e.target.value)} /></label>
            <label>{L("Type", "نوع")}<select className={`${field} mt-1`} value={nk} onChange={(e) => setNk(e.target.value)}><option value="codon">{L("Codon optimization", "بهینه‌سازی کدون")}</option><option value="construct">{L("Multi-epitope construct", "سازهٔ چنداپی‌توپی")}</option></select></label>
            <label>{L("Closes at (optional)", "پایان (اختیاری)")}<input type="datetime-local" className={`${field} mt-1`} value={nClose} onChange={(e) => setNClose(e.target.value)} /></label></div>
          <label className="block">{L("Description", "توضیح")}<textarea rows={2} className={`${field} mt-1`} value={nd} onChange={(e) => setNd(e.target.value)} /></label>
          {nk === "codon" ? <><label className="block">{L("Protein to encode", "پروتئین برای کدگذاری")}<textarea rows={2} dir="ltr" className={`${field} mt-1 font-mono text-xs`} value={nProt} onChange={(e) => setNProt(e.target.value)} /></label>
            <div className="flex flex-wrap gap-2"><label className="min-w-48 flex-1">{L("Forbidden enzymes", "آنزیم‌های ممنوع")}<input dir="ltr" className={`${field} mt-1`} value={nSites} onChange={(e) => setNSites(e.target.value)} /></label>
              <label>{L("GC min,max (%)", "GC کمینه،بیشینه (٪)")}<input dir="ltr" className={`${field} mt-1 w-28`} value={nGc} onChange={(e) => setNGc(e.target.value)} /></label></div></>
            : <><label className="block">{L("Reference sequences (one per line)", "توالی‌های مرجع (هر خط یکی)")}<textarea rows={3} dir="ltr" className={`${field} mt-1 font-mono text-xs`} value={nRefs} onChange={(e) => setNRefs(e.target.value)} /></label>
              <label className="block">{L("Min epitopes, max epitopes, max length", "حداقل اپی‌توپ، حداکثر اپی‌توپ، حداکثر طول")}<input dir="ltr" className={`${field} mt-1 w-40`} value={nLim} onChange={(e) => setNLim(e.target.value)} /></label></>}
          <button type="button" className={btnP} disabled={!!busy || nt.trim().length < 2} onClick={createCh}>{L("Create challenge", "ساخت چالش")}</button>
        </div></details>
    </div>}

    {tab === 3 && <div className="space-y-3">
      <div className={card}><div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="font-bold text-emerald-200">{L("Private mode", "حالت خصوصی")}</h4>
        <p className={sub}>{L("When on, tools that send data to external services (IEDB, UniProt, g:Profiler, STRING, NCBI, Ensembl, ClinicalTrials.gov) are refused for your account. Local calculations keep working.",
          "وقتی روشن باشد، ابزارهایی که داده را به سرویس‌های بیرونی می‌فرستند (IEDB، UniProt، g:Profiler، STRING، NCBI، Ensembl، ClinicalTrials.gov) برای حساب شما رد می‌شوند. محاسبات محلی کار می‌کنند.")}</p></div>
        <button type="button" className={priv ? btnP : btnG} disabled={!!busy || priv === null} aria-pressed={!!priv} onClick={togglePriv}>{priv ? L("On — turn off", "روشن — خاموش کن") : L("Off — turn on", "خاموش — روشن کن")}</button></div></div>
      <div className={card}><div className="flex items-center justify-between"><h4 className="font-bold text-emerald-200">{L("Data egress ledger", "دفتر خروج داده")}</h4><button type="button" className={btnG} disabled={!!busy} onClick={loadPriv}>{L("Refresh", "تازه‌سازی")}</button></div>
        {ledger && <><p className={sub}>{ledger.note}</p>{ledger.items.length === 0 ? <p className="mt-2 text-sm text-slate-300">{L("No external calls recorded yet.", "هنوز تماس بیرونی ثبت نشده است.")}</p> :
          <div className="mt-2 overflow-x-auto"><table className="w-full text-start text-xs" dir="ltr"><thead className="text-slate-400"><tr><th className="p-1 text-start">Time</th><th className="p-1 text-start">Provider</th><th className="p-1 text-start">Operation</th><th className="p-1 text-start">Payload SHA-256</th><th className="p-1 text-start">Bytes</th><th className="p-1 text-start">Status</th></tr></thead>
            <tbody>{ledger.items.map((e: any) => <tr key={e.id} className="border-t border-slate-700"><td className="p-1">{String(e.created_at).slice(0, 19)}</td><td className="p-1">{e.provider}</td><td className="p-1">{e.operation}</td><td className="p-1 font-mono">{e.payload_sha256.slice(0, 12)}…</td><td className="p-1">{e.payload_bytes}</td><td className="p-1">{e.status}</td></tr>)}</tbody></table></div>}</>}</div>
    </div>}
  </section>;
}
