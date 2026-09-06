"use client";

import { ChevronDown, CircleDollarSign, CreditCard, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { createHomeownerPayMongoCheckoutAction } from "@/lib/actions/homeowner-paymongo";
import { HOMEOWNER_ADVANCE_DUES_TRANSACTION_TYPE } from "@/lib/homeowner-advance-dues";

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

type AdvanceDuesQuote = {
  from: string;
  to: string;
  monthCount: number;
  coverageLabel: string;
  total: number;
  lines: Array<{
    key: string;
    label: string;
    amount: number;
    exempt: boolean;
    exemptionReason: string | null;
    resolutionReference: string | null;
  }>;
};

const transactionTypes = [
  { value: "MONTHLY_DUES", label: "Monthly Dues" },
  { value: HOMEOWNER_ADVANCE_DUES_TRANSACTION_TYPE, label: "Advance Monthly Dues" },
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
  const [advanceFrom, setAdvanceFrom] = useState("");
  const [advanceTo, setAdvanceTo] = useState("");
  const [advanceQuote, setAdvanceQuote] = useState<AdvanceDuesQuote | null>(null);
  const [advanceQuoteError, setAdvanceQuoteError] = useState("");
  const [advanceQuoteLoading, setAdvanceQuoteLoading] = useState(false);
  const pesoFormatter = useMemo(() => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }), []);
  const selectedTotal = useMemo(
    () => openBills.filter((bill) => selectedBills.includes(bill.id)).reduce((sum, bill) => sum + bill.balance, 0),
    [openBills, selectedBills],
  );
  const selectedTotalLabel = pesoFormatter.format(selectedTotal);
  const isMonthlyDues = transactionType === "MONTHLY_DUES" && !documentPayment;
  const isAdvanceDues = transactionType === HOMEOWNER_ADVANCE_DUES_TRANSACTION_TYPE && !documentPayment;
  const displayAmount = documentPayment?.amountLabel
    || (isMonthlyDues ? selectedTotalLabel : isAdvanceDues ? pesoFormatter.format(advanceQuote?.total || 0) : pesoFormatter.format(Number(amount) || 0));
  const canSubmit = documentPayment ? true : isMonthlyDues ? selectedBills.length > 0 : isAdvanceDues ? Boolean(advanceQuote && !advanceQuoteLoading) : Number(amount) > 0;
  const platformFeeEnabled = platformFeeAmountPesos > 0;

  useEffect(() => {
    if (!isAdvanceDues || !advanceFrom || !advanceTo) {
      setAdvanceQuote(null);
      setAdvanceQuoteError("");
      setAdvanceQuoteLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setAdvanceQuoteLoading(true);
      setAdvanceQuote(null);
      setAdvanceQuoteError("");
      try {
        const response = await fetch(`/api/homeowner-payments/advance-dues-quote?from=${encodeURIComponent(advanceFrom)}&to=${encodeURIComponent(advanceTo)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json() as AdvanceDuesQuote & { error?: string };
        if (!response.ok) throw new Error(payload.error || "Advance Monthly Dues quote could not be calculated.");
        setAdvanceQuote(payload);
      } catch (error) {
        if (!controller.signal.aborted) setAdvanceQuoteError(error instanceof Error ? error.message : "Advance Monthly Dues quote could not be calculated.");
      } finally {
        if (!controller.signal.aborted) setAdvanceQuoteLoading(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [advanceFrom, advanceTo, isAdvanceDues]);

  function toggleBill(id: string) {
    setSelectedBills((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  return <form id="qr-payment" action={createHomeownerPayMongoCheckoutAction} className="scroll-mt-24 rounded-3xl border border-blue-100 bg-white shadow-soft">
    <div className="p-4 sm:p-5">
      <details className="group mb-4 rounded-2xl border border-blue-100 bg-blue-50/40">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 [&::-webkit-details-marker]:hidden">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-100 text-blue-700"><CreditCard className="size-5" /></span>
            <div className="min-w-0"><h2 className="font-black text-slate-950">Pay securely online</h2><p className="text-xs font-semibold text-slate-500">How secure checkout works</p></div>
          </div>
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-blue-700" aria-hidden="true"><ChevronDown className="size-5 transition-transform duration-200 group-open:rotate-180" /></span>
        </summary>
        <div className="border-t border-blue-100 px-4 pb-4 pt-3">
          <p className="text-sm leading-6 text-slate-600">Choose what to pay, then continue to the secure payment page. HOAHub records the HOA payment only after PayMongo sends a verified payment confirmation.</p>
        </div>
      </details>

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
        </div> : <div className="sm:col-span-2 rounded-2xl border border-blue-100 bg-white p-3 shadow-sm">
          <label className="mb-2 block text-xs font-black uppercase tracking-[.14em] text-blue-800" htmlFor="paymongoTransactionType">Transaction type</label>
          <select id="paymongoTransactionType" className="field" name="transactionType" value={transactionType} onChange={(event) => { setTransactionType(event.target.value); setSelectedBills([]); setAmount(""); setAdvanceQuote(null); setAdvanceQuoteError(""); }} required>
            {transactionTypes.map((type) => <option value={type.value} key={type.value}>{type.label}</option>)}
          </select>
        </div>}

        {isMonthlyDues ? <div className="sm:col-span-2 rounded-2xl border border-blue-100 bg-blue-50/30 p-3 sm:p-4">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="text-xs font-black uppercase tracking-[.14em] text-blue-800">Billing items</p><p className="mt-1 text-xs text-slate-500">Select one or more unpaid months. HOAHub calculates the total automatically.</p></div>
            <div className="rounded-2xl bg-white px-4 py-2 text-right shadow-sm"><p className="text-[10px] font-black uppercase tracking-widest text-blue-700">Selected total</p><p className="text-lg font-black text-blue-950">{selectedTotalLabel}</p></div>
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
            {!openBills.length && <p className="rounded-xl bg-white px-3 py-10 text-center text-sm text-slate-500">No unpaid monthly dues are available. You can still choose <b>Advance Monthly Dues</b> above to prepay eligible future coverage.</p>}
          </div>
          {selectedBills.length > 0 && <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50 p-3 text-sm font-bold text-blue-950">Selected coverage: {selectedBills.length} billing item{selectedBills.length === 1 ? "" : "s"} totaling {selectedTotalLabel}. The server rechecks ownership, balance, and payment status before creating checkout.</div>}
          {openBills.some((bill) => bill.hasPendingRequest) && <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">A billing item with a payment already in progress cannot be selected again. Use <b>Continue Payment</b> from Payment Status to resume it.</p>}
        </div> : isAdvanceDues ? <div className="sm:col-span-2 rounded-2xl border border-blue-100 bg-blue-50/30 p-3 sm:p-4">
          <div className="mb-4"><p className="text-xs font-black uppercase tracking-[.14em] text-blue-800">Future Monthly Dues coverage</p><h3 className="mt-1 text-lg font-black text-slate-950">Choose From / To month</h3><p className="mt-1 text-xs leading-5 text-slate-600">HOAHub calculates the amount from this association's effective Monthly Dues rules. You cannot type or override the amount. Existing billing periods must be paid from Monthly Dues instead.</p></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label" htmlFor="advanceFromMonth">From month</label><input id="advanceFromMonth" className="field" name="advanceFromMonth" type="month" value={advanceFrom} onChange={(event) => setAdvanceFrom(event.target.value)} required /></div>
            <div><label className="label" htmlFor="advanceToMonth">To month</label><input id="advanceToMonth" className="field" name="advanceToMonth" type="month" value={advanceTo} onChange={(event) => setAdvanceTo(event.target.value)} required /></div>
          </div>
          {advanceQuoteLoading && <div className="mt-3 rounded-2xl border border-blue-100 bg-white p-3 text-sm font-bold text-blue-900" role="status">Calculating the authoritative Monthly Dues amount…</div>}
          {advanceQuoteError && <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800" role="alert">{advanceQuoteError}</div>}
          {advanceQuote && <div className="mt-4 space-y-3">
            <div className="rounded-2xl border border-blue-100 bg-white p-4"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-widest text-blue-700">Advance coverage</p><p className="mt-1 font-black text-slate-950">{advanceQuote.coverageLabel}</p><p className="mt-1 text-xs font-semibold text-slate-500">{advanceQuote.monthCount} month{advanceQuote.monthCount === 1 ? "" : "s"}; exempt months are shown at PHP 0.</p></div><p className="text-2xl font-black text-blue-950">{pesoFormatter.format(advanceQuote.total)}</p></div></div>
            <div className="grid max-h-64 gap-2 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50/60 p-2">{advanceQuote.lines.map((line) => <div key={line.key} className="flex items-center justify-between gap-3 rounded-xl bg-white p-3 text-sm"><div><p className="font-black text-slate-950">{line.label}</p><p className="text-xs font-semibold text-slate-500">{line.exempt ? `Exempt · ${line.exemptionReason || "Active exemption"}` : line.resolutionReference || "Effective Monthly Dues rule"}</p></div><p className="font-black text-slate-950">{pesoFormatter.format(line.amount)}</p></div>)}</div>
            <p className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold leading-5 text-emerald-900">After PayMongo verifies payment, HOAHub records this as homeowner advance credit. Future Monthly Dues bills automatically consume available credit oldest-first; the daily reconciliation remains a recovery safeguard.</p>
          </div>}
        </div> : documentPayment ? null : <>
          <div><label className="label" htmlFor="paymongoAmount">Amount</label><input id="paymongoAmount" className="field" name="amount" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required /></div>
          <div><label className="label" htmlFor="paymongoDescription">Description</label><input id="paymongoDescription" className="field" name="description" placeholder={transactionType === "OTHER" ? "Required for Other Payment" : "Optional"} required={transactionType === "OTHER"} /></div>
        </>}
      </div>

      {platformFeeEnabled && <details className="group mt-5 rounded-2xl border border-amber-200 bg-amber-50 text-sm leading-6 text-amber-950">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-500 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0 flex-1">
            <p className="font-black">Online payment fee disclosure</p>
            <div className="mt-2 flex items-center justify-between gap-4"><span>HOAHub convenience fee</span><b>{pesoFormatter.format(platformFeeAmountPesos)}</b></div>
          </div>
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-900" aria-hidden="true"><ChevronDown className="size-5 transition-transform duration-200 group-open:rotate-180" /></span>
        </summary>
        <div className="border-t border-amber-200 px-4 pb-4 pt-3">
          <p className="text-xs leading-5">This platform fee is separate from your HOA payment. The payment provider will also calculate the applicable <b>Processing Fee</b> for your selected payment method before you authorize payment.</p>
        </div>
      </details>}

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
