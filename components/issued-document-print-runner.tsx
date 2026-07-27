"use client";

import { useEffect } from "react";

export function IssuedDocumentPrintRunner() {
  useEffect(() => {
    let cancelled = false;
    async function ready() {
      try {
        if (document.fonts?.ready) await document.fonts.ready;
      } catch {
        // Browser font readiness is best-effort.
      }
      const images = Array.from(document.images);
      await Promise.all(images.map((image) => image.complete ? Promise.resolve() : new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      })));
      if (!cancelled) window.setTimeout(() => window.print(), 150);
    }
    ready();
    return () => { cancelled = true; };
  }, []);

  return null;
}
