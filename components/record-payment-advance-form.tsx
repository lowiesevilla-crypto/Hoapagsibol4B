"use client";

import { Check, Search, UserRound } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { reconcileHomeownerPaymentProgressAction, recordHomeownerPaymentAction, recordHomeownerPaymentProgressAction, type RecordHomeownerPaymentProgressState } from "@/lib/actions/advance-payments";
import { SubmitButton } from "@/components/ui";
import { paymentCoverageMonths } from "@/lib/payment-coverage";
import { paymentMethodRequiresReference } from "@/lib/payment-methods";

type HomeownerChoice = {
  id: string;
  name: string;
  email: string;
  accountNumber: string;
  property: string;
  monthlyDuesAmount: number;
};

type OpenBillChoice = {
  id: string;
  homeownerId: string;
  homeowner: string;
  property: string;
  month: string;
  billingMonth: string;
  balance: number;
  balanceLabel: string;
};

type HomeownerSearchResponse = { homeowners?: HomeownerChoice[]; total?: number; hasMore?: boolean };
type HomeownerDetailResponse = { homeowner?: HomeownerChoice; bills?: OpenBillChoice[]; error?: string };
type RecordPaymentAdvanceFormProps = {
  today: string;
  submissionKey: string;
  actionProgressEnabled?: boolean;
  initialHomeownerId?: string;
};

const initialProgressState: RecordHomeownerPaymentProgressState = { status: "idle", message: "", paymentId: null, receiptUrl: null, reused: false };
const SUCCESS_RECEIPT_REDIRECT_DELAY_MS = 650;

export function RecordPaymentAdvanceForm({ today, submissionKey, actionProgressEnabled = false, initialHomeownerId }: RecordPaymentAdvanceFormProps) {
  const router = useRouter();
  const statusRef = useRef<HTMLParagraphElement>(null);
  const preloadedHomeownerIdRef = useRef<string | null>(null);
  const [progressState, progressAction] = useActionState(recordHomeownerPaymentProgressAction, initialProgressState);
  const [reconciliationState, reconciliationAction] = useActionState(reconcileHomeownerPaymentProgressAction, initialProgressState);
  const [activeProgressSource, setActiveProgressSource] = useState<"record" | "reconciliation">("record");
  const [todayYear, todayMonth] = today.split("-").map(Number);
  const [query, setQuery] = useState("");
  const [homeowners, setHomeowners] = useState<HomeownerChoice[]>([]);
  const [homeownerTotal, setHomeownerTotal] = useState(0);
  const [loadingHomeowners, setLoadingHomeowners] = useState(true);
  const [selectedHomeowner, setSelectedHomeowner] = useState<HomeownerChoice | null>(null);
  const [bills, setBills] = useState<OpenBillChoice[]>([]);
  const [loadingBills, setLoadingBills] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("GCASH");
  const [coverageFromMonth, setCoverageFromMonth] = useState(todayMonth);
  const [coverageFromYear, setCoverageFromYear] = useState(todayYear);
  const [coverageToMonth, setCoverageToMonth] = useState(todayMonth);
  const [coverageToYear, setCoverageToYear] = useState(todayYear);
  const [preselectingHomeowner, setPreselectingHomeowner] = useState(Boolean(initialHomeownerId));
  const [preselectionError, setPreselectionError] = useState("");
  const referenceRequired = paymentMethodRequiresReference(method);
  const selectedBills = bills.filter((bill) => selectedIds.includes(bill.id));
  const selectedTotal = selectedBills.reduce((sum, bill) => sum + bill.balance, 0);
  const openTotal = bills.reduce((sum, bill) => sum + bill.balance, 0);
  const receivedAmount = Math.max(0, Number(amount) || 0);
  const appliedAmount = Math.min(receivedAmount, selectedTotal || openTotal);
  const unappliedCredit = Math.max(0, receivedAmount - appliedAmount);
  const selectedBillingMonths = selectedBills.map((bill) => bill.billingMonth).sort().join(",");

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoadingHomeowners(true);
      try {
        const response = await fetch(`/api/admin/payments/record-options?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal, headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error("Homeowner search failed.");
        const payload = await response.json() as HomeownerSearchResponse;
        setHomeowners(Array.isArray(payload.homeowners) ? payload.homeowners : []);
        setHomeownerTotal(typeof payload.total === "number" ? payload.total : 0);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setHomeowners([]);
          setHomeownerTotal(0);
        }
      } finally {
        if (!controller.signal.aborted) setLoadingHomeowners(false);
      }
    }, query.trim() ? 180 : 0);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    const homeownerId = initialHomeownerId?.trim();
    if (!homeownerId) {
      setPreselectingHomeowner(false);
      return;
    }

    const controller = new AbortController();
    void (async () => {
      setPreselectingHomeowner(true);
      setPreselectionError("");
      setLoadingBills(true);
      try {
        const response = await fetch(`/api/admin/payments/record-options?homeownerId=${encodeURIComponent(homeownerId)}`, { signal: controller.signal, headers: { Accept: "application/json" } });
        const payload = await response.json() as HomeownerDetailResponse;
        if (!response.ok || !payload.homeowner) throw new Error(payload.error || "Homeowner could not be loaded.");

        const openBills = Array.isArray(payload.bills) ? payload.bills : [];
        preloadedHomeownerIdRef.current = payload.homeowner.id;
        setSelectedHomeowner(payload.homeowner);
        setQuery(payload.homeowner.name);
        setBills(openBills);
        setSelectedIds(openBills.map((bill) => bill.id));
        const total = openBills.reduce((sum, bill) => sum + bill.balance, 0);
        setAmount(total > 0 ? total.toFixed(2) : "");
      } catch (error) {
        if (!controller.signal.aborted) {
          setSelectedHomeowner(null);
          setBills([]);
          setSelectedIds([]);
          setAmount("");
          setPreselectionError(error instanceof Error && error.message === "Homeowner not found."
            ? "The selected homeowner is not active or is unavailable in this tenant. Search for another active homeowner."
            : "The selected homeowner could not be loaded. Search for the homeowner manually before recording payment.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingBills(false);
          setPreselectingHomeowner(false);
        }
      }
    })();

    return () => controller.abort();
  }, [initialHomeownerId]);

  useEffect(() => {
    if (!selectedHomeowner) {
      setBills([]);
      setSelectedIds([]);
      setAmount("");
      return;
    }

    if (preloadedHomeownerIdRef.current === selectedHomeowner.id) {
      preloadedHomeownerIdRef.current = null;
      return;
    }

    const controller = new AbortController();
    void (async () => {
      setLoadingBills(true);
      try {
        const response = await fetch(`/api/admin/payments/record-options?homeownerId=${encodeURIComponent(selectedHomeowner.id)}`, { signal: controller.signal, headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error("Homeowner billing details could not be loaded.");
        const payload = await response.json() as HomeownerDetailResponse;
        const openBills = Array.isArray(payload.bills) ? payload.bills : [];
        setBills(openBills);
        setSelectedIds(openBills.map((bill) => bill.id));
        const total = openBills.reduce((sum, bill) => sum + bill.balance, 0);
        setAmount(total > 0 ? total.toFixed(2) : "");
      } catch {
        if (!controller.signal.aborted) {
          setBills([]);
          setSelectedIds([]);
          setAmount("");
        }
      } finally {
        if (!controller.signal.aborted) setLoadingBills(false);
      }
    })();
    return () => controller.abort();
  }, [selectedHomeowner]);

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

  const selectedName = selectedHomeowner?.name ?? "";
  const canSubmit = Boolean(selectedHomeowner && receivedAmount > 0 && !loadingBills && !preselectingHomeowner);
  const formAction = actionProgressEnabled ? progressAction : recordHomeownerPaymentAction;
  const activeProgressState = activeProgressSource === "reconciliation" ? reconciliationState : progressState;

  function toggleBill(bill: OpenBillChoice) {
    setSelectedIds((current) => current.includes(bill.id) ? current.filter((id) => id !== bill.id) : [...current, bill.id]);
  }

  function selectHomeowner(homeowner: HomeownerChoice) {
    setPreselectionError("");
    setSelectedHomeowner(homeowner);
  }

  useEffect(() => {
    if (!actionProgressEnabled || activeProgressState.status === "idle") return;
    statusRef.current?.focus();
    if (activeProgressState.status !== "success" || !activeProgressState.receiptUrl) return;
    const redirectTimer = window.setTimeout(() => router.push(activeProgressState.receiptUrl!), SUCCESS_RECEIPT_REDIRECT_DELAY_MS);
    return () => window.clearTimeout(redirectTimer);
  }, [actionProgressEnabled, activeProgressState.receiptUrl, activeProgressState.status, router]);

  return <form action={formAction} className="card mb-6" onSubmit={(event) => {
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    setActiveProgressSource(submitter?.dataset.statusCheck === "true" ? "reconciliation" : "record");
  }}>
    <input type="hidden" name="idempotencyKey" value={submissionKey} />
    <input type="hidden" name="homeownerId" value={selectedHomeowner?.id ?? ""} />
    {selectedIds.map((id) => <input key={id} type="hidden" name="billIds" value={id} />)}

    <div className="mb-5">
      <h2 className="text-lg font-black">Record a payment</h2>
      <p className="text-sm text-slate-500">Search any active homeowner in this tenant. Homeowners with zero balance can still make an advance Monthly Dues payment.</p>
    </div>
    {actionProgressEnabled && activeProgressState.status === "error" && <div className="mb-4 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-800"><p ref={statusRef} tabIndex={-1} role="alert" aria-live="polite">{activeProgressState.message}</p><button type="submit" formAction={reconciliationAction} data-status-check="true" className="btn-secondary mt-3 min-h-9 px-3 py-1.5 text-xs">Check payment status before retry</button></div>}
    {actionProgressEnabled && activeProgressState.status === "success" && <p ref={statusRef} tabIndex={-1} role="status" aria-live="polite" className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{activeProgressState.message}</p>}

    <div className="grid gap-5 xl:grid-cols-[1.15fr_1fr]">
      <div>
        <label className="label" htmlFor="record-payment-homeowner-search">Homeowner</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-3 size-4 text-slate-400" />
          <input id="record-payment-homeowner-search" className="field pl-10" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, account number, block, lot, or email" autoComplete="off" />
        </div>
        {preselectingHomeowner && <p className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800" role="status" aria-live="polite">Loading homeowner and available billings from the Homeowner Balance Report...</p>}
        {preselectionError && <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800" role="alert">{preselectionError}</p>}
        {!preselectingHomeowner && initialHomeownerId && selectedHomeowner?.id === initialHomeownerId && <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">Homeowner loaded from the Homeowner Balance Report. All available open billings are selected automatically; review them before recording payment.</p>}
        <p className="mt-1 text-xs font-semibold text-slate-500">{loadingHomeowners ? "Loading active homeowners..." : homeownerTotal > homeowners.length ? `Showing ${homeowners.length} of ${homeownerTotal} matches. Keep typing to narrow the result.` : `${homeownerTotal} active homeowner${homeownerTotal === 1 ? "" : "s"} found.`}</p>
        <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/70 p-1.5">
          {homeowners.map((homeowner) => {
            const selected = selectedHomeowner?.id === homeowner.id;
            return <button key={homeowner.id} type="button" onClick={() => selectHomeowner(homeowner)} className={`flex w-full items-center gap-3 rounded-lg p-3 text-left transition ${selected ? "bg-pine-600 text-white shadow-md" : "hover:bg-white"}`}>
              <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${selected ? "bg-white/15" : "bg-pine-50 text-pine-700"}`}>{selected ? <Check className="size-4" /> : <UserRound className="size-4" />}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-black">{homeowner.name}</span>
                <span className={`block text-xs ${selected ? "text-pine-100" : "text-slate-500"}`}>{homeowner.accountNumber} · {homeowner.property}</span>
              </span>
            </button>;
          })}
          {!loadingHomeowners && !homeowners.length && <p className="px-3 py-8 text-center text-sm text-slate-500">No active homeowner matched this search.</p>}
        </div>

        {selectedHomeowner && <div className="mt-4 rounded-xl border border-pine-100 bg-pine-50/60 p-3">
          <p className="font-black text-pine-900">{selectedName}</p>
          <p className="text-xs text-pine-800">{selectedHomeowner.accountNumber} · {selectedHomeowner.property}</p>
          <p className="mt-1 text-xs text-pine-800">Configured Monthly Dues: {peso(selectedHomeowner.monthlyDuesAmount)}</p>
        </div>}

        {selectedHomeowner && <div className="mt-4">
          <p className="label">Open Monthly Dues billing</p>
          <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/70 p-1.5">
            {loadingBills && <p className="px-3 py-8 text-center text-sm text-slate-500">Loading open billings...</p>}
            {!loadingBills && bills.map((bill) => {
              const selected = selectedIds.includes(bill.id);
              return <button key={bill.id} type="button" onClick={() => toggleBill(bill)} className={`flex w-full items-center justify-between gap-3 rounded-lg p-3 text-left transition ${selected ? "bg-pine-600 text-white" : "hover:bg-white"}`}>
                <span><span className="block text-sm font-black">{bill.month}</span><span className={`text-xs ${selected ? "text-pine-100" : "text-slate-500"}`}>{bill.property}</span></span>
                <b>{bill.balanceLabel}</b>
              </button>;
            })}
            {!loadingBills && !bills.length && <div className="px-3 py-6 text-center"><p className="font-black text-emerald-800">Zero open balance · Advance payment available</p><p className="mt-1 text-xs text-slate-500">Enter the amount received and coverage period. The full receipt will remain as homeowner advance credit until future Monthly Dues are generated.</p></div>}
          </div>
        </div>}
      </div>

      <div className="grid content-start gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2 rounded-xl border border-pine-100 bg-pine-50/60 p-3 text-sm">
          {!selectedHomeowner ? <p className="text-slate-500">Select a homeowner first.</p> : bills.length ? <><p className="font-black text-pine-900">Current open balance: {peso(openTotal)}</p><p className="mt-1 text-xs text-pine-800">Selected billings are applied first. Any excess becomes advance Monthly Dues credit.</p></> : <><p className="font-black text-emerald-900">Advance Monthly Dues Credit</p><p className="mt-1 text-xs text-emerald-800">This homeowner has no open bill. The amount received will be held as unapplied credit for the next billing cycle.</p></>}
        </div>
        <div><label className="label" htmlFor="record-payment-date">Payment date</label><input id="record-payment-date" className="field" name="paymentDate" type="date" defaultValue={today} required /></div>
        <div><label className="label" htmlFor="record-payment-method">Method</label><select id="record-payment-method" className="field" name="method" value={method} onChange={(event) => setMethod(event.target.value)}><option value="CASH">Cash</option><option value="BANK_TRANSFER">Bank transfer</option><option value="GCASH">GCash</option><option value="CHECK">Check</option><option value="OTHER">Other</option></select></div>
        <fieldset className="sm:col-span-2 rounded-xl border border-sky-200 bg-sky-50/60 p-4">
          <legend className="px-1 text-sm font-black text-sky-950">Payment Coverage</legend>
          <p className="mb-3 text-xs text-sky-800">For advance payments, select the future month range the homeowner intends to cover.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <CoverageFields label="Coverage From" prefix="coverageFrom" month={coverageFromMonth} year={coverageFromYear} onMonth={setCoverageFromMonth} onYear={setCoverageFromYear} />
            <CoverageFields label="Coverage To" prefix="coverageTo" month={coverageToMonth} year={coverageToYear} onMonth={setCoverageToMonth} onYear={setCoverageToYear} />
          </div>
        </fieldset>
        <div className="sm:col-span-2"><label className="label" htmlFor="record-payment-amount">Payment amount received <span className="text-rose-600">*</span></label><input id="record-payment-amount" className="field text-right text-lg font-black text-pine-700" name="amount" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required placeholder="0.00" /><p className="mt-1 text-xs text-slate-500">Any amount not applied to an existing bill remains available as homeowner credit.</p></div>
        {selectedHomeowner && receivedAmount > 0 && <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm"><p className="flex justify-between"><span>Amount received</span><b>{peso(receivedAmount)}</b></p><p className="mt-1 flex justify-between"><span>Applied to current bills</span><b>{peso(appliedAmount)}</b></p><p className="mt-1 flex justify-between"><span>Advance / unapplied credit</span><b>{peso(unappliedCredit)}</b></p>{unappliedCredit > 0 && <p className="mt-3 rounded-lg bg-emerald-100 px-3 py-2 font-bold text-emerald-900">{peso(unappliedCredit)} will remain as Advance Monthly Dues Credit.</p>}</div>}
        <div className="sm:col-span-2"><label className="label" htmlFor="record-payment-reference">Reference number {referenceRequired && <span className="text-rose-600">*</span>}</label><input id="record-payment-reference" className="field" name="referenceNumber" required={referenceRequired} aria-required={referenceRequired} placeholder={referenceRequired ? "Required; must be unique" : "Optional for cash payments"} /></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="record-payment-remarks">Remarks</label><input id="record-payment-remarks" className="field" name="remarks" placeholder="Optional notes shown in receipt audit trail" /></div>
        <div className="sm:col-span-2"><SubmitButton disabled={!canSubmit} actionProgress={actionProgressEnabled} pendingLabel="Recording payment" success={actionProgressEnabled && activeProgressState.status === "success"}>Record payment - {peso(receivedAmount)}</SubmitButton></div>
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
