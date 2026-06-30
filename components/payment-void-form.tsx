"use client";

import { Ban, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { SubmitButton } from "@/components/ui";
import { voidPaymentAction } from "@/lib/actions/payments";

const confirmationText = "This payment/transaction is part of payment history. Deleting it will remove it from active records, archive a copy for audit/reference, and recalculate billing balance and status. Do you want to continue?";

export function PaymentVoidForm({ paymentId }: { paymentId: string }) {
  const [open, setOpen] = useState(false);

  function confirmVoid(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm(confirmationText)) event.preventDefault();
  }

  if (!open) return <button type="button" className="btn-danger min-h-8 px-3 py-1 text-xs" onClick={() => setOpen(true)}><Ban className="size-3.5" /> Void</button>;
  return <form action={voidPaymentAction} onSubmit={confirmVoid} className="min-w-64 rounded-2xl border border-rose-200 bg-rose-50 p-3">
    <input type="hidden" name="id" value={paymentId} />
    <p className="text-xs font-black text-rose-900">Void and archive payment?</p>
    <p className="mt-1 text-xs leading-5 text-rose-800">The active receipt will be removed and billing totals recalculated. An audit snapshot will remain.</p>
    <label className="label mt-2" htmlFor={`void-reason-${paymentId}`}>Reason (optional)</label>
    <input id={`void-reason-${paymentId}`} className="field min-h-9 bg-white py-1 text-xs" name="reason" maxLength={500} placeholder="Reason for voiding" />
    <div className="mt-2 flex flex-wrap gap-2"><SubmitButton className="btn-danger min-h-8 px-3 py-1 text-xs"><Ban className="size-3.5" /> Confirm void</SubmitButton><button type="button" className="btn-secondary min-h-8 px-3 py-1 text-xs" onClick={() => setOpen(false)}><X className="size-3.5" /> Cancel</button></div>
  </form>;
}
