# HOAHub Work Status Register

_Last reconciled: 2026-08-30 (Asia/Manila)_

This register is the current release-status snapshot for the active HOAHub production-quality program. It records only evidence-backed status and does not replace issue-specific acceptance criteria.

## Current production baseline

- Production-verified `main`: `ea981e9f125a8d6246c05fd5c2005fbc1c4f5481`.
- Source PR: #270 (`fix: allow repeated PWA update reloads`).
- Exact PR head: `d3f20ef37b046a72ea8103b537ce2a86bf596190`.
- Required exact-head gates passed: HOAHub MySQL CI #1375, Canva Visual Parity #461, Edge Critical Flow #54, Firefox Critical Flow #50, Mobile Responsive Evidence #49.
- Post-merge HOAHub MySQL CI #1376 passed the complete verification suite, production smoke / critical browser suite, Hostinger managed-deployment wait, and public production-health verification.

## Verified release queue

The P0 functional regression queue tracked by #193 is VERIFIED: Payroll, Petty Cash, Payment Void, Refund, Online Payments reporting/settlement trace, and Financial Reports.

The P1 improvement queue tracked by #254 is VERIFIED through item 10:

1. Final documentation baseline — PR #253.
2. Document Repository table usability — PR #255.
3. Billing collapsible sections — PR #256.
4. Admin Documents issued-table usability — PR #257.
5. Homeowner Online Payment Status collapsible — PR #258.
6. Messaging received-message popup/notification — PR #259.
7. Admin add Household Member — PR #260.
8. Homeowner Online Payment history safe hide/archive UX — PR #262.
9. Homeowner Account Information collapsible — PR #263.
10. Stale PWA/client update-path defect — PR #270. The confirmed defect was a session-scoped reload guard that remained set after a completed service-worker update and could suppress a later update reload in the same browser session. The corrected path clears only the completed HOAHub update-reload marker on the newly loaded document and retains duplicate-reload protection for the active update.

## Open / blocked work

`HOAHUB-UX-P0-001` is `IN_PROGRESS` under issue #273. The current candidate is a default-off, fail-closed shared action-progress/submission-lock foundation with pilot wiring limited to Record Payment and monthly billing generation. It does not activate behavior for the active tenant. Exact-head CI, merge, staging UAT, monitoring, rollback verification, and explicit tenant-pilot authorization remain required; see `docs/quality/HOAHUB_ACTION_PROGRESS_IMPLEMENTATION.md`.

Authenticated non-destructive production UAT remains tracked separately by #194. The repository already contains the bounded read-only harness (`scripts/authenticated-production-smoke.mjs`) and the manually dispatched production workflow (`.github/workflows/authenticated-production-uat.yml`). Live execution remains BLOCKED on administrator/environment provisioning of the dedicated UAT identity and controlled homeowner query expected by that workflow:

- production secret `HOAHUB_UAT_ADMIN_EMAIL`
- production secret `HOAHUB_UAT_ADMIN_PASSWORD`
- production environment variable `HOAHUB_UAT_HOMEOWNER_QUERY`

Credentials, tokens, cookies, or tenant-private payloads must never be committed, placed in issue text, or substituted with live tenant-user credentials. Production UAT must remain non-destructive and must not create, edit, delete, post, void, refund, settle, approve, generate, or otherwise mutate tenant business data.

Repository branch-protection hardening remains outside the currently approved #194 scope unless separately re-approved.

## Release governance

- Never merge a stale or red head.
- Required CI evidence must belong to the exact current PR head SHA.
- Any failed gate must be inspected to the exact failing job/step, corrected at root cause, pushed as a new head, and re-run.
- After merge, verify the merged `main` release with HOAHub MySQL CI plus managed-production/public-health verification before moving to the next product mutation.
- Preserve tenant isolation, RBAC, finance/payroll/payment/document authority, audit semantics, and existing live-tenant business behavior.
- Do not use destructive production test data or weaken security/CI gates to obtain a pass.

## Current execution state

Repository-side P1 product work is reconciled through the production-verified PWA correction. The only approved release-hardening item still preventing a fully closed program status is #194 live authenticated production UAT, which requires administrator/environment provisioning before it can be executed safely. Until that prerequisite is supplied, no repository-side workaround is authorized.
