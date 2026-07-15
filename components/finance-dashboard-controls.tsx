"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Download, FileText, Filter, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";

export function FinanceDashboardControls({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [exporting, setExporting] = useState<"pdf" | "docx" | null>(null);
  const [error, setError] = useState("");

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextFrom = String(form.get("from") || "");
    const nextTo = String(form.get("to") || "");
    if (!nextFrom || !nextTo) return setError("Start date and end date are required.");
    if (nextFrom > nextTo) return setError("Start date must be on or before end date.");
    setError("");
    startTransition(() => router.push(`/admin/reports/dashboard?from=${encodeURIComponent(nextFrom)}&to=${encodeURIComponent(nextTo)}`));
  }

  function reset() {
    setError("");
    startTransition(() => router.push("/admin/reports/dashboard"));
  }

  function download(kind: "pdf" | "docx") {
    setExporting(kind);
    window.location.assign(`/admin/reports/dashboard/${kind}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    window.setTimeout(() => setExporting(null), 1800);
  }

  return <section className="mb-6 rounded-lg border border-pine-100 bg-white p-4 shadow-soft" aria-label="Finance dashboard controls">
    <form onSubmit={apply} className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] lg:items-end">
      <div><label className="label" htmlFor="dashboard-from">Start date</label><input className="field" id="dashboard-from" name="from" type="date" defaultValue={from} required /></div>
      <div><label className="label" htmlFor="dashboard-to">End date</label><input className="field" id="dashboard-to" name="to" type="date" defaultValue={to} required /></div>
      <button className="btn-primary" type="submit" disabled={pending} title="Apply date range"><Filter className="size-4" />{pending ? "Applying..." : "Apply filter"}</button>
      <button className="btn-secondary" type="button" disabled={pending} onClick={reset} title="Reset to current year"><RotateCcw className="size-4" />Reset</button>
    </form>
    {error && <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800" role="alert">{error}</p>}
    <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
      <button className="btn-secondary" type="button" onClick={() => download("pdf")} disabled={exporting !== null} title="Export dashboard as PDF"><Download className="size-4" />{exporting === "pdf" ? "Preparing PDF..." : "Export PDF"}</button>
      <button className="btn-secondary" type="button" onClick={() => download("docx")} disabled={exporting !== null} title="Export dashboard as Word document"><FileText className="size-4" />{exporting === "docx" ? "Preparing DOCX..." : "Export DOCX"}</button>
    </div>
  </section>;
}
