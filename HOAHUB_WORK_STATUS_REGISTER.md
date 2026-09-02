# HOAHub Work Status Register

_Last reconciled: 2026-09-02 (Asia/Manila)_

This register is the current release-status snapshot for the active HOAHub production-quality program. It records only evidence-backed status and does not replace issue-specific acceptance criteria.

## Current production baseline

- Production-verified `main`: `6c6da059011ca29c429f6e4396d243478579b28a` from PR #291 (`Activate production automatic billing scheduler`). PR #291 exact head `6108cb120cac463d9a89c85d5b98a19eddb39bf6` passed HOAHub MySQL CI #1428, Canva Visual Parity #496, Edge Critical Flow #89, Firefox Critical Flow #85, and Mobile Responsive Evidence #84 before merge.
- Last fully production-verified `main`: `e2248a53ce14595e3a7d61db4dc3b7264988629c` from PR #290 (`Add production automatic billing scheduler`). PR #290 exact head `c00758b4c0e444c262d2216d0a807f33d9581e66` passed HOAHub MySQL CI #1426, Canva Visual Parity #495, Edge Critical Flow #88, Firefox Critical Flow #84, and Mobile Responsive Evidence #83 before merge; post-merge HOAHub MySQL CI #1427 passed including Hostinger managed-production and public-health verification.
- Post-merge HOAHub MySQL CI #1429 passed after rerunning a transient employee-workflow browser navigation abort. The passing attempt completed the full verification suite, production smoke / critical browser suite, Hostinger managed-deployment verification, and public production health for `6c6da059011ca29c429f6e4396d243478579b28a`.
- The new automatic-billing scheduler activation run #1 initially failed before touching tenant data because GitHub's `production` environment had `HOSTINGER_APP_URL` but an empty `CRON_SECRET`; after `CRON_SECRET` was configured, run #1 attempt 2 passed and reconciled 4 tenants with aggregate-only logging.
- The `ux_action_progress_v1` feature flag remains default-off and no active tenant rollout is enabled.

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

Durable Manual Billing progress and dedicated 5,001-homeowner proof tracked by #273 is VERIFIED through PR #289. Exact head `8017230a88f7251a8e865b26a1be97a60f8715d9` passed HOAHub MySQL CI #1424, Canva Visual Parity #494, Edge Critical Flow #87, Firefox Critical Flow #83, and Mobile Responsive Evidence #82; merged as `614e6af11045c79d6113b40d3eb5162740977a64`. Post-merge HOAHub MySQL CI #1425 passed, and the initially delayed Hostinger production marker was inspected and the failed production job rerun successfully. Evidence covers persisted truthful counts, 250-record batching, duplicate/exemption handling, failed-record-only retry, 5,001 active homeowners, and second-tenant isolation.

## Action-progress program — issue #273

`HOAHUB-UX-P0-001` remains `IN_PROGRESS`.

Verified production increments:

- Shared default-off action-progress/submission-lock foundation — PR #274.
- Admin Record Payment server-confirmed result state — PR #276.
- Payment uncertain-response reconciliation before retry — PR #281.
- Monthly Billing server-confirmed result state — PR #285, exact head `12a737312fbfb5ec35f91faebaf82f0f984ee8d5`, which passed MySQL #1412, Canva #485, Edge #78, Firefox #74, and Mobile #73 and merged as `e744afe0a8589f9be45da9ceb745a14a5a0f4a29`.
- Billing progress review corrections — PR #286. The correction resets flagged billing-result state when preview inputs change and preserves framework authorization/session redirects rather than converting them into recoverable billing errors.
- Durable Manual Billing progress and 5,001-homeowner Manual Billing qualification — PR #289.
- Production automatic billing scheduler code — PR #290. The scheduler runs daily at 00:15 Asia/Manila and posts only to `/api/cron/monthly-dues` with the cron bearer secret. PR #291 added the first activation trigger, and scheduler run #1 attempt 2 is verified after GitHub `production` environment `CRON_SECRET` configuration.

Still open under #273:

- Production automatic billing scheduler activation is verified: run #1 attempt 2 passed after GitHub `production` environment secret `CRON_SECRET` was configured and reconciled 4 tenants.
- Remaining P0/P1 financial and operational action coverage, server idempotency/uniqueness review, privacy-safe observability, concurrency/slow-network/two-tab testing, accessibility, selected-tenant staging UAT, monitoring, rollback verification, and explicit product-owner pilot authorization.

No tenant target is enabled while these gates remain incomplete.

## Manual Billing 5,000+ scale qualification

Manual Billing is now independently production-proven at 5,001 homeowners through PR #289. The evidence uses disposable MySQL data and verifies the administrator-triggered generation path with durable job progress, truthful `completed / total` counts, bounded 250-record batches, duplicate/exemption handling, failed-record-only retry, row-level failure isolation, and second-tenant isolation. The active-tenant rollout flag remains disabled until staging/UAT, monitoring, rollback, and product-owner pilot authorization are separately completed.

## Automatic Billing production trigger

The user-reported automatic billing setup showed Monthly Dues automatic billing enabled for day 2, but the prior production deployment had no external scheduler invoking the cron endpoint. PR #290 added the production GitHub Actions scheduler for 00:15 Asia/Manila daily, calling only `/api/cron/monthly-dues`. PR #291 merged a one-time activation trigger on the scheduler workflow file path.

Activation status: VERIFIED. Scheduler run #1 on main `6c6da059011ca29c429f6e4396d243478579b28a` initially failed in `Validate scheduler configuration` because `CRON_SECRET` was empty in GitHub's `production` environment. After the environment secret was configured, run #1 attempt 2 passed, POSTed to `/api/cron/monthly-dues`, and logged `Automatic billing reconciliation completed; tenants processed: 4.` The log masks secrets and exposes no tenant-private identifiers.

## Blocked external dependency

Authenticated non-destructive production UAT remains tracked separately by #194. The repository already contains the bounded read-only harness and manually dispatched workflow. Live execution remains BLOCKED on administrator/environment provisioning of the dedicated UAT identity and controlled homeowner query expected by that workflow:

- `HOAHUB_UAT_ADMIN_EMAIL`
- `HOAHUB_UAT_ADMIN_PASSWORD`
- `HOAHUB_UAT_HOMEOWNER_QUERY`

Real tenant credentials and destructive substitute testing are prohibited.

## Release governance

- Never merge a stale or red head.
- Required CI evidence must belong to the exact current PR head SHA.
- Any failed gate must be inspected to the exact failing job/step, corrected at root cause, pushed as a new head, and re-run.
- After merge, verify the merged `main` release with HOAHub MySQL CI plus managed-production/public-health verification before the next production mutation.
- Preserve tenant isolation, RBAC, financial/document authority, audit semantics, duplicate protection, and live-tenant business behavior.
- Do not use destructive production test data or weaken security/CI gates to obtain a pass.

## Current execution state

Current production is verified at `6c6da059011ca29c429f6e4396d243478579b28a` through post-merge MySQL CI #1429 and Hostinger/public-health verification. Automatic-billing scheduler activation is verified by scheduler run #1 attempt 2, which reconciled 4 tenants. The active engineering priority remains issue #273 for remaining action coverage and tenant pilot readiness; issue #194 remains blocked on administrator-provisioned UAT credentials/environment inputs.
