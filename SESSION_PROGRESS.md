# Session Progress

## Sprint
Sprint 2.1 – Finance Engine

## Status
In Progress

## Completed
- Statement of Account (SOA)
- Billing History
- Payment History
- Ledger
- PDF Export
- SOA integrated into Homeowner Module

## UAT Result
PASS

## Issues Found
- Bug #028 – Print SOA button is not clickable
- Bug #029 – Outstanding Balance overlaps on Print and PDF

## Hotfix
Sprint2 Hotfix #001

## Next Task
Fix SOA Print
Fix SOA Layout
Retest
Merge feature/soa-v1 into develop

## Release Blocker Fix #002

Branch:
feature/soa-v1

Completed:
- Fixed Print SOA activation by keeping printing in a Client Component and calling `window.print()` directly from the button click.
- Preserved PDF Download and Return to Homeowner actions.
- Fixed PDF homeowner information overlap by measuring wrapped row heights before starting Account Summary.
- Standardized PDF table content width, margins, header height, borders, and cell wrapping for Running Ledger, Payment History, and Billing History.
- Fixed empty Payment History spacing by rendering an empty state inside a bordered table row with reserved height.
- Added SOA-specific browser print table rules for A4-safe table wrapping.

Verification:
- pnpm typecheck: Passed
- pnpm build: Passed after removing stale `.next`

Not changed:
- Authentication
- RBAC
- Tenant routing
- Prisma schema
- Billing, payment, receipt, or balance computation logic
