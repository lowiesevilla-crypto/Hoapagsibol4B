# HOAHub Work Status Register

_Last reconciled: 2026-09-01 (Asia/Manila)_

This register is the current release-status snapshot for the active HOAHub production-quality program. It records only evidence-backed status and does not replace issue-specific acceptance criteria.

## Current production baseline

- Production-verified `main`: `9f58fb2ac9df352ce86972076815ff93f8bfdb48` from PR #286 (`Fix billing progress review edge cases`).
- PR #286 exact head `2c8f8f7017a5793bacb973f6657880a847a1acae` passed HOAHub MySQL CI #1414, Canva Visual Parity #486, Edge Critical Flow #79, Firefox Critical Flow #75, and Mobile Responsive Evidence #74 before merge.
- Post-merge HOAHub MySQL CI #1415 run `33474363771` passed the complete verification suite, database integrations, typecheck, production build, production smoke / critical browser suite, Hostinger managed-deployment verification, and public production health for `9f58fb2ac9df352ce86972076815ff93f8bfdb48`.
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

## Action-progress program — issue #273

`HOAHUB-UX-P0-001` remains `IN_PROGRESS`.

Verified production increments:

- Shared default-off action-progress/submission-lock foundation — PR #274.
- Admin Record Payment server-confirmed result state — PR #276.
- Payment uncertain-response reconciliation before retry — PR #281.
- Monthly Billing server-confirmed result state — PR #285, exact head `12a737312fbfb5ec35f91faebaf82f0f984ee8d5`, which passed MySQL #1412, Canva #485, Edge #78, Firefox #74, and Mobile #73 and merged as `e744afe0a8589f9be45da9ceb745a14a5a0f4a29`.
- Billing progress review corrections — PR #286. The correction resets flagged billing-result state when preview inputs change and preserves framework authorization/session redirects rather than converting them into recoverable billing errors.

Still open under #273:

- Durable bulk-job progress for Monthly Billing with persisted `total`, `completed`, `succeeded`, `failed`, status, and job reference.
- Actual bulk percentage `floor(completed / total * 100)` that survives refresh, reconnection, and navigation.
- Failed-record-only retry without repeating successful business results.
- Remaining P0/P1 financial and operational action coverage, server idempotency/uniqueness review, privacy-safe observability, concurrency/slow-network/two-tab testing, accessibility, selected-tenant staging UAT, monitoring, rollback verification, and explicit product-owner pilot authorization.

No tenant target is enabled while these gates remain incomplete.

## Manual Billing 5,000+ scale qualification

Automatic Billing is production-proven at 5,001 homeowners, but that evidence must not be silently treated as a separate proof of the administrator-triggered Manual Billing user flow.

The manual Monthly Billing path uses the same tenant-scoped billing generation engine and bounded persistence controls, so the implementation is architecturally positioned for large tenants. However, a dedicated 5,001-homeowner Manual Billing integration qualification is now required before the manual UI path is labeled 5,000+ production-proven. The qualification must use disposable CI/staging data and verify:

- a manual Billing Rule / manual generation flow for at least 5,001 ACTIVE homeowners;
- expected bills created while exemptions, pre-existing duplicates, and invalid/skipped records are handled correctly;
- repeat submission creates no prohibited duplicate bills;
- bounded batching and acceptable runtime/memory behavior;
- row-level failure isolation and persisted succeeded/failed counts;
- tenant isolation with a second tenant;
- compatibility with the durable #273 progress contract so the UI reports truthful `completed / total` progress for large manual runs.

This qualification is the next billing-scale acceptance item and must pass before enabling durable bulk progress for an active tenant.

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

Current production is verified at `9f58fb2ac9df352ce86972076815ff93f8bfdb48` through post-merge MySQL CI #1415 and Hostinger/public-health verification. The obsolete experimental Hostinger marker branch must not be merged as-is because the current managed-deployment gate is already green. The active engineering priority is issue #273: reconcile durable Monthly Billing progress onto the current PR #285/#286 baseline and include explicit 5,001-homeowner Manual Billing scale evidence before any tenant pilot. Issue #194 remains blocked on administrator-provisioned UAT credentials/environment inputs.
