import type { ReactNode } from "react";

export default function ReceiptPrintLayout({ children }: { children: ReactNode }) {
  return <>
    <style>{`
      @media print {
        @page {
          size: A4 portrait;
          margin: 0;
        }

        /* Browser print stays on A4 paper, while the receipt content itself
           is rendered at a half-A4 footprint in portrait orientation. */
        .print-document {
          width: 210mm !important;
          max-width: 210mm !important;
          min-height: 297mm !important;
          transform: scale(0.70710678);
          transform-origin: top left;
        }
      }
    `}</style>
    {children}
  </>;
}
