"use client";

import { CircleDollarSign, CreditCard, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { createHomeownerPayMongoCheckoutAction } from "@/lib/actions/homeowner-paymongo";

export type PayMongoOpenBill = {
  id: string;
  month: string;
  dueDate: string;
  balance: number;
  balanceLabel: string;
  hasPendingRequest: boolean;
};

export type PayMongoDocumentFeePayment = {
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

export function PayMongoHomeownerFormClient({
  openBills,
  documentPayment,
  platformFeeAmountPesos,
}: {
  openBills: PayMongoOpenBill[];
  documentPayment?: PayMongoDocumentFeePayment | null;
  platformFeeAmountPesos: number;
}) {
  const [transactionType, setTransactionType] = useState(documentPayment ? "DOCUMENT_FEE" : "MONTHLY_DUES");
  const [selectedBills, setSelectedBills] = useState<string[]>([]);
  const [amount, setAmount] = useState("");
  const pesoFormatter = useMemo(() => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }), []);
  const selectedTotal = useMemo(
    () => openBills.filter((bill) => selectedBills.includes(bill.id)).reduce((sum, bill) => sum + bill.balance, 0),
    [openBills, selectedBills],
  );
  const selectedTotalLabel = pesoFormatter.format(selectedTotal);
  const isMonthlyDues = transactionType === "MONTHLY_DUES" && !documentPayment;
  const displayAmount = documentPayment?.amountLabel || (isMonthlyDues ? selectedTotalLabel : pesoFormatter.format(Number(amount) || 0));
  const canSubmit = documentPayment ? true : isMonthlyDues ? selectedBills.length > 0 : Number(amount) > 0;
  const platformFeeEnabled = platformFeeAmountPesos > 0;

  function toggleBill(id: string) {
    setSelectedBills((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  return <form id="qr-payment" action={createHomeownerPayMongoCheckoutAction} className="scroll-mt-24 rounded-3xl border border-blue-100 bg-white shadow-soft">
    <div className="p-4 sm:p-5">
      <div className="mb-5 flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-700"><CreditCard className="size-5" /></span>
        <div><h2 className="text-lg font-black">Pay securely online</h2><p className="text-sm leading-6 text-slate-500">Choose what to pay, then continue to the secure payment page. HOAHub records the HOA payment only after PayMongo sends a verified payment confirmation.</p></div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {documentPayment ? <div className="sm:col-span-2 rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
          <input type="hidden" name="transactionType" value="DOCUMENT_FEE" />
          <input type="hidden" name="documentRequestId" value={documentPayment.documentRequestId} />
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="font-bold uppercase tracking-wide text-slate-500">Document type</dt><dd className="font-black text-slate-950">{documentPayment.documentType}</dd></div>
            <div><dt className="font-bold uppercase tracking-wide text-slate-500">Request number</dt><dd className="font-mono font-black text-slate-950">{documentPayment.requestReference}</dd></div>
            <div><dt className="font-bold uppercase tracking-wide text-slate-500">Amount due</dt><dd className="text-xl font-black text-slate-950">{documentPayment.amountLabel}</dd></div>
            <div><dt className="font-bold uppercase tracking-wide text-slate-500">Payment status</dt><dd className="font-black text-slate-950">{documentPayment.statusLabel}</dd></div>
          </dl>
          <p className="mt-4 whitespace-pre-wrap rounded-xl bg-white p-3 text-sm font-semibold text-slate-700">{documentPayment.purpose}</p>
        </div> : <div className="sm:col-span-2">
          <label className="label" htmlFor="paymongoTransactionType">Transaction type</label>
          <select id="paymongoTransactionType" className="field" name="transactionType" value={transactionType} onChange={(event) => { setTransactionType(event.target.value); setSelectedBills([]); setAmount(""); }} required>
            {transactionTypes.map((type) => <option value={type.value} key={type.value}>{type.label}</option>)}
          </select>
        </div>}

        {isMonthlyDues ? <div className="sm:col-span-2">
          <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div><label className="label">Billing items</label><p className="text-xs text-slate-500">Select one or more unpaid months. HOAHub calculates the total automatically.</p></div>
            <div className="rounded-2xl bg-blue-50 px-4 py-2 text-right"><p className="text-[10px] font-black uppercase tracking-widest text-blue-700">Selected total</p><p className="text-lg font-black text-blue-950">{selectedTotalLabel}</p></div>
          </div>
          <div className="grid max-h-80 gap-2 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50/60 p-2">
            {openBills.map((bill) => {
              const selected = selectedBills.includes(bill.id);
              const disabled = bill.hasPendingRequest;
              return <label key={bill.id} className={`flex items-center gap-3 rounded-xl border p-3 transition ${selected ? "border-blue-300 bg-blue-700 text-white shadow-md" : "border-transparent bg-white hover:border-blue-100"} ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
                <input className="size-4 accent-blue-700" type="checkbox" name="billIds" value={bill.id} checked={selected} disabled={disabled} onChange={() => toggleBill(bill.id)} />
                <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${selected ? "bg-white/15" : "bg-blue-50 text-blue-700"}`}><CircleDollarSign className="size-4" /></span>
                <span className="min-w-0 flex-1"><span className="block font-black">{bill.month}</span><span className={`block text-xs ${selected ? "text-blue-100" : "text-slate-500"}`}>Due {bill.dueDate}{disabled ? " · payment already in progress" : ""}</span></span>
                <span className="text-right font-black">{bill.balanceLabel}</span>
              </label>;
            })}
            {!openBills.length && <p className="rounded-xl bg-white px-3 py-10 text-center text-sm text-slate-500">No unpaid monthly dues are available for online payment.</p>}
          </div>
          {selectedBills.length > 0 && <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50 p-3 text-sm font-bold text-blue-950">Selected coverage: {selectedBills.length} billing item{selectedBills.length === 1 ? "" : "s"} totaling {selectedTotalLabel}. The server rechecks ownership, balance, and payment status before creating checkout.</div>}
          {openBills.some((bill) => bill.hasPendingRequest) && <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">A billing item with a payment already in progress cannot be selected again. Use <b>Continue Payment</b> from Payment Status to resume it.</p>}
        </div> : documentPayment ? null : <>
          <div><label className="label" htmlFor="paymongoAmount">Amount</label><input id="paymongoAmount" className="field" name="amount" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required /></div>
          <div><label className="label" htmlFor="paymongoDescription">Description</label><input id="paymongoDescription" className="field" name="description" placeholder={transactionType === "OTHER" ? "Required for Other Payment" : "Optional"} required={transactionType === "OTHER"} /></div>
        </>}
      </div>

      {platformFeeEnabled && <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        <p className="font-black">Online payment fee disclosure</p>
        <div className="mt-2 flex items-center justify-between gap-4"><span>HOAHub convenience fee</span><b>{pesoFormatter.format(platformFeeAmountPesos)}</b></div>
        <p className="mt-2 text-xs leading-5">This platform fee is separate from your HOA payment. The payment provider will also calculate the applicable <b>Processing Fee</b> for your selected payment method before you authorize payment.</p>
      </div>}

      <div className="mt-5 flex items-start gap-2 rounded-2xl border border-blue-100 bg-blue-50 p-3 text-xs font-semibold leading-5 text-blue-900"><ShieldCheck className="mt-0.5 size-4 shrink-0" /><p>You will leave HOAHub briefly to complete payment on the secure payment page. Returning to HOAHub does not by itself mark the account paid; the verified gateway webhook is the source of truth.</p></div>
    </div>
    <div className="sticky bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-20 border-t border-blue-100 bg-white/95 p-3 backdrop-blur lg:bottom-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[10px] font-black uppercase tracking-[.16em] text-slate-500">HOA payment amount</p><p className="text-xl font-black tabular-nums text-slate-950">{displayAmount}</p>{platformFeeEnabled && <p className="mt-1 text-xs font-bold text-amber-800">+ {pesoFormatter.format(platformFeeAmountPesos)} HOAHub fee + Processing Fee</p>}</div><PayMongoSubmitButton disabled={!canSubmit} /></div>
    </div>
  </form>;
}

function PayMongoSubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" className="btn-primary min-h-12 w-full sm:w-auto" disabled={disabled || pending}>{pending ? "Creating checkout..." : "Continue Payment"}</button>;
}
