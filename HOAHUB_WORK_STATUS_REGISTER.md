# HOAHub Work Status Register

_Last reconciled: 2026-09-06 (Asia/Manila)_

This register is the current evidence-backed release snapshot for the active HOAHub production-quality program. It does not replace issue-specific acceptance criteria. A capability is called production-verified only after the exact PR head passes required PR gates, the PR is merged with exact-head protection, and the merged `main` SHA passes HOAHub MySQL CI plus Hostinger managed-production/public-health verification.

## Current production baseline

- Current production-verified `main`: `f98bf3db72e91ec611b9715bf074480377453409`, merged from PR #308 (`Rental: add homeowner asset reservations with concurrency safety`).
- PR #308 exact head `6fc6a498786f1ca44ec6b7ed1b4bf5f53fa87a63` passed all required exact-head PR gates: HOAHub MySQL CI, Canva Visual Parity, Edge Critical Flow, Firefox Critical Flow, and Mobile Responsive Evidence. The MySQL gate included lint, Prisma validation/generation/migration, seed, unit tests, full integration tests, homeowner mobile verifiers, typecheck, build, and the production smoke / critical browser suite.
- PR #308 merged as `f98bf3db72e91ec611b9715bf074480377453409` using expected-head protection. Post-merge HOAHub MySQL CI #1483 / run `33998180744` passed on that exact `main` SHA, including the new rental-reservation MySQL integration evidence. Hostinger served the expected release and public `/api/health` passed.
- The previous documentation reconciliation PR #307 merged as `4a59b3b652b3bd6ec16f1ea66ca3ca9809b281d8`; post-merge HOAHub MySQL CI #1480 was fully green before PR #308 work began.
- Bulk billing/reminder SMTP delivery remains deliberately fail-closed through `EMAIL_BULK_DELIVERY_ENABLED=false`. Queue creation remains active, but bulk SMTP must not be enabled until the mailbox/provider is restored, Mail Settings **Verify Connection** succeeds, and a controlled one-to-three known-valid-recipient canary is clean.
- The `ux_action_progress_v1` feature flag remains default-off unless a separate controlled rollout authorizes a tenant target.

## Completed / verified programs

- P0 functional regression queue #193: COMPLETED / VERIFIED — Payroll, Petty Cash, Payment Void, Refund, Online Payments reporting/settlement trace, and Financial Reports.
- P1 post-program improvement queue #254: COMPLETED — documentation baseline, document-table usability, billing/document/payment collapsibles, messaging notification UX, household-member administration, safe homeowner payment-history hide/archive, account-information UX, PWA recovery, and final reconciliation through PR #284.
- Automatic Billing 5,001-homeowner qualification #278: VERIFIED through PR #283 — bounded batching, duplicate prevention, retry/completion behavior, row-failure isolation, rental billing-day correctness, rental retry idempotency, oldest-due-first advance-credit allocation, and second-tenant isolation.
- Durable Manual Billing 5,001-homeowner qualification: VERIFIED through PR #289 — durable truthful progress, 250-record batching, duplicate/exemption handling, failed-record-only retry, row-failure isolation, and second-tenant isolation.
- Automatic Billing production trigger: VERIFIED through PRs #290/#291 and successful scheduler execution using the protected cron endpoint.
- Reports expansion: VERIFIED in production through PRs #293–#297 — Homeowner Monthly Dues Balance and Transaction History reporting, full-volume tenant scope, XLSX output, wildcard search, pagination, payment remarks/coverage, and Homeowner → Record Payment drilldown.
- Platform Admin lifecycle/manual subscription payments: VERIFIED through PR #299 — deactivation/reactivation/permanent-delete safeguards and concurrency-safe manual subscription payment posting.
- Platform Agreement commercial terms: VERIFIED through PR #305 — explicit agreement Start/End dates, Free Trial Days with plan fallback, setup-fee snapshot, standard PHP 2.00 HOAHub Convenience Fee, explicit mutual-agreement confirmation for a different rate, immutable delivered/executed copies, and legal-template v1.1 staged for legal approval. Billing scheduler fields are not silently mutated by agreement issuance.
- P0 Email Delivery Safety Hotfix: VERIFIED through PR #306 — invalid-recipient preflight, tenant-scoped suppression, provider circuit breaking, durable queueing, serialized/paced bulk delivery, protected Platform Invoice email, privacy-safe audit data, and authenticated queue scheduler. Deployment does not authorize bulk SMTP enablement.
- Rental Asset Reservations: VERIFIED in production through PR #308 — homeowner `/portal/rentals` inventory/reserve/cancel flow, tenant `AVAILABLE` inventory filtering, private reservation-owner handling in the homeowner portal, Admin Asset reservation owner/status visibility, tenant-scoped composite foreign keys, database-enforced one-active-reservation-per-asset, `SERIALIZABLE` + `FOR UPDATE` mutation protection, audit trail, cancellation history, replacement reservation after cancellation, and second-tenant/cross-tenant FK isolation evidence.

## Issue #273 reconciliation

GitHub issue #273 (`HOAHUB-UX-P0-001: truthful action progress and duplicate-submission protection`) is CLOSED / completed. The historical rollout flag remains default-off; issue closure does not itself authorize a tenant pilot.

Evidence-backed increments retained for history include PRs #274, #276, #281, #285, #286, #289, #290, and #291.

## Issue #146 — Finance & Rental hardening

Issue #146 remains OPEN while its full six-point scope is reconciled against current production evidence.

Production evidence now covers the previously missing **Rental Asset Reservations** requirement through PR #308:

- Homeowners can view tenant `AVAILABLE` rental assets and reserve an unreserved asset.
- Exactly one active reservation per tenant asset is enforced at the database layer and by serialized row-locking mutations.
- Admin Rental Asset actions display active reservation status and homeowner identity with Block/Lot context.
- Homeowner views do not expose another homeowner's identity.
- Reservation create/cancel operations are tenant-scoped and audited.
- MySQL integration proves concurrent competition, cancellation/replacement behavior, and cross-tenant FK isolation.

Repository/status evidence also shows substantial prior delivery for #146 automatic billing, financial reporting, Admin advance-credit behavior, and focused Rental Agreement UX. The next clearly actionable gap identified in the current homeowner payment surface is **#146 item 4 — Homeowner advance Monthly Dues payment**. Current `/portal/pay` is built around existing open bills, and the current PayMongo homeowner form receives `openBills`; the approved #146 requirement instead calls for homeowner-selected coverage **From/To month**, server-side amount calculation from effective Monthly Dues rules, online posting as homeowner advance credit, and automatic future allocation.

Do not close #146 until that homeowner-advance flow and the remaining six-point acceptance reconciliation have exact evidence.

## Blocked external dependency

Authenticated non-destructive production smoke remains tracked by open issue #194. Repository-side preparation exists, but live execution remains BLOCKED on administrator/account-level provisioning of a dedicated authorized production-smoke identity and corresponding protected GitHub production-environment credentials. Real tenant credentials and destructive substitute testing are prohibited.

## Release governance

- Never merge a stale or red head.
- Required CI evidence must belong to the exact current PR head SHA.
- Any failed gate must be inspected to the exact failing job/step, corrected at root cause, pushed as a new head, and re-run.
- Merge only with expected-head/exact-head protection after every required gate is green.
- After merge, verify the merged `main` release with HOAHub MySQL CI plus Hostinger managed-production/public-health verification before the next production mutation.
- A managed-production timeout must be inspected before retry. A same-SHA retry is acceptable only when the failure is external deployment-marker timing rather than a code/test defect.
- Preserve tenant isolation, RBAC, financial/document authority, audit semantics, duplicate protection, receipt uniqueness, idempotency, and live-tenant business behavior.
- Do not use destructive production test data or weaken security/CI gates to obtain a pass.

## Current execution state

Current production is VERIFIED at `f98bf3db72e91ec611b9715bf074480377453409` through post-merge HOAHub MySQL CI #1483 / run `33998180744`, Hostinger expected-release verification, and public production health. PR #308 Rental Asset Reservations is complete and production-deployed. Issue #146 remains open; the next actionable implementation is **Homeowner advance Monthly Dues payment (item 4)**. Issue #194 remains externally blocked and must not be bypassed. Email bulk delivery remains fail-closed pending provider restoration and controlled canary approval.