"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { BillingGenerationScope } from "@/lib/services/billing-rules";

type HomeownerOption = {
  id: string;
  label: string;
  search: string;
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
  const selected = new Set(defaultHomeownerIds);
  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    return homeowners.filter((homeowner) => !term || homeowner.search.includes(term)).slice(0, 80);
  }, [homeowners, query]);

  return <>
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
      <div className="relative mb-2"><Search className="pointer-events-none absolute left-3.5 top-3 size-4 text-slate-400" /><input className="field pl-10" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, block, lot, or account" autoComplete="off" /></div>
      <select className="field" name="homeownerId" defaultValue={defaultHomeownerId ?? ""} required={scope === "HOMEOWNER"}>
        <option value="">Select homeowner</option>
        {matches.map((homeowner) => <option key={homeowner.id} value={homeowner.id}>{homeowner.label}</option>)}
      </select>
      {!matches.length && <p className="mt-1 text-xs font-bold text-rose-700">No homeowner found.</p>}
    </div>}

    {scope === "SELECTED" && <div className="md:col-span-3">
      <label className="label">Selected homeowners</label>
      <div className="relative mb-2"><Search className="pointer-events-none absolute left-3.5 top-3 size-4 text-slate-400" /><input className="field pl-10" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, block, lot, or account" autoComplete="off" /></div>
      <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2">
        {matches.map((homeowner) => <label key={homeowner.id} className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold hover:bg-slate-50">
          <input className="size-4 accent-pine-600" type="checkbox" name="homeownerIds" value={homeowner.id} defaultChecked={selected.has(homeowner.id)} />
          <span>{homeowner.label}</span>
        </label>)}
        {!matches.length && <p className="px-3 py-8 text-center text-sm font-semibold text-slate-500">No homeowner found.</p>}
      </div>
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
