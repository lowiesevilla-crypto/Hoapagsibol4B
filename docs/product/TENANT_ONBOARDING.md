# HOAHub Tenant Onboarding Operations Guide

**Status:** Current  
**Owner:** Product owner / tenant implementation lead  
**Last reviewed:** August 5, 2026

## Purpose

The tenant onboarding wizard at `/admin/onboarding` guides an authorized tenant administrator from initial tenant creation through a safe first billing preview without direct database manipulation.

The wizard is resumable. Progress and summaries are stored in a tenant-scoped system setting. Raw uploaded CSV files and activation secrets are not stored in onboarding state.

## Prerequisite

A platform administrator first creates the tenant and initial tenant administrator through Platform Administration. The tenant administrator then signs in and completes the wizard.

## Workflow

1. **Tenant profile and defaults**
   - Confirm HOA name, short name, address, support email, and support phone.
   - Set the IANA timezone and three-letter currency code.
   - Set receipt and document prefixes.

2. **Privacy responsibilities**
   - Confirm the HOA is authorized to control and upload the resident data.
   - Confirm secure handling and retention responsibilities.
   - Confirm authority to import property, account-number, and opening-balance records.

3. **Homeowner dry run and import**
   - Download the versioned CSV template.
   - Upload the completed file for dry-run validation.
   - Correct all errors. No record is written while errors exist.
   - Re-upload the unchanged file and explicitly confirm the apply operation.
   - Download the validation error CSV when needed.

4. **Billing rule**
   - Configure the initial monthly-dues amount, due day, effective month, and authority/description.
   - The rule is created in `MANUAL` generation mode.

5. **First billing preview**
   - Select a coverage month.
   - Review eligible, skipped, invalid, and projected-total counts.
   - The wizard verifies that the persisted bill count is unchanged.

6. **Complete onboarding**
   - Review the checklist and mark onboarding complete.
   - Bill generation remains a separate permission-controlled action in the Billing module.

## Homeowner CSV template v2.0

Required columns:

- `name`
- `email`
- `phone`
- `address`
- `block`
- `lot`
- `status` (`ACTIVE` or `INACTIVE`)
- `monthlyDuesAmount`

Optional columns:

- `phase`
- `propertyType`
- `occupancyStatus`
- `accountNumber`
- `openingBalance`
- `openingBalanceAsOf`

Rules:

- The template does not contain a password field.
- Account numbers are automatically allocated when blank.
- Supplied account numbers must be globally unused 11-digit values that do not start with zero.
- Opening balances require an `openingBalanceAsOf` date in `YYYY-MM-DD` format.
- Money fields allow no more than two decimal places.
- A single file supports up to 500 rows and 2 MB.
- Duplicate email and block/lot checks are tenant-scoped.
- Account-number checks include all tenants because the current account-number schema is globally unique.

## Security and integrity controls

- Server actions require named permissions.
- Applying an import requires both homeowner-management and billing-adjustment authority.
- Privacy acknowledgement is required before operational completion.
- The exact file hash must match the successful dry run.
- Imports run in a serializable transaction.
- Invalid files create no homeowner or balance records.
- Imported users receive a random non-login placeholder hash plus an expiring activation credential and email-verification token.
- Explicit HOMEOWNER role assignments are created.
- Activation emails are attempted only after the database transaction commits.
- Opening balances create a bill, data-migration record, and audit event.
- Batch validation, application, configuration, preview, and completion are audit logged.
- Replaying the same applied batch is rejected.
- Raw CSV data and activation secrets are excluded from audit metadata and onboarding state.
- The retired legacy bulk-data endpoint rejects password-based homeowner imports.

## Recovery and correction

- Validation errors: correct the source file and run a new dry run.
- File changed after validation: run the dry run again; do not bypass the hash check.
- Import failed before commit: no trusted rows should remain. Review the error and retry after correction.
- Activation delivery failed: use the existing homeowner activation controls to regenerate/send an invitation.
- Incorrect imported business data: correct through audited operational workflows; do not edit the database directly.
- Incorrect opening balance: use the approved finance adjustment/migration correction process with audit evidence.

## Acceptance evidence

Required automated evidence includes:

- parser validation and template-without-password tests;
- tenant-scoped duplicate validation;
- transactional activation-only account creation;
- role assignment and account-number reservation;
- opening-balance bill and migration evidence;
- replay denial;
- preview creates no bills;
- permission denial and cross-tenant isolation;
- production browser completion of the representative wizard journey.
