"use client";

import { useEffect, useState } from "react";
import { applyConstructionBondToDuesAction, recordBondRefundAction } from "@/lib/actions/collections";
import { SearchableSelect, type SearchableSelectItem } from "@/components/searchable-select";
import { SubmitButton } from "@/components/ui";

type BondOption = SearchableSelectItem & {
  kind?: "CONSTRUCTION_BOND" | "CONTRACTOR_BOND";
  availableBalance?: number;
  openDuesBalance?: number;
};

export function BondRefundForm({ bonds, today }: { bonds: BondOption[]; today: string }) {
  const [idempotencyKey, setIdempotencyKey] = useState("");
  useEffect(() => setIdempotencyKey(globalThis.crypto.randomUUID()), []);
  const constructionBonds = bonds.filter((item) => item.kind === "CONSTRUCTION_BOND" && Number(item.openDuesBalance ?? 0) > 0);

  return <div className="space-y-5">
    <form action={recordBondRefundAction} className="card">
      <div className="mb-5"><h2 className="text-lg font-black">Refund a bond</h2><p className="text-sm text-slate-500">Return all or part of an eligible Construction or Contractor Bond after clearance.</p></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><SearchableSelect name="collectionId" label="Open bond" items={bonds} placeholder="Search payer, contractor, property, or bond type" required /></div>
        <div><label className="label">Refund amount</label><input className="field" name="amount" type="number" min="0.01" step="0.01" required /></div>
        <div><label className="label">Refund date</label><input className="field" name="refundDate" type="date" defaultValue={today} required /></div>
        <div><label className="label">Method</label><select className="field" name="method" defaultValue="BANK_TRANSFER"><option value="CASH">Cash</option><option value="BANK_TRANSFER">Bank transfer</option><option value="GCASH">GCash</option><option value="CHECK">Check</option><option value="OTHER">Other</option></select></div>
        <div><label className="label">Reference number</label><input className="field" name="referenceNumber" /></div>
        <div className="sm:col-span-2"><label className="label">Clearance remarks</label><input className="field" name="remarks" placeholder="No construction violations found" /></div>
      </div>
      <div className="mt-5"><SubmitButton>Process cash refund</SubmitButton></div>
    </form>

    <form action={applyConstructionBondToDuesAction} className="card border-emerald-200">
      <div className="mb-5"><h2 className="text-lg font-black">Apply Construction Bond to Monthly Dues</h2><p className="text-sm text-slate-500">Non-cash option: reduce the homeowner's oldest open Monthly Dues using an available Construction Bond. Any excess stays in the bond.</p></div>
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><SearchableSelect name="collectionId" label="Construction Bond" items={constructionBonds} placeholder="Search homeowner, property, or Construction Bond" required /></div>
        <div><label className="label">Amount to apply</label><input className="field" name="amount" type="number" min="0.01" step="0.01" required /></div>
        <div><label className="label">Application date</label><input className="field" name="applicationDate" type="date" defaultValue={today} required /></div>
        <div className="sm:col-span-2"><label className="label">Homeowner authorization / request reference</label><input className="field" name="authorizationReference" placeholder="Written request, email, letter, or approval reference" maxLength={191} required /></div>
        <div className="sm:col-span-2"><label className="label">Remarks</label><input className="field" name="remarks" maxLength={500} placeholder="Apply Construction Bond credit to oldest outstanding Monthly Dues" /></div>
      </div>
      {!constructionBonds.length && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">No open Construction Bond currently has both an available bond balance and an outstanding Monthly Dues balance.</p>}
      <div className="mt-5"><SubmitButton disabled={!idempotencyKey || !constructionBonds.length}>Apply to Monthly Dues</SubmitButton></div>
    </form>
  </div>;
}
