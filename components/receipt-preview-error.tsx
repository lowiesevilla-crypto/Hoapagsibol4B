"use client";

import Link from "next/link";

export function ReceiptPreviewError({ reset, historyHref, historyLabel }: { reset: () => void; historyHref?: string; historyLabel?: string }) {
  return <main className="mx-auto max-w-xl p-6">
    <h1 className="text-xl font-bold">Receipt preview unavailable</h1>
    <p role="alert" className="mt-3 text-slate-600">The preview could not be loaded. This does not mean the transaction failed. Check the saved record before submitting again.</p>
    <div className="mt-5 flex flex-wrap gap-3">
      <button type="button" className="btn-primary" onClick={reset}>Retry preview</button>
      {historyHref && <Link className="btn-secondary" href={historyHref}>{historyLabel || "Transaction history"}</Link>}
      <Link className="btn-secondary" href="/">Return to home</Link>
    </div>
  </main>;
}
