"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";

export const API = process.env.NEXT_PUBLIC_API_URL || "https://primer-ai.onrender.com";
export type Lang = "en" | "fa";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
export const fmt = (s: string = "", p: Record<string, any> = {}) => s.replace(/\{(\w+)\}/g, (_, k) => String(p[k] ?? ""));
export const norm = (s: string) => s.split("\n").filter((l) => !l.trim().startsWith(">")).join("").replace(/[\s\d]/g, "").toUpperCase().replace(/U/g, "T");
export const AA3: Record<string, string> = { ALA: "A", ARG: "R", ASN: "N", ASP: "D", CYS: "C", GLN: "Q", GLU: "E", GLY: "G", HIS: "H", ILE: "I", LEU: "L", LYS: "K", MET: "M", PHE: "F", PRO: "P", SER: "S", THR: "T", TRP: "W", TYR: "Y", VAL: "V" };

export async function apiFetch(path: string, token: string | null, init: RequestInit = {}) {
  const headers: Record<string, string> = { ...((init.headers as any) || {}) };
  if (init.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try { res = await fetch(API + path, { ...init, headers }); } catch { throw Object.assign(new Error("network"), { code: "network" }); }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (typeof j.detail === "string") msg = j.detail;
      else if (Array.isArray(j.detail)) msg = j.detail.map((d: any) => d.msg).join("; ");
    } catch { /* ignore */ }
    throw Object.assign(new Error(msg), { code: res.status === 429 ? "rate" : res.status === 401 ? "auth" : "http" });
  }
  return res.json();
}

export function download(name: string, text: string, mime = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const inputCls = "w-full border border-slate-300 rounded-lg p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500";
export const seqCls = inputCls + " font-mono text-sm";
export const btnBase = "px-4 py-2 rounded-lg font-semibold text-sm disabled:opacity-50 transition-colors";
export const riskCls: Record<string, string> = { low: "bg-green-100 text-green-800", medium: "bg-yellow-100 text-yellow-800", high: "bg-red-100 text-red-800" };

export type Ctx = { t: Record<string, string>; lang: Lang; call: (p: string, i?: RequestInit) => Promise<any>; token: string | null; notify: (m: string, k?: "error" | "ok") => void; fail: (e: any) => void };

export function Field({ label, hint, children }: { label: string; hint?: string; children: any }) {
  return (<label className="block"><span className="block text-sm font-semibold mb-1 text-slate-700">{label}</span>{children}{hint && <span className="block text-xs text-slate-500 mt-1">{hint}</span>}</label>);
}
export function Btn({ children, onClick, disabled, kind = "primary", title }: { children: any; onClick?: () => void; disabled?: boolean; kind?: "primary" | "ghost" | "danger" | "dark"; title?: string }) {
  const k = { primary: "bg-blue-700 hover:bg-blue-800 text-white", ghost: "bg-slate-100 hover:bg-slate-200 text-slate-800", danger: "bg-red-50 hover:bg-red-100 text-red-700", dark: "bg-slate-800 hover:bg-slate-900 text-white" }[kind];
  return <button title={title} onClick={onClick} disabled={disabled} className={`${btnBase} ${k}`}>{children}</button>;
}
export function Risk({ v, t }: { v: string; t: Record<string, string> }) { return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${riskCls[v] || "bg-slate-100"}`}>{t["risk_" + v] || v}</span>; }
export function CopyBtn({ text, t }: { text: string; t: Record<string, string> }) {
  const [ok, setOk] = useState(false);
  return <button className="text-xs text-blue-700 shrink-0 ms-2" onClick={() => { navigator.clipboard?.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); }}>{ok ? t.copied : t.copy}</button>;
}
export function worstOf(...r: string[]) { return r.sort((a, b) => ["low", "medium", "high"].indexOf(b) - ["low", "medium", "high"].indexOf(a))[0]; }

