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
           The lower half remains blank for the tenant's cut-in-half workflow.
           Keep the physical footprint fixed while preserving readable print type. */
        .print-document {
          width: 210mm !important;
          max-width: 210mm !important;
          min-height: 0 !important;
          height: 148.5mm !important;
          max-height: 148.5mm !important;
          margin: 0 !important;
          padding: 2.5mm !important;
          box-sizing: border-box !important;
          overflow: hidden !important;
          font-size: 9.4px !important;
          line-height: 1.2 !important;
          transform: none !important;
          zoom: 1 !important;
        }

        .print-document > section {
          height: 143.5mm !important;
          max-height: 143.5mm !important;
          overflow: hidden !important;
          padding: 3mm !important;
          border-width: 1px !important;
          box-shadow: none !important;
        }

        /* Reserve independent columns for logo, association identity, and receipt metadata.
           This prevents the tenant logo/name from colliding with the receipt number block. */
        .print-document header {
          display: grid !important;
          grid-template-columns: 18mm minmax(0, 1fr) 47mm !important;
          align-items: center !important;
          column-gap: 3mm !important;
          row-gap: 0 !important;
          padding-bottom: 2.2mm !important;
        }

        .print-document header > :first-child {
          width: 18mm !important;
          height: 18mm !important;
          max-width: 18mm !important;
          max-height: 18mm !important;
          align-self: center !important;
          justify-self: center !important;
          overflow: hidden !important;
        }

        /* AssociationLogo is wrapped by PostLoginBrandOrbit. Constrain the real
           logo element too; resizing only the wrapper lets the screen-size logo
           overflow into the tenant-name column when printing. */
        .print-document header > :first-child > span:first-child {
          width: 18mm !important;
          height: 18mm !important;
          max-width: 18mm !important;
          max-height: 18mm !important;
          box-shadow: none !important;
        }

        .print-document header > :first-child img {
          width: 100% !important;
          height: 100% !important;
          max-width: 18mm !important;
          max-height: 18mm !important;
          object-fit: contain !important;
          object-position: center !important;
        }

        /* Do not print the login-handoff orbit/status decoration around the logo. */
        .print-document header > :first-child > span:last-child {
          display: none !important;
        }

        .print-document header > :nth-child(2) {
          min-width: 0 !important;
          overflow: hidden !important;
          text-align: left !important;
        }

        .print-document header > :last-child {
          min-width: 0 !important;
          width: 47mm !important;
          text-align: right !important;
          justify-self: end !important;
        }

        .print-document header h1 {
          margin: 0 !important;
          font-size: 13.5px !important;
          line-height: 1.05 !important;
          letter-spacing: 0 !important;
          overflow-wrap: anywhere !important;
        }

        .print-document header p {
          margin-top: 0.45mm !important;
          font-size: 7.5px !important;
          line-height: 1.12 !important;
        }

        .print-document header > :last-child p:nth-child(2) {
          font-size: 11px !important;
          line-height: 1.05 !important;
          white-space: nowrap !important;
        }

        .print-document .py-6 {
          padding-top: 1.8mm !important;
          padding-bottom: 1.8mm !important;
        }

        .print-document .space-y-4 > :not([hidden]) ~ :not([hidden]) {
          margin-top: 1.1mm !important;
        }

        .print-document .min-h-6 {
          min-height: 3.2mm !important;
        }

        .print-document table {
          font-size: 8.2px !important;
          line-height: 1.12 !important;
        }

        .print-document th,
        .print-document td {
          padding: 1.05mm !important;
        }

        .print-document td span {
          margin-top: 0 !important;
          font-size: 7px !important;
          line-height: 1.1 !important;
        }

        .print-document .mt-4 {
          margin-top: 1.6mm !important;
        }

        .print-document .mt-6 {
          margin-top: 2.2mm !important;
        }

        .print-document .mt-10 {
          margin-top: 3.2mm !important;
        }

        .print-document .py-3 {
          padding-top: 1.1mm !important;
          padding-bottom: 1.1mm !important;
        }

        .print-document .p-3 {
          padding: 1.4mm !important;
        }

        .print-document .gap-10 {
          gap: 5mm !important;
        }

        .print-document .pt-2 {
          padding-top: 1mm !important;
        }

        .print-document .text-sm,
        .print-document .sm\\:text-base {
          font-size: 8.8px !important;
          line-height: 1.18 !important;
        }

        .print-document .text-xs {
          font-size: 7.3px !important;
          line-height: 1.14 !important;
        }

        .print-document .text-lg {
          font-size: 10.5px !important;
          line-height: 1.1 !important;
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
