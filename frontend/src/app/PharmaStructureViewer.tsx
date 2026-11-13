"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type Structure = {
  id: string; title: string; method: string; resolution_angstrom: number | null;
  release_date: string; revision_date: string; citation_title: string;
  doi: string; doi_url: string; source_url: string; coordinate_url: string;
  retrieved_at: string; cif: string;
};
type Props = {
  call: (path: string, init?: RequestInit) => Promise<any>;
  lang?: string;
};

export default function PharmaStructureViewer({ call, lang }: Props) {
  const fa = lang === "fa";
  const [input, setInput] = useState("");
  const [entry, setEntry] = useState<Structure | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [libraryReady, setLibraryReady] = useState(false);
  const [libraryFailed, setLibraryFailed] = useState(false);
  const [renderError, setRenderError] = useState("");
  const [showHetero, setShowHetero] = useState(true);
  const box = useRef<HTMLDivElement>(null);
  const viewer = useRef<any>(null);
  const request = useRef(0);

  useEffect(() => {
    if ((window as any).$3Dmol) setLibraryReady(true);
    return () => { request.current += 1; };
  }, []);

  const load = async () => {
    const id = input.trim().toUpperCase();
    if (!/^[0-9][A-Z0-9]{3}$/.test(id)) {
      setError(fa ? "یک شناسه چهارحرفی PDB وارد کنید، مثل 4HHB." : "Enter a four-character PDB ID, e.g. 4HHB.");
      return;
    }
    const n = ++request.current;
    setEntry(null); setError(""); setRenderError(""); setLoading(true);
    try {
      const result = await call(`/pharma/structures/${encodeURIComponent(id)}`);
      if (n === request.current) setEntry(result);
    } catch {
      if (n === request.current) setError(fa
        ? "دریافت ساختار ممکن نشد. شناسه، دسترسی و اتصال به RCSB را بررسی کنید."
        : "Could not load the structure. Check the ID, access and RCSB availability.");
    } finally {
      if (n === request.current) setLoading(false);
    }
  };

  useEffect(() => {
    const lib = (window as any).$3Dmol;
    if (!entry || !libraryReady || !box.current || !lib) return;
    let v: any;
    try {
      box.current.innerHTML = "";
      v = lib.createViewer(box.current, { backgroundColor: "#101c30" });
      if (!v) throw new Error("WebGL unavailable");
      v.addModel(entry.cif, "cif");
      v.setStyle({}, { cartoon: { color: "#a9b8c8" } });
      if (showHetero) {
        // Non-water hetero atoms can include cofactors and ions as well as ligands.
        v.setStyle({ hetflag: true, not: { resn: ["HOH", "WAT", "DOD"] } },
          { stick: { radius: 0.22, colorscheme: "greenCarbon" } });
      }
      v.zoomTo(); v.render();
      viewer.current = v; setRenderError("");
    } catch {
      setRenderError(fa ? "نمایش سه‌بعدی در این مرورگر ممکن نشد؛ فایل منبع را باز کنید."
        : "The 3D viewer could not render in this browser; open the source file instead.");
    }
    const resize = () => { try { v?.resize(); v?.render(); } catch { /* ignore */ } };
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      try { v?.clear(); } catch { /* ignore */ }
      viewer.current = null;
    };
  }, [entry, libraryReady, showHetero, fa]);

  const resetView = () => { try { viewer.current?.zoomTo(); viewer.current?.render(); } catch { /* ignore */ } };
  const button = "rounded-lg border border-slate-500 px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700 disabled:opacity-50";

  return <section aria-labelledby="pharma-3d-title" className="space-y-4 rounded-2xl border border-slate-600 bg-[#111c34] p-4 text-slate-100">
    <Script src="https://3dmol.org/build/3Dmol-min.js" strategy="afterInteractive"
      onReady={() => { setLibraryReady(true); setLibraryFailed(false); }}
      onError={() => setLibraryFailed(true)} />
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">RCSB PDB · 3D</p>
      <h3 id="pharma-3d-title" className="mt-1 text-xl font-bold">{fa ? "ساختار تجربی سه‌بعدی" : "Experimental 3D structure"}</h3>
      <p className="mt-1 text-sm text-slate-300">{fa
        ? "شناسه PDB ساختار موردنظر را وارد کنید؛ ارتباط آن با داروی انتخاب‌شده خودکار تأیید نمی‌شود."
        : "Enter a PDB ID. Its relationship to the selected drug is not automatically verified."}</p>
    </div>
    <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); void load(); }}>
      <label htmlFor="pharma-pdb-id" className="sr-only">{fa ? "شناسه PDB" : "PDB ID"}</label>
      <input id="pharma-pdb-id" dir="ltr" value={input} maxLength={4}
        onChange={(event) => setInput(event.target.value.toUpperCase())}
        placeholder="PDB ID · 4HHB" autoComplete="off"
        className="min-w-40 flex-1 rounded-lg border border-slate-500 bg-[#0c182a] px-3 py-2 text-white placeholder:text-slate-400" />
      <button type="submit" disabled={loading} className="rounded-lg bg-emerald-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">
        {loading ? (fa ? "در حال دریافت…" : "Loading…") : (fa ? "بارگذاری ساختار" : "Load structure")}
      </button>
    </form>
    {error && <p role="alert" className="text-sm text-amber-200">{error}</p>}
    {libraryFailed && <p role="alert" className="text-sm text-amber-200">{fa ? "کتابخانه نمایش سه‌بعدی بارگذاری نشد." : "The 3D viewer library could not be loaded."}</p>}
    {entry && <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(240px,1fr)]">
      <div className="space-y-2">
        <div ref={box} aria-label={fa ? "نمایش سه‌بعدی ساختار" : "3D structure viewer"}
          className="relative h-[360px] w-full overflow-hidden rounded-xl border border-slate-600 bg-[#101c30]" />
        {!libraryReady && !libraryFailed && <p role="status" className="text-sm text-slate-300">{fa ? "در حال آماده‌سازی نمایشگر…" : "Preparing 3D viewer…"}</p>}
        {renderError && <p role="alert" className="text-sm text-amber-200">{renderError}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={button} onClick={resetView}>{fa ? "بازنشانی نما" : "Reset view"}</button>
          <button type="button" className={button} aria-pressed={showHetero} onClick={() => setShowHetero((x) => !x)}>
            {showHetero ? (fa ? "پنهان‌کردن اجزای غیرپروتئینی" : "Hide non-polymer atoms") : (fa ? "نمایش اجزای غیرپروتئینی" : "Show non-polymer atoms")}
          </button>
        </div>
        <p className="text-xs text-slate-300">{fa
          ? "اجزای غیرپروتئینی ممکن است شامل لیگاند، کوفاکتور یا یون باشند؛ نمایش آن‌ها نتیجه Docking نیست."
          : "Non-polymer atoms may include ligands, cofactors or ions; their display is not a docking result."}</p>
      </div>
      <div className="space-y-3 rounded-xl border border-slate-600 bg-[#172743] p-4 text-sm">
        <h4 className="font-bold text-emerald-200">{fa ? "جزئیات و منبع" : "Entry & source"}</h4>
        <p><span className="text-slate-300">PDB ID: </span><a href={entry.source_url} target="_blank" rel="noreferrer" className="font-semibold text-emerald-200 underline">{entry.id} ↗</a></p>
        <p>{entry.title || "—"}</p>
        <p><span className="text-slate-300">{fa ? "روش: " : "Method: "}</span>{entry.method || (fa ? "گزارش نشده" : "Not reported")}</p>
        <p><span className="text-slate-300">{fa ? "تفکیک‌پذیری: " : "Resolution: "}</span>{entry.resolution_angstrom != null ? `${entry.resolution_angstrom} Å` : (fa ? "گزارش نشده" : "Not reported")}</p>
        <p><span className="text-slate-300">{fa ? "انتشار / ویرایش: " : "Released / revised: "}</span>{entry.release_date?.slice(0, 10) || "—"} / {entry.revision_date?.slice(0, 10) || "—"}</p>
        {entry.citation_title && <p><span className="text-slate-300">{fa ? "مقاله: " : "Citation: "}</span>{entry.citation_title}</p>}
        {entry.doi_url && <a href={entry.doi_url} target="_blank" rel="noreferrer" className="block break-all text-emerald-200 underline">DOI: {entry.doi} ↗</a>}
        <a href={entry.coordinate_url} target="_blank" rel="noreferrer" className="block text-emerald-200 underline">{fa ? "دریافت مختصات mmCIF ↗" : "Download mmCIF coordinates ↗"}</a>
        <p className="text-xs text-slate-300">{fa ? "زمان دریافت" : "Retrieved"}: {entry.retrieved_at}</p>
      </div>
    </div>}
  </section>;
}
