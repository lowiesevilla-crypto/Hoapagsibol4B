"use client";

import { useEffect } from "react";
import { chunkRecoveryKey, hasFailedNextStaticResource, isChunkLoadFailure, routeCategory, SAFE_CHUNK_RECOVERY_MESSAGE } from "@/lib/chunk-recovery";
import { GLOBAL_ERROR_RECOVERY_KEY, globalErrorRecoveryRecord, shouldFallbackAfterGlobalError } from "@/lib/navigation-recovery";

export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  const chunkFailure = isChunkLoadFailure(error);
  const failedStaticAsset = hasFailedStaticAssetInPerformanceLog();
  const staleClientFailure = chunkFailure || failedStaticAsset;

  useEffect(() => {
    if (!staleClientFailure) return;
    const pathname = window.location.pathname;
    const storageKey = chunkRecoveryKey(pathname, process.env.NEXT_PUBLIC_HOAHUB_BUILD_ID || "local");
    try {
      if (window.sessionStorage.getItem(storageKey) === "1") return;
      window.sessionStorage.setItem(storageKey, "1");
    } catch {
      return;
    }
    console.info("[HOAHub]", { event: "chunk_load_error_boundary", route: routeCategory(pathname), action: "clear_shell_cache_and_reload" });
    void clearHoaHubShellCache().finally(() => window.location.reload());
  }, [staleClientFailure]);

  const recover = () => {
    const pathname = window.location.pathname;
    if (staleClientFailure) {
      void clearHoaHubShellCache().finally(() => window.location.reload());
      return;
    }

    try {
      const previous = window.sessionStorage.getItem(GLOBAL_ERROR_RECOVERY_KEY);
      if (shouldFallbackAfterGlobalError(previous, pathname)) {
        window.sessionStorage.removeItem(GLOBAL_ERROR_RECOVERY_KEY);
        console.info("[HOAHub]", { event: "global_error_recovery", route: routeCategory(pathname), action: "safe_entry" });
        window.location.replace("/");
        return;
      }
      window.sessionStorage.setItem(GLOBAL_ERROR_RECOVERY_KEY, globalErrorRecoveryRecord(pathname));
    } catch {
      // A full document refresh is still the safest recovery when storage is blocked.
    }

    console.info("[HOAHub]", { event: "global_error_recovery", route: routeCategory(pathname), action: "reload" });
    window.location.reload();
  };

  return (
    <main className="grid min-h-[70vh] place-items-center p-6">
      <section className="card max-w-lg text-center">
        <p className="text-sm font-bold uppercase tracking-widest text-rose-600">Something went wrong</p>
        <h1 className="mt-2 text-2xl font-black">We couldn&apos;t finish that request.</h1>
        <p className="mt-3 text-slate-600">{staleClientFailure ? SAFE_CHUNK_RECOVERY_MESSAGE : "HOAHub will reload this page using a fresh secure session and current server state."}</p>
        <button className="btn-primary mt-6" onClick={recover}>
          {staleClientFailure ? "Refresh page" : "Try again"}
        </button>
      </section>
    </main>
  );
}

function hasFailedStaticAssetInPerformanceLog() {
  if (typeof window === "undefined" || !window.performance) return false;
  const entries = window.performance.getEntriesByType("resource") as Array<PerformanceResourceTiming & { responseStatus?: number }>;
  return hasFailedNextStaticResource(entries);
}

async function clearHoaHubShellCache() {
  if (typeof window === "undefined" || !("caches" in window)) return;
  try {
    const cacheNames = await window.caches.keys();
    await Promise.all(
      cacheNames
        .filter((name) => name.startsWith("hoahub-pwa-shell-"))
        .map((name) => window.caches.delete(name)),
    );
  } catch {
    // Cache cleanup is best effort. The hard reload remains the recovery path.
  }
}
