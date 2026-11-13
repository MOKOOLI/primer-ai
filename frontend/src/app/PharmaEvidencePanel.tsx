"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";

type Activity = {
  activity_id: number; molecule_chembl_id: string; assay_chembl_id: string;
  assay_type: string; assay_description: string | null; bao_label: string | null;
  standard_type: string | null; standard_relation: string | null; standard_value: string | null;
  standard_upper_value: string | null; standard_text_value: string | null; standard_units: string | null;
  standard_flag: boolean | number | null; type: string | null; relation: string | null;
  value: string | null; upper_value: string | null; text_value: string | null; units: string | null;
  target_chembl_id: string | null; target_pref_name: string | null; target_organism: string | null;
  document_chembl_id: string | null; document_journal: string | null; document_year: number | null;
  data_validity_comment: string | null; data_validity_description: string | null;
  potential_duplicate: number | boolean | null; activity_comment: string | null;
  assay_url: string; document_url: string; target_url: string;
};
type Page = {
  chembl_id: string; assay_type: string; offset: number; limit: number; total_count: number | null;
  has_next: boolean; page_cap_reached: boolean; items: Activity[];
  source_url: string; retrieved_at: string;
};
type Props = { drugId: string; call: (path: string, init?: RequestInit) => Promise<any>; lang?: string };

const fields: (keyof Activity)[] = [
  "activity_id", "molecule_chembl_id", "assay_chembl_id", "assay_type", "assay_description", "bao_label",
  "standard_type", "standard_relation", "standard_value", "standard_upper_value", "standard_text_value", "standard_units", "standard_flag",
  "type", "relation", "value", "upper_value", "text_value", "units",
  "target_chembl_id", "target_pref_name", "target_organism",
  "document_chembl_id", "document_journal", "document_year", "data_validity_comment", "data_validity_description",
  "potential_duplicate", "activity_comment", "assay_url", "document_url", "target_url",
];

function csvCell(value: unknown) {
  let text = value == null ? "" : String(value);
  // Prevent spreadsheet formula execution for untrusted source text.
  if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return `"${text.replace(/"/g, '""')}"`;
}

function exportPage(page: Page) {
  const headers = [...fields, "source_url", "retrieved_at"];
  const lines = [headers.map(csvCell).join(",")];
  for (const item of page.items) {
    lines.push([...fields.map((key) => csvCell(item[key])), csvCell(page.source_url), csvCell(page.retrieved_at)].join(","));
  }
  const url = URL.createObjectURL(new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url;
  link.download = `${page.chembl_id}-${page.assay_type}-offset-${page.offset}.csv`;
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function resultValue(item: Activity, standard: boolean) {
  const type = standard ? item.standard_type : item.type;
  const relation = standard ? item.standard_relation : item.relation;
  const value = standard ? item.standard_value : item.value;
  const upper = standard ? item.standard_upper_value : item.upper_value;
  const text = standard ? item.standard_text_value : item.text_value;
  const unit = standard ? item.standard_units : item.units;
  const val = value != null && value !== "" ? String(value) : text || "";
  if (!type && !val && !unit) return "—";
  return [type, relation, val, upper != null && upper !== "" ? `to ${upper}` : "", unit].filter(Boolean).join(" ");
}

export default function PharmaEvidencePanel({ drugId, call, lang }: Props) {
  const fa = lang === "fa";
  const [category, setCategory] = useState("A");
  const [page, setPage] = useState<Page | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  useEffect(() => () => { request.current += 1; }, []);

  const load = async (type: string, offset: number) => {
    const n = ++request.current;
    setLoading(true); setError(""); setPage(null);
    try {
      const result = await call(`/pharma/drugs/${encodeURIComponent(drugId)}/activities?assay_type=${encodeURIComponent(type)}&offset=${offset}`);
      if (n === request.current) setPage(result);
    } catch {
      if (n === request.current) setError(fa ? "داده‌های ChEMBL دریافت نشدند. اتصال و دسترسی را بررسی کنید." : "ChEMBL data could not be loaded. Check access and connectivity.");
    } finally {
      if (n === request.current) setLoading(false);
    }
  };

  const button = "rounded-lg border border-slate-500 px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700 disabled:opacity-50";
  return <section aria-labelledby="pharma-evidence-title" className="space-y-4 rounded-2xl border border-slate-600 bg-[#111c34] p-4 text-slate-100">
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">ChEMBL · {drugId}</p>
      <h3 id="pharma-evidence-title" className="mt-1 text-xl font-bold">{fa ? "شواهد زیست‌فعالیت و ADME / سمیت" : "Bioactivity and ADME / toxicity evidence"}</h3>
      <p className="mt-1 text-sm text-slate-300">{fa
        ? "رکوردهای گزارش‌شده برای همین شناسه ترکیب؛ نوع آزمایش، گونه و کیفیت منبع را قبل از تفسیر بررسی کنید."
        : "Records reported for this exact compound ID; review assay context, species and source quality before interpretation."}</p>
    </div>
    <div className="flex flex-wrap items-end gap-2">
      <label className="space-y-1 text-sm">
        <span className="block">{fa ? "نوع آزمایش" : "Assay category"}</span>
        <select value={category} onChange={(e) => { request.current += 1; setCategory(e.target.value); setPage(null); setError(""); setLoading(false); }}
          className="rounded-lg border border-slate-500 bg-[#172743] px-3 py-2 text-slate-100">
          <option value="A">ADME</option>
          <option value="T">{fa ? "سمیت" : "Toxicity"}</option>
          <option value="P">{fa ? "خواص فیزیکوشیمیایی" : "Physicochemical"}</option>
          <option value="B">{fa ? "اتصال" : "Binding"}</option>
          <option value="F">{fa ? "عملکردی" : "Functional"}</option>
        </select>
      </label>
      <button type="button" onClick={() => void load(category, 0)} disabled={loading}
        className="rounded-lg bg-emerald-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">
        {loading ? (fa ? "در حال دریافت…" : "Loading…") : (fa ? "دریافت شواهد" : "Load evidence")}
      </button>
    </div>
    <p className="text-xs text-slate-300">{fa
      ? "این داده‌ها پیش‌بینی، امتیاز ایمنی یا توصیه بالینی نیستند. نبود رکورد به معنی ایمن‌بودن نیست."
      : "These records are not predictions, safety scores or clinical recommendations. No record does not establish safety."}</p>
    {error && <p role="alert" className="text-sm text-amber-200">{error}</p>}
    {page && <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p>{fa ? "رکوردهای این صفحه" : "Records on this page"}: {page.items.length}
          {page.total_count != null && <> · {fa ? "تعداد گزارش‌شده منبع" : "Source total"}: {page.total_count}</>}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={button} disabled={!page.items.length} onClick={() => exportPage(page)}>CSV · {fa ? "همین صفحه" : "this page"}</button>
          <a href={page.source_url} target="_blank" rel="noreferrer" className={`${button} underline`}>{fa ? "داده منبع ↗" : "Source data ↗"}</a>
        </div>
      </div>
      <p className="text-xs text-slate-300">{fa ? "زمان دریافت" : "Retrieved"}: {page.retrieved_at}</p>
      {!page.items.length && <p className="rounded-xl border border-slate-600 p-3 text-sm">{fa ? "برای این دسته رکوردی برنگشت." : "No records returned for this category."}</p>}
      <div className="space-y-3">
        {page.items.map((item, index) => <article key={`${item.activity_id ?? "missing"}-${index}`} className="space-y-2 rounded-xl border border-slate-600 bg-[#172743] p-4 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="font-semibold text-emerald-200">{item.standard_type || item.type || (fa ? "نوع گزارش نشده" : "Type not reported")}</p>
            <span className="font-mono text-xs text-slate-300">Activity {item.activity_id ?? "—"}</span>
          </div>
          <p>{item.assay_description || (fa ? "شرح آزمایش گزارش نشده." : "Assay description not reported.")}</p>
          <div className="grid gap-2 md:grid-cols-2">
            <p><span className="text-slate-300">{fa ? "مقدار استاندارد منبع: " : "Source standard value: "}</span><span dir="ltr" className="inline-block font-semibold">{resultValue(item, true)}</span></p>
            <p><span className="text-slate-300">{fa ? "مقدار گزارش‌شده اصلی: " : "Original reported value: "}</span><span dir="ltr" className="inline-block">{resultValue(item, false)}</span></p>
          </div>
          <p className="text-xs text-slate-300">{fa ? "هدف / گونه هدف" : "Target / target organism"}: {[item.target_pref_name, item.target_organism, item.target_chembl_id].filter(Boolean).join(" · ") || "—"}{item.bao_label ? ` · ${item.bao_label}` : ""}</p>
          {(item.data_validity_comment || item.data_validity_description || item.potential_duplicate || item.activity_comment) && <p className="text-xs text-amber-200">
            {fa ? "یادداشت کیفیت منبع: " : "Source quality note: "}
            {[item.data_validity_comment, item.data_validity_description, item.activity_comment,
              item.potential_duplicate ? (fa ? "احتمال رکورد تکراری" : "Potential duplicate") : ""].filter(Boolean).join(" · ")}
          </p>}
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {item.assay_url && <a href={item.assay_url} target="_blank" rel="noreferrer" className="text-emerald-200 underline">{fa ? "رکورد آزمایش" : "Assay"} {item.assay_chembl_id} ↗</a>}
            {item.document_url && <a href={item.document_url} target="_blank" rel="noreferrer" className="text-emerald-200 underline">{fa ? "سند منبع" : "Source document"} {item.document_chembl_id} ↗</a>}
            {item.target_url && <a href={item.target_url} target="_blank" rel="noreferrer" className="text-emerald-200 underline">{fa ? "هدف" : "Target"} ↗</a>}
            {(item.document_journal || item.document_year) && <span className="text-slate-300">{[item.document_journal, item.document_year].filter(Boolean).join(" · ")}</span>}
          </div>
        </article>)}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={button} disabled={loading || page.offset === 0} onClick={() => void load(category, Math.max(0, page.offset - page.limit))}>{fa ? "صفحه قبل" : "Previous"}</button>
        <span className="text-xs text-slate-300">{fa ? "از رکورد" : "Offset"}: {page.offset}</span>
        <button type="button" className={button} disabled={loading || !page.has_next} onClick={() => void load(category, page.offset + page.limit)}>{fa ? "صفحه بعد" : "Next"}</button>
      </div>
      {page.page_cap_reached && <p className="text-xs text-amber-200">{fa ? "برای ادامه رکوردها از پیوند منبع استفاده کنید." : "Use the source link for records beyond this viewer's page limit."}</p>}
    </div>}
  </section>;
}
