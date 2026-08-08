"use client";

import { Download, Printer } from "lucide-react";

export function AgreementPrintActions({ pdfUrl }: { pdfUrl: string }) {
  return (
    <div className="flex flex-wrap gap-2 print:hidden" aria-label="Agreement document actions">
      <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={() => window.print()}>
        <Printer className="size-4" /> Print agreement
      </button>
      <a className="btn-primary inline-flex items-center gap-2" href={pdfUrl}>
        <Download className="size-4" /> Download PDF
      </a>
    </div>
  );
}
