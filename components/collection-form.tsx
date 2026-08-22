"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { recordCollectionAction } from "@/lib/actions/collections";
import { SearchableHomeownerSelect } from "@/components/searchable-homeowner-select";
import { SearchableSelect } from "@/components/searchable-select";
import { SubmitButton } from "@/components/ui";

type Payer = { id: string; label: string; search: string };

const profilePayerTypes = new Set(["HOMEOWNER", "CONTRACTOR"]);
const rentalPaymentsHref = "/admin/rentals?view=payments&source=collections";

export function CollectionForm({ homeowners, contractors, today }: { homeowners: Payer[]; contractors: Payer[]; today: string }) {
  const router = useRouter();
  const [type, setType] = useState("GATE_PASS");
  const [payerType, setPayerType] = useState("HOMEOWNER");

  function openRentalPayments() {
    router.push(rentalPaymentsHref);
  }

  function changeType(next: string) {
    if (next === "RENTAL_PAYMENT") {
      openRentalPayments();
      return;
    }
    setType(next);
    if (next === "CONSTRUCTION_BOND") setPayerType("HOMEOWNER");
    else if (next === "CONTRACTOR_BOND") setPayerType("CONTRACTOR");
    else if (next !== "OTHER" && !profilePayerTypes.has(payerType)) setPayerType("HOMEOWNER");
  }

  function changePayerType(next: string) {
    if (type === "OTHER" && next === "RENTER") {
      openRentalPayments();
      return;
    }
    setPayerType(next);
  }

  const payerTypeLocked = type === "CONSTRUCTION_BOND" || type === "CONTRACTOR_BOND";
  const externalPayer = payerType === "OTHER";

  return <form action={recordCollectionAction} className="card">
    <div className="mb-5"><h2 className="text-lg font-black">Record a collection</h2><p className="text-sm text-slate-500">Fees become income; bonds are held as refundable liabilities.</p></div>
    <div className="mb-5 rounded-xl border border-pine-200 bg-pine-50 p-4 text-sm text-pine-950">
      <p className="font-black">Rental payments have one posting workflow.</p>
      <p className="mt-1 text-xs text-pine-800">Post renter payments in Rental Management so HOAHub can select the actual renter record, issue one official receipt, allocate rental invoices, preserve advance credits, and reconcile automatically. Collections remains the central receipt ledger.</p>
      <button className="mt-3 text-xs font-black text-pine-700 underline underline-offset-4" type="button" onClick={openRentalPayments}>Open Rental Payments →</button>
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <div><label className="label">Collection type</label><select className="field" name="type" value={type} onChange={(event) => changeType(event.target.value)}><option value="GATE_PASS">Gate Pass</option><option value="STICKER">Sticker</option><option value="MEMBERSHIP">Membership</option><option value="CONSTRUCTION_BOND">Construction Bond (refundable)</option><option value="CONTRACTOR_BOND">Contractor Bond (refundable)</option><option value="OTHER">Other income</option><option value="RENTAL_PAYMENT">Rental Payment → Rental Management</option></select></div>
      <div><label className="label">Payer type</label><select className="field" name="payerType" value={payerType} onChange={(event) => changePayerType(event.target.value)} disabled={payerTypeLocked}><option value="HOMEOWNER">Homeowner</option><option value="CONTRACTOR">Contractor</option>{type === "OTHER" && <><option value="RENTER">Renter → Rental Management</option><option value="OTHER">Others</option></>}</select>{payerTypeLocked && <input type="hidden" name="payerType" value={payerType} />}</div>
      <div className="sm:col-span-2">{payerType === "HOMEOWNER" ? <SearchableHomeownerSelect name="homeownerId" label="Homeowner" homeowners={homeowners} placeholder="Search name, block, lot, account, or email" searchEndpoint="/api/admin/homeowners/search?status=all" required /> : payerType === "CONTRACTOR" ? <SearchableSelect name="contractorId" label="Contractor" items={contractors} placeholder="Search company, contact, or phone" required /> : <div><label className="label">Payer name</label><input className="field" name="payerName" maxLength={150} placeholder="Enter payer name" required={externalPayer} /></div>}</div>
      {type === "OTHER" && <div className="sm:col-span-2"><label className="label">Income type name</label><input className="field" name="description" placeholder="e.g. Facility use fee" required /></div>}
      <div><label className="label">Amount</label><input className="field" name="amount" type="number" min="0.01" step="0.01" required /></div>
      <div><label className="label">Collection date</label><input className="field" name="collectionDate" type="date" defaultValue={today} required /></div>
      <div><label className="label">Method</label><select className="field" name="method" defaultValue="CASH"><option value="CASH">Cash</option><option value="BANK_TRANSFER">Bank transfer</option><option value="GCASH">GCash</option><option value="CHECK">Check</option><option value="OTHER">Other</option></select></div>
      <div><label className="label">Reference number</label><input className="field" name="referenceNumber" /></div>
      <div className="sm:col-span-2"><label className="label">Remarks</label><input className="field" name="remarks" /></div>
    </div>
    <div className="mt-5"><SubmitButton>Record collection</SubmitButton></div>
  </form>;
}
