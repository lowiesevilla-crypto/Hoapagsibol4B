"use client";

import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { BillingGenerationRow } from "@/lib/services/billing-rules";
import { money } from "@/lib/utils";

type SortKey = "homeownerName" | "block" | "lot" | "existingBalance" | "ruleAmount" | "action";
type SortDirection = "asc" | "desc";

const pageSize = 10;

export function BillingPreviewTable({ rows }: { rows: BillingGenerationRow[] }) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("homeownerName");
  const [direction, setDirection] = useState<SortDirection>("asc");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const matching = rows.filter((row) => {
      if (!term) return true;
      return [
        row.homeownerName,
        row.block,
        row.lot,
        row.phase ?? "",
        row.action,
        row.message,
        row.resolutionReference ?? "",
      ].join(" ").toLowerCase().includes(term);
    });
    return [...matching].sort((left, right) => compareRows(left, right, sortKey, direction));
  }, [rows, query, sortKey, direction]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  function changeSort(nextKey: SortKey) {
    setPage(1);
    if (nextKey === sortKey) {
      setDirection((current) => current === "asc" ? "desc" : "asc");
      return;
    }
    setSortKey(nextKey);
    setDirection("asc");
  }

  return <div className="mt-4">
    <div className="mb-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <label className="relative block">
        <span className="sr-only">Search billing preview</span>
        <Search className="pointer-events-none absolute left-3.5 top-3 size-4 text-slate-400" />
        <input className="field pl-10" type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search homeowner, block, lot, action, or resolution" />
      </label>
      <p className="text-sm font-semibold text-slate-500">{filtered.length} of {rows.length} preview rows</p>
    </div>
    <div className="table-wrap shadow-none">
      <table className="data-table min-w-[1300px]">
        <thead><tr>
          <SortableHeader label="Homeowner" sortKey="homeownerName" activeKey={sortKey} direction={direction} onSort={changeSort} />
          <SortableHeader label="Block" sortKey="block" activeKey={sortKey} direction={direction} onSort={changeSort} />
          <SortableHeader label="Lot" sortKey="lot" activeKey={sortKey} direction={direction} onSort={changeSort} />
          <SortableHeader label="Existing balance" sortKey="existingBalance" activeKey={sortKey} direction={direction} onSort={changeSort} />
          <SortableHeader label="Rule amount" sortKey="ruleAmount" activeKey={sortKey} direction={direction} onSort={changeSort} />
          <th>Resolution</th>
          <th>Exemption status</th>
          <th>Duplicate status</th>
          <SortableHeader label="Final action" sortKey="action" activeKey={sortKey} direction={direction} onSort={changeSort} />
          <th>Message</th>
        </tr></thead>
        <tbody>
          {visible.map((row) => <tr key={row.homeownerId}>
            <td className="font-bold">{row.homeownerName}</td>
            <td>{row.block}</td>
            <td>{row.lot}</td>
            <td>{money(row.existingBalance)}</td>
            <td>{money(row.ruleAmount)}</td>
            <td>{row.resolutionReference ?? "-"}</td>
            <td>{row.exemptionStatus}</td>
            <td>{row.duplicateStatus}</td>
            <td><span className={`rounded-full px-2.5 py-1 text-xs font-black ${actionTone(row.action)}`}>{row.action}</span></td>
            <td className="max-w-xs text-sm text-slate-500">{row.message}</td>
          </tr>)}
          {!visible.length && <tr><td colSpan={10} className="py-10 text-center text-slate-500">No preview rows match that search.</td></tr>}
        </tbody>
      </table>
    </div>
    {pageCount > 1 && <nav className="mt-3 flex items-center justify-between gap-3 text-sm">
      <button className="btn-secondary" type="button" disabled={safePage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button>
      <span className="font-bold">Page {safePage} of {pageCount}</span>
      <button className="btn-secondary" type="button" disabled={safePage >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Next</button>
    </nav>}
  </div>;
}

function SortableHeader({ label, sortKey, activeKey, direction, onSort }: { label: string; sortKey: SortKey; activeKey: SortKey; direction: SortDirection; onSort: (key: SortKey) => void }) {
  const active = sortKey === activeKey;
  return <th><button className="inline-flex items-center gap-1 font-black" type="button" onClick={() => onSort(sortKey)}>{label}{active && (direction === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />)}</button></th>;
}

function compareRows(left: BillingGenerationRow, right: BillingGenerationRow, key: SortKey, direction: SortDirection) {
  const multiplier = direction === "asc" ? 1 : -1;
  const leftValue = left[key];
  const rightValue = right[key];
  if (typeof leftValue === "number" && typeof rightValue === "number") return (leftValue - rightValue) * multiplier;
  return String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true, sensitivity: "base" }) * multiplier;
}

function actionTone(action: string) {
  if (action === "CREATE") return "bg-emerald-100 text-emerald-700";
  if (action === "SKIP_EXEMPT") return "bg-blue-100 text-blue-700";
  if (action === "SKIP_DUPLICATE") return "bg-amber-100 text-amber-800";
  if (action === "ERROR") return "bg-rose-100 text-rose-700";
  return "bg-slate-100 text-slate-700";
}
