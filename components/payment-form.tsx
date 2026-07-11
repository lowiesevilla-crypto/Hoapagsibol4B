"use client";

import { Check, Search, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { recordPaymentAction } from "@/lib/actions/payments";
import { SubmitButton } from "@/components/ui";
import { paymentCoverageMonths } from "@/lib/payment-coverage";
import { paymentMethodRequiresReference } from "@/lib/payment-methods";

export type OpenBillChoice = {
  id: string;
  homeownerId: string;
  homeowner: string;
  property: string;
  month: string;
  billingMonth: string;
  balance: number;
  balanceLabel: string;
  search: string;
};

export function PaymentForm({ bills, today }: { bills: OpenBillChoice[]; today: string }) {
  const [todayYear, todayMonth] = today.split("-").map(Number);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("GCASH");
  const [coverageFromMonth, setCoverageFromMonth] = useState(todayMonth);
  const [coverageFromYear, setCoverageFromYear] = useState(todayYear);
  const [coverageToMonth, setCoverageToMonth] = useState(todayMonth);
  const [coverageToYear, setCoverageToYear] = useState(todayYear);
  const referenceRequired = paymentMethodRequiresReference(method);
  const selectedBills = bills.filter((bill) => selectedIds.includes(bill.id));
  const selectedHomeownerId = selectedBills[0]?.homeownerId;
  const total = selectedBills.reduce((sum, bill) => sum + bill.balance, 0);
  const selectedBillingMonths = selectedBills.map((bill) => bill.billingMonth).sort().join(",");
  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    return bills.filter((bill) => !term || bill.search.includes(term)).slice(0, 12);
  }, [bills, query]);

  useEffect(() => {
    setAmount(total > 0 ? total.toFixed(2) : "");
  }, [total]);

  useEffect(() => {
    const selected = selectedBillingMonths.split(",").filter(Boolean).map((value) => new Date(`${value}T00:00:00.000Z`));
    if (!selected.length) return;
    const first = selected[0];
    const last = selected[selected.length - 1];
    setCoverageFromMonth(first.getUTCMonth() + 1);
    setCoverageFromYear(first.getUTCFullYear());
    setCoverageToMonth(last.getUTCMonth() + 1);
    setCoverageToYear(last.getUTCFullYear());
  }, [selectedBillingMonths]);

  function toggleBill(bill: OpenBillChoice) {
    setSelectedIds((current) => {
      if (current.includes(bill.id)) return current.filter((id) => id !== bill.id);
      const sameHomeowner = !selectedHomeownerId || bill.homeownerId === selectedHomeownerId;
      return sameHomeowner ? [...current, bill.id] : [bill.id];
    });
  }

  return <form action={recordPaymentAction} className="card mb-6">
    <div className="mb-5"><h2 className="text-lg font-black">Record a payment</h2><p className="text-sm text-slate-500">Search a homeowner, select one or more open billings, then record the payment. Reference numbers are optional for Cash and required for non-cash methods.</p></div>
    <div className="grid gap-5 xl:grid-cols-[1.15fr_1fr]">
      <div>
        <label className="label" htmlFor="homeowner-bill-search">Search homeowner or property</label>
        <div className="relative"><Search className="pointer-events-none absolute left-3.5 top-3 size-4 text-slate-400" /><input id="homeowner-bill-search" className="field pl-10" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Type a name, block, lot, or billing month" autoComplete="off" /></div>
        {selectedIds.map((id) => <input key={id} type="hidden" name="billIds" value={id} />)}
        <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/70 p-1.5">
          {matches.map((bill) => {
            const selected = selectedIds.includes(bill.id);
            const disabled = Boolean(selectedHomeownerId && bill.homeownerId !== selectedHomeownerId && !selected);
            return <button key={bill.id} type="button" onClick={() => toggleBill(bill)} disabled={disabled} className={`flex w-full items-center gap-3 rounded-lg p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${selected ? "bg-pine-600 text-white shadow-md" : "hover:bg-white"}`}>
              <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${selected ? "bg-white/15" : "bg-pine-50 text-pine-700"}`}>{selected ? <Check className="size-4" /> : <UserRound className="size-4" />}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-black">{bill.homeowner}</span><span className={`block text-xs ${selected ? "text-pine-100" : "text-slate-500"}`}>{bill.property} - {bill.month}</span></span>
              <span className="text-right text-sm font-black">{bill.balanceLabel}<span className={`block text-[10px] font-semibold uppercase ${selected ? "text-pine-100" : "text-slate-400"}`}>Balance</span></span>
            </button>;
          })}
          {!matches.length && <p className="px-3 py-8 text-center text-sm text-slate-500">No homeowner found with an open balance.</p>}
        </div>
      </div>
      <div className="grid content-start gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2 rounded-xl border border-pine-100 bg-pine-50/60 p-3 text-sm">
          {selectedBills.length ? <><p className="font-black text-pine-900">Selected billings</p><ul className="mt-2 space-y-1 text-pine-800">{selectedBills.map((bill) => <li key={bill.id} className="flex justify-between gap-3"><span>{bill.month}</span><b>{bill.balanceLabel}</b></li>)}</ul><p className="mt-3 flex justify-between border-t border-pine-200 pt-2 text-base font-black"><span>Total payment</span><span>{peso(total)}</span></p></> : <p className="text-slate-500">Select one or more open billings from the same homeowner.</p>}
        </div>
        <div><label className="label">Payment date</label><input className="field" name="paymentDate" type="date" defaultValue={today} required /></div>
        <div><label className="label">Method</label><select className="field" name="method" value={method} onChange={(event) => setMethod(event.target.value)}><option value="CASH">Cash</option><option value="BANK_TRANSFER">Bank transfer</option><option value="GCASH">GCash</option><option value="CHECK">Check</option><option value="OTHER">Other</option></select></div>
        <fieldset className="sm:col-span-2 rounded-xl border border-sky-200 bg-sky-50/60 p-4">
          <legend className="px-1 text-sm font-black text-sky-950">Payment Coverage</legend>
          <p className="mb-3 text-xs text-sky-800">Select the month and year covered by this Monthly Dues payment.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <CoverageFields label="Coverage From" prefix="coverageFrom" month={coverageFromMonth} year={coverageFromYear} onMonth={setCoverageFromMonth} onYear={setCoverageFromYear} />
            <CoverageFields label="Coverage To" prefix="coverageTo" month={coverageToMonth} year={coverageToYear} onMonth={setCoverageToMonth} onYear={setCoverageToYear} />
          </div>
        </fieldset>
        <div className="sm:col-span-2"><label className="label">Payment amount <span className="text-rose-600">*</span></label><input className="field text-right text-lg font-black text-pine-700" name="amount" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required placeholder="0.00" /><p className="mt-1 text-xs text-slate-500">Editable before saving. Partial payments and amounts above the selected balance are supported and recalculated automatically.</p></div>
        <div className="sm:col-span-2"><label className="label">Reference number {referenceRequired && <span className="text-rose-600">*</span>}</label><input className="field" name="referenceNumber" required={referenceRequired} aria-required={referenceRequired} placeholder={referenceRequired ? "Required; must be unique" : "Optional for cash payments"} /><p className="mt-1 text-xs text-slate-500">{referenceRequired ? "Required for this payment method." : "Cash payments can be saved without a reference number."}</p></div>
        <div className="sm:col-span-2"><label className="label">Remarks</label><input className="field" name="remarks" placeholder="Optional notes shown in receipt audit trail" /></div>
        <div className="sm:col-span-2"><SubmitButton>Record payment - {peso(Number(amount) || 0)}</SubmitButton></div>
      </div>
    </div>
  </form>;
}

function CoverageFields({ label, prefix, month, year, onMonth, onYear }: { label: string; prefix: string; month: number; year: number; onMonth: (value: number) => void; onYear: (value: number) => void }) {
  return <div><p className="mb-2 text-xs font-black uppercase tracking-wide text-sky-900">{label}</p><div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2"><label className="sr-only" htmlFor={`${prefix}Month`}>{label} Month</label><select id={`${prefix}Month`} className="field" name={`${prefix}Month`} value={month} onChange={(event) => onMonth(Number(event.target.value))} required>{paymentCoverageMonths.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select><label className="sr-only" htmlFor={`${prefix}Year`}>{label} Year</label><input id={`${prefix}Year`} className="field" name={`${prefix}Year`} type="number" min="1900" max="2200" step="1" value={year} onChange={(event) => onYear(Number(event.target.value))} required inputMode="numeric" /></div></div>;
}

function peso(value: number) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);
}
