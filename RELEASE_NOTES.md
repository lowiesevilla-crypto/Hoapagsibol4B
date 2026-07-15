# HOA Digital Hub 2.0.0

This release moves the production data layer to MySQL 8 and makes GitHub the reviewed source of truth. Existing local data was exported before cutover and restored into MySQL with exact per-model count verification.

Before deploying to Hostinger, create the production MySQL database, shared `.env`, persistent upload directories, PM2 process, SSH key, and required GitHub environment secrets described in the Hostinger guide. The first production deployment should use a maintenance window and retain the source PostgreSQL backup until functional and financial reconciliation is signed off.

The configuration seed no longer creates demonstration homeowners or transactions. Existing production records are migrated through backup/import, while new installations create only safe master/configuration data.

## 2026-07-12 Finance Hotfix

- Fixed false cross-tenant validation for same-tenant PaymentAllocation rows created after a Payment header in the same transaction.
- Added overpayment support with unapplied homeowner credit derived from the payment total minus bill allocations.
- Updated receipts, SOA, payment history, editing, voiding, payment requests, exports, and financial reports to separate cash received, dues applied, and unapplied credit.
- No Prisma schema or migration changes are required for this hotfix.
