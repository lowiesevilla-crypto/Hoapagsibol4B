"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { chunkRecoveryKey, isChunkLoadFailure, routeCategory } from "@/lib/chunk-recovery";

const CACHE_NAME_PATTERN = /^(hoahub|next-pwa|workbox|pwa|offline)/i;
const SERVICE_WORKER_PATH_PATTERN = /\/(sw|service-worker)\.js$|\/workbox-/i;

export function BrowserCacheRecovery() {
  const pathname = usePathname();

  useEffect(() => {
    void removeStaleServiceWorkerCaches();
  }, []);

  useEffect(() => {
    const buildId = process.env.NEXT_PUBLIC_HOAHUB_BUILD_ID || "local";
    const storageKey = chunkRecoveryKey(pathname, buildId);
    const recover = (event: ErrorEvent | PromiseRejectionEvent, error: unknown) => {
      if (!isChunkLoadFailure(error)) return;
      event.preventDefault();
      try {
        if (window.sessionStorage.getItem(storageKey) === "1") return;
        window.sessionStorage.setItem(storageKey, "1");
      } catch {
        return;
      }
      console.info("[HOAHub]", { event: "chunk_load_recovery", route: routeCategory(pathname), action: "reload" });
      window.location.reload();
    };
    const onError = (event: ErrorEvent) => recover(event, event.error || event.message);
    const onUnhandledRejection = (event: PromiseRejectionEvent) => recover(event, event.reason);
    const stableTimer = window.setTimeout(() => {
      try {
        window.sessionStorage.removeItem(storageKey);
      } catch {
        // Storage may be unavailable in restricted browser modes.
      }
    }, 4000);

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.clearTimeout(stableTimer);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, [pathname]);

  return null;
}

async function removeStaleServiceWorkerCaches() {
  if (!("serviceWorker" in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
  await Promise.all(registrations.map(async (registration) => {
    const scriptUrl = registration.active?.scriptURL || registration.waiting?.scriptURL || registration.installing?.scriptURL || "";
    if (!scriptUrl) return;
    let parsed: URL;
    try {
      parsed = new URL(scriptUrl);
    } catch {
      return;
    }
    if (parsed.origin !== window.location.origin) return;
    if (SERVICE_WORKER_PATH_PATTERN.test(parsed.pathname)) await registration.unregister();
  }));
  if (!("caches" in window)) return;
  const cacheNames = await window.caches.keys().catch(() => []);
  await Promise.all(cacheNames.filter((name) => CACHE_NAME_PATTERN.test(name)).map((name) => window.caches.delete(name)));
}
