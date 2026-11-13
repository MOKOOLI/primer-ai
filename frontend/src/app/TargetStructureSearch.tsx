"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";

type Protein = { id: string; source: string };
type Proteins = { proteins: Protein[]; truncated: boolean; source_url: string; retrieved_at: string };
type Matches = { uniprot: string; pdb_ids: string[]; total_count: number | null; page_size: number;
  unsupported_identifiers: number; source_url: string; uniprot_url: string; retrieved_at: string };
type Props = { targetId: string; call: (path: string, init?: RequestInit) => Promise<any>; lang?: string; onChoose: (id: string) => void };

export default function TargetStructureSearch({ targetId, call, lang, onChoose }: Props) {
  const fa = lang === "fa";
  const [open, setOpen] = useState(false);
  const [proteins, setProteins] = useState<Proteins | null>(null);
  const [busyProteins, setBusyProteins] = useState(false);
  const [proteinError, setProteinError] = useState("");
  const [matches, setMatches] = useState<Matches | null>(null);
  const [busySearch, setBusySearch] = useState(false);
  const [searchError, setSearchError] = useState("");
  const proteinRequest = useRef(0);
  const searchRequest = useRef(0);
  useEffect(() => () => { proteinRequest.current += 1; searchRequest.current += 1; }, []);

  const toggle = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (proteins) return;
    const n = ++proteinRequest.current;
    setBusyProteins(true); setProteinError("");
    try {
      const result = await call(`/pharma/targets/${encodeURIComponent(targetId)}/proteins`);
      if (n === proteinRequest.current) setProteins(result);
    } catch {
      if (n === proteinRequest.current) setProteinError(fa ? "شناسه‌های پروتئینی دریافت نشدند." : "Protein identifiers could not be loaded.");
    } finally { if (n === proteinRequest.current) setBusyProteins(false); }
  };
  const find = async (id: string) => {
    const n = ++searchRequest.current;
    setBusySearch(true); setSearchError(""); setMatches(null);
    try {
      const result = await call(`/pharma/structure-search?uniprot=${encodeURIComponent(id)}`);
      if (n === searchRequest.current) setMatches(result);
    } catch {
      if (n === searchRequest.current) setSearchError(fa ? "جست‌وجوی RCSB انجام نشد؛ دوباره تلاش کنید." : "RCSB search failed. Try again.");
    } finally { if (n === searchRequest.current) setBusySearch(false); }
  };
  return <div className="space-y-2">
    <button type="button" aria-expanded={open} onClick={() => void toggle()}
      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50">
      {open ? (fa ? "بستن جست‌وجوی ساختار" : "Close structure search") : (fa ? "یافتن ساختار هدف" : "Find target structures")}
    </button>
    {open && <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800">
      <p>{fa ? "ابتدا شناسه پروتئین هدف را انتخاب کنید؛ سپس ساختارهای تجربی مرتبط جست‌وجو می‌شوند."
        : "Select a target protein identifier to search for related experimental structures."}</p>
      {busyProteins && <p role="status">{fa ? "دریافت شناسه‌ها…" : "Loading identifiers…"}</p>}
      {proteinError && <p role="alert" className="text-red-800">{proteinError} <button type="button" className="underline" onClick={() => { setOpen(false); setProteinError(""); }}>{fa ? "بستن" : "Close"}</button></p>}
      {proteins && <>
        {!proteins.proteins.length && <p>{fa ? "شناسه UniProt معتبری برای این هدف برنگشت." : "No valid UniProt IDs were returned for this target."}</p>}
        <div className="flex flex-wrap gap-2">{proteins.proteins.map((p) =>
          <button type="button" key={`${p.source}:${p.id}`} disabled={busySearch} onClick={() => void find(p.id)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-emerald-50 disabled:opacity-50">
            {p.id} · {p.source === "uniprot_swissprot" ? "Swiss-Prot" : "TrEMBL"}
          </button>)}</div>
        {proteins.truncated && <p>{fa ? "فهرست شناسه‌ها محدود شده است؛ همه را در منبع ببینید." : "The identifier list is truncated; see the source."}</p>}
        <p><a href={proteins.source_url} target="_blank" rel="noreferrer" className="text-emerald-800 underline">Open Targets ↗</a>
          {" · "}{fa ? "زمان دریافت" : "Retrieved"}: {proteins.retrieved_at}</p>
      </>}
      {busySearch && <p role="status">{fa ? "در حال جست‌وجوی RCSB…" : "Searching RCSB…"}</p>}
      {searchError && <p role="alert" className="text-red-800">{searchError}</p>}
      {matches && <div className="space-y-2 border-t border-slate-200 pt-2">
        <p><b>UniProt: </b><a href={matches.uniprot_url} target="_blank" rel="noreferrer" className="text-emerald-800 underline">{matches.uniprot} ↗</a>
          {matches.total_count != null && <> · {fa ? "تعداد گزارش‌شده" : "Source count"}: {matches.total_count}</>}</p>
        <p>{fa ? "این‌ها ساختارهای کاندید برای پروتئین هدف هستند؛ اتصال داروی انتخاب‌شده به آن‌ها تأیید نشده است."
          : "These are candidate structures for the target protein, not proof that the selected drug is bound."}</p>
        {!matches.pdb_ids.length && <p>{fa ? "شناسه چهارکاراکتری قابل نمایش در این پاسخ نبود." : "No supported four-character PDB IDs in this response."}</p>}
        {matches.unsupported_identifiers > 0 && <p>{fa ? "برخی شناسه‌های ساختار در این نمایشگر پشتیبانی نمی‌شوند؛ منبع را ببینید." : "Some structure identifiers are unsupported by this viewer; see the source."}</p>}
        <div className="flex flex-wrap gap-2">{matches.pdb_ids.map((id) =>
          <button type="button" key={id} onClick={() => onChoose(id)}
            className="rounded-md bg-[#16233f] px-2 py-1 font-semibold text-white hover:bg-[#22325a]">{id} · 3D</button>)}</div>
        <p>{fa ? "حداکثر ۱۵ شناسه اول در اینجا نمایش داده می‌شود." : "Up to the first 15 identifiers are shown here."}
          {" "}<a href={matches.source_url} target="_blank" rel="noreferrer" className="text-emerald-800 underline">RCSB ↗</a>
          {" · "}{fa ? "زمان دریافت" : "Retrieved"}: {matches.retrieved_at}</p>
      </div>}
    </div>}
  </div>;
}
