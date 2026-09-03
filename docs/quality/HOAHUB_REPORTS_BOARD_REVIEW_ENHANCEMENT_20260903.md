# HOAHub Reports Board Review Enhancement — 2026-09-03

## Scope

The Homeowner Monthly Dues Balance Report is a dedicated tenant-scoped report view, separate from the HOA Financial Report, and is being improved for large-tenant operational review.

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

## Homeowner balance preview search and pagination

- The preview table uses 25-row pagination instead of limiting administrators to the first 100 homeowners.
- Search is applied to the complete authenticated tenant/status report result set before pagination, so a homeowner can be found regardless of which preview page the record would otherwise appear on.
- Wildcard/partial matching supports homeowner name, account number, block, lot, phase, and combinations such as `Block 12 Lot 5` or `Juan 12`.
- Search is case-insensitive and accent-insensitive and requires every entered token to match somewhere in the homeowner search fields.
- Search, date range, and homeowner status are preserved when navigating preview pages.
- The Excel export remains the complete report for the selected tenant/date/status scope; preview search does not silently reduce the downloaded workbook.

## Production safety

No global tenant query safety limit is removed or weakened. Tenant identity is derived from the authenticated administrator session; client-supplied tenant IDs are not accepted. Preview search operates only on rows already returned by the authenticated tenant-scoped report service.

## Verification state

- Board-ready report enhancement PR #295: merged to `main` as `c3a0bf2b64ff4a19fc4d4c663eae1e14b3fdaa40`; post-merge HOAHub MySQL CI #1447 completed successfully.
- Preview search/pagination enhancement: IMPLEMENTED on `feature/homeowner-balance-preview-search-pagination-20260903`; exact-head CI, merge, and post-merge verification are required before VERIFIED status.
