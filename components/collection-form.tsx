"use client";

import { useState } from "react";
import { recordCollectionAction } from "@/lib/actions/collections";
import { SearchableSelect } from "@/components/searchable-select";
import { SubmitButton } from "@/components/ui";

type Payer = { id: string; label: string; search: string };

export function CollectionForm({ homeowners, contractors, today }: { homeowners: Payer[]; contractors: Payer[]; today: string }) {
  const [type, setType] = useState("GATE_PASS");
  const [payerType, setPayerType] = useState("HOMEOWNER");

  function changeType(next: string) {
    setType(next);
    if (next === "CONSTRUCTION_BOND") setPayerType("HOMEOWNER");
    if (next === "CONTRACTOR_BOND") setPayerType("CONTRACTOR");
  }

  return <form action={recordCollectionAction} className="card">
    <div className="mb-5"><h2 className="text-lg font-black">Record a collection</h2><p className="text-sm text-slate-500">Fees become income; bonds are held as refundable liabilities.</p></div>
    <div className="grid gap-4 sm:grid-cols-2">
      <div><label className="label">Collection type</label><select className="field" name="type" value={type} onChange={(event) => changeType(event.target.value)}><option value="GATE_PASS">Gate Pass</option><option value="STICKER">Sticker</option><option value="MEMBERSHIP">Membership</option><option value="CONSTRUCTION_BOND">Construction Bond (refundable)</option><option value="CONTRACTOR_BOND">Contractor Bond (refundable)</option><option value="OTHER">Other income</option></select></div>
      <div><label className="label">Payer type</label><select className="field" name="payerType" value={payerType} onChange={(event) => setPayerType(event.target.value)} disabled={type === "CONSTRUCTION_BOND" || type === "CONTRACTOR_BOND"}><option value="HOMEOWNER">Homeowner</option><option value="CONTRACTOR">Contractor</option></select>{(type === "CONSTRUCTION_BOND" || type === "CONTRACTOR_BOND") && <input type="hidden" name="payerType" value={payerType} />}</div>
      <div className="sm:col-span-2">{payerType === "HOMEOWNER" ? <SearchableSelect name="homeownerId" label="Homeowner" items={homeowners} placeholder="Search name, block, lot, or unit" required /> : <SearchableSelect name="contractorId" label="Contractor" items={contractors} placeholder="Search company, contact, or phone" required />}</div>
      {type === "OTHER" && <div className="sm:col-span-2"><label className="label">Income type name</label><input className="field" name="description" placeholder="e.g. Facility rental" required /></div>}
      <div><label className="label">Amount</label><input className="field" name="amount" type="number" min="0.01" step="0.01" required /></div>
      <div><label className="label">Collection date</label><input className="field" name="collectionDate" type="date" defaultValue={today} required /></div>
      <div><label className="label">Method</label><select className="field" name="method" defaultValue="CASH"><option value="CASH">Cash</option><option value="BANK_TRANSFER">Bank transfer</option><option value="GCASH">GCash</option><option value="CHECK">Check</option><option value="OTHER">Other</option></select></div>
      <div><label className="label">Reference number</label><input className="field" name="referenceNumber" /></div>
      <div className="sm:col-span-2"><label className="label">Remarks</label><input className="field" name="remarks" /></div>
    </div>
    <div className="mt-5"><SubmitButton>Record collection</SubmitButton></div>
  </form>;
}
