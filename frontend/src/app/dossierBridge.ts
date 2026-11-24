/* Tiny queue shared by the tool panels and the workspace panel. Results are parked in localStorage
   until the user files them into a dossier; nothing is sent to the server from here. */
export type QueueItem = { id: string; kind: string; title: string; data?: any; text?: string; added_at: string };

const KEY = "primer:dossier-queue:v1";
const MAX_ITEMS = 30;
const MAX_BYTES = 300_000;
const HEAVY = ["rows", "per_residue", "identity_per_column", "alignment", "frames", "consensus", "csv", "cds_rows", "plates"];

export function slim(obj: any): any {
  if (Array.isArray(obj)) return obj.slice(0, 200).map(slim);
  if (obj && typeof obj === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(obj)) if (!HEAVY.includes(k)) out[k] = slim(v);
    return out;
  }
  return obj;
}

export function readQueue(): QueueItem[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

function write(items: QueueItem[]): boolean {
  try { window.localStorage.setItem(KEY, JSON.stringify(items)); window.dispatchEvent(new Event("primer-dossier-queue")); return true; }
  catch { return false; }
}

export function addToQueue(item: { kind: string; title: string; data?: any; text?: string }): { ok: boolean; reason?: string } {
  const entry: QueueItem = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, kind: item.kind, title: item.title.slice(0, 160),
    data: item.data !== undefined ? slim(item.data) : undefined, text: item.text?.slice(0, 60000), added_at: new Date().toISOString() };
  if (JSON.stringify(entry).length > MAX_BYTES) return { ok: false, reason: "too-large" };
  const q = readQueue();
  if (q.length >= MAX_ITEMS) return { ok: false, reason: "queue-full" };
  return write([...q, entry]) ? { ok: true } : { ok: false, reason: "storage" };
}

export const removeFromQueue = (id: string) => { write(readQueue().filter((x) => x.id !== id)); };
export const clearQueue = () => { write([]); };
