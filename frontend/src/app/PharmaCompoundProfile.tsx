"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";

type Compound = {
  id: string; name: string; molecule_type: string; formula: string | null; molecular_weight: string | null;
  alogp: string | null; polar_surface_area: string | null; hba: number | null; hbd: number | null;
  rotatable_bonds: number | null; canonical_smiles: string | null; standard_inchi_key: string | null;
  source_url: string; molecule_url: string; retrieved_at: string;
};
type Props = { drugId: string; call: (path: string, init?: RequestInit) => Promise<any>; lang?: string };

const shown = (value: unknown) => value == null || value === "" ? "—" : String(value);
function rows(data: Compound, fa: boolean): [string, string][] {
  return [
    [fa ? "شناسه" : "ChEMBL ID", data.id], [fa ? "نام منبع" : "Source name", shown(data.name)],
    [fa ? "نوع ترکیب" : "Molecule type", shown(data.molecule_type)],
    [fa ? "فرمول مولکولی" : "Molecular formula", shown(data.formula)],
    [fa ? "جرم مولکولی" : "Molecular weight", data.molecular_weight != null ? `${data.molecular_weight} g/mol` : "—"],
    ["ALogP", shown(data.alogp)],
    [fa ? "سطح قطبی" : "Polar surface area", data.polar_surface_area != null ? `${data.polar_surface_area} Å²` : "—"],
    ["HBA", shown(data.hba)], ["HBD", shown(data.hbd)],
    [fa ? "پیوندهای چرخشی" : "Rotatable bonds", shown(data.rotatable_bonds)],
    ["InChIKey", shown(data.standard_inchi_key)], ["Canonical SMILES", shown(data.canonical_smiles)],
  ];
}

function printReport(data: Compound, fa: boolean): boolean {
  const win = window.open("", "_blank");
  if (!win) return false;
  const doc = win.document;
  doc.title = `${data.id} | Primer AI compound profile`;
  doc.documentElement.lang = fa ? "fa" : "en";
  doc.documentElement.dir = fa ? "rtl" : "ltr";
  const style = doc.createElement("style");
  style.textContent = "body{font:15px system-ui,sans-serif;color:#17243a;line-height:1.5;max-width:850px;margin:40px auto;padding:0 24px}h1{font-size:26px}table{border-collapse:collapse;width:100%;margin:20px 0}th,td{border:1px solid #b8c5ce;padding:8px;text-align:start;vertical-align:top;overflow-wrap:anywhere}th{width:30%;background:#eff4f4}a{color:#064c61;overflow-wrap:anywhere}.note{font-size:12px;color:#475569}@media print{body{margin:0;padding:0}button{display:none}}";
  doc.head.appendChild(style);
  const h = doc.createElement("h1"); h.textContent = fa ? "گزارش پروفایل ترکیب" : "Compound profile report"; doc.body.appendChild(h);
  const scope = doc.createElement("p"); scope.textContent = fa
    ? "دامنه گزارش: فقط پروفایل این ترکیب از ChEMBL؛ شامل نتایج Docking یا ارزیابی بالینی نیست."
    : "Scope: the compound profile from ChEMBL only. No docking results or clinical assessment.";
  doc.body.appendChild(scope);
  const table = doc.createElement("table");
  for (const [label, value] of rows(data, fa)) {
    const tr = doc.createElement("tr"), th = doc.createElement("th"), td = doc.createElement("td");
    th.textContent = label; td.textContent = value; tr.append(th, td); table.appendChild(tr);
  }
  doc.body.appendChild(table);
  const note = doc.createElement("p"); note.className = "note";
  note.textContent = fa
    ? "شاخص‌ها همان مقادیر گزارش‌شده توسط ChEMBL هستند و ممکن است محاسبه‌شده باشند. نبود مقدار، صفر یا اثبات ایمنی نیست."
    : "Descriptors are as reported by ChEMBL and may be calculated. A missing value is not zero or proof of safety.";
  doc.body.appendChild(note);
  const source = doc.createElement("p");
  source.textContent = fa ? "منبع و زمان دریافت: " : "Source and retrieval time: ";
  const link = doc.createElement("a"); link.href = data.source_url; link.textContent = data.source_url; link.rel = "noreferrer";
  source.append(link, doc.createTextNode(` · ${data.retrieved_at}`)); doc.body.appendChild(source);
  win.focus();
  win.setTimeout(() => win.print(), 150);
  return true;
}

export default function PharmaCompoundProfile({ drugId, call, lang }: Props) {
  const fa = lang === "fa";
  const [data, setData] = useState<Compound | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [printError, setPrintError] = useState("");
  const request = useRef(0);
  useEffect(() => () => { request.current += 1; }, []);
  const load = async () => {
    const n = ++request.current;
    setBusy(true); setError(""); setData(null); setPrintError("");
    try {
      const res = await call(`/pharma/drugs/${encodeURIComponent(drugId)}/compound-profile`);
      if (n === request.current) setData(res);
    } catch {
      if (n === request.current) setError(fa ? "پروفایل ChEMBL دریافت نشد؛ بعداً دوباره تلاش کنید." : "Could not load the ChEMBL profile. Try again later.");
    } finally { if (n === request.current) setBusy(false); }
  };
  const controls = "rounded-lg border border-slate-500 px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700 disabled:opacity-50";
  return <section className="space-y-4 rounded-2xl border border-slate-600 bg-[#111c34] p-4 text-slate-100" aria-labelledby="compound-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-semibold tracking-wider text-emerald-300">ChEMBL · {drugId}</p>
        <h3 id="compound-title" className="mt-1 text-xl font-bold">{fa ? "پروفایل شیمیایی ترکیب" : "Compound chemical profile"}</h3>
        <p className="mt-1 text-sm text-slate-300">{fa ? "ساختار و شاخص‌های منبع؛ برخی شاخص‌ها محاسبه‌شده‌اند." : "Source structure and descriptors; some descriptors are calculated."}</p>
      </div>
      <button type="button" disabled={busy} onClick={() => void load()} className="rounded-lg bg-emerald-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">
        {busy ? (fa ? "در حال دریافت…" : "Loading…") : (fa ? "دریافت پروفایل" : "Load profile")}
      </button>
    </div>
    {error && <p role="alert" className="text-sm text-amber-200">{error}</p>}
    {data && <>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {rows(data, fa).filter(([label]) => label !== "Canonical SMILES" && label !== "InChIKey").map(([label, value]) =>
          <div key={label} className="rounded-lg border border-slate-600 bg-[#172743] p-3">
            <p className="text-xs text-slate-300">{label}</p><p className="mt-1 break-words text-sm font-semibold">{value}</p>
          </div>)}
      </div>
      <div className="space-y-2 text-sm">
        <p className="break-all"><b>InChIKey: </b><span dir="ltr">{shown(data.standard_inchi_key)}</span></p>
        <p className="break-all"><b>Canonical SMILES: </b><span dir="ltr">{shown(data.canonical_smiles)}</span></p>
        <p className="text-xs text-slate-300">{fa ? "زمان دریافت" : "Retrieved"}: {data.retrieved_at}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={data.source_url} target="_blank" rel="noreferrer" className={`${controls} underline`}>{fa ? "داده منبع ↗" : "Source data ↗"}</a>
        <a href={data.molecule_url} target="_blank" rel="noreferrer" className={`${controls} underline`}>ChEMBL ↗</a>
        <button type="button" className={controls} onClick={() => {
          setPrintError(printReport(data, fa) ? "" : (fa ? "مرورگر پنجره چاپ را مسدود کرد؛ اجازه پاپ‌آپ بدهید." : "The print window was blocked. Allow pop-ups and retry."));
        }}>{fa ? "چاپ / ذخیره PDF پروفایل" : "Print / save profile PDF"}</button>
      </div>
      {printError && <p role="alert" className="text-sm text-amber-200">{printError}</p>}
    </>}
  </section>;
}
