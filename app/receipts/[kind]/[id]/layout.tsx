import type { ReactNode } from "react";

export default function ReceiptPrintLayout({ children }: { children: ReactNode }) {
  return <>
    <style>{`
      @media print {
        @page {
          size: A4 portrait;
          margin: 0;
        }

        html,
        body {
          width: 210mm !important;
          min-width: 210mm !important;
          min-height: 297mm !important;
          margin: 0 !important;
          padding: 0 !important;
          background: #fff !important;
        }

        /* Receipt / AR prints on the TOP HALF of one A4 portrait sheet.
           The document itself is laid out as a compact 210mm x 148.5mm
           half-A4 panel; the lower half of the physical A4 sheet remains blank
           for the tenant's cut-in-half printing workflow. */
        .print-document {
          width: 210mm !important;
          max-width: 210mm !important;
          min-height: 0 !important;
          height: 148.5mm !important;
          max-height: 148.5mm !important;
          margin: 0 !important;
          padding: 3mm !important;
          box-sizing: border-box !important;
          overflow: hidden !important;
          font-size: 8px !important;
          line-height: 1.15 !important;
          transform: none !important;
          zoom: 1 !important;
        }

        .print-document > section {
          height: 142.5mm !important;
          max-height: 142.5mm !important;
          overflow: hidden !important;
          padding: 3mm !important;
          border-width: 1px !important;
          box-shadow: none !important;
        }

        .print-document header {
          gap: 2mm !important;
          padding-bottom: 2mm !important;
        }

        .print-document header > :first-child {
          width: 14mm !important;
          height: 14mm !important;
        }

        .print-document header h1 {
          font-size: 11px !important;
          line-height: 1.05 !important;
        }

        .print-document header p {
          margin-top: 0.4mm !important;
          font-size: 6.2px !important;
          line-height: 1.05 !important;
        }

        .print-document .py-6 {
          padding-top: 1.5mm !important;
          padding-bottom: 1.5mm !important;
        }

        .print-document .space-y-4 > :not([hidden]) ~ :not([hidden]) {
          margin-top: 0.8mm !important;
        }

        .print-document .min-h-6 {
          min-height: 2.5mm !important;
        }

        .print-document table {
          font-size: 6.8px !important;
          line-height: 1.05 !important;
        }

        .print-document th,
        .print-document td {
          padding: 0.9mm !important;
        }

        .print-document td span {
          margin-top: 0 !important;
          font-size: 5.8px !important;
        }

        .print-document .mt-4 {
          margin-top: 1.5mm !important;
        }

        .print-document .mt-6 {
          margin-top: 2mm !important;
        }

        .print-document .mt-10 {
          margin-top: 3mm !important;
        }

        .print-document .py-3 {
          padding-top: 1mm !important;
          padding-bottom: 1mm !important;
        }

        .print-document .p-3 {
          padding: 1.2mm !important;
        }

        .print-document .gap-10 {
          gap: 4mm !important;
        }

        .print-document .pt-2 {
          padding-top: 0.8mm !important;
        }

        .print-document .text-sm,
        .print-document .sm\\:text-base {
          font-size: 7px !important;
        }

        .print-document .text-xs {
          font-size: 6px !important;
        }

        .print-document .text-lg {
          font-size: 9px !important;
        }

        .print-document section,
        .print-document table,
        .print-document tr,
        .print-document .mt-10 {
          break-inside: avoid;
        }
      }
    `}</style>
    {children}
  </>;
}
