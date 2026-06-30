"use client";

import { useState } from "react";
import { deletePayrollAction } from "@/lib/actions/payroll";

export function PayrollDeleteForm({ id, paid }: { id: string; paid: boolean }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className="btn-danger" onClick={() => setOpen(true)}>Archive & delete</button>;
  return <form action={deletePayrollAction} className="w-full rounded-2xl border border-rose-200 bg-rose-50 p-4 text-left sm:max-w-lg">
    <input type="hidden" name="id" value={id} />
    <p className="font-black text-rose-900">{paid ? "This payroll period is already marked Paid." : "Archive this payroll period?"}</p>
    <p className="mt-1 text-sm text-rose-800">Deleting removes it from active payroll lists. Its period, employee breakdown, deductions, adjustments, OT records, and payslips will remain in Payroll Archive.</p>
    <label className="mt-3 flex items-start gap-2 text-sm font-bold text-rose-900"><input type="checkbox" name="acknowledged" required /> I understand and want to continue.</label>
    <div className="mt-3"><label className="label">Deletion reason (optional)</label><input className="field bg-white" name="deletionReason" maxLength={500} /></div>
    <div className="mt-3"><label className="label">Type DELETE</label><input className="field bg-white" name="confirmation" pattern="DELETE" required autoComplete="off" /></div>
    <div className="mt-3 flex flex-wrap gap-2"><button className="btn-danger" type="submit">Archive & delete period</button><button className="btn-secondary" type="button" onClick={() => setOpen(false)}>Cancel</button></div>
  </form>;
}
