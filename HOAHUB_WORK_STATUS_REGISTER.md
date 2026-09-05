# HOAHub Work Status Register

_Last reconciled: 2026-09-05 (Asia/Manila)_

This register is the current release-status snapshot for the active HOAHub production-quality program. It records only evidence-backed status and does not replace issue-specific acceptance criteria.

## Current production baseline

- Current production-verified `main`: `e14495a437613da9c77ad5863f779b8aa9eb6f80` from PR #306 (`P0: protect outbound email from invalid recipients and SMTP suspension`).
- PR #306 exact head `5e675b46205eb3fb7db2929a5d9ccca228b79afc` passed the required exact-head PR gates: HOAHub MySQL CI #1477 / run `33969580285`, Canva Visual Parity, Edge Critical Flow, Firefox Critical Flow, and Mobile Responsive Evidence. The MySQL gate included unit tests, database integration tests, typecheck, build, and the production smoke / critical browser suite.
- PR #306 merged as `e14495a437613da9c77ad5863f779b8aa9eb6f80`. Post-merge HOAHub MySQL CI #1478 / run `33970326509` passed on that exact `main` SHA. The first Hostinger managed-production verification attempt timed out because `release.txt` remained unavailable for the full ten-minute gate; the failed job was inspected and the same merged SHA was re-verified without a code change. The rerun confirmed Hostinger serving release marker `e14495a43761` and public `/api/health` passed.
- Bulk billing/reminder SMTP delivery remains deliberately fail-closed through `EMAIL_BULK_DELIVERY_ENABLED=false`. Queue creation remains active, but bulk SMTP must not be enabled until the mailbox/provider is restored, Mail Settings **Verify Connection** succeeds, and a one-to-three known-valid-recipient canary is clean.
- The previous production baseline, PR #305 (`Urgent: add agreement dates, trial terms, setup fee, and HOAHub convenience fee`), is also production-verified. Exact PR head `d395bac62c0dea7bac1a3bc1dcfbea56f707f05f` merged as `5d4ff7473b0aa435a9f8650eaa298289bbf7666a`; post-merge HOAHub MySQL CI #1474 / run `33966192780` passed the full verification chain plus Hostinger managed-production and public-health verification.
- PR #305 production-verifies explicit Agreement Start Date and End Date, Free Trial Days with Subscription Plan default fallback, Subscription Plan setup-fee snapshotting, the standard HOAHub Convenience Fee of PHP 2.00 per successfully processed transaction, explicit mutual-agreement confirmation for a different convenience-fee rate, immutable delivered/executed agreement protection, and legal-template v1.1 staged as `PENDING_LEGAL_APPROVAL`. It intentionally does not mutate live billing automation fields such as `TenantSubscription.startedAt`, `trialEndsAt`, or `nextBillingDate`.
- The report enhancement chain remains production-verified through PR #293 (Homeowner Balance + Transaction History Reports), PR #294 (>500 homeowner pagination safety), PR #295 (board-review XLSX, payment remarks and coverage), PR #296 (tenant-wide wildcard search + 25-row pagination), and PR #297 (clickable Homeowner → Record Payment drilldown with automatic homeowner/open-bill selection).
- Production automatic billing remains verified. Scheduler run #1 attempt 2 passed after GitHub's `production` environment `CRON_SECRET` was configured and reconciled four tenants with aggregate-only logging.
- The `ux_action_progress_v1` feature flag remains default-off; this status register does not claim an active tenant pilot.

## Completed / verified programs

The P0 functional regression queue tracked by #193 is COMPLETED and VERIFIED: Payroll, Petty Cash, Payment Void, Refund, Online Payments reporting/settlement trace, and Financial Reports.

The P1 post-program improvement queue tracked by #254 is COMPLETED. Verified delivery includes:

1. Final documentation baseline — PR #253.
2. Document Repository table usability — PR #255.
3. Billing collapsible sections — PR #256.
4. Admin Documents issued-table usability — PR #257.
5. Homeowner Online Payment Status collapsible — PR #258.
6. Messaging received-message popup/notification — PR #259.
7. Admin add Household Member — PR #260.
8. Homeowner Online Payment history safe hide/archive UX — PR #262.
9. Homeowner Account Information collapsible — PR #263.
10. Stale PWA/client update-path correction — PR #270.
11. Final repository documentation reconciliation — PR #284. Issue #254 was closed as completed on 2026-09-01.

Automatic Billing 5,001-homeowner end-to-end proof tracked by #278 is VERIFIED and completed through PR #283. The approved disposable MySQL harness proves bounded automatic Monthly Dues generation at 5,001 active homeowners, duplicate prevention, retry/completion behavior, row-failure isolation, notification-failure persistence, rental billing-day correctness, rental retry idempotency, oldest-due-first advance-credit allocation, and second-tenant isolation.

Durable Manual Billing progress and dedicated 5,001-homeowner proof are VERIFIED through PR #289. Exact head `8017230a88f7251a8e865b26a1be97a60f8715d9` passed HOAHub MySQL CI #1424, Canva Visual Parity #494, Edge Critical Flow #87, Firefox Critical Flow #83, and Mobile Responsive Evidence #82; merged as `614e6af11045c79d6113b40d3eb5162740977a64`. Post-merge HOAHub MySQL CI #1425 passed, and the initially delayed Hostinger production marker was inspected and the failed production job rerun successfully. Evidence covers persisted truthful counts, 250-record batching, duplicate/exemption handling, failed-record-only retry, 5,001 active homeowners, and second-tenant isolation.

The urgent Reports expansion requested on 2026-09-02/03 is VERIFIED in production through PRs #293–#297. The Homeowner Monthly Dues Balance Report provides tenant-scoped full-volume data, Excel workbook output with Summary & Analytics, receipt/date/amount/payment-coverage remarks, wildcard search over the complete selected tenant/status scope, 25-row preview pagination, and clickable active homeowner names that open Record Payment. Record Payment re-validates the homeowner against the authenticated tenant and ACTIVE status, automatically loads/selects all open billings, initializes the payment amount to the open selected total, and derives payment coverage while preserving administrator review before submission. Transaction History remains a separate report view.

Platform Admin tenant lifecycle and manual tenant subscription payment handling remain VERIFIED in production through PR #299. Deactivation retains tenant-owned data while revoking active sessions, permanent deletion requires an inactive tenant plus explicit confirmation and preserves normal FK protections outside the privileged purge, and manual subscription payments use an internal unique reference with concurrency-safe invoice balance updates.

The Platform Agreement commercial-term enhancement is VERIFIED in production through PR #305. New legal template v1.1 remains subject to the existing legal approval/activation workflow; existing signed/delivered agreements are not retroactively modified.

The P0 Email Delivery Safety Hotfix is VERIFIED in production through PR #306. Confirmed protections include zero SMTP for HOAHub placeholder/malformed/reserved-domain recipients, tenant-scoped permanent-recipient suppression, provider circuit breaking, durable billing/reminder queueing, serialized paced bulk delivery, protected Platform Invoice delivery, privacy-safe audit metadata, tenant-scoped processing, and an authenticated scheduled queue worker. Code deployment does not authorize bulk SMTP rollout; `EMAIL_BULK_DELIVERY_ENABLED=false` remains the required production state until provider restoration and canary approval.

## Action-progress program — issue #273 reconciliation

GitHub issue #273 (`HOAHUB-UX-P0-001: truthful action progress and duplicate-submission protection`) is **CLOSED / completed** as of 2026-09-01. The prior status-register statement that it remained `IN_PROGRESS` was stale and is superseded by this reconciliation.

Evidence-backed production increments retained for history:

- Shared default-off action-progress/submission-lock foundation — PR #274.
- Admin Record Payment server-confirmed result state — PR #276.
- Payment uncertain-response reconciliation before retry — PR #281.
- Monthly Billing server-confirmed result state — PR #285.
- Billing progress review corrections — PR #286.
- Durable Manual Billing progress and 5,001-homeowner Manual Billing qualification — PR #289.
- Production automatic billing scheduler code — PR #290 and activation trigger PR #291.

Issue closure is recorded as repository state; it does not by itself establish that every historical pilot/UAT note in the original issue body was executed. The `ux_action_progress_v1` rollout remains default-off unless separately enabled under controlled authorization.

## Manual Billing 5,000+ scale qualification

Manual Billing is independently production-proven at 5,001 homeowners through PR #289. The evidence uses disposable MySQL data and verifies the administrator-triggered generation path with durable job progress, truthful `completed / total` counts, bounded 250-record batches, duplicate/exemption handling, failed-record-only retry, row-level failure isolation, and second-tenant isolation.

## Automatic Billing production trigger

PR #290 added the production GitHub Actions scheduler for 00:15 Asia/Manila daily, calling only `/api/cron/monthly-dues`. PR #291 added the first activation trigger on the scheduler workflow file path.

Activation status: VERIFIED. Scheduler run #1 on main `6c6da059011ca29c429f6e4396d243478579b28a` initially failed in `Validate scheduler configuration` because `CRON_SECRET` was empty in GitHub's `production` environment. After the environment secret was configured, run #1 attempt 2 passed, POSTed to `/api/cron/monthly-dues`, and logged `Automatic billing reconciliation completed; tenants processed: 4.` The log masks secrets and exposes no tenant-private identifiers.

## Blocked external dependency

Authenticated non-destructive production smoke remains tracked by open issue #194. Repository-side preparation exists, but live execution remains BLOCKED on administrator/account-level provisioning of a dedicated authorized production-smoke identity and corresponding protected GitHub production-environment credentials. Real tenant credentials and destructive substitute testing are prohibited.

## Next actionable product task

Open issue #146 (`Finance & Rental hardening: automatic billing, advance dues, reports, reservations, agreement UX`) remains the next actionable product task. Repository review confirms that the clearly missing implementation is **Rental Asset Reservations**:

- Homeowners must be able to view tenant `AVAILABLE` rental assets and reserve an asset.
- One active reservation per asset must be enforced concurrency-safely.
- Admin Rental Asset view must show the reserved homeowner and reservation status.
- Tenant isolation and an audit trail are mandatory.

The current rental persistence contains `RentalAsset`, `Renter`, `RentalAgreement`, `RentalInvoice`, and `RentalPaymentAllocation` but no reservation table. The next controlled implementation therefore adds a tenant-scoped reservation persistence layer, homeowner reserve/cancel flow, Admin Asset reservation visibility, database uniqueness/concurrency protection, and regression evidence before issue #146 is re-evaluated for closure.

## Release governance

- Never merge a stale or red head.
- Required CI evidence must belong to the exact current PR head SHA.
- Any failed gate must be inspected to the exact failing job/step, corrected at root cause, pushed as a new head, and re-run.
- After merge, verify the merged `main` release with HOAHub MySQL CI plus managed-production/public-health verification before the next production mutation.
- A managed-production timeout must be inspected before retry. A retry is acceptable only when the exact already-merged SHA is unchanged and the failure is external deployment-marker timing rather than a code/test defect.
- Preserve tenant isolation, RBAC, financial/document authority, audit semantics, duplicate protection, and live-tenant business behavior.
- Do not use destructive production test data or weaken security/CI gates to obtain a pass.

## Current execution state

Current production is VERIFIED at `e14495a437613da9c77ad5863f779b8aa9eb6f80` through post-merge HOAHub MySQL CI #1478 / run `33970326509`, exact-release Hostinger verification, and public production health. PR #306 is deployed with bulk email delivery still fail-closed. PR #305 Platform Agreement commercial terms are also production-verified through CI #1474 / run `33966192780`. Issue #273 is closed/completed and is no longer the active engineering priority. The next actionable product task is issue #146 Rental Asset Reservations. Issue #194 remains externally blocked on dedicated production-smoke identity/credential provisioning and must not be bypassed.