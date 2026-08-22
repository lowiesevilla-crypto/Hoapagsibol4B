"use client";

import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BillingAutomationFormLock } from "@/components/billing-automation-form-lock";
import type { BillingGenerationScope } from "@/lib/services/billing-rules";

type HomeownerOption = {
  id: string;
  label: string;
  search: string;
};

type HomeownerSearchResponse = {
  homeowners?: HomeownerOption[];
  total?: number;
};

export function BillingGenerationScopeFields({
  homeowners,
  blocks,
  phases,
  defaultScope,
  defaultHomeownerId,
  defaultHomeownerIds,
  defaultBlock,
  defaultPhase,
}: {
  homeowners: HomeownerOption[];
  blocks: string[];
  phases: string[];
  defaultScope: BillingGenerationScope;
  defaultHomeownerId?: string;
  defaultHomeownerIds: string[];
  defaultBlock?: string;
  defaultPhase?: string;
}) {
  const [scope, setScope] = useState<BillingGenerationScope>(defaultScope);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(defaultHomeownerIds));
  const [remoteMatches, setRemoteMatches] = useState<HomeownerOption[]>([]);
  const [remoteTotal, setRemoteTotal] = useState<number | null>(null);
  const [remoteReady, setRemoteReady] = useState(false);
  const [loading, setLoading] = useState(false);

  const localMatches = useMemo(() => {
    const term = normalizeSearch(query);
    return homeowners.filter((homeowner) => !term || normalizeSearch(homeowner.search).includes(term));
  }, [homeowners, query]);

  useEffect(() => {
    const term = query.trim();
    if (!term || (scope !== "HOMEOWNER" && scope !== "SELECTED")) {
      setRemoteMatches([]);
      setRemoteTotal(null);
      setRemoteReady(false);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setRemoteReady(false);
      try {
        const response = await fetch(`/api/admin/homeowners/search?q=${encodeURIComponent(term)}&limit=100`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error("Homeowner search failed.");
        const payload = await response.json() as HomeownerSearchResponse;
        setRemoteMatches(Array.isArray(payload.homeowners) ? payload.homeowners : []);
        setRemoteTotal(typeof payload.total === "number" ? payload.total : null);
        setRemoteReady(true);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setRemoteMatches([]);
          setRemoteTotal(null);
          setRemoteReady(false);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query, scope]);

  const remoteSearchActive = Boolean(query.trim()) && (scope === "HOMEOWNER" || scope === "SELECTED");
  const matches = remoteSearchActive && remoteReady ? remoteMatches : localMatches;

  return <>
    <BillingAutomationFormLock scope="section" updateSectionDescription />
    <div>
      <label className="label">Generation scope</label>
      <select className="field" name="scope" value={scope} onChange={(event) => setScope(event.target.value as BillingGenerationScope)}>
        <option value="ALL">All eligible homeowners</option>
        <option value="HOMEOWNER">Individual homeowner</option>
        <option value="SELECTED">Selected homeowners</option>
        {blocks.length > 0 && <option value="BLOCK">Block</option>}
        {phases.length > 0 && <option value="PHASE">Phase</option>}
      </select>
    </div>

    {scope === "HOMEOWNER" && <div className="md:col-span-2">
      <label className="label">Selected homeowner</label>
      <div className="relative mb-2"><Search className="pointer-events-none absolute left-3.5 top-3 size-4 text-slate-400" /><input className="field pl-10" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, block, lot, account, or email" autoComplete="off" /></div>
      <select className="field" name="homeownerId" defaultValue={defaultHomeownerId ?? ""} required={scope === "HOMEOWNER"}>
        <option value="">Select homeowner</option>
        {matches.map((homeowner) => <option key={homeowner.id} value={homeowner.id}>{homeowner.label}</option>)}
      </select>
      {loading && <p className="mt-1 text-xs font-semibold text-slate-500">Searching all active homeowners in this tenant...</p>}
      {!loading && remoteSearchActive && remoteReady && remoteTotal !== null && remoteTotal > matches.length && <p className="mt-1 text-xs font-semibold text-slate-500">Showing {matches.length} of {remoteTotal} matches. Keep typing to narrow the result.</p>}
      {!loading && !matches.length && <p className="mt-1 text-xs font-bold text-rose-700">No homeowner found.</p>}
    </div>}

    {scope === "SELECTED" && <div className="md:col-span-3">
      {[...selectedIds].map((id) => <input key={id} type="hidden" name="homeownerIds" value={id} />)}
      <label className="label">Selected homeowners</label>
      <div className="relative mb-2"><Search className="pointer-events-none absolute left-3.5 top-3 size-4 text-slate-400" /><input className="field pl-10" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, block, lot, account, or email" autoComplete="off" /></div>
      <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2">
        {matches.map((homeowner) => <label key={homeowner.id} className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold hover:bg-slate-50">
          <input className="size-4 accent-pine-600" type="checkbox" value={homeowner.id} checked={selectedIds.has(homeowner.id)} onChange={(event) => {
            setSelectedIds((current) => {
              const next = new Set(current);
              if (event.target.checked) next.add(homeowner.id);
              else next.delete(homeowner.id);
              return next;
            });
          }} />
          <span>{homeowner.label}</span>
        </label>)}
        {loading && <p className="px-3 py-3 text-center text-sm font-semibold text-slate-500">Searching all active homeowners in this tenant...</p>}
        {!loading && !matches.length && <p className="px-3 py-8 text-center text-sm font-semibold text-slate-500">No homeowner found.</p>}
      </div>
      {!loading && remoteSearchActive && remoteReady && remoteTotal !== null && remoteTotal > matches.length && <p className="mt-1 text-xs font-semibold text-slate-500">Showing {matches.length} of {remoteTotal} matches. Keep typing to narrow the result.</p>}
      {selectedIds.size > 0 && <p className="mt-1 text-xs font-semibold text-pine-700">{selectedIds.size} homeowner{selectedIds.size === 1 ? "" : "s"} selected.</p>}
    </div>}

    {scope === "BLOCK" && <div>
      <label className="label">Block</label>
      <select className="field" name="block" defaultValue={defaultBlock ?? ""} required={scope === "BLOCK"}>
        <option value="">Select block</option>
        {blocks.map((block) => <option key={block} value={block}>Block {block}</option>)}
      </select>
    </div>}

    {scope === "PHASE" && <div>
      <label className="label">Phase</label>
      <select className="field" name="phase" defaultValue={defaultPhase ?? ""} required={scope === "PHASE"}>
        <option value="">Select phase</option>
        {phases.map((phase) => <option key={phase} value={phase}>{phase}</option>)}
      </select>
    </div>}
  </>;
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9@._#:-]+/g, " ")
    .trim();
}
