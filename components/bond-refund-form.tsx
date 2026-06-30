"use client";

import { recordBondRefundAction } from "@/lib/actions/collections";
import { SearchableSelect, type SearchableSelectItem } from "@/components/searchable-select";
import { SubmitButton } from "@/components/ui";

export function BondRefundForm({ bonds, today }: { bonds: SearchableSelectItem[]; today: string }) {
  return <form action={recordBondRefundAction} className="card">
    <div className="mb-5"><h2 className="text-lg font-black">Refund a bond</h2><p className="text-sm text-slate-500">Search homeowner or contractor bonds, then return all or part of the balance after clearance.</p></div>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><SearchableSelect name="collectionId" label="Open bond" items={bonds} placeholder="Search payer, contractor, property, or bond type" required /></div>
      <div><label className="label">Refund amount</label><input className="field" name="amount" type="number" min="0.01" step="0.01" required /></div>
      <div><label className="label">Refund date</label><input className="field" name="refundDate" type="date" defaultValue={today} required /></div>
      <div><label className="label">Method</label><select className="field" name="method" defaultValue="BANK_TRANSFER"><option value="CASH">Cash</option><option value="BANK_TRANSFER">Bank transfer</option><option value="GCASH">GCash</option><option value="CHECK">Check</option><option value="OTHER">Other</option></select></div>
      <div><label className="label">Reference number</label><input className="field" name="referenceNumber" /></div>
      <div className="sm:col-span-2"><label className="label">Clearance remarks</label><input className="field" name="remarks" placeholder="No construction violations found" /></div>
    </div>
    <div className="mt-5"><SubmitButton>Process refund</SubmitButton></div>
  </form>;
}
