"use client";

import { useEffect } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

export default function PortalDashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const reference = error.digest || "dashboard-render";

  useEffect(() => {
    console.error("[portal-dashboard] error boundary", { digest: error.digest || null, name: error.name });
  }, [error]);

  return (
    <section className="mx-auto max-w-2xl rounded-3xl border border-rose-100 bg-rose-50 p-6 text-rose-950 shadow-soft">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-1 size-6 shrink-0" aria-hidden="true" />
        <div>
          <h1 className="text-xl font-black">Dashboard could not load safely</h1>
          <p className="mt-2 text-sm leading-6">Please retry. If the issue continues, contact the HOA office and provide the reference below. No private server details are shown here.</p>
          <p className="mt-3 rounded-xl bg-white/70 px-3 py-2 font-mono text-xs font-bold text-rose-900">Reference: {reference}</p>
          <button type="button" className="btn-primary mt-5" onClick={reset}>
            <RefreshCw className="size-4" aria-hidden="true" />
            Retry
          </button>
        </div>
      </div>
    </section>
  );
}
