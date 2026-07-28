"use client";

import { useEffect } from "react";
import { RotateCcw } from "lucide-react";

export default function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[portal] render failed", { digest: error.digest ?? "missing" });
  }, [error]);

  return (
    <main className="grid min-h-[70vh] place-items-center p-6">
      <section className="w-full max-w-lg rounded-2xl border border-pine-100 bg-white p-6 text-center shadow-soft">
        <p className="text-xs font-black uppercase tracking-[.18em] text-rose-600">Portal temporarily unavailable</p>
        <h1 className="mt-2 text-2xl font-black text-pine-950">We could not load this portal page.</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">Please try again. Your signed-in session is preserved.</p>
        <button type="button" className="btn-primary mt-6 inline-flex items-center justify-center gap-2" onClick={() => reset()}>
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Try again
        </button>
      </section>
    </main>
  );
}
