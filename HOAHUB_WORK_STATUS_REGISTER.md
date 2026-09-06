# HOAHub Work Status Register

_Last reconciled: 2026-09-06 (Asia/Manila)_

This register is the current evidence-backed release snapshot for the active HOAHub production-quality program. It does not replace issue-specific acceptance criteria. A capability is called production-verified only after the exact PR head passes required PR gates, the PR is merged with exact-head protection, and the merged `main` SHA passes HOAHub MySQL CI plus Hostinger managed-production/public-health verification.

## Current production baseline

- Current production-verified `main`: `d79c88074b833b4c760a28d74d3962f557a0c231`, merged from PR #310 (`Rental: expose homeowner contracts and signed agreement workflow`).
- PR #310 exact head `f782a2069cd093045988be70276b027e93d9e796` passed all required exact-head PR gates: HOAHub MySQL CI #1492 / run `34003875873`, Canva Visual Parity #537 / run `34003875945`, Edge Critical Flow #130 / run `34003875854`, Firefox Critical Flow #126 / run `34003875822`, and Mobile Responsive Evidence #125 / run `34003875835`.
- PR #310 merged with expected-head protection as `d79c88074b833b4c760a28d74d3962f557a0c231`. Post-merge HOAHub MySQL CI #1493 / run `34005745930` passed on that exact `main` SHA, including lint, Prisma validation/generation/migrations, seed, unit tests, database integration, homeowner verifiers, typecheck, build, production smoke, and the complete critical browser suite. The dependent **Verify Hostinger managed production** job also passed the expected-release marker and public `/api/health` verification.
- The prior production baseline `f98bf3db72e91ec611b9715bf074480377453409` came from PR #308 Rental Asset Reservations and remains part of the evidence history.
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
- Rental Agreements & Contracts: VERIFIED in production through PR #310 — focused Admin agreement view, immutable contract snapshots for existing and newly activated agreements, homeowner-linked agreement visibility, direct Rentals & Contracts discovery, authorized PDF/DOCX/print rendering, tenant/agreement-scoped signed PDF/DOCX upload/download, protected homeowner ownership checks, and reservation fulfillment history preservation. The initial privileged MySQL-trigger implementation was removed after CI proved the managed application user cannot create such triggers; the final production implementation performs snapshot/reservation conversion inside the existing `SERIALIZABLE` agreement transaction instead of weakening database privileges.

## Issue #273 reconciliation

GitHub issue #273 (`HOAHUB-UX-P0-001: truthful action progress and duplicate-submission protection`) is CLOSED / completed. The historical rollout flag remains default-off; issue closure does not itself authorize a tenant pilot.

Evidence-backed increments retained for history include PRs #274, #276, #281, #285, #286, #289, #290, and #291.

## Issue #146 — Finance & Rental hardening

Issue #146 remains OPEN while its six-point scope is completed and reconciled against production evidence.

Production evidence currently covers:

- Item 1 Automatic Billing — tenant ON/OFF + billing day, scheduled Monthly Dues and Rental billing, idempotency, bounded 5,001-homeowner qualification, retry/failure isolation and production scheduler evidence through PRs #147, #277, #283, #290 and #291.
- Item 2 Financial Reports — From/To activity, Income/Expenses/Liabilities/Cash Movement/Receivables and detailed collection/payment-path reporting through the financial-report program and PRs #293–#297.
- Item 3 Admin advance Monthly Dues — all-active-homeowner search including zero balance, pure advance credit, serializable/idempotent PaymentAllocation behavior and oldest-due-first future application through PR #149 and subsequent regression coverage.
- Item 5 Rental Asset Reservations — concurrency-safe tenant-scoped homeowner reservations and Admin visibility through PR #308.
- Item 6 Rental Agreement UX — compact list/focused detail-edit workflow, now extended with official contract generation and signed-copy handling through PR #310.

The remaining actionable gap is **item 4 — Homeowner advance Monthly Dues payment**. The approved requirement is homeowner-selected coverage **From/To month**, an authoritative server-side amount calculated from effective Monthly Dues rules, online payment posted as unapplied homeowner advance credit, and automatic allocation to future Monthly Dues bills. Existing `/portal/pay` currently supports online settlement of existing open bills but not this future-period advance flow.

Do not close #146 until item 4 is production-verified and the final six-point acceptance reconciliation confirms no unresolved requirement.

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

Current production is VERIFIED at `d79c88074b833b4c760a28d74d3962f557a0c231` through post-merge HOAHub MySQL CI #1493 / run `34005745930`, Hostinger expected-release verification, and public production health. PR #310 Rental Agreements & Contracts is complete and production-deployed. Work has moved to **issue #146 item 4 — Homeowner advance Monthly Dues payment**, on a controlled branch from the exact verified production baseline. Issue #194 remains externally blocked and must not be bypassed. Email bulk delivery remains fail-closed pending provider restoration and controlled canary approval.