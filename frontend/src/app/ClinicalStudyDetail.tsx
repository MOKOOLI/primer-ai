"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";

type Study = {
  id: string; title: string; official_title: string; status: string; last_update_posted: string;
  start_date: { date?: string; type?: string }; completion_date: { date?: string; type?: string };
  results_first_posted: string; study_type: string; phases: string[]; enrollment_count: number | null;
  enrollment_type: string; conditions: string[]; sponsor: string; sex: string; minimum_age: string; maximum_age: string;
  eligibility_criteria: string; eligibility_truncated: boolean;
  interventions: { type: string; name: string }[]; interventions_truncated: boolean;
  primary_outcomes: { measure: string; time_frame: string }[]; outcomes_truncated: boolean;
  source_url: string; api_url: string; retrieved_at: string;
};
type Props = { nctId: string; call: (path: string, init?: RequestInit) => Promise<any>; lang?: string };

export default function ClinicalStudyDetail({ nctId, call, lang }: Props) {
  const fa = lang === "fa";
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Study | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  useEffect(() => () => { request.current += 1; }, []);

  const toggle = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (data) return;
    const n = ++request.current;
    setLoading(true); setError("");
    try {
      const result = await call(`/pharma/clinical-studies/${encodeURIComponent(nctId)}`);
      if (n === request.current) setData(result);
    } catch {
      if (n === request.current) setError(fa ? "جزئیات مطالعه دریافت نشد؛ دوباره تلاش کنید." : "Could not load study details. Try again.");
    } finally {
      if (n === request.current) setLoading(false);
    }
  };
  const countType = (type: string) => type === "ACTUAL" ? (fa ? "واقعی" : "Actual")
    : type === "ESTIMATED" ? (fa ? "برآوردی" : "Estimated") : (type || (fa ? "نوع گزارش نشده" : "Type not reported"));
  const date = (d: { date?: string; type?: string }) => d?.date
    ? `${d.date} (${countType(d.type || "")})` : "—";
  return <div className="space-y-2">
    <button type="button" aria-expanded={open} onClick={() => void toggle()}
      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50">
      {open ? (fa ? "بستن جزئیات مطالعه" : "Close study details") : (fa ? "مشاهده جزئیات مطالعه" : "View study details")}
    </button>
    {open && <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">
      {loading && <p role="status">{fa ? "در حال دریافت از ClinicalTrials.gov…" : "Loading from ClinicalTrials.gov…"}</p>}
      {error && <p role="alert" className="text-red-800">{error} <button type="button" className="underline" onClick={() => { setOpen(false); setError(""); }}>{fa ? "بستن" : "Close"}</button></p>}
      {data && <>
        <p className="font-semibold">{data.official_title || data.title}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <p><b>{fa ? "وضعیت: " : "Status: "}</b>{data.status || "—"}</p>
          <p><b>{fa ? "فاز: " : "Phase: "}</b>{data.phases.join(", ") || "—"}</p>
          <p><b>{fa ? "نوع مطالعه: " : "Study type: "}</b>{data.study_type || "—"}</p>
          <p><b>{fa ? "حامی: " : "Sponsor: "}</b>{data.sponsor || "—"}</p>
          <p><b>{fa ? "آغاز: " : "Start: "}</b>{date(data.start_date)}</p>
          <p><b>{fa ? "پایان: " : "Completion: "}</b>{date(data.completion_date)}</p>
          <p><b>{fa ? "تعداد ثبت‌شده در مطالعه: " : "Registered enrollment: "}</b>
            {data.enrollment_count != null ? `${data.enrollment_count} (${countType(data.enrollment_type)})` : "—"}</p>
          <p><b>{fa ? "آخرین به‌روزرسانی ثبت‌شده: " : "Registry last updated: "}</b>{data.last_update_posted || "—"}</p>
        </div>
        <p className="text-xs text-slate-600">{fa
          ? "تعداد ثبت‌شده مربوط به این مطالعه است و آمار لحظه‌ای یا تعداد بیماران سازمان شما نیست."
          : "Registered enrollment is for this study, not live enrollment or a count for your organization."}</p>
        <p><b>{fa ? "بیماری‌ها: " : "Conditions: "}</b>{data.conditions.join(" · ") || "—"}</p>
        <p><b>{fa ? "مداخلات: " : "Interventions: "}</b>{data.interventions.map((x) => `${x.type ? `${x.type}: ` : ""}${x.name}`).join(" · ") || "—"}
          {data.interventions_truncated && <span> {fa ? "(فهرست کوتاه‌شده؛ منبع را ببینید)" : "(list truncated; see source)"}</span>}</p>
        <p><b>{fa ? "شرایط جمعیت: " : "Population: "}</b>{[data.sex, data.minimum_age, data.maximum_age].filter(Boolean).join(" · ") || "—"}</p>
        {data.eligibility_criteria && <details>
          <summary className="cursor-pointer font-semibold">{fa ? "معیارهای ورود و خروج" : "Eligibility criteria"}</summary>
          <p className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-xs leading-relaxed">{data.eligibility_criteria}</p>
          {data.eligibility_truncated && <p className="text-xs">{fa ? "متن کوتاه‌شده است؛ متن کامل در منبع." : "Text truncated; read the complete source record."}</p>}
        </details>}
        {data.primary_outcomes.length > 0 && <details>
          <summary className="cursor-pointer font-semibold">{fa ? "پیامدهای اصلی ثبت‌شده" : "Registered primary outcomes"}</summary>
          <ul className="mt-2 list-disc space-y-1 ps-5 text-xs">
            {data.primary_outcomes.map((outcome, index) => <li key={index}>{outcome.measure}{outcome.time_frame ? ` · ${outcome.time_frame}` : ""}</li>)}
          </ul>
          {data.outcomes_truncated && <p className="text-xs">{fa ? "فهرست کوتاه‌شده است." : "List truncated."}</p>}
          <p className="mt-1 text-xs text-slate-600">{fa ? "این‌ها پیامدهای تعریف‌شده‌اند، نه نتیجه اثربخشی." : "These are defined outcomes, not efficacy results."}</p>
        </details>}
        <p className="text-xs"><b>{fa ? "تاریخ انتشار نتایج در رجیستری: " : "Results first posted: "}</b>{data.results_first_posted || (fa ? "در پاسخ موجود نیست" : "Not available in response")}</p>
        <div className="flex flex-wrap gap-3 text-xs">
          <a href={data.source_url} target="_blank" rel="noreferrer" className="font-semibold text-emerald-800 underline">{fa ? "رکورد کامل مطالعه ↗" : "Full registry record ↗"}</a>
          <a href={data.api_url} target="_blank" rel="noreferrer" className="text-emerald-800 underline">{fa ? "داده منبع ↗" : "Source data ↗"}</a>
        </div>
        <p className="text-xs text-slate-600">{fa ? "زمان دریافت" : "Retrieved"}: {data.retrieved_at}</p>
      </>}
    </div>}
  </div>;
}
