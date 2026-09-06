"use client";

import { LoaderCircle } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const MAX_PROGRESS_MS = 20_000;

export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const pendingRef = useRef(false);
  const timeoutRef = useRef<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    pendingRef.current = false;
    setMessage(null);
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, [pathname, searchKey]);

  useEffect(() => {
    function clearSafetyTimeout() {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => {
        pendingRef.current = false;
        setMessage(null);
        timeoutRef.current = null;
      }, MAX_PROGRESS_MS);
    }

    function begin(label: string) {
      pendingRef.current = true;
      setMessage(label);
      clearSafetyTimeout();
    }

    function blockDuplicate(event: Event) {
      event.preventDefault();
      event.stopPropagation();
      if ("stopImmediatePropagation" in event) event.stopImmediatePropagation();
    }

    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.dataset.noNavigationProgress === "true" || anchor.download) return;
      if (anchor.target && anchor.target !== "_self") return;

      let destination: URL;
      try {
        destination = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (destination.origin !== window.location.origin) return;

      const current = new URL(window.location.href);
      const sameDocument = destination.pathname === current.pathname && destination.search === current.search;
      if (sameDocument && destination.hash) return;
      if (destination.href === current.href) return;

      if (pendingRef.current) {
        blockDuplicate(event);
        return;
      }

      const readableLabel = (anchor.getAttribute("aria-label") || anchor.getAttribute("title") || anchor.textContent || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 60);
      begin(readableLabel ? `Opening ${readableLabel}…` : "Loading page…");
    }

    function onSubmit(event: SubmitEvent) {
      if (event.defaultPrevented) return;
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      // Read the HTML attribute rather than the named DOM property. Controls
      // such as <select name="method"> can shadow form.method and turn it into
      // an element instead of a string, which must never break POST/server-action
      // submissions while this GET-only progress listener is installed.
      const method = (form.getAttribute("method") || "get").toLowerCase();
      if (method !== "get") return;
      if (form.target && form.target !== "_self") return;

      if (pendingRef.current) {
        blockDuplicate(event);
        return;
      }

      begin("Loading results…");
    }

    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  if (!message) return null;

  return <div
    className="pointer-events-none fixed right-4 top-4 z-[100] flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full border border-white/15 bg-slate-950/95 px-4 py-2.5 text-sm font-bold text-white shadow-2xl backdrop-blur sm:right-6 sm:top-6"
    role="status"
    aria-live="polite"
    aria-atomic="true"
  >
    <LoaderCircle className="size-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
    <span className="truncate">{message}</span>
  </div>;
}
