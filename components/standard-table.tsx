"use client";

import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type StandardTableMode = "client" | "managed";

export type StandardTableProps = {
  children: ReactNode;
  mode?: StandardTableMode;
  searchLabel?: string;
  searchPlaceholder?: string;
  pageSize?: number;
  loading?: boolean;
  empty?: boolean;
  emptyMessage?: string;
  toolbar?: ReactNode;
  pagination?: ReactNode;
  className?: string;
};

/**
 * Shared HOAHub table shell.
 *
 * `client` mode adds local search and pagination without changing the caller's
 * existing row mapping or data source. `managed` mode preserves an existing
 * server-side search/pagination implementation while standardizing placement,
 * loading/empty states, and responsive layout around it.
 */
export function StandardTable({
  children,
  mode = "client",
  searchLabel = "Search table",
  searchPlaceholder = "Search records...",
  pageSize = 10,
  loading = false,
  empty = false,
  emptyMessage = "No records found.",
  toolbar,
  pagination,
  className = "",
}: StandardTableProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [rowCount, setRowCount] = useState(0);
  const [matchCount, setMatchCount] = useState(0);

  const pageCount = useMemo(() => Math.max(1, Math.ceil(matchCount / Math.max(1, pageSize))), [matchCount, pageSize]);
  const safePage = Math.min(page, pageCount);

  const applyClientView = useCallback(() => {
    if (mode !== "client") return;
    const table = contentRef.current?.querySelector("table");
    const tbody = table?.tBodies.item(0);
    if (!tbody) {
      setRowCount(0);
      setMatchCount(0);
      return;
    }

    const rows = Array.from(tbody.rows);
    const dataRows = rows.filter((row) => !isExistingEmptyRow(row));
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const matchingRows = dataRows.filter((row) => !normalizedQuery || (row.textContent || "").toLocaleLowerCase().includes(normalizedQuery));
    const nextPageCount = Math.max(1, Math.ceil(matchingRows.length / Math.max(1, pageSize)));
    const activePage = Math.min(page, nextPageCount);
    const start = (activePage - 1) * Math.max(1, pageSize);
    const end = start + Math.max(1, pageSize);
    const matchingSet = new Set(matchingRows.slice(start, end));

    for (const row of dataRows) row.hidden = !matchingSet.has(row);
    for (const row of rows.filter(isExistingEmptyRow)) row.hidden = dataRows.length > 0;

    setRowCount(dataRows.length);
    setMatchCount(matchingRows.length);
    if (activePage !== page) setPage(activePage);
  }, [mode, page, pageSize, query]);

  useEffect(() => {
    applyClientView();
    if (mode !== "client") return;
    const table = contentRef.current?.querySelector("table");
    const tbody = table?.tBodies.item(0);
    if (!tbody) return;
    const observer = new MutationObserver(() => applyClientView());
    observer.observe(tbody, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [applyClientView, mode]);

  return <div className={`space-y-3 ${className}`.trim()}>
    {mode === "client" ? <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <label className="relative block">
        <span className="sr-only">{searchLabel}</span>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <input
          className="field pl-10"
          type="search"
          value={query}
          onChange={(event) => { setQuery(event.target.value); setPage(1); }}
          placeholder={searchPlaceholder}
          aria-label={searchLabel}
        />
      </label>
      <p className="text-sm font-semibold text-slate-500" aria-live="polite">{query ? `${matchCount} of ${rowCount} records` : `${rowCount} record${rowCount === 1 ? "" : "s"}`}</p>
    </div> : toolbar}

    {loading ? <TableState message="Loading records..." /> : empty ? <TableState message={emptyMessage} /> : <div ref={contentRef}>{children}</div>}

    {mode === "client" ? <>
      {!loading && !empty && query && rowCount > 0 && matchCount === 0 && <TableState message="No records match your search." />}
      {!loading && !empty && matchCount > pageSize && <nav className="flex flex-col gap-2 border-t border-slate-100 pt-3 text-sm sm:flex-row sm:items-center sm:justify-between" aria-label="Table pagination">
        <button className="btn-secondary min-h-9 px-3 py-1.5" type="button" disabled={safePage <= 1} onClick={() => setPage(Math.max(1, safePage - 1))}><ChevronLeft className="size-4" /> Previous</button>
        <span className="text-center font-bold text-slate-600">Page {safePage} of {pageCount}</span>
        <button className="btn-secondary min-h-9 px-3 py-1.5" type="button" disabled={safePage >= pageCount} onClick={() => setPage(Math.min(pageCount, safePage + 1))}>Next <ChevronRight className="size-4" /></button>
      </nav>}
    </> : pagination}
  </div>;
}

function TableState({ message }: { message: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-semibold text-slate-500" role="status">{message}</div>;
}

function isExistingEmptyRow(row: HTMLTableRowElement) {
  if (row.dataset.standardEmpty === "true") return true;
  if (row.cells.length !== 1) return false;
  const cell = row.cells.item(0);
  if (!cell?.hasAttribute("colspan")) return false;
  return /^\s*(no|nothing)\b/i.test(cell.textContent || "");
}
