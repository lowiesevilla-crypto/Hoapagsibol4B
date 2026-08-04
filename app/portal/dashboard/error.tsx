"use client";

import { AlertCircle, RefreshCw } from "lucide-react";

export default function PortalDashboardError({ reset }: { reset: () => void }) {
  return (
    <section className="mx-auto max-w-2xl rounded-3xl border border-rose-100 bg-rose-50 p-6 text-rose-950 shadow-soft">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-1 size-6 shrink-0" aria-hidden="true" />
        <div>
          <h1 className="text-xl font-black">Dashboard could not load safely</h1>
          <p className="mt-2 text-sm leading-6">Please retry. If the issue continues, contact the HOA office. No private server details are shown here.</p>
          <button type="button" className="btn-primary mt-5" onClick={reset}>
            <RefreshCw className="size-4" aria-hidden="true" />
            Retry
          </button>
        </div>
      </div>
    </section>
  );
}
