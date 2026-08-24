import type { ReactNode } from "react";

export default function ReceiptPrintLayout({ children }: { children: ReactNode }) {
  return <>
    <style>{`
      @media print {
        @page {
          size: 210mm 148.5mm;
          margin: 0;
        }

        html,
        body {
          width: 210mm !important;
          min-width: 210mm !important;
          height: 148.5mm !important;
          min-height: 148.5mm !important;
          margin: 0 !important;
          padding: 0 !important;
          background: #fff !important;
        }

        /* Receipt / AR browser printing uses the exact physical half of an A4
           sheet in landscape orientation. Compact the existing receipt layout
           to the sheet instead of scaling an A4 page inside the print page. */
        .print-document {
          width: 210mm !important;
          max-width: 210mm !important;
          min-height: 0 !important;
          height: auto !important;
          margin: 0 !important;
          padding: 3mm !important;
          box-sizing: border-box !important;
          font-size: 8px !important;
          line-height: 1.15 !important;
          transform: none !important;
          zoom: 1 !important;
        }

        .print-document > section {
          padding: 3mm !important;
          border-width: 1px !important;
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
          line-height: 1.1 !important;
        }

        .print-document header p {
          margin-top: 0.5mm !important;
          font-size: 6.5px !important;
          line-height: 1.1 !important;
        }

        .print-document .py-6 {
          padding-top: 2mm !important;
          padding-bottom: 2mm !important;
        }

        .print-document .space-y-4 > :not([hidden]) ~ :not([hidden]) {
          margin-top: 1mm !important;
        }

        .print-document .min-h-6 {
          min-height: 3mm !important;
        }

        .print-document table {
          font-size: 7px !important;
          line-height: 1.1 !important;
        }

        .print-document th,
        .print-document td {
          padding: 1.1mm !important;
        }

        .print-document td span {
          margin-top: 0 !important;
          font-size: 6px !important;
        }

        .print-document .mt-4 {
          margin-top: 2mm !important;
        }

        .print-document .mt-6 {
          margin-top: 2.5mm !important;
        }

        .print-document .mt-10 {
          margin-top: 4mm !important;
        }

        .print-document .py-3 {
          padding-top: 1.5mm !important;
          padding-bottom: 1.5mm !important;
        }

        .print-document .p-3 {
          padding: 1.5mm !important;
        }

        .print-document .gap-10 {
          gap: 5mm !important;
        }

        .print-document .pt-2 {
          padding-top: 1mm !important;
        }

        .print-document .text-sm,
        .print-document .sm\\:text-base {
          font-size: 7.5px !important;
        }

        .print-document .text-xs {
          font-size: 6.5px !important;
        }

        .print-document .text-lg {
          font-size: 10px !important;
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
