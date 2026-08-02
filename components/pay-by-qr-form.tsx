"use client";

import { AlertCircle, CheckCircle2, CircleDollarSign, ReceiptText, WifiOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { submitPaymentRequestAction } from "@/lib/actions/payment-requests";
import { PaymentProofUpload } from "@/components/payment-proof-upload";

type OpenBill = {
  id: string;
  month: string;
  dueDate: string;
  balance: number;
  balanceLabel: string;
  hasPendingRequest: boolean;
};

type DocumentFeePayment = {
  documentRequestId: string;
  documentType: string;
  requestReference: string;
  amountLabel: string;
  purpose: string;
  statusLabel: string;
};

const transactionTypes = [
  { value: "MONTHLY_DUES", label: "Monthly Dues" },
  { value: "GATE_PASS", label: "Gate Pass" },
  { value: "STICKER", label: "Vehicle Sticker" },
  { value: "MEMBERSHIP", label: "Membership" },
  { value: "CONSTRUCTION_BOND", label: "Construction Bond" },
  { value: "OTHER", label: "Other Payment" },
] as const;

export function PayByQrForm({ openBills, today, documentPayment }: { openBills: OpenBill[]; today: string; documentPayment?: DocumentFeePayment | null }) {
  const [transactionType, setTransactionType] = useState(documentPayment ? "DOCUMENT_FEE" : "MONTHLY_DUES");
  const [selectedBills, setSelectedBills] = useState<string[]>([]);
  const [referenceNumber, setReferenceNumber] = useState("");
  const [otherAmount, setOtherAmount] = useState("");
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const selectedTotal = useMemo(() => openBills.filter((bill) => selectedBills.includes(bill.id)).reduce((sum, bill) => sum + bill.balance, 0), [openBills, selectedBills]);
  const selectedTotalLabel = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(selectedTotal);
  const isDocumentFee = Boolean(documentPayment);
  const isMonthlyDues = transactionType === "MONTHLY_DUES" && !isDocumentFee;
  const effectiveAmountLabel = documentPayment ? documentPayment.amountLabel : isMonthlyDues ? selectedTotalLabel : new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(otherAmount) || 0);
  const hasAmount = documentPayment ? true : isMonthlyDues ? selectedBills.length > 0 : Number(otherAmount) > 0;
  const canSubmit = online && hasAmount && referenceNumber.trim().length > 0;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  function toggleBill(id: string) {
    setSelectedBills((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  return <form id="qr-payment" action={submitPaymentRequestAction} className="rounded-3xl border border-pine-100 bg-white shadow-soft">
    <fieldset className="p-4 sm:p-5" disabled={!online}>
    <div className="mb-5 flex items-start gap-3">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-pine-50 text-pine-700"><ReceiptText className="size-5" /></span>
      <div>
        <h2 className="text-lg font-black">{documentPayment ? "Pay document fee" : "Submit QR payment"}</h2>
        <p className="text-sm leading-6 text-slate-500">{documentPayment ? "Pay the exact document fee through the configured HOA payment channel, then submit the reference number for verification." : "Choose the transaction type, scan/pay through GCash, then submit the reference number for HOA verification."}</p>
      </div>
    </div>
    {!online && <div className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-950" role="status"><WifiOff className="mt-0.5 size-4 shrink-0" />Payment submission and proof upload are disabled while offline.</div>}

    <div className="grid gap-4 sm:grid-cols-2">
      {documentPayment ? <div className="sm:col-span-2 rounded-2xl border border-pine-100 bg-pine-50/70 p-4">
        <input type="hidden" name="transactionType" value="DOCUMENT_FEE" />
        <input type="hidden" name="documentRequestId" value={documentPayment.documentRequestId} />
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="font-bold uppercase tracking-wide text-slate-500">Document type</dt><dd className="font-black text-pine-950">{documentPayment.documentType}</dd></div>
          <div><dt className="font-bold uppercase tracking-wide text-slate-500">Request number</dt><dd className="font-mono font-black text-pine-950">{documentPayment.requestReference}</dd></div>
          <div><dt className="font-bold uppercase tracking-wide text-slate-500">Amount due</dt><dd className="text-xl font-black text-pine-950">{documentPayment.amountLabel}</dd></div>
          <div><dt className="font-bold uppercase tracking-wide text-slate-500">Payment status</dt><dd className="font-black text-pine-950">{documentPayment.statusLabel}</dd></div>
        </dl>
        <p className="mt-4 whitespace-pre-wrap rounded-xl bg-white p-3 text-sm font-semibold text-slate-700">{documentPayment.purpose}</p>
      </div> : <div className="sm:col-span-2">
        <label className="label" htmlFor="transactionType">Transaction type</label>
        <select id="transactionType" className="field" name="transactionType" value={transactionType} onChange={(event) => { setTransactionType(event.target.value); setSelectedBills([]); }} required>
          {transactionTypes.map((type) => <option value={type.value} key={type.value}>{type.label}</option>)}
        </select>
      </div>}

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
        {selectedBills.length > 0 && <div className="mt-3 rounded-2xl border border-pine-100 bg-pine-50 p-3 text-sm font-bold text-pine-900">Selected coverage: {selectedBills.length} billing item{selectedBills.length === 1 ? "" : "s"} totaling {selectedTotalLabel}. The server will recheck ownership, balance, and pending-verification status before saving.</div>}
      </div> : isDocumentFee ? null : <>
        <input type="hidden" name="collectionType" value={transactionType} />
        <div><label className="label">Amount paid</label><input className="field" name="amount" type="number" min="0.01" step="0.01" value={otherAmount} onChange={(event) => setOtherAmount(event.target.value)} required={!isMonthlyDues} /></div>
        <div><label className="label">Description</label><input className="field" name="description" placeholder={transactionType === "OTHER" ? "Required for Other Payment" : "Optional"} /></div>
      </>}

      <div><label className="label">Payment date</label><input className="field" name="paymentDate" type="date" defaultValue={today} required /></div>
      <div><label className="label">GCash reference number</label><input className="field" name="referenceNumber" value={referenceNumber} onChange={(event) => setReferenceNumber(event.target.value)} required placeholder="Example: 1001 234 567890" aria-describedby="reference-help" /><p id="reference-help" className="mt-1 text-xs font-semibold text-slate-500">Required for QR/GCash verification. Duplicate references are rejected by the server.</p></div>
      <PaymentProofUpload />
      <div className="sm:col-span-2"><label className="label">Notes</label><input className="field" name="payerNotes" placeholder="Optional message to the HOA treasurer" /></div>
    </div>

    <div className="mt-5 flex items-start gap-2 rounded-2xl bg-slate-50 p-3 text-xs font-semibold text-slate-600">
      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-leaf-600" />
      <p>{documentPayment ? "HOA verification confirms the fee, creates the receipt, and continues document processing." : "Approval creates the official receipt and updates your account."}</p>
    </div>
    </fieldset>
    <div className="sticky bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-20 border-t border-pine-100 bg-white/95 p-3 backdrop-blur lg:bottom-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[.16em] text-slate-500">Ready to submit</p>
          <p className="break-words text-xl font-black text-ink tabular-nums">{effectiveAmountLabel}</p>
          {!canSubmit && <p className="mt-1 flex items-center gap-1 text-xs font-bold text-amber-800"><AlertCircle className="size-3" /> Select an amount and enter a reference while online.</p>}
        </div>
        <PaymentSubmitButton disabled={!canSubmit}>{documentPayment ? "Submit Document Fee" : "Submit for Verification"}</PaymentSubmitButton>
      </div>
    </div>
  </form>;
}

function PaymentSubmitButton({ children, disabled }: { children: ReactNode; disabled: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" className="btn-primary min-h-12 w-full sm:w-auto" disabled={disabled || pending}>{pending ? "Submitting..." : children}</button>;
}
