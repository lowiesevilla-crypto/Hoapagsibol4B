"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";

export type SearchableHomeownerOption = {
  id: string;
  label: string;
  search: string;
};

export function SearchableHomeownerSelect({
  name,
  label,
  homeowners,
  defaultValue = "",
  required = false,
  placeholder = "Search name, block, lot, account, or email",
}: {
  name: string;
  label: string;
  homeowners: SearchableHomeownerOption[];
  defaultValue?: string;
  required?: boolean;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    return homeowners.filter((homeowner) => !term || homeowner.search.includes(term));
  }, [homeowners, query]);

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
    {!matches.length && <p className="mt-1 text-xs font-bold text-rose-700">No homeowner found.</p>}
  </div>;
}
