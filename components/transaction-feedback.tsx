"use client";

import { CheckCircle2, CircleX, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

const successMessages: Record<string, string> = {
  created: "Record has been created successfully.",
  saved: "Record has been saved successfully.",
  recorded: "Transaction has been recorded successfully.",
  generated: "Monthly billing records were generated successfully.",
  deleted: "Record has been deleted successfully.",
  refunded: "Bond refund has been recorded successfully.",
  forfeited: "Bond forfeiture has been recorded successfully.",
  calculated: "Payroll has been calculated successfully.",
  recalculated: "Payroll has been recalculated successfully.",
  finalized: "Payroll has been finalized successfully.",
  reopened: "Payroll has been returned to draft for adjustment.",
  paid: "Payroll has been marked as paid successfully.",
  published: "Content has been published successfully.",
  reminded: "Payment reminders have been processed successfully.",
  exempted: "Monthly dues exemption has been added successfully.",
  submitted: "Payment request has been submitted successfully.",
  approved: "Payment request has been approved successfully.",
  rejected: "Payment request has been rejected.",
};

export function TransactionFeedback() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const success = params.get("success");
  const error = params.get("error");
  const message = params.get("message");
  const incoming = useMemo(() => {
    const text = message || error || (success ? successMessages[success] || "Transaction completed successfully." : "");
    return text ? { id: params.toString(), text, failed: Boolean(error) } : null;
  }, [error, message, params, success]);
  const [notification, setNotification] = useState(incoming);

  const clearToastParams = useCallback(() => {
    const next = new URLSearchParams(params.toString());
    ["success", "error", "message", "count", "skipped"].forEach((key) => next.delete(key));
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  const dismiss = useCallback(() => {
    setNotification(null);
    clearToastParams();
  }, [clearToastParams]);

  useEffect(() => {
    if (!incoming) return;
    setNotification(incoming);
    clearToastParams();
  }, [clearToastParams, incoming]);

  useEffect(() => {
    if (!notification) return;
    const timer = window.setTimeout(dismiss, notification.failed ? 8000 : 4500);
    return () => window.clearTimeout(timer);
  }, [dismiss, notification]);

  useEffect(() => {
    if (!notification) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") dismiss();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dismiss, notification]);

  if (!notification) return null;
  return <div className={`pointer-events-auto fixed inset-x-3 top-20 z-[70] flex max-w-[calc(100vw-1.5rem)] items-start gap-3 rounded-2xl border bg-white p-4 shadow-2xl sm:left-auto sm:right-4 sm:max-w-sm lg:top-5 ${notification.failed ? "border-rose-200" : "border-leaf-200"}`} role="alert" aria-live="polite">
    <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full ${notification.failed ? "bg-rose-50 text-rose-600" : "bg-leaf-50 text-leaf-700"}`}>{notification.failed ? <CircleX className="size-5" /> : <CheckCircle2 className="size-5" />}</span>
    <div className="min-w-0 flex-1"><p className="font-black text-ink">{notification.failed ? "Action not completed" : "Success"}</p><p className="mt-0.5 text-sm leading-5 text-slate-600">{notification.text}</p></div>
    <button type="button" onClick={dismiss} className="grid size-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-pine-500" aria-label="Dismiss notification"><X className="size-4" /></button>
  </div>;
}
