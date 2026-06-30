"use client";

import { CheckCircle2, CircleDollarSign, ReceiptText } from "lucide-react";
import { useMemo, useState } from "react";
import { submitPaymentRequestAction } from "@/lib/actions/payment-requests";
import { SubmitButton } from "@/components/ui";
import { PaymentProofUpload } from "@/components/payment-proof-upload";

type OpenBill = {
  id: string;
  month: string;
  dueDate: string;
  balance: number;
  balanceLabel: string;
  hasPendingRequest: boolean;
};

const transactionTypes = [
  { value: "MONTHLY_DUES", label: "Monthly Dues" },
  { value: "GATE_PASS", label: "Gate Pass" },
  { value: "STICKER", label: "Vehicle Sticker" },
  { value: "MEMBERSHIP", label: "Membership" },
  { value: "CONSTRUCTION_BOND", label: "Construction Bond" },
  { value: "OTHER", label: "Other Payment" },
] as const;

export function PayByQrForm({ openBills, today }: { openBills: OpenBill[]; today: string }) {
  const [transactionType, setTransactionType] = useState("MONTHLY_DUES");
  const [selectedBills, setSelectedBills] = useState<string[]>([]);
  const selectedTotal = useMemo(() => openBills.filter((bill) => selectedBills.includes(bill.id)).reduce((sum, bill) => sum + bill.balance, 0), [openBills, selectedBills]);
  const selectedTotalLabel = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(selectedTotal);
  const isMonthlyDues = transactionType === "MONTHLY_DUES";

  function toggleBill(id: string) {
    setSelectedBills((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  return <form action={submitPaymentRequestAction} encType="multipart/form-data" className="card">
    <div className="mb-5 flex items-start gap-3">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-pine-50 text-pine-700"><ReceiptText className="size-5" /></span>
      <div>
        <h2 className="text-lg font-black">Submit QR payment</h2>
        <p className="text-sm leading-6 text-slate-500">Choose the transaction type, scan/pay through GCash, then submit the reference number for HOA verification.</p>
      </div>
    </div>

    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label" htmlFor="transactionType">Transaction type</label>
        <select id="transactionType" className="field" name="transactionType" value={transactionType} onChange={(event) => { setTransactionType(event.target.value); setSelectedBills([]); }} required>
          {transactionTypes.map((type) => <option value={type.value} key={type.value}>{type.label}</option>)}
        </select>
      </div>

      {isMonthlyDues ? <div className="sm:col-span-2">
        <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div><label className="label">Select pending dues</label><p className="text-xs text-slate-500">You can select multiple unpaid months. The amount is computed automatically.</p></div>
          <div className="rounded-2xl bg-pine-50 px-4 py-2 text-right"><p className="text-[10px] font-black uppercase tracking-widest text-pine-700">Selected total</p><p className="text-lg font-black text-pine-900">{selectedTotalLabel}</p></div>
        </div>
        <div className="grid max-h-80 gap-2 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50/60 p-2">
          {openBills.map((bill) => {
            const selected = selectedBills.includes(bill.id);
            const disabled = bill.hasPendingRequest;
            return <label key={bill.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${selected ? "border-pine-300 bg-pine-600 text-white shadow-md" : "border-transparent bg-white hover:border-pine-100"} ${disabled ? "cursor-not-allowed opacity-60" : ""}`}>
              <input className="size-4 accent-pine-700" type="checkbox" name="billIds" value={bill.id} checked={selected} disabled={disabled} onChange={() => toggleBill(bill.id)} />
              <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${selected ? "bg-white/15" : "bg-pine-50 text-pine-700"}`}><CircleDollarSign className="size-4" /></span>
              <span className="min-w-0 flex-1"><span className="block font-black">{bill.month}</span><span className={`block text-xs ${selected ? "text-pine-100" : "text-slate-500"}`}>Due {bill.dueDate}{disabled ? " - Verification already pending" : ""}</span></span>
              <span className="text-right font-black">{bill.balanceLabel}</span>
            </label>;
          })}
          {!openBills.length && <p className="rounded-xl bg-white px-3 py-10 text-center text-sm text-slate-500">No unpaid monthly dues are available for QR payment.</p>}
        </div>
      </div> : <>
        <input type="hidden" name="collectionType" value={transactionType} />
        <div><label className="label">Amount paid</label><input className="field" name="amount" type="number" min="0.01" step="0.01" required={!isMonthlyDues} /></div>
        <div><label className="label">Description</label><input className="field" name="description" placeholder={transactionType === "OTHER" ? "Required for Other Payment" : "Optional"} /></div>
      </>}

      <div><label className="label">Payment date</label><input className="field" name="paymentDate" type="date" defaultValue={today} required /></div>
      <div><label className="label">GCash reference number</label><input className="field" name="referenceNumber" required placeholder="Example: 1001 234 567890" /></div>
      <PaymentProofUpload />
      <div className="sm:col-span-2"><label className="label">Notes</label><input className="field" name="payerNotes" placeholder="Optional message to the HOA treasurer" /></div>
    </div>

    <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-center gap-2 text-xs font-semibold text-slate-500"><CheckCircle2 className="size-4 text-leaf-600" /> Approval creates the official receipt and updates your account.</p>
      <SubmitButton>Submit for verification</SubmitButton>
    </div>
  </form>;
}
