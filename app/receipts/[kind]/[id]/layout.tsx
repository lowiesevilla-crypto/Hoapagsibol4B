import type { ReactNode } from "react";

export default function ReceiptPrintLayout({ children }: { children: ReactNode }) {
  return <>
    <style>{`
      @media print {
        @page receipt-half-a4 {
          size: A5 portrait;
          margin: 0;
        }

        .print-document {
          page: receipt-half-a4;
          width: 210mm !important;
          max-width: 210mm !important;
          min-height: 297mm !important;
          zoom: .7047619048;
        }
      }
    `}</style>
    {children}
  </>;
}
