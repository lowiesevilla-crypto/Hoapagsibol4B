# HOAHub Tenant Onboarding Operations Guide

**Status:** Current  
**Owner:** Product owner / tenant implementation lead  
**Last reviewed:** August 5, 2026

## Purpose

Use `/admin/onboarding` to move a newly provisioned HOA from tenant creation to a reviewed first billing preview without direct database manipulation. The command center is resumable because readiness is derived from durable tenant, role, homeowner, billing-rule, and audit records.

## Operating sequence

1. Complete HOA identity, address, contact, branding, locale, and support settings.
2. Confirm at least one active tenant administrator assignment.
3. Review privacy, retention, activation, and support responsibilities.
4. Download the current versioned homeowner CSV template.
5. Run dry-run validation. Correct every row-level and database conflict.
6. Re-select the unchanged file, provide an operational reason, and explicitly commit.
7. Verify imported homeowners received secure activation invitations. Never communicate or store a shared default password.
8. Configure dues, penalties, discounts, exemptions, effective dates, and scope through Billing Rules.
9. Run the existing account-level billing preview. Resolve all exclusions and warnings.
10. Record preview sign-off in onboarding. This writes audit evidence and does not generate bills.
11. Generate production billing only through the separate authorized billing action after final approval.

## CSV contract

- Current template version: `1.0`.
- Maximum upload: 2 MB.
- Required identity/property fields: name, email, phone, address, block, lot, monthly dues amount.
- Account number may be supplied as 11 digits or left blank for secure allocation.
- Password columns are prohibited.
- Opening balances are optional, require `billing.adjust`, and post through the audited data-migration ledger.
- The commit action re-parses the file and rechecks live database conflicts; a previously clean preview is not trusted blindly.

## Safety and recovery

- Imports are tenant-scoped and committed in one serializable transaction.
- Any row, relation, opening-balance, or uniqueness failure rolls back the complete batch.
- Repeating the same committed file fails duplicate email/property/account checks instead of creating duplicate residents or bills.
- Activation email delivery occurs after the database commit; failed delivery is recorded and can be retried through the existing homeowner activation controls.
- Upload contents and activation secrets are not written to audit logs.
- Do not upload real pilot data to non-production or shared test environments without approved masking.

## UAT checklist

- Clean import creates homeowners, properties, role assignments, account numbers, and activation invitations.
- Duplicate rows inside one file are rejected.
- Existing tenant email and block/lot conflicts are rejected.
- A globally reserved account number is rejected.
- Invalid amounts and malformed emails show understandable row-level errors.
- Opening balances require elevated billing-adjust authority and appear in the homeowner ledger.
- Unauthorized and cross-tenant requests cannot preview or commit another tenant's records.
- Repeated commit creates no duplicate data.
- Logout/browser interruption does not lose readiness progress.
- Billing preview is reviewable before generation and onboarding sign-off creates no bills.
- Desktop, tablet, keyboard, focus, labels, and status messaging are usable.

## Completion evidence

Retain the onboarding audit events, import fingerprint, approved operational reason, billing-preview sign-off, CI run, and pilot UAT record with the release evidence. Do not retain uploaded CSV files beyond the approved operational session unless a separate controlled retention policy is established.
