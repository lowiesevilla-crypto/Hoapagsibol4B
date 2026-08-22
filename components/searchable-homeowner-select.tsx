"use client";

import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export type SearchableHomeownerOption = {
  id: string;
  label: string;
  search: string;
};

type HomeownerSearchResponse = {
  homeowners?: SearchableHomeownerOption[];
  total?: number;
};

export function SearchableHomeownerSelect({
  name,
  label,
  homeowners,
  defaultValue = "",
  required = false,
  placeholder = "Search name, block, lot, account, or email",
  searchEndpoint,
}: {
  name: string;
  label: string;
  homeowners: SearchableHomeownerOption[];
  defaultValue?: string;
  required?: boolean;
  placeholder?: string;
  searchEndpoint?: string;
}) {
  const [query, setQuery] = useState("");
  const [remoteMatches, setRemoteMatches] = useState<SearchableHomeownerOption[]>([]);
  const [remoteTotal, setRemoteTotal] = useState<number | null>(null);
  const [remoteReady, setRemoteReady] = useState(false);
  const [loading, setLoading] = useState(false);

  const localMatches = useMemo(() => {
    const term = normalizeSearch(query);
    return homeowners.filter((homeowner) => !term || normalizeSearch(homeowner.search).includes(term));
  }, [homeowners, query]);

  const remoteSearchActive = Boolean(searchEndpoint && query.trim());

  useEffect(() => {
    const term = query.trim();
    if (!searchEndpoint || !term) {
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
        const separator = searchEndpoint.includes("?") ? "&" : "?";
        const response = await fetch(`${searchEndpoint}${separator}q=${encodeURIComponent(term)}&limit=100`, {
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
  }, [query, searchEndpoint]);

  const matches = remoteSearchActive && remoteReady ? remoteMatches : localMatches;

  return <div>
    <label className="label">{label}</label>
    <div className="relative mb-2">
      <Search className="pointer-events-none absolute left-3.5 top-3 size-4 text-slate-400" />
      <input className="field pl-10" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} autoComplete="off" />
    </div>
    <select className="field" name={name} defaultValue={defaultValue} required={required}>
      <option value="">Select homeowner</option>
      {matches.map((homeowner) => <option key={homeowner.id} value={homeowner.id}>{homeowner.label}</option>)}
    </select>
    {loading && <p className="mt-1 text-xs font-semibold text-slate-500">Searching all homeowners in this tenant...</p>}
    {!loading && remoteSearchActive && remoteReady && remoteTotal !== null && remoteTotal > matches.length && <p className="mt-1 text-xs font-semibold text-slate-500">Showing {matches.length} of {remoteTotal} matches. Keep typing to narrow the result.</p>}
    {!loading && !matches.length && <p className="mt-1 text-xs font-bold text-rose-700">No homeowner found.</p>}
  </div>;
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9@._#:-]+/g, " ")
    .trim();
}
