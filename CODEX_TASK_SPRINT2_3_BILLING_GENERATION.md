# HOAHub Sprint 2.3 – Automated Billing Generation Engine

## Objective

Build a safe, tenant-scoped billing generation engine that uses the Billing Rules and Billing Exemptions completed in Sprint 2.2.

## Required Features

- Generate billing for all eligible homeowners
- Generate billing for one selected homeowner
- Generate billing for selected homeowners
- Generate billing by block or phase when existing property data supports it
- Preview before generation
- Show eligible, exempt, duplicate, skipped, and error counts
- Respect the Billing Rule effective for the selected coverage month
- Respect active Billing Exemptions
- Prevent duplicate billing
- Preserve historical bills
- Record audit logs
- Support manual generation now
- Prepare for automatic scheduled generation later

## Generation Modes

- All eligible homeowners
- Individual homeowner
- Selected homeowners
- Block or phase, if supported by current data

## Preview Requirements

Before creating bills, show:

- Tenant
- Billing period
- Effective Billing Rule
- Rule amount
- Resolution reference
- Eligible homeowners
- Exempt homeowners
- Existing duplicate bills
- Records that will be created
- Records that will be skipped
- Total projected billing amount

## Generation Requirements

For every candidate homeowner:

1. Resolve tenant from authenticated session.
2. Resolve selected coverage month and year.
3. Find the Billing Rule effective for that period.
4. Confirm the rule is active.
5. Check active exemption.
6. Check duplicate billing.
7. Create bill only when eligible.
8. Save recurring charge type.
9. Save coverage month and year.
10. Save Billing Rule reference or snapshot.
11. Save resolution reference.
12. Update balances using the existing billing process.
13. Record audit details.

## Safety Requirements

- No cross-tenant billing
- No duplicate billing
- No invented rate
- No historical recalculation
- No automatic scheduler in this phase
- No destructive database operations
- No direct production deployment

## Definition of Done

- Preview works
- All-homeowner generation works
- Individual generation works
- Selected-homeowner generation works
- Exemptions are skipped
- Duplicates are skipped
- Existing balance behavior remains correct
- Audit trail is recorded
- Mobile-friendly UI
- Prisma validate passes
- Prisma generate passes
- Typecheck passes
- Build passes
- Local UAT passes