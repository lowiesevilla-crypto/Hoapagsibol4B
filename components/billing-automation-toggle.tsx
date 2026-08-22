"use client";

import { useState } from "react";

export function BillingAutomationToggle({ defaultAutomatic, defaultBillingDay, modeError, dayError }: { defaultAutomatic: boolean; defaultBillingDay: number; modeError?: string; dayError?: string }) {
  const [automatic, setAutomatic] = useState(defaultAutomatic);
  return <div className="md:col-span-2 xl:col-span-2 rounded-2xl border border-pine-100 bg-pine-50/50 p-4">
    <input type="hidden" name="generationMode" value={automatic ? "AUTOMATIC" : "MANUAL"} />
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="label">Automatic monthly billing</p>
        <p className="mt-1 max-w-xl text-xs leading-5 text-slate-500">When enabled, HOAHub generates Monthly Dues on the configured day. Active rental agreements are also billed automatically on each agreement&apos;s billing day. Duplicate billing is blocked.</p>
      </div>
      <button type="button" role="switch" aria-checked={automatic} onClick={() => setAutomatic((value) => !value)} className={`relative inline-flex h-8 w-16 shrink-0 items-center rounded-full p-1 transition ${automatic ? "bg-pine-700" : "bg-slate-300"}`}>
        <span className={`size-6 rounded-full bg-white shadow-sm transition-transform ${automatic ? "translate-x-8" : "translate-x-0"}`} />
        <span className="sr-only">{automatic ? "Disable automatic billing" : "Enable automatic billing"}</span>
      </button>
    </div>
    <div className="mt-4 grid gap-3 sm:grid-cols-[180px_1fr] sm:items-end">
      <label className="label">Monthly Dues billing day<input className="field mt-1" name="billingDay" type="number" min="1" max="28" defaultValue={defaultBillingDay} required /></label>
      <div className={`rounded-xl px-3 py-2 text-xs font-bold ${automatic ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>{automatic ? `ON · Monthly Dues will run on day ${defaultBillingDay || 1}; rental agreements use their own billing day.` : "OFF · Billing remains manual until this switch is enabled."}</div>
    </div>
    {modeError && <p className="mt-2 text-xs font-bold text-rose-700" role="alert">{modeError}</p>}
    {dayError && <p className="mt-2 text-xs font-bold text-rose-700" role="alert">{dayError}</p>}
  </div>;
}
