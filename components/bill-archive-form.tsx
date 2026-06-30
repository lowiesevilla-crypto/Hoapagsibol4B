"use client";

import { useState } from "react";
import { Archive, X } from "lucide-react";
import { archiveBillAction } from "@/lib/actions/billing";
import { SubmitButton } from "@/components/ui";

export function BillArchiveForm({
  id,
  homeowner,
  billingMonth,
  paymentCount,
  requestCount,
}: {
  id: string;
  homeowner: string;
  billingMonth: string;
  paymentCount: number;
  requestCount: number;
}) {
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className="btn-danger min-h-8 px-3 py-1" onClick={() => setOpen(true)}><Archive className="size-4" /> Archive</button>;

  return <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/70 p-4" role="dialog" aria-modal="true" aria-labelledby={`archive-title-${id}`}>
    <form action={archiveBillAction} className="card w-full max-w-lg shadow-2xl">
      <input type="hidden" name="id" value={id} />
      <div className="flex items-start justify-between gap-4"><div><h2 id={`archive-title-${id}`} className="text-xl font-black">Archive billing record?</h2><p className="mt-1 text-sm text-slate-500">{homeowner} · {billingMonth}</p></div><button type="button" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" aria-label="Close archive confirmation" onClick={() => setOpen(false)}><X className="size-5" /></button></div>
      <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">This removes the record from active Billing Management. Its {paymentCount} payment(s), {requestCount} payment request(s), receipts, and audit history stay intact.</div>
      <div className="mt-4"><label className="label" htmlFor={`archive-reason-${id}`}>Archive reason (optional)</label><textarea id={`archive-reason-${id}`} className="field min-h-24" name="reason" placeholder="Why is this billing record being removed from active view?" /></div>
      <label className="mt-4 flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm font-semibold text-slate-700"><input className="mt-1 size-4 accent-pine-600" type="checkbox" name="confirmed" value="yes" required />I understand this billing record will be archived, not permanently deleted.</label>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button><SubmitButton className="btn-danger"><Archive className="size-4" /> Archive billing</SubmitButton></div>
    </form>
  </div>;
}
