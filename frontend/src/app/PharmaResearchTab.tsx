"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useState } from "react";

type Target = { ensembl_id: string; symbol: string; mechanisms: string[]; references: { source: string; url: string }[]; url: string };
type Drug = {
  id: string; name: string; drug_type: string; max_clinical_phase: number | null; withdrawn: boolean; description: string;
  action_types: string[]; mechanisms: { mechanism: string; target_name: string; targets: { symbol: string }[]; references: { source: string; url: string }[] }[];
  targets: Target[]; url: string;
};
type Org = { id: string; name: string; role: string };
type Props = {
  call: (path: string, init?: RequestInit) => Promise<any>;
  notify: (m: string, k?: "error" | "ok") => void;
  lang?: string;
  onDesignGene?: (symbol: string) => void;
  onOpenQpcr?: () => void;
};

const L: Record<"en" | "fa", Record<string, string>> = {
  en: {
    title: "Pharma Research", subtitle: "Drug → target → pathway → primers → qPCR, in one research workspace.",
    ruo: "Research use only. Not for diagnosis, treatment or dosing decisions.",
    search: "Search a drug (name or ChEMBL ID)", searchBtn: "Search", noHits: "No drugs found.",
    phase: "Max clinical phase", withdrawn: "Withdrawn", type: "Type", targets: "Molecular targets (curated mechanism of action)",
    noTargets: "No curated mechanism-of-action targets for this drug.", pathways: "Reactome pathways", loadPw: "Show pathways",
    extra: "Extra genes (comma separated, e.g. reference genes or downstream markers)",
    org: "Organization", newOrg: "New organization name", create: "Create", members: "Members", addMember: "Add member",
    memberEmail: "Registered member email", remove: "Remove",
    project: "Save as research project", pname: "Project name", organism: "Organism", model: "Model system (cell line, tissue, animal)",
    dose: "Dose / concentration", duration: "Treatment duration", hypothesis: "Hypothesis and notes (no patient-identifiable data)",
    save: "Save project", projects: "Organization projects", noProjects: "No projects yet.", design: "Design primers", qpcr: "Analyze qPCR",
    del: "Delete", needOrg: "Create or select an organization first.", needGene: "Select at least one gene.",
    saved: "Project saved", source: "Source", retrieved: "Retrieved", userGene: "added by user", otGene: "Open Targets",
    selected: "selected", open: "Open", refs: "References", login: "Log in to use Pharma Research.",
  },
  fa: {
    title: "پژوهش دارویی", subtitle: "دارو ← هدف مولکولی ← مسیر ← پرایمر ← qPCR، در یک فضای پژوهشی.",
    ruo: "فقط برای پژوهش. برای تشخیص، درمان یا تعیین دوز استفاده نشود.",
    search: "جست‌وجوی دارو (نام یا شناسه‌ی ChEMBL)", searchBtn: "جست‌وجو", noHits: "دارویی پیدا نشد.",
    phase: "بالاترین فاز بالینی", withdrawn: "از بازار خارج‌شده", type: "نوع", targets: "اهداف مولکولی (مکانیسم اثر ثبت‌شده)",
    noTargets: "برای این دارو هدف مکانیسمی ثبت‌شده‌ای وجود ندارد.", pathways: "مسیرهای Reactome", loadPw: "نمایش مسیرها",
    extra: "ژن‌های اضافه (با کاما؛ مثلاً ژن مرجع یا نشانگرهای پایین‌دست)",
    org: "سازمان", newOrg: "نام سازمان جدید", create: "ساخت", members: "اعضا", addMember: "افزودن عضو",
    memberEmail: "ایمیل حساب ثبت‌شده", remove: "حذف",
    project: "ذخیره به‌عنوان پروژه‌ی پژوهشی", pname: "نام پروژه", organism: "گونه", model: "مدل آزمایشی (رده‌ی سلولی، بافت، حیوان)",
    dose: "دوز / غلظت", duration: "مدت تیمار", hypothesis: "فرضیه و یادداشت (بدون اطلاعات قابل‌شناسایی بیمار)",
    save: "ذخیره‌ی پروژه", projects: "پروژه‌های سازمان", noProjects: "هنوز پروژه‌ای نیست.", design: "طراحی پرایمر", qpcr: "تحلیل qPCR",
    del: "حذف", needOrg: "اول یک سازمان بسازید یا انتخاب کنید.", needGene: "حداقل یک ژن انتخاب کنید.",
    saved: "پروژه ذخیره شد", source: "منبع", retrieved: "زمان دریافت", userGene: "افزوده‌ی کاربر", otGene: "Open Targets",
    selected: "انتخاب‌شده", open: "باز کردن", refs: "منابع", login: "برای استفاده از پژوهش دارویی وارد شوید.",
  },
};

const input = "w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-white shadow-sm focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15";
const btn = "px-4 py-2 rounded-xl font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition";
const primary = `${btn} bg-[#16233f] text-white hover:bg-[#22325a]`;
const ghost = `${btn} bg-slate-100 text-slate-800 hover:bg-slate-200`;
const chip = "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold border";
const GENE_RE = /^[A-Za-z0-9][A-Za-z0-9.-]{0,23}$/;

function PharmaWorkspace({ call, notify, lang = "en", onDesignGene, onOpenQpcr }: Props) {
  const t = L[lang === "fa" ? "fa" : "en"];
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<any[] | null>(null);
  const [drug, setDrug] = useState<Drug | null>(null);
  const [retrieved, setRetrieved] = useState("");
  const [source, setSource] = useState<any>(null);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [pw, setPw] = useState<Record<string, any[]>>({});
  const [pickedPw, setPickedPw] = useState<Record<string, { id: string; name: string }>>({});
  const [extra, setExtra] = useState("");
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgId, setOrgId] = useState("");
  const [orgName, setOrgName] = useState("");
  const [memberList, setMemberList] = useState<any[]>([]);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState("researcher");
  const [projects, setProjects] = useState<any[]>([]);
  const [form, setForm] = useState({ name: "", organism: "Homo sapiens", model_system: "", dose_text: "", duration_text: "", hypothesis: "" });
  const [authErr, setAuthErr] = useState(false);

  const role = orgs.find((o) => o.id === orgId)?.role || "";
  const canWrite = ["owner", "admin", "researcher"].includes(role);
  const canManage = ["owner", "admin"].includes(role);

  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); }
    catch (e: any) { if (e?.code === "auth") setAuthErr(true); notify(String(e?.message || e)); }
    finally { setBusy(false); }
  }, [notify]);

  const loadOrgs = useCallback(async () => {
    const r = await call("/pharma/organizations");
    const items: Org[] = r.items || [];
    setOrgs(items);
    setOrgId((cur) => (cur && items.some((o) => o.id === cur) ? cur : items[0]?.id || ""));
  }, [call]);

  useEffect(() => { void run(loadOrgs); }, [run, loadOrgs]);

  useEffect(() => {
    if (!orgId) { setProjects([]); setMemberList([]); return; }
    void run(async () => {
      const [p, m] = await Promise.all([
        call(`/pharma/organizations/${encodeURIComponent(orgId)}/projects`),
        call(`/pharma/organizations/${encodeURIComponent(orgId)}/members`),
      ]);
      setProjects(p.items || []); setMemberList(m.items || []);
    });
  }, [orgId, call, run]);

  const search = () => {
    const term = q.trim();
    if (term.length < 2) return;
    void run(async () => {
      const r = await call(`/pharma/drugs/search?q=${encodeURIComponent(term)}`);
      setHits(r.items || []); setSource(r.source);
      if ((r.items || []).length === 1) await openDrug(r.items[0].id);
    });
  };

  const openDrug = async (id: string) => {
    const r = await call(`/pharma/drugs/${encodeURIComponent(id)}`);
    setDrug(r.drug); setRetrieved(r.retrieved_at || ""); setSource(r.source);
    setPicked(Object.fromEntries((r.drug.targets || []).map((x: Target) => [x.symbol, true])));
    setPw({}); setPickedPw({});
    setForm((f) => ({ ...f, name: f.name || `${r.drug.name} target expression study` }));
  };

  const loadPathways = (target: Target) => run(async () => {
    const r = await call(`/pharma/targets/${encodeURIComponent(target.ensembl_id)}/pathways`);
    setPw((x) => ({ ...x, [target.symbol]: r.target?.pathways || [] }));
  });

  const extraGenes = useMemo(() => extra.split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean), [extra]);
  const badExtra = extraGenes.filter((g) => !GENE_RE.test(g));

  const selectedGenes = useMemo(() => {
    const fromTargets = (drug?.targets || []).filter((x) => picked[x.symbol]).map((x) => ({ symbol: x.symbol, ensembl_id: x.ensembl_id, origin: "open_targets" }));
    const seen = new Set(fromTargets.map((g) => g.symbol));
    const fromUser = extraGenes.filter((g) => GENE_RE.test(g) && !seen.has(g)).map((symbol) => ({ symbol, origin: "user" }));
    return [...fromTargets, ...fromUser];
  }, [drug, picked, extraGenes]);

  const createOrg = () => run(async () => {
    const r = await call("/pharma/organizations", { method: "POST", body: JSON.stringify({ name: orgName.trim() }) });
    setOrgName(""); await loadOrgs(); setOrgId(r.id);
  });

  const addMember = () => run(async () => {
    await call(`/pharma/organizations/${encodeURIComponent(orgId)}/members`, { method: "POST", body: JSON.stringify({ email: memberEmail.trim(), role: memberRole }) });
    setMemberEmail("");
    const m = await call(`/pharma/organizations/${encodeURIComponent(orgId)}/members`); setMemberList(m.items || []);
    notify("OK", "ok");
  });

  const removeMember = (uid: number) => run(async () => {
    await call(`/pharma/organizations/${encodeURIComponent(orgId)}/members/${uid}`, { method: "DELETE" });
    setMemberList((x) => x.filter((m) => m.user_id !== uid));
  });

  const saveProject = () => {
    if (!orgId) { notify(t.needOrg); return; }
    if (!selectedGenes.length) { notify(t.needGene); return; }
    void run(async () => {
      const p = await call(`/pharma/organizations/${encodeURIComponent(orgId)}/projects`, {
        method: "POST",
        body: JSON.stringify({ ...form, name: form.name.trim(), drug_chembl_id: drug!.id, genes: selectedGenes, pathways: Object.values(pickedPw) }),
      });
      setProjects((x) => [p, ...x]); notify(t.saved, "ok");
    });
  };

  const deleteProject = (id: string) => run(async () => {
    await call(`/pharma/organizations/${encodeURIComponent(orgId)}/projects/${encodeURIComponent(id)}`, { method: "DELETE" });
    setProjects((x) => x.filter((p) => p.id !== id));
  });

  if (authErr) return <p className="text-sm text-slate-600">{t.login}</p>;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-2xl font-bold text-[#16233f]">{t.title}</h2>
        <p className="text-sm text-slate-600">{t.subtitle}</p>
        <p className="text-xs font-semibold text-amber-800">{t.ruo}</p>
      </header>

      {/* 1. Drug lookup */}
      <section className="rounded-2xl border bg-emerald-50/60 p-4 space-y-3">
        <div className="flex gap-2">
          <input className={input} dir="ltr" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder={t.search} />
          <button type="button" className={primary} disabled={busy || q.trim().length < 2} onClick={search}>{t.searchBtn}</button>
        </div>
        {hits && !hits.length && <p className="text-sm text-slate-600">{t.noHits}</p>}
        {hits && hits.length > 1 && <div className="flex flex-wrap gap-2">
          {hits.map((h) => <button type="button" key={h.id} onClick={() => run(() => openDrug(h.id))}
            className={`${chip} ${drug?.id === h.id ? "bg-[#16233f] text-white border-[#16233f]" : "bg-white border-slate-200 hover:border-emerald-500"}`}>{h.name} · {h.id}</button>)}
        </div>}
      </section>

      {/* 2. Drug detail and targets */}
      {drug && <section className="rounded-2xl border p-4 space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-xl font-bold text-[#16233f]">{drug.name} <span className="text-sm font-mono text-slate-500">{drug.id}</span></h3>
          <a className="text-sm font-semibold text-emerald-700 hover:underline" href={drug.url} target="_blank" rel="noreferrer">{t.open} ↗</a>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {drug.drug_type && <span className={`${chip} bg-slate-50 border-slate-200`}>{t.type}: {drug.drug_type}</span>}
          {drug.max_clinical_phase != null && <span className={`${chip} bg-slate-50 border-slate-200`}>{t.phase}: {drug.max_clinical_phase}</span>}
          {drug.action_types.map((a) => <span key={a} className={`${chip} bg-slate-50 border-slate-200`}>{a}</span>)}
          {drug.withdrawn && <span className={`${chip} bg-red-50 border-red-200 text-red-800`}>{t.withdrawn}</span>}
        </div>
        {drug.description && <p className="text-sm text-slate-700">{drug.description}</p>}

        <div>
          <p className="font-semibold text-sm mb-2">{t.targets}</p>
          {!drug.targets.length ? <p className="text-sm text-slate-600">{t.noTargets}</p> :
            <div className="grid gap-3 md:grid-cols-2">{drug.targets.map((x) => (
              <article key={x.ensembl_id} className={`rounded-xl border p-3 space-y-2 ${picked[x.symbol] ? "border-emerald-500 bg-emerald-50/40" : "border-slate-200"}`}>
                <label className="flex items-center gap-2 font-semibold">
                  <input type="checkbox" checked={!!picked[x.symbol]} onChange={(e) => setPicked((p) => ({ ...p, [x.symbol]: e.target.checked }))} />
                  <span dir="ltr">{x.symbol}</span>
                  <a className="ms-auto text-xs font-mono text-slate-500 hover:underline" href={x.url} target="_blank" rel="noreferrer">{x.ensembl_id}</a>
                </label>
                <p className="text-xs text-slate-600">{x.mechanisms.join(" · ")}</p>
                {x.references.length > 0 && <p className="text-xs">{t.refs}: {x.references.slice(0, 4).map((r, i) =>
                  <a key={i} className="me-2 text-emerald-700 hover:underline" href={r.url} target="_blank" rel="noreferrer">{r.source || "link"}</a>)}</p>}
                <div className="flex flex-wrap gap-2">
                  {onDesignGene && <button type="button" className={ghost} onClick={() => onDesignGene(x.symbol)}>{t.design}</button>}
                  {!pw[x.symbol] && <button type="button" className={ghost} disabled={busy} onClick={() => loadPathways(x)}>{t.loadPw}</button>}
                </div>
                {pw[x.symbol] && <div className="max-h-40 overflow-y-auto space-y-1 text-xs">{pw[x.symbol].map((p) => (
                  <label key={p.id} className="flex items-start gap-2">
                    <input type="checkbox" checked={!!pickedPw[p.id]} onChange={(e) => setPickedPw((s) => {
                      const n = { ...s }; if (e.target.checked) n[p.id] = { id: p.id, name: p.name }; else delete n[p.id]; return n; })} />
                    <a className="hover:underline" href={p.url} target="_blank" rel="noreferrer">{p.name}</a>
                  </label>))}</div>}
              </article>))}</div>}
        </div>
        <label className="block text-sm space-y-1"><span className="font-semibold">{t.extra}</span>
          <input className={input} dir="ltr" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="ACTB, GAPDH, LDLR" /></label>
        {badExtra.length > 0 && <p className="text-xs text-red-700">Invalid: {badExtra.join(", ")}</p>}
        {source && <p className="text-xs text-slate-500">{t.source}: <a className="hover:underline" href={source.url} target="_blank" rel="noreferrer">{source.provider}</a> ({source.license}; {(source.upstream || []).map((u: any) => `${u.name}: ${u.license}`).join("; ")}) · {t.retrieved}: {retrieved ? new Date(retrieved).toLocaleString() : "-"}</p>}
      </section>}

      {/* 3. Organization */}
      <section className="rounded-2xl border p-4 space-y-3">
        <h3 className="font-semibold">{t.org}</h3>
        {orgs.length > 0 && <select className={input} value={orgId} onChange={(e) => setOrgId(e.target.value)}>
          {orgs.map((o) => <option key={o.id} value={o.id}>{o.name} · {o.role}</option>)}</select>}
        <div className="flex gap-2"><input className={input} value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder={t.newOrg} />
          <button type="button" className={primary} disabled={busy || orgName.trim().length < 2} onClick={createOrg}>{t.create}</button></div>
        {orgId && <details className="text-sm"><summary className="cursor-pointer font-semibold">{t.members} ({memberList.length})</summary>
          <ul className="mt-2 space-y-1">{memberList.map((m) => <li key={m.user_id} className="flex items-center gap-2">
            <span dir="ltr">{m.email}</span><span className="text-xs text-slate-500">{m.role}</span>
            {canManage && m.role !== "owner" && <button type="button" className="ms-auto text-xs text-red-700 hover:underline" onClick={() => removeMember(m.user_id)}>{t.remove}</button>}
          </li>)}</ul>
          {canManage && <div className="mt-2 flex flex-wrap gap-2">
            <input className={`${input} flex-1 min-w-[200px]`} type="email" dir="ltr" value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} placeholder={t.memberEmail} />
            <select className="border rounded-xl px-2" value={memberRole} onChange={(e) => setMemberRole(e.target.value)}>
              {(role === "owner" ? ["admin", "researcher", "viewer"] : ["researcher", "viewer"]).map((r) => <option key={r} value={r}>{r}</option>)}</select>
            <button type="button" className={primary} disabled={busy || !memberEmail.trim()} onClick={addMember}>{t.addMember}</button></div>}
        </details>}
      </section>

      {/* 4. Save project */}
      {drug && canWrite && <section className="rounded-2xl border bg-slate-50 p-4 space-y-3">
        <h3 className="font-semibold">{t.project}</h3>
        <p className="text-xs text-slate-600">{selectedGenes.map((g) => g.symbol).join(", ") || "-"} · {Object.keys(pickedPw).length} {t.pathways}</p>
        <div className="grid gap-3 md:grid-cols-2">
          <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t.pname} />
          <input className={input} value={form.organism} onChange={(e) => setForm({ ...form, organism: e.target.value })} placeholder={t.organism} />
          <input className={input} value={form.model_system} onChange={(e) => setForm({ ...form, model_system: e.target.value })} placeholder={t.model} />
          <input className={input} value={form.dose_text} onChange={(e) => setForm({ ...form, dose_text: e.target.value })} placeholder={t.dose} />
          <input className={input} value={form.duration_text} onChange={(e) => setForm({ ...form, duration_text: e.target.value })} placeholder={t.duration} />
        </div>
        <textarea className={input} rows={3} value={form.hypothesis} onChange={(e) => setForm({ ...form, hypothesis: e.target.value })} placeholder={t.hypothesis} />
        <button type="button" className={primary} disabled={busy || !orgId || form.name.trim().length < 2 || !selectedGenes.length || badExtra.length > 0} onClick={saveProject}>{t.save}</button>
      </section>}

      {/* 5. Projects */}
      {orgId && <section className="space-y-2">
        <h3 className="font-semibold">{t.projects}</h3>
        {!projects.length ? <p className="text-sm text-slate-500">{t.noProjects}</p> : projects.map((p) => (
          <article key={p.id} className="rounded-xl border p-3 space-y-2 text-sm">
            <div className="flex flex-wrap items-baseline gap-2"><b>{p.name}</b>
              <span className="text-slate-600">{p.drug_name} ({p.drug_chembl_id}) · {p.organism}{p.model_system ? ` · ${p.model_system}` : ""}</span>
              {canWrite && <button type="button" className="ms-auto text-xs text-red-700 hover:underline" onClick={() => deleteProject(p.id)}>{t.del}</button>}</div>
            {(p.dose_text || p.duration_text) && <p className="text-xs text-slate-600">{[p.dose_text, p.duration_text].filter(Boolean).join(" · ")}</p>}
            <div className="flex flex-wrap gap-2">{(p.genes || []).map((g: any) => (
              <button type="button" key={g.symbol} onClick={() => onDesignGene?.(g.symbol)} title={t.design}
                className={`${chip} ${g.origin === "open_targets" ? "bg-emerald-50 border-emerald-300" : "bg-white border-slate-300"}`}>
                <span dir="ltr">{g.symbol}</span><span className="text-[11px] text-slate-500">{g.origin === "open_targets" ? t.otGene : t.userGene}</span></button>))}</div>
            {(p.pathways || []).length > 0 && <p className="text-xs text-slate-600">{t.pathways}: {p.pathways.map((x: any) => x.name).join(" · ")}</p>}
            {p.hypothesis && <p className="text-xs text-slate-700 whitespace-pre-wrap">{p.hypothesis}</p>}
            <div className="flex flex-wrap gap-2 items-center">
              {onOpenQpcr && <button type="button" className={ghost} onClick={onOpenQpcr}>{t.qpcr}</button>}
              <span className="text-xs text-slate-500">{t.source}: {p.evidence?.source?.provider} · {t.retrieved}: {p.evidence?.retrieved_at ? new Date(p.evidence.retrieved_at).toLocaleString() : "-"}</span>
            </div>
          </article>))}
      </section>}
    </div>
  );
}


// The workspace is mounted only after a server-side authorization check.
// The API independently checks access on every protected route.
export default function PharmaResearchTab(props: Props) {
  const { call, notify } = props;
  const fa = props.lang === "fa";
  const [status, setStatus] = useState<string>("loading");
  const [admin, setAdmin] = useState(false);
  const [org, setOrg] = useState("");
  const [purpose, setPurpose] = useState("");
  const [requests, setRequests] = useState<any[]>([]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      const info = await call("/pharma/access/status");
      setStatus(info.status); setAdmin(!!info.is_admin); setError("");
      if (info.is_admin) {
        const r = await call("/pharma/access/admin/requests");
        setRequests(r.items || []);
      }
    } catch (e: any) {
      setStatus(e?.code === "auth" ? "login" : "error");
      setError(String(e?.message || e));
    }
  }, [call]);
  useEffect(() => { void refresh(); }, [refresh]);
  const requestAccess = async () => {
    setWorking(true); setError("");
    try {
      const r = await call("/pharma/access/request", { method: "POST", body: JSON.stringify({ organization_name: org, purpose }) });
      setStatus(r.status);
    } catch (e: any) { setError(String(e?.message || e)); }
    finally { setWorking(false); }
  };
  const decide = async (id: number, decision: "approved" | "rejected" | "revoked") => {
    const label = decision === "approved" ? (fa ? "تأیید" : "Approve") : decision === "rejected" ? (fa ? "رد" : "Reject") : (fa ? "لغو مجوز" : "Revoke");
    if (!window.confirm(`${label}?`)) return;
    setWorking(true); setError("");
    try {
      await call(`/pharma/access/admin/requests/${id}/decision`, { method: "POST", body: JSON.stringify({ status: decision }) });
      await refresh();
      notify(fa ? "وضعیت مجوز به‌روزرسانی شد" : "Access status updated", "ok");
    } catch (e: any) { setError(String(e?.message || e)); }
    finally { setWorking(false); }
  };
  return <div className="space-y-4">
    {status !== "approved" && <section className="rounded-2xl border border-slate-200 p-5 space-y-3">
      <h2 className="text-xl font-bold text-[#16233f]">{fa ? "دسترسی به پژوهش دارویی" : "Pharma Research access"}</h2>
      {status === "loading" && <p>{fa ? "در حال بررسی دسترسی…" : "Checking access…"}</p>}
      {status === "login" && <p>{fa ? "ابتدا وارد حساب Primer AI شوید." : "Please sign in to Primer AI first."}</p>}
      {status === "pending" && <p>{fa ? "درخواست شما ثبت شده و منتظر بررسی مدیر است." : "Your request is pending administrator review."}</p>}
      {status === "revoked" && <p>{fa ? "مجوز شما لغو شده است. با مدیر تماس بگیرید." : "Your access was revoked. Contact the administrator."}</p>}
      {status === "rejected" && <p>{fa ? "درخواست قبلی رد شد. می‌توانید درخواست تازه ثبت کنید." : "Your previous request was rejected. You can submit a new one."}</p>}
      {(status === "not_requested" || status === "rejected") && <div className="space-y-3">
        <p className="text-sm text-slate-600">{fa ? "برای ادامه، مشخصات سازمان و هدف پژوهش را بفرستید. مدیر دسترسی را بررسی می‌کند." : "To continue, submit your organization and research purpose for review."}</p>
        <label className="block text-sm">{fa ? "نام شرکت یا سازمان" : "Company or organization"}<input className={input} value={org} maxLength={160} onChange={(e) => setOrg(e.target.value)} /></label>
        <label className="block text-sm">{fa ? "هدف پژوهشی" : "Research purpose"}<textarea className={input} value={purpose} maxLength={1000} rows={3} onChange={(e) => setPurpose(e.target.value)} /></label>
        <button type="button" className={primary} disabled={working || org.trim().length < 2 || purpose.trim().length < 5} onClick={() => void requestAccess()}>{fa ? "ثبت درخواست" : "Request access"}</button>
      </div>}
      <button type="button" className={ghost} disabled={working} onClick={() => void refresh()}>{fa ? "بررسی دوباره وضعیت" : "Refresh status"}</button>
    </section>}
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {admin && <details className="rounded-2xl border border-slate-200 p-4">
      <summary className="cursor-pointer font-semibold">{fa ? "مدیریت درخواست‌های دسترسی" : "Manage access requests"} ({requests.length})</summary>
      <p className="mt-2 text-sm text-slate-600">{fa ? "پیش از تأیید، هویت شرکت را جداگانه بررسی کنید." : "Verify the organization independently before approval."}</p>
      {requests.map((r: any) => <article key={r.user_id} className="mt-3 rounded-xl border p-3 space-y-2 text-sm">
        <p><b>{r.organization_name}</b> · <span dir="ltr">{r.email}</span> · {r.status}</p>
        <p className="whitespace-pre-wrap">{r.purpose}</p>
        <div className="flex flex-wrap gap-2">
          {r.status !== "approved" && <button type="button" className={primary} disabled={working} onClick={() => void decide(r.user_id, "approved")}>{fa ? "تأیید" : "Approve"}</button>}
          {r.status === "pending" && <button type="button" className={ghost} disabled={working} onClick={() => void decide(r.user_id, "rejected")}>{fa ? "رد" : "Reject"}</button>}
          {r.status === "approved" && <button type="button" className={ghost} disabled={working} onClick={() => void decide(r.user_id, "revoked")}>{fa ? "لغو مجوز" : "Revoke"}</button>}
        </div>
      </article>)}
    </details>}
    {status === "approved" && <PharmaWorkspace {...props} />}
  </div>;
}
