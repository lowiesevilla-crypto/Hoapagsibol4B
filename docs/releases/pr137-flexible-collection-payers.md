# PR #137 — Flexible Collection Payers

## Scope

Other Income collections support `HOMEOWNER`, `CONTRACTOR`, `RENTER`, and `OTHER` payer types. `RENTER` and `OTHER` use `Collection.payerName` and do not require fabricated homeowner, contractor, or user profiles.

## Finance and bond rules

Construction Bond remains Homeowner-only. Contractor Bond remains Contractor-only. External payer types are valid only for `CollectionType.OTHER`; refundable bond accounting, refunds, forfeitures, receipt numbering, and tenant-scoped authorization are unchanged.

## Data model

Prisma `PayerType` is the single payer authority. The migration expands the existing MySQL enum in place and adds nullable `Collection.payerName`. There is no parallel `payerCategory` column or raw-SQL payer metadata path.

## User-visible surfaces

External payer type and payer name are preserved in collection history/search, HTML receipts, PDF receipts, finance CSV export, and receipt audit metadata.

## Release gate

Merge only after the exact final head passes HOAHub MySQL CI and HOAHub Canva Visual Parity. Production completion requires the merged release marker and `/api/health` verification.
