# HOAHub Reports Board Review Enhancement — 2026-09-03

## Scope

The Homeowner Monthly Dues Balance Report is being enhanced as a dedicated tenant-scoped report view, separate from the HOA Financial Report.

## Implemented behavior

- Homeowner Monthly Dues Balance Report has its own view under Reports.
- Transaction History Report has its own view under Reports.
- HOA Financial Report no longer embeds the homeowner balance and transaction download center.
- Monthly Dues Balance workbook exports all homeowners matching the authenticated tenant/status filter using explicit 500-record cursor pagination with a final integrity count check.
- Payment remarks include Receipt No., Date of Payment, Amount, Payment Coverage, and Full Paid or Partial status using active payment/allocation records associated with selected Monthly Dues bills.
- Payment Coverage is shown per receipt/application, using the allocation coverage label when available and the stored/fallback Monthly Dues coverage for legacy direct bill payments.
- Homeowners without a recorded payment in the selected Monthly Dues billing period show `None Payment`.
- XLSX Sheet 1 contains homeowner Monthly Dues balance details and payment remarks.
- XLSX Sheet 2 is `Summary & Analytics` for HOA Board Review, including executive summary, KPIs, payment-standing analytics, block-level collection analytics, top outstanding homeowner accounts, and board-review notes.
- Workbook output is configured for A4 printable page setup and fit-to-width.

## Production safety

No global tenant query safety limit is removed or weakened. Tenant identity is derived from the authenticated administrator session; client-supplied tenant IDs are not accepted.

## Verification state

IMPLEMENTED on `feature/homeowner-balance-board-report-20260903`; exact-head CI, merge, and post-merge production verification are required before VERIFIED status.
