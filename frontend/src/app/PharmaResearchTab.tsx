"use client";

import React, { useEffect, useMemo, useState } from "react";

type CatalogItem = {
  id: string;
  drug: string;
  pathway: string;
  genes: string[];
  curation_status: string;
  source_title: string;
  source_url?: string | null;
  note: string;
};

type Organization = { id: string; name: string; role: string };
type Props = {
  call: (path: string, init?: RequestInit) => Promise<any>;
  notify?: (message: string, kind?: "error" | "ok") => void;
};

/**
 * Starter UI for the Pharma Research catalog + organization-scoped projects.
 * `call` should be the existing authenticated apiFetch wrapper from page.tsx.
 */
export default function PharmaResearchTab({ call, notify }: Props) {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [orgId, setOrgId] = useState("");
  const [orgName, setOrgName] = useState("");
  const [selected, setSelected] = useState("");
  const [projectName, setProjectName] = useState("");
  const [organism, setOrganism] = useState("Homo sapiens");
  const [dose, setDose] = useState("");
  const [duration, setDuration] = useState("");
  const [notes, setNotes] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [projects, setProjects] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const chosen = useMemo(() => catalog.find((x) => x.id === selected), [catalog, selected]);

  async function refreshOrgs() {
    const res = await call("/pharma/organizations");
    const items = res.items || [];
    setOrgs(items);
    if (!orgId && items[0]?.id) setOrgId(items[0].id);
  }

  async function refreshProjects(id = orgId) {
    if (!id) { setProjects([]); return; }
    const res = await call(`/pharma/organizations/${encodeURIComponent(id)}/projects`);
    setProjects(res.items || []);
  }

  useEffect(() => {
    let alive = true;
    Promise.all([call("/pharma/catalog"), call("/pharma/organizations")])
      .then(([c, o]) => {
        if (!alive) return;
        setCatalog(c.items || []);
        const items = o.items || [];
        setOrgs(items);
        if (items[0]?.id) setOrgId(items[0].id);
      })
      .catch((e) => { if (alive) setErr(String(e?.message || e)); });
    return () => { alive = false; };
    // Authenticated `call` is stable in the host page via useCallback.
  }, [call]);

  useEffect(() => {
    if (!orgId) { setProjects([]); return; }
    refreshProjects(orgId).catch((e) => setErr(String(e?.message || e)));
    // refreshProjects depends only on the current organization and API wrapper.
  }, [orgId, call]);

  async function run(action: () => Promise<void>) {
    setBusy(true); setErr("");
    try { await action(); }
    catch (e: any) { const msg = String(e?.message || e); setErr(msg); notify?.(msg, "error"); }
    finally { setBusy(false); }
  }

  async function createOrg() {
    if (!orgName.trim()) return;
    await run(async () => {
      const created = await call("/pharma/organizations", { method: "POST", body: JSON.stringify({ name: orgName.trim() }) });
      setOrgName("");
      await refreshOrgs();
      setOrgId(created.id);
      notify?.("Organization created", "ok");
    });
  }

  async function addMember() {
    if (!orgId || !memberEmail.trim()) return;
    await run(async () => {
      await call(`/pharma/organizations/${encodeURIComponent(orgId)}/members`, {
        method: "POST", body: JSON.stringify({ email: memberEmail.trim(), role: "researcher" }),
      });
      setMemberEmail("");
      notify?.("Member added", "ok");
    });
  }

  async function saveProject() {
    if (!orgId || !chosen || !projectName.trim()) return;
    await run(async () => {
      await call(`/pharma/organizations/${encodeURIComponent(orgId)}/projects`, {
        method: "POST",
        body: JSON.stringify({
          name: projectName.trim(), drug: chosen.drug, pathway: chosen.pathway,
          organism, genes: chosen.genes, dose_text: dose.trim(), duration_text: duration.trim(), notes: notes.trim(),
        }),
      });
      setProjectName(""); setDose(""); setDuration(""); setNotes("");
      await refreshProjects(orgId);
      notify?.("Research project saved", "ok");
    });
  }

  const input = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm";
  const button = "rounded-xl bg-[#16233f] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-xl font-bold text-[#16233f]">Pharma Research</h2>
        <p className="mt-1 text-sm text-slate-600">Research workspace for drug, pathway and candidate-gene planning. Not for treatment or clinical decisions.</p>
      </header>

      <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        Demo catalog only: entries are unverified research candidates, not curated evidence. Add primary references and expert review before relying on them.
      </div>
      {err && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{err}</div>}

      <section className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 rounded-2xl border p-4">
          <h3 className="font-semibold">Organization workspace</h3>
          {orgs.length > 0 && <select className={input} value={orgId} onChange={(e) => setOrgId(e.target.value)}>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name} · {o.role}</option>)}
          </select>}
          <div className="flex gap-2"><input className={input} value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="New organization name" />
            <button className={button} disabled={busy || !orgName.trim()} onClick={createOrg}>Create</button></div>
          {orgId && <div className="flex gap-2"><input className={input} type="email" value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} placeholder="Registered member email" />
            <button className={button} disabled={busy || !memberEmail.trim()} onClick={addMember}>Add member</button></div>}
          <p className="text-xs text-slate-500">Only registered accounts can be added. Owner/admin permissions and invite acceptance should be hardened before production.</p>
        </div>

        <div className="space-y-2 rounded-2xl border p-4">
          <h3 className="font-semibold">Drug / pathway candidate</h3>
          <select className={input} value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">Choose a research panel</option>
            {catalog.map((x) => <option key={x.id} value={x.id}>{x.drug} · {x.pathway}</option>)}
          </select>
          {chosen && <div className="space-y-1 text-sm">
            <p><b>Candidate genes:</b> {chosen.genes.join(", ")}</p>
            <p className="text-xs text-slate-600">{chosen.note}</p>
            <p className="text-xs text-slate-500">Provenance: {chosen.source_title}</p>
          </div>}
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border bg-slate-50 p-4">
        <h3 className="font-semibold">Create research project</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <input className={input} value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Project name" />
          <input className={input} value={organism} onChange={(e) => setOrganism(e.target.value)} placeholder="Organism / model" />
          <input className={input} value={dose} onChange={(e) => setDose(e.target.value)} placeholder="Dose / concentration (record only)" />
          <input className={input} value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="Treatment duration (record only)" />
        </div>
        <textarea className={input} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Research hypothesis and notes. Do not enter patient-identifiable data." />
        <button className={button} disabled={busy || !orgId || !chosen || !projectName.trim()} onClick={saveProject}>Save project</button>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold">Organization projects</h3>
        {projects.length === 0 ? <p className="text-sm text-slate-500">No projects yet.</p> : projects.map((p) => <article key={p.id} className="rounded-xl border p-3 text-sm">
          <div className="font-semibold">{p.name}</div>
          <div className="text-slate-600">{p.drug} · {p.pathway} · {p.organism}</div>
          <div className="text-slate-600">Genes: {(p.genes || []).join(", ") || "none"}</div>
        </article>)}
      </section>
    </div>
  );
}
