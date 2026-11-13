"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useState } from "react";
import DrugResearchPanel from "./DrugResearchPanel";
import PharmaDashboard from "./PharmaDashboard";
import PharmaStructureViewer from "./PharmaStructureViewer";

type Target = { ensembl_id: string; symbol: string; mechanisms: string[]; references: { source: string; url: string }[]; url: string };
type Drug = {
  id: string; name: string; drug_type: string; max_clinical_phase: number | null; clinical_stage?: string | null; withdrawn: boolean | null; description: string;
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
    title: "Research Data Bank",
    catalogTitle: "Unified research search", catalogHint: "Search across trusted public research databases. Every result keeps its source, link and retrieval time.",
    catalogQuery: "Search a drug, gene, protein, disease, pathway, trial or paper",
    catalogSearchBtn: "Search all sources", catalogKind: "Record type",
    catalogAll: "All record types", catalogDrug: "Drugs & compounds", catalogTarget: "Genes & proteins",
    catalogDisease: "Diseases & biological terms", catalogPathway: "Pathways", catalogTrial: "Clinical trials", catalogPublication: "Publications",
    catalogNoResults: "No matching records found.", catalogWait: "Searching public research sources…",
    catalogSourceIssue: "A source could not be reached. Other results are still shown.",
    catalogSave: "Save to organization bank", catalogSaved: "Already in bank", catalogNeedOrg: "Create or select an organization to save records.",
    catalogOpenDrug: "Open drug record", catalogDesign: "Design primers", catalogRetrieved: "Retrieved",
    catalogBank: "Organization research bank", catalogBankHint: "Saved records stay linked to their original public source.",
    catalogBankEmpty: "No saved records yet. Save useful search results to build your bank.",
    catalogRemove: "Remove from bank", catalogRemoveConfirm: "Remove this record from the organization bank?",
    catalogItemSaved: "Record saved to organization bank",
    drugWorkspace: "Drug mechanism workspace", drugWorkspaceHint: "Deep dive into curated drug mechanisms, targets and pathways.",
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
    selected: "selected", open: "Open", refs: "References", login: "Log in to use the Research Data Bank.",
  },
  fa: {
    title: "بانک داده پژوهشی",
    catalogTitle: "جست‌وجوی یکپارچه پژوهشی", catalogHint: "در منابع عمومی معتبر جست‌وجو کنید؛ هر نتیجه منبع، پیوند و زمان دریافت را نگه می‌دارد.",
    catalogQuery: "جست‌وجوی دارو، ژن، پروتئین، بیماری، مسیر، کارآزمایی یا مقاله",
    catalogSearchBtn: "جست‌وجو در همه منابع", catalogKind: "نوع رکورد",
    catalogAll: "همه‌ی انواع", catalogDrug: "دارو و ترکیب", catalogTarget: "ژن و پروتئین",
    catalogDisease: "بیماری و مفاهیم زیستی", catalogPathway: "مسیر زیستی", catalogTrial: "کارآزمایی بالینی", catalogPublication: "مقاله",
    catalogNoResults: "رکوردی پیدا نشد.", catalogWait: "در حال جست‌وجو در منابع پژوهشی عمومی…",
    catalogSourceIssue: "یکی از منابع در دسترس نبود؛ نتایج منابع دیگر نمایش داده می‌شوند.",
    catalogSave: "ذخیره در بانک سازمان", catalogSaved: "قبلاً ذخیره شده", catalogNeedOrg: "برای ذخیره، یک سازمان بسازید یا انتخاب کنید.",
    catalogOpenDrug: "نمایش رکورد دارو", catalogDesign: "طراحی پرایمر", catalogRetrieved: "زمان دریافت",
    catalogBank: "بانک پژوهشی سازمان", catalogBankHint: "رکوردهای ذخیره‌شده به منبع عمومی اصلی پیوند دارند.",
    catalogBankEmpty: "هنوز رکوردی ذخیره نشده؛ نتایج مفید را به بانک اضافه کنید.",
    catalogRemove: "حذف از بانک", catalogRemoveConfirm: "این رکورد از بانک سازمان حذف شود؟",
    catalogItemSaved: "رکورد در بانک سازمان ذخیره شد",
    drugWorkspace: "فضای بررسی مکانیسم دارو", drugWorkspaceHint: "بررسی مکانیسم ثبت‌شده، اهداف مولکولی و مسیرهای زیستی دارو.",
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
    selected: "انتخاب‌شده", open: "باز کردن", refs: "منابع", login: "برای استفاده از بانک داده پژوهشی وارد شوید.",
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
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogKind, setCatalogKind] = useState("all");
  const [catalogItems, setCatalogItems] = useState<any[] | null>(null);
  const [catalogSources, setCatalogSources] = useState<any[]>([]);
  const [catalogErrors, setCatalogErrors] = useState<any[]>([]);
  const [catalogRetrieved, setCatalogRetrieved] = useState("");
  const [catalogBusy, setCatalogBusy] = useState(false);
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
  const [libraryItems, setLibraryItems] = useState<any[]>([]);
  const [orgDataState, setOrgDataState] = useState<"no-org" | "loading" | "ready" | "error">("no-org");
  const [loadedOrgId, setLoadedOrgId] = useState("");
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
    let active = true;
    setProjects([]); setMemberList([]); setLibraryItems([]);
    if (!orgId) { setOrgDataState("no-org"); return () => { active = false; }; }
    setOrgDataState("loading");
    void (async () => {
      try {
        const [p, m, l] = await Promise.all([
          call(`/pharma/organizations/${encodeURIComponent(orgId)}/projects`),
          call(`/pharma/organizations/${encodeURIComponent(orgId)}/members`),
          call(`/pharma/organizations/${encodeURIComponent(orgId)}/library`),
        ]);
        if (!active) return;
        setProjects(p.items || []); setMemberList(m.items || []); setLibraryItems(l.items || []);
        setLoadedOrgId(orgId); setOrgDataState("ready");
      } catch (e: any) {
        if (!active) return;
        setOrgDataState("error");
        if (e?.code === "auth") setAuthErr(true);
        notify(String(e?.message || e));
      }
    })();
    return () => { active = false; };
  }, [orgId, call, notify]);

  const search = () => {
    const term = q.trim();
    if (term.length < 2) return;
    void run(async () => {
      const r = await call(`/pharma/drugs/search?q=${encodeURIComponent(term)}`);
      setHits(r.items || []); setSource(r.source);
      if ((r.items || []).length === 1) await openDrug(r.items[0].id);
    });
  };

  const searchCatalog = () => {
    const term = catalogQuery.trim();
    if (term.length < 2) return;
    setCatalogBusy(true);
    void (async () => {
      try {
        const r = await call(`/pharma/catalog/search?q=${encodeURIComponent(term)}&kind=${encodeURIComponent(catalogKind)}`);
        setCatalogItems(r.items || []);
        setCatalogSources(r.sources || []);
        setCatalogErrors(r.source_errors || []);
        setCatalogRetrieved(r.retrieved_at || "");
      } catch (e: any) {
        if (e?.code === "auth") setAuthErr(true);
        notify(String(e?.message || e));
      } finally {
        setCatalogBusy(false);
      }
    })();
  };

  const saveCatalogItem = (item: any) => run(async () => {
    if (!orgId) { notify(t.catalogNeedOrg); return; }
    const response = await call(`/pharma/organizations/${encodeURIComponent(orgId)}/library`, {
      method: "POST",
      body: JSON.stringify({
        kind: item.type, source_id: item.id, title: item.title, summary: item.summary || "",
        url: item.url, provider: item.provider, license: item.license || "",
        retrieved_at: item.retrieved_at || catalogRetrieved, details: item,
      }),
    });
    const saved = response.item;
    setLibraryItems((items) => [saved, ...items.filter((x) => x.id !== saved.id)]);
    notify(response.already_saved ? t.catalogSaved : t.catalogItemSaved, "ok");
  });

  const removeCatalogItem = (id: string) => run(async () => {
    if (!window.confirm(t.catalogRemoveConfirm)) return;
    await call(`/pharma/organizations/${encodeURIComponent(orgId)}/library/${encodeURIComponent(id)}`, { method: "DELETE" });
    setLibraryItems((items) => items.filter((item) => item.id !== id));
  });

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
      <PharmaDashboard lang={lang} organizationName={orgs.find((org) => org.id === orgId)?.name || ""}
        state={orgDataState === "ready" && loadedOrgId !== orgId ? "loading" : orgDataState} projects={projects} records={libraryItems}
        onTrials={() => {
          setCatalogKind("trial");
          document.getElementById("pharma-catalog-query")?.focus();
          document.getElementById("pharma-catalog")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }} />

      <PharmaStructureViewer call={call} lang={lang} />

      {/* Unified, source-linked research catalog */}
      <section id="pharma-catalog" className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-4">
        <div>
          <h3 className="text-lg font-bold text-[#16233f]">{t.catalogTitle}</h3>
          <p className="mt-1 text-sm text-slate-600">{t.catalogHint}</p>
        </div>
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_220px_auto]">
          <input id="pharma-catalog-query" className={input} dir="auto" value={catalogQuery}
            onChange={(e) => setCatalogQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && searchCatalog()}
            placeholder={t.catalogQuery} />
          <select aria-label={t.catalogKind} className={input} value={catalogKind}
            onChange={(e) => setCatalogKind(e.target.value)}>
            <option value="all">{t.catalogAll}</option>
            <option value="drug">{t.catalogDrug}</option>
            <option value="target">{t.catalogTarget}</option>
            <option value="disease">{t.catalogDisease}</option>
            <option value="pathway">{t.catalogPathway}</option>
            <option value="trial">{t.catalogTrial}</option>
            <option value="publication">{t.catalogPublication}</option>
          </select>
          <button type="button" className={primary} disabled={catalogBusy || catalogQuery.trim().length < 2}
            onClick={searchCatalog}>{catalogBusy ? t.catalogWait : t.catalogSearchBtn}</button>
        </div>
        {catalogErrors.length > 0 && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          {t.catalogSourceIssue} <span className="text-xs">{catalogErrors.map((x: any) => x.provider).join(", ")}</span>
        </p>}
        {catalogItems && !catalogItems.length && <p className="text-sm text-slate-600">{t.catalogNoResults}</p>}
        {catalogItems && catalogItems.length > 0 && <div className="grid gap-3 md:grid-cols-2">
          {catalogItems.map((item: any) => {
            const typeLabel = item.type === "drug" ? t.catalogDrug
              : item.type === "target" ? t.catalogTarget
              : item.type === "disease" ? t.catalogDisease
              : item.type === "pathway" ? t.catalogPathway
              : item.type === "trial" ? t.catalogTrial : t.catalogPublication;
            const inBank = libraryItems.some((saved: any) => saved.kind === item.type && saved.source_id === item.id);
            return <article key={`${item.provider}:${item.type}:${item.id}`} className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
              <div className="flex flex-wrap items-start gap-2">
                <span className={`${chip} bg-emerald-50 border-emerald-200`}>{typeLabel}</span>
                <a className="min-w-0 flex-1 font-semibold text-[#16233f] hover:underline"
                  href={item.url} target="_blank" rel="noreferrer">{item.title} ↗</a>
              </div>
              <p className="break-all text-[11px] font-mono text-slate-500">{item.id}</p>
              {item.summary && <p className="whitespace-pre-wrap text-sm text-slate-700">{item.summary}</p>}
              <p className="text-xs text-slate-500">
                {t.source}: {item.provider}{item.license ? ` · ${item.license}` : ""}
                {item.retrieved_at && ` · ${t.catalogRetrieved}: ${new Date(item.retrieved_at).toLocaleString()}`}
              </p>
              <div className="flex flex-wrap gap-2">
                {item.type === "drug" && <button type="button" className={ghost}
                  disabled={busy} onClick={() => run(() => openDrug(item.id))}>{t.catalogOpenDrug}</button>}
                {item.type === "target" && onDesignGene && GENE_RE.test(item.title) &&
                  <button type="button" className={ghost} onClick={() => onDesignGene(item.title)}>{t.catalogDesign}</button>}
                {canWrite && <button type="button" className={ghost} disabled={busy || !orgId || inBank}
                  onClick={() => saveCatalogItem(item)}>{inBank ? t.catalogSaved : t.catalogSave}</button>}
              </div>
            </article>;
          })}
        </div>}
        {catalogSources.length > 0 && <p className="text-xs text-slate-500">
          {t.source}: {catalogSources.map((source: any) =>
            <a key={source.provider} className="me-2 text-emerald-800 hover:underline"
              href={source.url} target="_blank" rel="noreferrer">{source.provider}</a>)}
        </p>}
      </section>

      {/* Drug-specific mechanism and pathway workspace */}
      <section className="space-y-1">
        <h3 className="text-lg font-bold text-[#16233f]">{t.drugWorkspace}</h3>
        <p className="text-sm text-slate-600">{t.drugWorkspaceHint}</p>
      </section>

      {/* Drug lookup */}
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
          {(drug.clinical_stage || drug.max_clinical_phase != null) && <span className={`${chip} bg-slate-50 border-slate-200`}>{t.phase}: {drug.clinical_stage ?? drug.max_clinical_phase}</span>}
          {drug.action_types.map((a) => <span key={a} className={`${chip} bg-slate-50 border-slate-200`}>{a}</span>)}
          {drug.withdrawn && <span className={`${chip} bg-red-50 border-red-200 text-red-800`}>{t.withdrawn}</span>}
          {drug.withdrawn == null && <span className={`${chip} bg-amber-50 border-amber-200 text-amber-900`}>{lang === "fa" ? "وضعیت خروج از بازار در این رکورد نامشخص است" : "Withdrawal status not provided in this record"}</span>}
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

      {drug && <DrugResearchPanel drug={drug} call={call} lang={lang} />}

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

      {orgId && <section className="space-y-3">
        <div>
          <h3 className="font-semibold">{t.catalogBank} ({libraryItems.length})</h3>
          <p className="text-xs text-slate-500">{t.catalogBankHint}</p>
        </div>
        {!libraryItems.length ? <p className="text-sm text-slate-500">{t.catalogBankEmpty}</p> :
          <div className="grid gap-2 md:grid-cols-2">{libraryItems.map((item: any) => (
            <article key={item.id} className="rounded-xl border p-3 space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <a className="flex-1 font-semibold text-[#16233f] hover:underline"
                  href={item.url} target="_blank" rel="noreferrer">{item.title} ↗</a>
                {item.can_delete && <button type="button" className="text-xs text-red-700 hover:underline"
                  onClick={() => removeCatalogItem(item.id)}>{t.catalogRemove}</button>}
              </div>
              <p className="text-xs text-slate-500">{item.kind} · {item.source_id} · {item.provider}</p>
              {item.summary && <p className="text-xs text-slate-700">{item.summary}</p>}
              <p className="text-[11px] text-slate-500">
                {item.license}{item.created_at ? ` · ${new Date(item.created_at).toLocaleDateString()}` : ""}
              </p>
            </article>
          ))}</div>}
      </section>}

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
      <h2 className="text-xl font-bold text-[#16233f]">{fa ? "دسترسی به بانک داده پژوهشی" : "Research Data Bank access"}</h2>
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
