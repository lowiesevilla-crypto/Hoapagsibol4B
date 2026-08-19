"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { chunkRecoveryKey, isChunkLoadFailure, routeCategory } from "@/lib/chunk-recovery";
import { GLOBAL_ERROR_RECOVERY_KEY, isProtectedApplicationPath } from "@/lib/navigation-recovery";

const LEGACY_CACHE_NAME_PATTERN = /^(next-pwa|workbox|pwa|offline)(-|$)/i;
const LEGACY_SERVICE_WORKER_PATH_PATTERN = /\/service-worker\.js$|\/workbox-/i;
const DEVELOPMENT_HOAHUB_CACHE_PREFIX = "hoahub-pwa-";
const HOAHUB_SERVICE_WORKER_PATH = "/sw.js";

export function BrowserCacheRecovery() {
  const pathname = usePathname();

  useEffect(() => {
    void removeStaleServiceWorkerCaches();
  }, []);

  useEffect(() => {
    let recovering = false;
    const refreshProtectedHistoryEntry = (reason: "history_pop" | "bfcache_restore") => {
      const currentPath = window.location.pathname;
      if (recovering || !isProtectedApplicationPath(currentPath)) return;
      recovering = true;
      console.info("[HOAHub]", { event: "protected_history_recovery", route: routeCategory(currentPath), action: "reload", reason });
      window.location.reload();
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) refreshProtectedHistoryEntry("bfcache_restore");
    };
    const onPopState = () => refreshProtectedHistoryEntry("history_pop");

    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("popstate", onPopState);
    };
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
        window.sessionStorage.removeItem(GLOBAL_ERROR_RECOVERY_KEY);
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
    if (LEGACY_SERVICE_WORKER_PATH_PATTERN.test(parsed.pathname) || shouldRemoveDevelopmentHoaHubWorker(parsed)) await registration.unregister();
  }));
  if (!("caches" in window)) return;
  const cacheNames = await window.caches.keys().catch(() => []);
  await Promise.all(cacheNames.filter((name) => LEGACY_CACHE_NAME_PATTERN.test(name) || shouldRemoveDevelopmentHoaHubCache(name)).map((name) => window.caches.delete(name)));
}

function shouldRemoveDevelopmentHoaHubWorker(scriptUrl: URL) {
  return process.env.NODE_ENV !== "production" && isLocalDevelopmentOrigin() && scriptUrl.pathname === HOAHUB_SERVICE_WORKER_PATH;
}

function shouldRemoveDevelopmentHoaHubCache(cacheName: string) {
  return process.env.NODE_ENV !== "production" && isLocalDevelopmentOrigin() && cacheName.startsWith(DEVELOPMENT_HOAHUB_CACHE_PREFIX);
}

function isLocalDevelopmentOrigin() {
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.hostname === "::1" || window.location.hostname === "[::1]";
}
