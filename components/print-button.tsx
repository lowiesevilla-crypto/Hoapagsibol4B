"use client";

import { Printer } from "lucide-react";

export function PrintButton({ label = "Print", fallbackHref }: { label?: string; fallbackHref?: string }) {
  const handlePrint = () => {
    try {
      if (typeof window.print !== "function") {
        if (fallbackHref) window.location.assign(fallbackHref);
        return;
      }
      window.focus();
      requestAnimationFrame(() => window.print());
    } catch {
      if (fallbackHref) window.location.assign(fallbackHref);
    }
  };

  return <button type="button" className="btn-primary print-hidden" onClick={handlePrint}><Printer className="size-4" />{label}</button>;
}
