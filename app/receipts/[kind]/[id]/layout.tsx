import type { ReactNode } from "react";

export default function ReceiptPrintLayout({ children }: { children: ReactNode }) {
  return <>
    <style>{`
      @media print {
        @page {
          size: A4 landscape;
          margin: 0;
        }

        html,
        body {
          width: 297mm !important;
          min-width: 297mm !important;
          height: 210mm !important;
          min-height: 210mm !important;
          margin: 0 !important;
          padding: 0 !important;
          background: #fff !important;
        }

        /* Browser print uses one A4 sheet in landscape. The existing A4
           portrait Receipt / AR is reduced by sqrt(1/2), producing an exact
           half-A4 footprint (148.5mm x 210mm) on the LEFT half of the sheet.
           The right half intentionally remains blank, matching the physical
           cut-in-half printing workflow. */
        .print-document {
          width: 210mm !important;
          max-width: 210mm !important;
          min-height: 297mm !important;
          margin: 0 !important;
          box-sizing: border-box !important;
          zoom: 70.710678%;
          transform: none !important;
          transform-origin: top left;
        }
      }
    `}</style>
    {children}
  </>;
}
