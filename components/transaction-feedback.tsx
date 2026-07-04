"use client";

import { CheckCircle2, CircleX, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";

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
  const text = useMemo(() => message || error || (success ? successMessages[success] || "Transaction completed successfully." : ""), [error, message, success]);

  function dismiss() {
    const next = new URLSearchParams(params.toString());
    ["success", "error", "message", "count", "skipped"].forEach((key) => next.delete(key));
    router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
  }

  useEffect(() => {
    if (!text) return;
    const timer = window.setTimeout(dismiss, 5000);
    return () => window.clearTimeout(timer);
    // The URL is the source of truth; changing it intentionally restarts the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  if (!text) return null;
  const failed = Boolean(error);
  return <div className={`fixed inset-x-3 top-20 z-[70] flex max-w-sm items-start gap-3 rounded-2xl border bg-white p-4 shadow-2xl sm:left-auto sm:right-4 lg:top-5 ${failed ? "border-rose-200" : "border-leaf-200"}`} role="alert" aria-live="polite">
    <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full ${failed ? "bg-rose-50 text-rose-600" : "bg-leaf-50 text-leaf-700"}`}>{failed ? <CircleX className="size-5" /> : <CheckCircle2 className="size-5" />}</span>
    <div className="min-w-0"><p className="font-black text-ink">{failed ? "Action not completed" : "Success"}</p><p className="mt-0.5 text-sm leading-5 text-slate-600">{text}</p></div>
    <button type="button" onClick={dismiss} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Dismiss notification"><X className="size-4" /></button>
  </div>;
}
