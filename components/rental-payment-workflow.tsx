import { SubmitButton } from "@/components/ui";
import { recordRentalPaymentAction, reconcileRentalCreditsAction } from "@/lib/actions/rental-workflow";

export type RentalPaymentRenterOption = {
  id: string;
  fullName: string;
  homeownerLinked: boolean;
  currentAssetCode?: string | null;
};

export function RentalPaymentForm({ renters, today }: { renters: RentalPaymentRenterOption[]; today: string }) {
  return <form action={recordRentalPaymentAction} className="card space-y-4">
    <div>
      <p className="eyebrow">Rental cash receipt</p>
      <h2 className="text-lg font-black">Record rental payment</h2>
      <p className="mt-1 text-sm text-slate-500">This is the authoritative rental-payment entry point. HOAHub issues one official Collection receipt here, then applies it to the renter&apos;s oldest open rental dues or keeps it as advance rental credit.</p>
    </div>
    <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-950"><strong>One payment, one receipt:</strong> Collections is the central cash and receipt ledger. Do not post the same rental payment again from Collections.</div>
    <label className="label">Renter
      <select className="field" name="renterId" required defaultValue="">
        <option value="" disabled>Select renter</option>
        {renters.map((renter) => <option key={renter.id} value={renter.id}>{renter.fullName} · {renter.homeownerLinked ? "Homeowner" : "External"}{renter.currentAssetCode ? ` · ${renter.currentAssetCode}` : ""}</option>)}
      </select>
    </label>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="label">Amount<input className="field" type="number" min="0.01" step="0.01" name="amount" required /></label>
      <label className="label">Payment date<input className="field" type="date" name="paymentDate" defaultValue={today} required /></label>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="label">Method<select className="field" name="method" defaultValue="CASH"><option value="CASH">Cash</option><option value="BANK_TRANSFER">Bank transfer</option><option value="GCASH">GCash</option><option value="CHECK">Check</option><option value="OTHER">Other</option></select></label>
      <label className="label">Reference number<input className="field" name="referenceNumber" placeholder="Optional bank / GCash / check reference" /></label>
    </div>
    <fieldset className="space-y-2">
      <legend className="label">Allocation</legend>
      <label className="flex cursor-pointer gap-3 rounded-xl border border-pine-200 bg-pine-50 p-3"><input className="mt-1" type="radio" name="allocationMode" value="AUTO" defaultChecked /><span><strong className="block text-sm text-pine-950">Apply automatically</strong><span className="text-xs text-pine-800">Settle the oldest unpaid rental invoices first. Any remainder becomes advance rental credit.</span></span></label>
      <label className="flex cursor-pointer gap-3 rounded-xl border border-slate-200 p-3"><input className="mt-1" type="radio" name="allocationMode" value="ADVANCE" /><span><strong className="block text-sm text-slate-950">Record as advance payment</strong><span className="text-xs text-slate-500">Keep the full receipt as unapplied rental credit. It will be available for future billing.</span></span></label>
    </fieldset>
    <label className="label">Remarks<textarea className="field min-h-20" name="remarks" placeholder="Optional payment note" /></label>
    <SubmitButton className="btn-primary w-full">Issue receipt & record payment</SubmitButton>
  </form>;
}

export function RentalReconcileControl() {
  return <form action={reconcileRentalCreditsAction} className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div><p className="eyebrow">Automatic reconciliation</p><h2 className="text-lg font-black">Apply advance rental credits</h2><p className="text-sm text-slate-500">Matches available rental credits to each renter&apos;s oldest unpaid RENT invoices. Security deposits are never consumed as rent.</p></div>
    <SubmitButton className="btn-primary whitespace-nowrap">Auto reconcile credits</SubmitButton>
  </form>;
}
