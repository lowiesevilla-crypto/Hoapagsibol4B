"use client";

import { Download, Printer } from "lucide-react";

export function PlatformInvoiceDocumentActions({ pdfUrl }: { pdfUrl: string }) {
  return (
    <div className="print:hidden flex flex-wrap items-center justify-end gap-3">
      <button
        type="button"
        className="btn-secondary inline-flex items-center gap-2"
        onClick={() => window.print()}
      >
        <Printer className="size-4" /> Print invoice
      </button>
      <a className="btn-primary inline-flex items-center gap-2" href={pdfUrl}>
        <Download className="size-4" /> Download PDF
      </a>
    </div>
  );
}
