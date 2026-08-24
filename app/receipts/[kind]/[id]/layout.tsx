import type { ReactNode } from "react";

export default function ReceiptPrintLayout({ children }: { children: ReactNode }) {
  return <>
    <style>{`
      @media print {
        @page {
          size: 148mm 210mm;
          margin: 0;
        }

        html,
        body {
          width: 148mm !important;
          min-width: 148mm !important;
          margin: 0 !important;
          padding: 0 !important;
          background: #fff !important;
        }

        /* Browser printing uses an actual half-A4 portrait sheet. Keep the
           existing full-A4 receipt composition and scale its layout footprint
           down to the 148mm x 210mm print page so it fills one physical sheet
           without the blank lower half produced by an A4 @page. */
        .print-document {
          width: 210mm !important;
          max-width: 210mm !important;
          min-height: 297mm !important;
          margin: 0 !important;
          box-sizing: border-box !important;
          zoom: 70.47619048%;
          transform: none !important;
          transform-origin: top left;
        }
      }
    `}</style>
    {children}
  </>;
}
