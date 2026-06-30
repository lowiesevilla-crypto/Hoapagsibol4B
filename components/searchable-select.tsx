"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";

export type SearchableSelectItem = {
  id: string;
  label: string;
  search: string;
};

export function SearchableSelect({ name, label, items, placeholder = "Search...", required = false }: { name: string; label: string; items: SearchableSelectItem[]; placeholder?: string; required?: boolean }) {
  const [query, setQuery] = useState("");
  const [value, setValue] = useState("");
  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    return items.filter((item) => !term || item.search.includes(term)).slice(0, 50);
  }, [items, query]);

  return <div>
    <label className="label">{label}</label>
    <div className="relative mb-2"><Search className="pointer-events-none absolute left-3.5 top-3 size-4 text-slate-400" /><input className="field pl-10" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} autoComplete="off" /></div>
    <select className="field" name={name} required={required} value={value} onChange={(event) => setValue(event.target.value)}>
      <option value="">Select {label.toLowerCase()}</option>
      {matches.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
    </select>
    {!matches.length && <p className="mt-1 text-xs text-rose-600">No matching records found.</p>}
  </div>;
}
