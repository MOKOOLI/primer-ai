"use client";
import { useEffect, useMemo, useRef, useState } from "react";

type Target = {
  ensembl_id: string;
  symbol: string;
  mechanisms: string[];
  references: { source: string; url: string }[];
  url: string;
};
type Drug = { id: string; name: string; targets: Target[] };
type Props = { drug: Drug; call: (path: string, init?: RequestInit) => Promise<any>; lang?: string };
type IntelligenceSource = { provider: string; data: any; error: string | null; retrieved_at: string | null };

export default function DrugResearchPanel({ drug, call, lang }: Props) {
  const fa = lang === "fa";
  const [chosen, setChosen] = useState("");
  const [associations, setAssociations] = useState<any>(null);
  const [associationError, setAssociationError] = useState("");
  const [loadingAssociations, setLoadingAssociations] = useState(false);
  const [sources, setSources] = useState<IntelligenceSource[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [requestError, setRequestError] = useState("");
  const associationRequest = useRef(0);
  const intelligenceRequest = useRef(0);
  const targets = useMemo(() => drug.targets.slice(0, 12), [drug.targets]);
  const selected = targets.find((x) => x.ensembl_id === chosen);

  useEffect(() => {
    associationRequest.current += 1;
    intelligenceRequest.current += 1;
    setChosen("");
    setAssociations(null);
    setAssociationError("");
    setSources(null);
    setRequestError("");
    setLoading(false);
    setLoadingAssociations(false);
  }, [drug.id]);

  const loadAssociations = async (target: Target) => {
    const request = ++associationRequest.current;
    setChosen(target.ensembl_id);
    setAssociations(null);
    setAssociationError("");
    setLoadingAssociations(true);
    try {
      const result = await call(`/pharma/targets/${encodeURIComponent(target.ensembl_id)}/associations`);
      if (request === associationRequest.current) setAssociations(result);
    } catch (err: any) {
      if (request === associationRequest.current) setAssociationError(String(err?.message || err));
    } finally {
      if (request === associationRequest.current) setLoadingAssociations(false);
    }
  };
  const loadIntelligence = async () => {
    const request = ++intelligenceRequest.current;
    setLoading(true);
    setRequestError("");
    try {
      const result = await call(`/pharma/intelligence?q=${encodeURIComponent(drug.name)}`);
      if (request === intelligenceRequest.current) setSources(result.results || []);
    } catch (err: any) {
      if (request === intelligenceRequest.current) setRequestError(String(err?.message || err));
    } finally {
      if (request === intelligenceRequest.current) setLoading(false);
    }
  };
  const fda = sources?.find((x) => x.provider === "FDA");
  const ema = sources?.find((x) => x.provider === "EMA");
  const pubchem = sources?.find((x) => x.provider === "PubChem");

  return <section className="rounded-2xl border border-slate-700 bg-[#111c34] p-4 text-slate-100 space-y-4">
    <header>
      <h3 className="text-lg font-bold text-white">{fa ? "کاوشگر شواهد دارویی" : "Drug evidence explorer"}</h3>
      <p className="mt-1 text-sm text-slate-300">{fa
        ? "ارتباط‌های ثبت‌شده، امتیازهای منبع و جست‌وجوی مستقل سازمان‌های ناظر."
        : "Curated links, source scores and independent regulatory searches."}</p>
    </header>

    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-xl border border-slate-600 bg-[#172743] p-4">
        <h4 className="font-semibold text-emerald-200">{fa ? "شبکه دارو و هدف" : "Drug–target network"}</h4>
        <p className="mt-1 text-xs text-slate-300">{fa
          ? "فقط هدف‌های ثبت‌شده مکانیسم دارو؛ برای دیدن جزئیات روی ژن بزنید."
          : "Only curated mechanism targets; select a gene to inspect it."}</p>
        {targets.length === 0 ? <p className="mt-3 text-sm text-slate-300">{fa ? "هدفی در منبع ثبت نشده است." : "No curated targets found."}</p> :
          <div className="mt-3 overflow-x-auto">
            <svg viewBox="0 0 520 320" role="img" aria-label={fa ? "شبکه دارو و هدف" : "Drug target network"} className="min-w-[420px] w-full">
              {targets.map((target, i) => {
                const angle = (2 * Math.PI * i / targets.length) - Math.PI / 2;
                const x = 260 + 190 * Math.cos(angle);
                const y = 160 + 115 * Math.sin(angle);
                return <line key={`edge-${target.ensembl_id}`} x1="260" y1="160" x2={x} y2={y}
                  stroke={chosen === target.ensembl_id ? "#74f0bd" : "#527b91"} strokeWidth="2" />;
              })}
              <ellipse cx="260" cy="160" rx="67" ry="26" fill="#54dca6" />
              <text x="260" y="165" textAnchor="middle" fontSize="13" fill="#0b1b2e">{drug.name.slice(0, 16)}</text>
              {targets.map((target, i) => {
                const angle = (2 * Math.PI * i / targets.length) - Math.PI / 2;
                const x = 260 + 190 * Math.cos(angle);
                const y = 160 + 115 * Math.sin(angle);
                return <g key={target.ensembl_id} role="button" tabIndex={0}
                  aria-label={`${target.symbol}: ${fa ? "نمایش شواهد" : "view evidence"}`}
                  onClick={() => void loadAssociations(target)}
                  onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); void loadAssociations(target); } }}
                  className="cursor-pointer">
                  <ellipse cx={x} cy={y} rx="46" ry="19" fill={chosen === target.ensembl_id ? "#f9b679" : "#2f5274"} stroke="#c4d5df" />
                  <text x={x} y={y + 4} textAnchor="middle" fontSize="12" fill={chosen === target.ensembl_id ? "#142036" : "#f6f8fb"}>{target.symbol.slice(0, 12)}</text>
                </g>;
              })}
            </svg>
          </div>}
        <div className="mt-2 flex flex-wrap gap-2">
          {targets.map((target) => <button key={target.ensembl_id} type="button"
            onClick={() => void loadAssociations(target)}
            className="rounded-lg border border-slate-500 px-2 py-1 text-xs hover:bg-slate-600">{target.symbol}</button>)}
        </div>
        {drug.targets.length > 12 && <p className="mt-2 text-xs text-slate-300">{fa ? "۱۲ هدف اول نمایش داده شده‌اند." : "Showing the first 12 targets."}</p>}
        <p className="mt-2 text-xs text-slate-300">{fa
          ? "منبع روابط: Open Targets / ChEMBL. عدد ساختگی برای رابطه دارو و هدف تولید نمی‌شود."
          : "Drug–target links: Open Targets / ChEMBL. No numerical score is invented for these links."}</p>
      </section>

      <section className="rounded-xl border border-slate-600 bg-[#172743] p-4">
        <h4 className="font-semibold text-emerald-200">{fa ? "شواهد هدف و بیماری" : "Target–disease evidence"}</h4>
        {!selected && <p className="mt-2 text-sm text-slate-300">{fa ? "یک ژن را از شبکه انتخاب کنید." : "Select a gene from the network."}</p>}
        {selected && <div className="mt-2 space-y-2 text-sm">
          <p className="font-semibold">{selected.symbol} · <a href={selected.url} target="_blank" rel="noreferrer" className="underline">{selected.ensembl_id} ↗</a></p>
          {selected.mechanisms.map((m, i) => <p key={i} className="text-slate-200">{m}</p>)}
          {selected.references.map((r, i) => <a key={i} href={r.url} target="_blank" rel="noreferrer" className="me-2 text-emerald-200 underline">{r.source || "Reference"} ↗</a>)}
          {loadingAssociations && <p>{fa ? "در حال دریافت شواهد…" : "Loading evidence…"}</p>}
          {associationError && <p role="alert" className="text-amber-200">{associationError}</p>}
          {associations && <>
            <p className="text-xs text-slate-300">{fa
              ? "این امتیاز ارتباط ژن و بیماری است، نه اثربخشی دارو یا احتمال درمان."
              : "This is target–disease association, not drug efficacy or treatment probability."}</p>
            <a href={associations.score_method} target="_blank" rel="noreferrer" className="text-xs text-emerald-200 underline">{fa ? "روش محاسبه امتیاز ↗" : "Score methodology ↗"}</a>
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {(associations.target?.associatedDiseases?.rows || []).map((row: any) =>
                <article key={row.disease.id} className="rounded-lg border border-slate-600 p-2">
                  <div className="flex justify-between gap-2">
                    <a href={`https://platform.opentargets.org/disease/${encodeURIComponent(row.disease.id)}`} target="_blank" rel="noreferrer" className="underline">{row.disease.name} ↗</a>
                    <b>{Number(row.score).toFixed(3)} / 1</b>
                  </div>
                  <p className="mt-1 text-xs text-slate-300">{row.disease.id}</p>
                  <details className="mt-1 text-xs"><summary className="cursor-pointer">{fa ? "جزئیات منابع امتیاز" : "Score breakdown"}</summary>
                    <p className="mt-1">{(row.datatypeScores || []).map((part: any) => `${part.id}: ${Number(part.score).toFixed(3)}`).join(" · ") || "—"}</p>
                    <p className="mt-1">{(row.datasourceScores || []).map((part: any) => `${part.id}: ${Number(part.score).toFixed(3)}`).join(" · ") || "—"}</p>
                  </details>
                  <a className="text-xs text-emerald-200 underline" target="_blank" rel="noreferrer" href={`https://platform.opentargets.org/evidence/${encodeURIComponent(selected.ensembl_id)}/${encodeURIComponent(row.disease.id)}`}>{fa ? "بررسی شواهد در منبع ↗" : "Review source evidence ↗"}</a>
                </article>)}
            </div>
            {!(associations.target?.associatedDiseases?.rows || []).length && <p>{fa ? "ارتباطی برنگشت." : "No associations returned."}</p>}
            <p className="text-xs text-slate-400">{fa ? "زمان دریافت" : "Retrieved"}: {associations.retrieved_at || "—"}</p>
            {associations.retrieved_at && Date.now() - Date.parse(associations.retrieved_at) >= 12 * 60 * 60 * 1000 &&
              <p className="text-xs text-amber-200">{fa ? "این داده بیش از ۱۲ ساعت پیش دریافت شده است." : "This record was retrieved more than 12 hours ago."}</p>}
          </>}
        </div>}
      </section>
    </div>

    <section className="rounded-xl border border-slate-600 bg-[#172743] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="font-semibold text-emerald-200">FDA · EMA · PubChem</h4>
          <p className="mt-1 text-xs text-slate-300">{fa
            ? "جست‌وجوی جداگانه بر اساس نام؛ تطابق نام، تأیید قطعی هویت یا کاربرد نیست."
            : "Independent name searches; matches do not establish product equivalence or approved indications."}</p>
        </div>
        <button type="button" disabled={loading} onClick={() => void loadIntelligence()}
          className="rounded-lg bg-emerald-300 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">
          {loading ? (fa ? "در حال دریافت…" : "Loading…") : (fa ? "دریافت اطلاعات منابع" : "Load source records")}
        </button>
      </div>
      {requestError && <p role="alert" className="mt-2 text-sm text-amber-200">{requestError}</p>}
      {sources && <div className="mt-3 grid gap-3 md:grid-cols-3">
        {sources.map((source) => <div key={source.provider} className="rounded-lg border border-slate-600 p-3 text-sm">
          <p className="font-semibold">{source.provider}</p>
          {source.error && <p className="text-amber-200">{fa ? "منبع در دسترس نبود؛ نمی‌توان نتیجه‌گیری کرد." : source.error}</p>}
          {!source.error && <p className="text-xs text-slate-300">{fa ? "زمان دریافت" : "Retrieved"}: {source.retrieved_at || "—"}</p>}
          {source.retrieved_at && Date.now() - Date.parse(source.retrieved_at) >= 12 * 60 * 60 * 1000 &&
            <p className="text-xs text-amber-200">{fa ? "این داده بیش از ۱۲ ساعت پیش دریافت شده است." : "This record was retrieved more than 12 hours ago."}</p>}
          {source.data?.dataset_updated && <p className="text-xs text-slate-300">{fa ? "به‌روزرسانی داده منبع" : "Source dataset updated"}: {source.data.dataset_updated}</p>}
          {source.provider === "PubChem" && pubchem?.data?.item && <div className="mt-2 space-y-1">
            <a className="underline" href={pubchem.data.item.url} target="_blank" rel="noreferrer">CID {pubchem.data.item.cid} ↗</a>
            <p>{fa ? "فرمول" : "Formula"}: {pubchem.data.item.molecular_formula || "—"}</p>
            <p>{fa ? "جرم مولکولی" : "Molecular weight"}: {pubchem.data.item.molecular_weight || "—"}</p>
            <p className="break-all text-xs">InChIKey: {pubchem.data.item.inchikey || "—"}</p>
            <p className="text-xs text-slate-300">{fa ? "تطابق نام باید بررسی شود." : "Verify this name match."}</p>
          </div>}
          {source.provider === "FDA" && fda?.data && <div className="mt-2 max-h-64 space-y-2 overflow-y-auto">
            {!fda.data.items.length && <p>{fa ? "رکوردی یافت نشد؛ این به معنی عدم تأیید نیست." : "No match found; this is not proof of non-approval."}</p>}
            {fda.data.items.map((item: any) => <div key={`${item.application_number}:${item.product_number}`} className="border-t border-slate-600 pt-2">
              <a href={item.url} target="_blank" rel="noreferrer" className="underline">{item.brand_name || item.application_number} ↗</a>
              <p className="text-xs">{item.application_number} · {item.marketing_status || "status not reported"}</p>
              <p className="text-xs">{item.ingredients.map((x: any) => `${x.name} ${x.strength}`).join(" + ")}</p>
            </div>)}
            <p className="text-xs text-slate-300">{fa ? "نتایج محدودند و ممکن است شامل محصولات ترکیبی باشند." : "Results are limited and may include combination products."}</p>
          </div>}
          {source.provider === "EMA" && ema?.data && <div className="mt-2 max-h-64 space-y-2 overflow-y-auto">
            {!ema.data.items.length && <p>{fa ? "رکوردی یافت نشد؛ این به معنی عدم تأیید ملی نیست." : "No match; national authorisations may still exist."}</p>}
            {ema.data.items.map((item: any) => <div key={item.id} className="border-t border-slate-600 pt-2">
              <a href={item.url} target="_blank" rel="noreferrer" className="underline">{item.name} ↗</a>
              <p className="text-xs">{item.id} · {item.status || "status not reported"}</p>
              <p className="text-xs">{item.active_substance}</p>
              {item.indication_excerpt && <p className="text-xs text-slate-300">{item.indication_excerpt}</p>}
            </div>)}
            <p className="text-xs text-slate-300">{fa ? "فقط رکوردهای ارزیابی مرکزی EMA." : "Centrally evaluated EMA records only."}</p>
          </div>}
          {source.provider === "PubChem" && pubchem?.data && !pubchem.data.item && <p>{fa ? "رکوردی یافت نشد." : "No record found."}</p>}
        </div>)}
      </div>}
    </section>
    <p className="text-xs text-slate-400">{fa ? "فقط برای پژوهش؛ نه برای تشخیص، درمان یا تعیین دوز." : "Research use only; not for diagnosis, treatment or dosing."}</p>
  </section>;
}
