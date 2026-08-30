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
  receipts?: Array<{ kind: "payment" | "collection"; id: string; receiptNumber: string }>;
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
  const [checking, setChecking] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [hidingId, setHidingId] = useState("");
  const [historyNotice, setHistoryNotice] = useState("");
  const [historyError, setHistoryError] = useState("");

  const sync = useCallback(async () => {
    try {
      const response = await fetch("/api/homeowner-payments/paymongo/status", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; payments?: PaymentActivity[] } | null;
      if (!response.ok || !payload?.ok || !Array.isArray(payload.payments)) throw new Error("Status unavailable");
      setPayments(payload.payments);
      setUnavailable(false);

      const signature = payload.payments
        .map((payment) => `${payment.requestId}:${payment.state}:${payment.financeStatus}:${(payment.receipts || []).map((receipt) => receipt.id).join(",")}`)
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

  async function hideFromHistory(payment: PaymentActivity) {
    if (!payment.terminal || hidingId) return;
    const confirmed = window.confirm("Remove this item from your online payment status history? Official payment, receipt, reconciliation, and audit records will be retained.");
    if (!confirmed) return;

    setHidingId(payment.requestId);
    setHistoryNotice("");
    setHistoryError("");
    try {
      const response = await fetch("/api/homeowner-payments/paymongo/status", {
        method: "DELETE",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ requestId: payment.requestId }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; message?: string } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.message || "Unable to remove this item from your history.");
      setPayments((current) => current.filter((item) => item.requestId !== payment.requestId));
      setHistoryNotice(payload.message || "Removed from your visible online payment history.");
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Unable to remove this item from your history.");
    } finally {
      setHidingId("");
    }
  }

  const visible = useMemo(() => payments.slice(0, 5), [payments]);
  if (!checking && !unavailable && visible.length === 0 && !historyNotice) return null;

  return <details className="group overflow-hidden rounded-3xl border border-blue-100 bg-blue-50/50" open aria-live="polite">
    <summary className="flex min-h-16 cursor-pointer list-none items-start justify-between gap-3 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 [&::-webkit-details-marker]:hidden">
      <div className="min-w-0">
        <p className="text-xs font-black uppercase tracking-[.14em] text-blue-700">PayMongo gateway</p>
        <h3 className="mt-1 font-black text-blue-950">Online payment status</h3>
        <p className="mt-1 text-xs leading-5 text-blue-800">HOAHub checks PayMongo server-to-server. A payment is shown as posted only after its HOAHub finance record and official receipt are present.</p>
      </div>
      <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white text-blue-700 shadow-sm" aria-hidden="true"><ChevronDown className="size-5 transition-transform duration-200 group-open:rotate-180" /></span>
    </summary>

    <div className="border-t border-blue-100 p-4 pt-3">
      <div className="flex justify-end">
        <button type="button" onClick={() => void sync()} className="min-h-9 shrink-0 rounded-xl bg-white px-3 text-xs font-black text-blue-700 shadow-sm" disabled={checking}>Refresh</button>
      </div>

      {checking && <p className="mt-3 text-sm font-semibold text-blue-800">Checking PayMongo…</p>}
      {unavailable && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">PayMongo status is temporarily unavailable. No payment will be posted without verified gateway evidence.</p>}
      {historyNotice && <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-xs font-bold leading-5 text-emerald-800" role="status">{historyNotice}</p>}
      {historyError && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-xs font-bold leading-5 text-rose-800" role="alert">{historyError}</p>}

      {visible.length > 0 && <>
        <p className="mt-3 text-[11px] font-semibold leading-5 text-blue-800">Completed or unsuccessful attempts can be removed from this visible list. HOAHub always retains official finance, receipt, reconciliation, gateway, and audit evidence.</p>
        <div className="mt-3 grid gap-2">
          {visible.map((payment) => <div key={payment.requestId} className="rounded-2xl bg-white p-3 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0"><p className="truncate font-mono text-xs font-black text-slate-700">{payment.referenceNumber}</p><p className="mt-1 text-sm font-black text-slate-950">₱{payment.amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p></div>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${toneClass[payment.tone]}`}>{payment.label}</span>
            </div>
            <p className="mt-2 text-[11px] font-bold text-slate-500">Finance: {payment.financeStatus === "RECONCILED" ? "Posted and reconciled" : "Not posted"}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(payment.receipts || []).map((receipt) => <Link key={`${receipt.kind}-${receipt.id}`} href={`/receipts/${receipt.kind}/${receipt.id}`} target="_blank" className="inline-flex min-h-9 items-center rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-black text-emerald-800">Receipt {receipt.receiptNumber}</Link>)}
              {payment.canResume && <Link href={`/portal/pay/paymongo-resume?requestId=${encodeURIComponent(payment.requestId)}`} className="inline-flex min-h-9 items-center rounded-xl bg-blue-700 px-3 text-xs font-black text-white">Continue / Retry Payment</Link>}
              {(payment.state === "CANCELLED" || payment.state === "EXPIRED" || payment.state === "FAILED") && <Link href="/portal/pay#qr-payment" className="inline-flex min-h-9 items-center rounded-xl bg-pine-700 px-3 text-xs font-black text-white">Start New Payment</Link>}
              {payment.terminal && <button type="button" onClick={() => void hideFromHistory(payment)} disabled={Boolean(hidingId)} className="inline-flex min-h-9 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 disabled:opacity-50">{hidingId === payment.requestId ? "Removing…" : "Remove from my history"}</button>}
            </div>
          </div>)}
        </div>
      </>}
    </div>
  </details>;
}
