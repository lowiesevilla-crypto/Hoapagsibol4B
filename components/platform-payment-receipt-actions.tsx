"use client";

import { Printer } from "lucide-react";

export function PlatformPaymentReceiptActions() {
  return (
    <div className="print:hidden flex flex-wrap items-center justify-end gap-3">
      <button
        type="button"
        className="btn-primary inline-flex items-center gap-2"
        onClick={() => window.print()}
      >
        <Printer className="size-4" /> Print receipt
      </button>
    </div>
  );
}
