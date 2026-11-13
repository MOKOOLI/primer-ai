"use client";

type Project = { id: string; name: string; drug_name?: string; drug_chembl_id?: string; created_at?: string };
type LibraryItem = { id: string; kind: string };
type Props = {
  lang?: string;
  organizationName: string;
  state: "no-org" | "loading" | "ready" | "error";
  projects: Project[];
  records: LibraryItem[];
  onTrials: () => void;
};

export default function PharmaDashboard({ lang, organizationName, state, projects, records, onTrials }: Props) {
  const fa = lang === "fa";
  const ready = state === "ready";
  const display = (count: number) => ready ? String(count) : "—";
  return <section className="space-y-4 rounded-2xl border border-slate-700 bg-[#111c34] p-4 text-slate-100">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">Primer AI · Pharma</p>
        <h2 className="mt-1 text-xl font-bold">{fa ? "داشبورد پژوهش دارویی" : "Pharma research dashboard"}</h2>
        <p className="mt-1 text-sm text-slate-300">{organizationName || (fa ? "سازمانی انتخاب نشده" : "No organization selected")}</p>
      </div>
      <button type="button" onClick={onTrials}
        className="rounded-lg bg-emerald-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-200">
        {fa ? "جست‌وجوی کارآزمایی‌ها" : "Search clinical trials"}
      </button>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      {[
        [fa ? "پروژه‌های سازمان" : "Organization projects", display(projects.length)],
        [fa ? "رکوردهای نمایش‌داده‌شده بانک" : "Bank records loaded", display(records.length)],
        [fa ? "کارآزمایی‌های ذخیره‌شده در رکوردهای نمایش‌داده‌شده" : "Trials among loaded records", display(records.filter((x) => x.kind === "trial").length)],
      ].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-600 bg-[#172743] p-3">
        <p className="text-2xl font-bold tabular-nums text-white">{value}</p>
        <p className="mt-1 text-sm text-slate-300">{label}</p>
      </div>)}
    </div>
    <p className="text-xs text-slate-300">{state === "no-org"
      ? (fa ? "برای دیدن داده‌های سازمان، پایین صفحه سازمان بسازید یا انتخاب کنید." : "Create or select an organization below to see its data.")
      : state === "loading" ? (fa ? "در حال دریافت اطلاعات سازمان…" : "Loading organization data…")
      : state === "error" ? (fa ? "داده‌های سازمان بارگذاری نشدند؛ عددی نمایش داده نمی‌شود." : "Organization data could not be loaded; counts are unavailable.")
      : (fa ? "بانک حداکثر ۵۰۰ رکورد اخیر را نمایش می‌دهد. تعداد بیماران یا ثبت‌نام از این داده‌ها قابل محاسبه نیست." : "The bank loads up to 500 recent records. These data cannot determine patient enrollment.")}</p>
    {ready && projects.length > 0 && <div className="overflow-x-auto rounded-xl border border-slate-600">
      <table className="w-full text-start text-sm">
        <caption className="px-3 py-2 text-start font-semibold text-emerald-200">{fa ? "پروژه‌های اخیر" : "Recent projects"}</caption>
        <thead className="bg-[#172743] text-slate-300"><tr>
          <th scope="col" className="px-3 py-2 text-start">{fa ? "پروژه" : "Project"}</th>
          <th scope="col" className="px-3 py-2 text-start">{fa ? "دارو" : "Drug"}</th>
          <th scope="col" className="px-3 py-2 text-start">{fa ? "زمان ایجاد" : "Created"}</th>
        </tr></thead>
        <tbody>{projects.slice(0, 5).map((project) => <tr key={project.id} className="border-t border-slate-700">
          <td className="px-3 py-2 font-medium">{project.name}</td>
          <td className="px-3 py-2">{project.drug_name || "—"} {project.drug_chembl_id ? `· ${project.drug_chembl_id}` : ""}</td>
          <td className="px-3 py-2">{project.created_at ? new Date(project.created_at).toLocaleDateString(fa ? "fa-IR" : "en-US") : "—"}</td>
        </tr>)}</tbody>
      </table>
    </div>}
  </section>;
}
