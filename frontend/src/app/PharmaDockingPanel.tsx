"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";

type Status = { enabled: boolean; engine_available: boolean; ready: boolean; timeout_seconds: number };
type Result = {
  engine: string; engine_version: string; energy_units: string; scores: number[]; poses_pdbqt: string;
  center: number[]; size: number[]; seed: number; exhaustiveness: number; requested_poses: number;
  receptor_sha256: string; ligand_sha256: string; cpu: number; scoring: string;
  completed_at: string; energy_range_kcal_mol: number;
};
type Props = { call: (path: string, init?: RequestInit) => Promise<any>; lang?: string };

function saveFile(name: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a"); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function PharmaDockingPanel({ call, lang }: Props) {
  const fa = lang === "fa";
  const [status, setStatus] = useState<Status | null>(null);
  const [statusError, setStatusError] = useState("");
  const [receptor, setReceptor] = useState<File | null>(null);
  const [ligand, setLigand] = useState<File | null>(null);
  const [center, setCenter] = useState(["", "", ""]);
  const [size, setSize] = useState(["", "", ""]);
  const [seed, setSeed] = useState("42");
  const [exhaustiveness, setExhaustiveness] = useState("4");
  const [numPoses, setNumPoses] = useState("3");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const request = useRef(0);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await call("/pharma/docking/status");
        if (active) { setStatus(response); setStatusError(""); }
      } catch { if (active) setStatusError(fa ? "وضعیت موتور قابل دریافت نیست." : "Could not check the engine status."); }
    })();
    return () => { active = false; request.current += 1; };
  }, [call, fa]);

  const submit = async () => {
    setError(""); setResult(null);
    if (!status?.ready || !receptor || !ligand) {
      setError(fa ? "موتور آماده و هر دو فایل PDBQT لازم‌اند." : "The engine and both prepared PDBQT files are required.");
      return;
    }
    if (receptor.size > 2_000_000 || ligand.size > 300_000) {
      setError(fa ? "حجم فایل گیرنده باید حداکثر ۲ مگابایت و لیگاند حداکثر ۳۰۰ کیلوبایت باشد." : "Receptor must be at most 2 MB and ligand at most 300 KB.");
      return;
    }
    const numeric = (values: string[]) => values.every((x) => x.trim() !== "" && Number.isFinite(Number(x)));
    const centers = center.map(Number), dimensions = size.map(Number);
    const seedNumber = Number(seed), exhaustivenessNumber = Number(exhaustiveness), posesNumber = Number(numPoses);
    if (!numeric(center) || !numeric(size) || dimensions.some((x) => x < 4 || x > 28) || centers.some((x) => Math.abs(x) > 10000)
      || !Number.isInteger(seedNumber) || seedNumber < 1 || seedNumber > 2147483647
      || !Number.isInteger(exhaustivenessNumber) || exhaustivenessNumber < 1 || exhaustivenessNumber > 8
      || !Number.isInteger(posesNumber) || posesNumber < 1 || posesNumber > 5) {
      setError(fa ? "مختصات و پارامترها را بررسی کنید. هر ضلع جعبه باید بین ۴ و ۲۸ آنگستروم باشد."
        : "Check coordinates and parameters. Each box side must be between 4 and 28 Å.");
      return;
    }
    const n = ++request.current; setBusy(true);
    try {
      const [receptorText, ligandText] = await Promise.all([receptor.text(), ligand.text()]);
      const res = await call("/pharma/docking/run", { method: "POST", body: JSON.stringify({
        receptor_pdbqt: receptorText, ligand_pdbqt: ligandText, center: centers, size: dimensions,
        seed: seedNumber, exhaustiveness: exhaustivenessNumber, num_poses: posesNumber,
      }) });
      if (n === request.current) setResult(res);
    } catch (err: any) {
      if (n === request.current) setError(fa
        ? `داکینگ اجرا نشد. آماده‌سازی فایل‌ها، جعبه و وضعیت سرور را بررسی کنید. ${String(err?.message || "")}`
        : `Docking failed. Check prepared files, box and server status. ${String(err?.message || "")}`);
    } finally { if (n === request.current) setBusy(false); }
  };
  const input = "w-full rounded-lg border border-slate-500 bg-[#0c182a] px-3 py-2 text-sm text-white placeholder:text-slate-400";
  const button = "rounded-lg border border-slate-500 px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700 disabled:opacity-50";

  return <section aria-labelledby="pharma-docking-title" className="space-y-4 rounded-2xl border border-slate-600 bg-[#111c34] p-4 text-slate-100">
    <div>
      <p className="text-xs font-semibold tracking-wider text-emerald-300">AutoDock Vina · research prototype</p>
      <h3 id="pharma-docking-title" className="mt-1 text-xl font-bold">{fa ? "داکینگ مولکولی" : "Molecular docking"}</h3>
      <p className="mt-1 text-sm text-slate-300">{fa
        ? "گیرنده و لیگاند از پیش آماده‌شده، به‌همراه مختصات جعبه لازم‌اند. ساختار موجود در نمایشگر خودکار به ورودی داکینگ تبدیل نمی‌شود."
        : "Prepared receptor and ligand PDBQT files and an explicit search box are required. The 3D viewer does not automatically prepare docking inputs."}</p>
    </div>
    {statusError && <p role="alert" className="text-sm text-amber-200">{statusError}</p>}
    {!status && !statusError && <p role="status" className="text-sm text-slate-300">{fa ? "بررسی وضعیت موتور…" : "Checking engine status…"}</p>}
    {status && <p className={`text-sm ${status.ready ? "text-emerald-200" : "text-amber-200"}`}>
      {status.ready ? (fa ? "موتور در سرور فعال است." : "Engine enabled on the server.")
        : !status.enabled ? (fa ? "داکینگ در سرور غیرفعال است." : "Docking is disabled on the server.")
        : (fa ? "بسته Vina یا موتور در سرور در دسترس نیست." : "The Vina package or engine is unavailable on the server.")}
    </p>}
    <p className="text-xs text-slate-300">{fa
      ? "فایل‌ها برای محاسبه به سرور سایت ارسال و موقتاً روی سرور نوشته می‌شوند. نتیجه در بانک ذخیره نمی‌شود؛ فایل‌های خودتان را نگه دارید."
      : "Files are sent to the site server and written temporarily for computation. Results are not saved to the bank; retain your inputs."}</p>
    <div className="grid gap-3 md:grid-cols-2">
      <label className="space-y-1 text-sm"><span className="block">{fa ? "گیرنده آماده‌شده PDBQT" : "Prepared receptor PDBQT"}</span>
        <input type="file" accept=".pdbqt,text/plain" disabled={busy} onChange={(e) => { setReceptor(e.target.files?.[0] || null); setResult(null); }} className={input} />
      </label>
      <label className="space-y-1 text-sm"><span className="block">{fa ? "لیگاند آماده‌شده PDBQT" : "Prepared ligand PDBQT"}</span>
        <input type="file" accept=".pdbqt,text/plain" disabled={busy} onChange={(e) => { setLigand(e.target.files?.[0] || null); setResult(null); }} className={input} />
      </label>
    </div>
    <div className="grid gap-3 md:grid-cols-2">
      {[{ label: fa ? "مرکز جعبه (Å)" : "Box center (Å)", values: center, setter: setCenter },
        { label: fa ? "اندازه جعبه (Å)" : "Box size (Å)", values: size, setter: setSize }].map((group) =>
        <fieldset key={group.label} className="space-y-1">
          <legend className="text-sm font-semibold">{group.label}</legend>
          <div className="grid grid-cols-3 gap-2">{["X", "Y", "Z"].map((axis, i) =>
            <label key={axis} className="space-y-1 text-xs text-slate-300">{axis}
              <input type="number" step="any" dir="ltr" value={group.values[i]} placeholder={axis} disabled={busy} className={input}
                onChange={(e) => { const next = [...group.values]; next[i] = e.target.value; group.setter(next); setResult(null); }} />
            </label>)}</div>
        </fieldset>)}
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      {[{ label: "Seed", value: seed, set: setSeed, min: 1, max: 2147483647 },
        { label: "Exhaustiveness", value: exhaustiveness, set: setExhaustiveness, min: 1, max: 8 },
        { label: fa ? "حداکثر حالت‌ها" : "Maximum poses", value: numPoses, set: setNumPoses, min: 1, max: 5 }].map((field) =>
        <label key={field.label} className="space-y-1 text-sm">{field.label}
          <input type="number" min={field.min} max={field.max} step="1" dir="ltr" value={field.value} disabled={busy} className={input}
            onChange={(e) => { field.set(e.target.value); setResult(null); }} />
        </label>)}
    </div>
    <p className="text-xs text-slate-300">{fa
      ? "هر ضلع جعبه: ۴ تا ۲۸ Å. مرکز و اندازه باید بر اساس جایگاه موردنظر پژوهشگر تعیین شوند."
      : "Each box side: 4 to 28 Å. Center and size must be chosen by the researcher for the intended site."}</p>
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" disabled={!status?.ready || busy} onClick={() => void submit()}
        className="rounded-lg bg-emerald-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">
        {busy ? (fa ? "در حال محاسبه…" : "Docking…") : (fa ? "اجرای داکینگ" : "Run docking")}
      </button>
      <a href="https://autodock-vina.readthedocs.io/en/stable/docking_basic.html" target="_blank" rel="noreferrer" className="text-xs text-emerald-200 underline">
        {fa ? "راهنمای آماده‌سازی ورودی ↗" : "Input preparation guide ↗"}
      </a>
    </div>
    {busy && <p role="status" className="text-sm text-slate-300">{fa ? "محاسبه ممکن است تا ۹۰ ثانیه طول بکشد." : "The calculation may take up to 90 seconds."}</p>}
    {error && <p role="alert" className="text-sm text-amber-200">{error}</p>}
    {result && <div className="space-y-3 rounded-xl border border-slate-600 bg-[#172743] p-4">
      <div>
        <h4 className="font-bold text-emerald-200">{fa ? "نتیجه محاسباتی" : "Computational result"}</h4>
        <p className="mt-1 text-xs text-slate-300">{fa
          ? "امتیاز Vina یک تخمین مدل است، نه اثبات اتصال، اثربخشی یا ایمنی. کیفیت ورودی و تنظیم جعبه باید مستقل اعتبارسنجی شوند."
          : "A Vina score is a model estimate, not proof of binding, efficacy or safety. Input preparation and the search box need independent validation."}</p>
      </div>
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead><tr><th scope="col" className="py-2 text-start">{fa ? "حالت" : "Pose"}</th>
          <th scope="col" className="py-2 text-start">{fa ? "امتیاز Vina" : "Vina score"} ({result.energy_units})</th></tr></thead>
        <tbody>{result.scores.map((score, index) => <tr key={index} className="border-t border-slate-600"><td className="py-2">{index + 1}</td>
          <td className="py-2" dir="ltr">{score}</td></tr>)}</tbody>
      </table></div>
      <p className="text-xs text-slate-300">{result.engine} {result.engine_version} · seed {result.seed} · exhaustiveness {result.exhaustiveness}
        {" · "}{fa ? "تکمیل" : "Completed"}: {result.completed_at}</p>
      <p className="break-all text-xs text-slate-300">Receptor SHA-256: {result.receptor_sha256}<br />Ligand SHA-256: {result.ligand_sha256}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} onClick={() => saveFile("vina-poses.pdbqt", result.poses_pdbqt, "text/plain;charset=utf-8")}>
          {fa ? "دریافت حالت‌ها PDBQT" : "Download poses PDBQT"}</button>
        <button type="button" className={button} onClick={() => saveFile("vina-result.json", JSON.stringify(result, null, 2), "application/json;charset=utf-8")}>
          {fa ? "دریافت گزارش JSON" : "Download JSON report"}</button>
      </div>
      <p className="text-xs text-slate-300">{fa ? "نتیجه موقتی است؛ پیش از خروج آن را دریافت کنید." : "The result is temporary; download it before leaving."}</p>
    </div>}
  </section>;
}
