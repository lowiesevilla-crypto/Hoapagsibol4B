"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type PaymentActivity = {
  requestId: string;
  referenceNumber: string;
  amount: number;
  state: string;
  label: string;
  tone: "success" | "info" | "warning" | "danger" | "default";
  financeStatus: "RECONCILED" | "NOT_POSTED";
  canResume: boolean;
  terminal: boolean;
};

const toneClass = {
  success: "bg-emerald-100 text-emerald-800",
  info: "bg-blue-100 text-blue-800",
  warning: "bg-amber-100 text-amber-900",
  danger: "bg-rose-100 text-rose-800",
  default: "bg-slate-100 text-slate-700",
};

const signatureStorageKey = "hoahub.paymongo.status.v1";

export function PayMongoPaymentStatusSync() {
  const router = useRouter();
  const [payments, setPayments] = useState<PaymentActivity[]>([]);
  const [hiddenRequestIds, setHiddenRequestIds] = useState<string[]>([]);
  const [checking, setChecking] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [visibilityError, setVisibilityError] = useState("");
  const [updatingRequestId, setUpdatingRequestId] = useState("");

  const sync = useCallback(async () => {
    try {
      const response = await fetch("/api/homeowner-payments/paymongo/status", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; payments?: PaymentActivity[]; hiddenRequestIds?: string[] } | null;
      if (!response.ok || !payload?.ok || !Array.isArray(payload.payments)) throw new Error("Status unavailable");
      setPayments(payload.payments);
      setHiddenRequestIds(Array.isArray(payload.hiddenRequestIds) ? payload.hiddenRequestIds : []);
      setUnavailable(false);

      const signature = payload.payments
        .map((payment) => `${payment.requestId}:${payment.state}:${payment.financeStatus}`)
        .join("|");
      const previous = window.sessionStorage.getItem(signatureStorageKey) || "";
      if (signature && signature !== previous) {
        window.sessionStorage.setItem(signatureStorageKey, signature);
        if (payload.payments.some((payment) => payment.state === "PAID" || payment.state === "EXPIRED" || payment.state === "CANCELLED")) {
          router.refresh();
        }
      }
    } catch {
      setUnavailable(true);
    } finally {
      setChecking(false);
    }
  }, [router]);

  useEffect(() => {
    void sync();
    const timer = window.setInterval(() => {
      if (!document.hidden) void sync();
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [sync]);

  const hiddenSet = useMemo(() => new Set(hiddenRequestIds), [hiddenRequestIds]);
  const visible = useMemo(() => payments.filter((payment) => !hiddenSet.has(payment.requestId)).slice(0, 5), [hiddenSet, payments]);
  const archived = useMemo(() => payments.filter((payment) => hiddenSet.has(payment.requestId)), [hiddenSet, payments]);

  async function updateHistoryVisibility(payment: PaymentActivity, hidden: boolean) {
    if (hidden) {
      const confirmed = window.confirm("Archive this completed online payment from this status view? Official HOA payment, receipt, reconciliation, gateway and audit records will remain unchanged.");
      if (!confirmed) return;
    }
    setUpdatingRequestId(payment.requestId);
    setVisibilityError("");
    try {
      const response = await fetch("/api/homeowner-payments/history-visibility", {
        method: hidden ? "POST" : "DELETE",
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: payment.requestId }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; message?: string } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.message || "Unable to update payment history visibility.");
      setHiddenRequestIds((current) => hidden
        ? current.includes(payment.requestId) ? current : [...current, payment.requestId]
        : current.filter((id) => id !== payment.requestId));
    } catch (error) {
      setVisibilityError(error instanceof Error ? error.message : "Unable to update payment history visibility.");
    } finally {
      setUpdatingRequestId("");
    }
  }

  if (!checking && !unavailable && visible.length === 0 && archived.length === 0) return null;

  return <details className="group overflow-hidden rounded-3xl border border-blue-100 bg-blue-50/50" open aria-live="polite">
    <summary className="flex min-h-16 cursor-pointer list-none items-start justify-between gap-3 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 [&::-webkit-details-marker]:hidden">
      <div className="min-w-0">
        <p className="text-xs font-black uppercase tracking-[.14em] text-blue-700">PayMongo gateway</p>
        <h3 className="mt-1 font-black text-blue-950">Online payment status</h3>
        <p className="mt-1 text-xs leading-5 text-blue-800">HOAHub checks PayMongo server-to-server. A browser redirect never marks a payment as paid.</p>
      </div>
      <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white text-blue-700 shadow-sm" aria-hidden="true"><ChevronDown className="size-5 transition-transform duration-200 group-open:rotate-180" /></span>
    </summary>

    <div className="border-t border-blue-100 p-4 pt-3">
      <div className="flex justify-end">
        <button type="button" onClick={() => void sync()} className="min-h-9 shrink-0 rounded-xl bg-white px-3 text-xs font-black text-blue-700 shadow-sm" disabled={checking}>Refresh</button>
      </div>

      <p className="mt-3 rounded-xl bg-white/80 p-3 text-xs font-semibold leading-5 text-blue-900">Completed online-payment activity can be archived from this homeowner view. Archiving never deletes or changes the official payment request, receipt, finance reconciliation, PayMongo gateway evidence, or audit history.</p>
      {checking && <p className="mt-3 text-sm font-semibold text-blue-800">Checking PayMongo…</p>}
      {unavailable && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">PayMongo status is temporarily unavailable. No payment will be posted without verified gateway evidence.</p>}
      {visibilityError && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-800" role="alert">{visibilityError}</p>}

      {visible.length > 0 && <div className="mt-3 grid gap-2">
        {visible.map((payment) => <div key={payment.requestId} className="rounded-2xl bg-white p-3 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0"><p className="truncate font-mono text-xs font-black text-slate-700">{payment.referenceNumber}</p><p className="mt-1 text-sm font-black text-slate-950">₱{payment.amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p></div>
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${toneClass[payment.tone]}`}>{payment.label}</span>
          </div>
          <p className="mt-2 text-[11px] font-bold text-slate-500">Finance: {payment.financeStatus === "RECONCILED" ? "Posted and reconciled" : "Not posted"}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {payment.canResume && <Link href={`/portal/pay/paymongo-resume?requestId=${encodeURIComponent(payment.requestId)}`} className="inline-flex min-h-9 items-center rounded-xl bg-blue-700 px-3 text-xs font-black text-white">Continue / Retry Payment</Link>}
            {(payment.state === "CANCELLED" || payment.state === "EXPIRED" || payment.state === "FAILED") && <Link href="/portal/pay#qr-payment" className="inline-flex min-h-9 items-center rounded-xl bg-pine-700 px-3 text-xs font-black text-white">Start New Payment</Link>}
            {payment.terminal && <button type="button" onClick={() => void updateHistoryVisibility(payment, true)} className="min-h-9 rounded-xl bg-slate-100 px-3 text-xs font-black text-slate-700" disabled={updatingRequestId === payment.requestId}>{updatingRequestId === payment.requestId ? "Archiving…" : "Archive from this view"}</button>}
          </div>
        </div>)}
      </div>}

      {archived.length > 0 && <details className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
        <summary className="cursor-pointer list-none px-3 py-3 text-xs font-black text-slate-700 [&::-webkit-details-marker]:hidden">Archived from this view ({archived.length})</summary>
        <div className="grid gap-2 border-t border-slate-200 p-3">
          {archived.map((payment) => <div key={payment.requestId} className="rounded-xl bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><p className="font-mono text-xs font-black text-slate-700">{payment.referenceNumber}</p><p className="mt-1 text-xs font-bold text-slate-500">{payment.label} · ₱{payment.amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p></div>
              <button type="button" onClick={() => void updateHistoryVisibility(payment, false)} className="min-h-9 rounded-xl bg-white px-3 text-xs font-black text-blue-700 shadow-sm" disabled={updatingRequestId === payment.requestId}>{updatingRequestId === payment.requestId ? "Restoring…" : "Restore"}</button>
            </div>
          </div>)}
        </div>
      </details>}
    </div>
  </details>;
}
