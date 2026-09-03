# HOAHub Homeowner Balance → Record Payment Drilldown — 2026-09-03

## Scope

Improve the Homeowner Monthly Dues Balance Report so an administrator can move directly from an active homeowner balance row to Record Payment without re-searching for the homeowner.

## Implemented behavior

- Active homeowner names in the Homeowner Balance preview are clickable.
- Clicking an active homeowner opens `/admin/payments/record` with the homeowner profile ID as a selection hint.
- Record Payment resolves the homeowner through the existing authenticated `record-options` API.
- The Record Payment API validates both the requested homeowner ID and the authenticated administrator tenant ID and continues to require `ACTIVE` homeowner status.
- After validation, the homeowner name, account number, property, and configured Monthly Dues are automatically populated.
- All available open billing rows returned for the selected homeowner are automatically selected.
- The payment amount is automatically initialized to the total of the selected open billings; the administrator can still review the selected billings and adjust the amount before submission.
- Payment coverage continues to follow the selected billing months through the existing Record Payment behavior.
- Inactive homeowner rows remain read-only in the balance report because the production Record Payment workflow intentionally accepts active homeowners only.
- If a stale, inactive, deleted, or cross-tenant homeowner ID is supplied, Record Payment does not populate the account and instead asks the administrator to search for an active homeowner.

## Tenant and production safety

No tenant ID is accepted from the browser. The homeowner ID is only a lookup hint. Server-side resolution remains constrained by `tenantId: admin.tenantId` and `status: "ACTIVE"` before any bill data is returned. No payment is created by clicking the report link; the administrator must still review the populated form and submit Record Payment through the existing payment action and idempotency controls.

## Predecessor verification

Homeowner preview wildcard search and pagination PR #296 was merged to `main` as `aa2e8a3852780dca164573a32f5d09d86853f4bb`. Post-merge HOAHub MySQL CI #1450 completed successfully, including managed production verification.

## Verification evidence

- PR #297 exact head: `3af2174d55af42464441d447d6e5d78b64fd59f8`.
- HOAHub MySQL CI #1451 — run `33707826548` — PASSED.
- HOAHub Canva Visual Parity #509 — run `33707826600` — PASSED.
- HOAHub Edge Critical Flow #102 — run `33707826546` — PASSED.
- HOAHub Firefox Critical Flow #98 — run `33707826702` — PASSED.
- HOAHub Mobile Responsive Evidence #97 — run `33707826639` — PASSED.
- PR #297 was squash-merged to `main` as `4ffe5f13f407ede8fdee4990ba048243a08b6f3c`.
- Post-merge HOAHub MySQL CI #1452 — run `33708913075` — PASSED on that exact `main` commit.
- Post-merge verification included lint, Prisma validation/generation/migration, seed, unit tests, database finance integration, functional verification, typecheck, build, controlled Chromium production smoke / critical browser suite, Hostinger managed-production verification, and public production health.

## Verification state

VERIFIED and production-deployed on `main` at `4ffe5f13f407ede8fdee4990ba048243a08b6f3c`.
