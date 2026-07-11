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
      window.print();
    } catch {
      if (fallbackHref) window.location.assign(fallbackHref);
    }
  };

  return <button type="button" className="btn-primary print-hidden cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine-700" onClick={handlePrint}><Printer className="size-4" />{label}</button>;
}
