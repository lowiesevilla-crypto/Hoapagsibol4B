"use client";

import { useEffect } from "react";
import { chunkRecoveryKey, isChunkLoadFailure, routeCategory, SAFE_CHUNK_RECOVERY_MESSAGE } from "@/lib/chunk-recovery";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const chunkFailure = isChunkLoadFailure(error);

  useEffect(() => {
    if (!chunkFailure) return;
    const pathname = window.location.pathname;
    const storageKey = chunkRecoveryKey(pathname, process.env.NEXT_PUBLIC_HOAHUB_BUILD_ID || "local");
    try {
      if (window.sessionStorage.getItem(storageKey) === "1") return;
      window.sessionStorage.setItem(storageKey, "1");
    } catch {
      return;
    }
    console.info("[HOAHub]", { event: "chunk_load_error_boundary", route: routeCategory(pathname), action: "reload" });
    window.location.reload();
  }, [chunkFailure]);

  return (
    <main className="grid min-h-[70vh] place-items-center p-6">
      <section className="card max-w-lg text-center">
        <p className="text-sm font-bold uppercase tracking-widest text-rose-600">Something went wrong</p>
        <h1 className="mt-2 text-2xl font-black">We couldn&apos;t finish that request.</h1>
        <p className="mt-3 text-slate-600">{chunkFailure ? SAFE_CHUNK_RECOVERY_MESSAGE : "Please check your information and try again."}</p>
        <button className="btn-primary mt-6" onClick={() => chunkFailure ? window.location.reload() : reset()}>
          {chunkFailure ? "Refresh page" : "Try again"}
        </button>
      </section>
    </main>
  );
}
