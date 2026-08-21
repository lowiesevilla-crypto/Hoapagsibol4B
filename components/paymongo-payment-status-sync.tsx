"use client";

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
  const [checking, setChecking] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

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

  const visible = useMemo(() => payments.slice(0, 5), [payments]);
  if (!checking && !unavailable && visible.length === 0) return null;

  return <section className="rounded-3xl border border-blue-100 bg-blue-50/50 p-4" aria-live="polite">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-black uppercase tracking-[.14em] text-blue-700">PayMongo gateway</p>
        <h3 className="mt-1 font-black text-blue-950">Online payment status</h3>
        <p className="mt-1 text-xs leading-5 text-blue-800">HOAHub checks PayMongo server-to-server. A browser redirect never marks a payment as paid.</p>
      </div>
      <button type="button" onClick={() => void sync()} className="min-h-9 shrink-0 rounded-xl bg-white px-3 text-xs font-black text-blue-700 shadow-sm" disabled={checking}>Refresh</button>
    </div>

    {checking && <p className="mt-3 text-sm font-semibold text-blue-800">Checking PayMongo…</p>}
    {unavailable && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">PayMongo status is temporarily unavailable. No payment will be posted without verified gateway evidence.</p>}

    {visible.length > 0 && <div className="mt-3 grid gap-2">
      {visible.map((payment) => <div key={payment.requestId} className="rounded-2xl bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0"><p className="truncate font-mono text-xs font-black text-slate-700">{payment.referenceNumber}</p><p className="mt-1 text-sm font-black text-slate-950">₱{payment.amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p></div>
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${toneClass[payment.tone]}`}>{payment.label}</span>
        </div>
        <p className="mt-2 text-[11px] font-bold text-slate-500">Finance: {payment.financeStatus === "RECONCILED" ? "Posted and reconciled" : "Not posted"}</p>
        {payment.canResume && <Link href={`/portal/pay/paymongo-resume?requestId=${encodeURIComponent(payment.requestId)}`} className="mt-2 inline-flex min-h-9 items-center rounded-xl bg-blue-700 px-3 text-xs font-black text-white">Continue / Retry Payment</Link>}
        {(payment.state === "CANCELLED" || payment.state === "EXPIRED" || payment.state === "FAILED") && <Link href="/portal/pay#qr-payment" className="mt-2 inline-flex min-h-9 items-center rounded-xl bg-pine-700 px-3 text-xs font-black text-white">Start New Payment</Link>}
      </div>)}
    </div>}
  </section>;
}
