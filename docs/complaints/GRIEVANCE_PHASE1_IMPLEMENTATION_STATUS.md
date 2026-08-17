# HOAHub Grievance Foundation Phase 1 — Implementation Status

**BRD baseline:** `docs/complaints/HOAHUB_GRIEVANCE_FOUNDATION_BRD_V1_0.md`  
**Branch:** `feature/grievance-foundation-phase1`  
**PR:** #122 — Ready for review, NOT MERGED  
**Status date:** 2026-08-17  
**Overall implementation:** IMPLEMENTED — PRE-PRODUCTION VALIDATION COMPLETE  
**Deployment:** NOT DEPLOYED  
**Production UAT:** NOT STARTED

This document is the live implementation-status companion to BRD v1.0. The BRD remains the approved requirements baseline; this file records delivery evidence, validation findings, release readiness, and deployment state without changing the approved business scope.

## Delivery Status

| BRD group | Status | Current evidence | Remaining before PRODUCTION COMPLETE |
| --- | --- | --- | --- |
| ANM — Anonymous two-way messaging | IMPLEMENTED / PRE-PRODUCTION VALIDATED | Additive anonymous-session persistence; tracking-code + PIN session exchange; HttpOnly cookie; REST cursor polling; PUBLIC-only DTO; text-only anonymous replies with retry-safe idempotency; separate auth/message rate limits; session revoke; sender classification remains authoritative after staff deletion; mobile/PWA conversation composer. | Production deployment verification and production privacy/cross-tenant UAT. |
| API — Anonymous REST endpoints | IMPLEMENTED / PRE-PRODUCTION VALIDATED | `POST/DELETE /api/complaints/anonymous/session`, `GET/POST /api/complaints/anonymous/messages`; same-origin state-change guard; no-store responses; short-lived anonymous session instead of PIN-on-every-poll; unexpected errors return generic responses rather than internal database/query details. | Production smoke/UAT after deployment. |
| SUB — Complaint subject | IMPLEMENTED / PRE-PRODUCTION VALIDATED | `ComplaintSubject`; same-tenant homeowner/vehicle revalidation; vehicle/homeowner mismatch rejection; Phase/Block/Lot/address snapshots separate from incident location; admin subject add/remove workflow. | Production negative cross-tenant UAT. |
| VER — Independent verification | IMPLEMENTED / PRE-PRODUCTION VALIDATED | Verification policy/record persistence; tenant settings UI; verification findings workflow; policy blocking derives only from policies that also require verification; verification status/activity/audit commit atomically; `IN_PROGRESS` uses a non-completion activity event; `VERIFIED` requires `PASSED`; reusable enforcement gate blocks `READY_FOR_FORMAL_PROCESS` when required verification has not passed. | Production policy/security UAT; future punitive actions must reuse the gate. |
| GRV — Separate grievance case | IMPLEMENTED / PRE-PRODUCTION VALIDATED | Additive `GrievanceCase`; explicit promotion; separate Phase 1 state machine; permission-aware admin workflow; queue/report visibility; board-review category flag remains policy metadata only. | Production workflow UAT after deployment. |
| COM — Grievance Committee | IMPLEMENTED / PRE-PRODUCTION VALIDATED | Tenant-scoped membership; Chair/Member/Secretary/Mediator; granular grievance permissions; effective-role-aware target validation; platform-role denial; committee permissions now drive grievance UI visibility/actions rather than administrator-role-only checks. | Production permission-matrix UAT. |
| DDL — Process deadlines vs SLA | IMPLEMENTED / PRE-PRODUCTION VALIDATED | Separate `GrievanceDeadline`; explicit Asia/Manila start/due dates; policy-source field; deadline lifecycle UI/actions; separate operational-SLA pause/resume with feature-switch enforcement. | Production timezone/SLA UAT. |
| Reporting / queue | IMPLEMENTED / PRE-PRODUCTION VALIDATED | Complaint queue exposes separate complaint, grievance, and verification states/filters; formal grievance/verification filtering occurs in SQL before the 100-row cap; privacy-safe `/admin/complaints/grievance-report`; explicit tenant predicates and no complainant identity fields. | Production filter/privacy UAT. |
| SEC-GRV | PRE-PRODUCTION VALIDATED | Explicit tenant predicates; anonymous session has no resident identity FK; DB stores only SHA-256 session-token digest; confidential identity tables remain separate; state-changing anonymous APIs use same-origin checks; workflow writes honor the tenant foundation switch; generic unexpected anonymous API errors; regression coverage for review remediations. | Production cross-tenant/privacy UAT. |
| UX-GRV | PRE-PRODUCTION VALIDATED | Phone/PWA anonymous tracker with `Back to Home`, `100dvh`, safe-area padding, shrink-safe content, text-only composer, reduced-motion-aware behavior; permission-aware admin grievance workflow/settings/report surfaces. Critical browser suite passed on the validated implementation head. | Production-device smoke/UAT. |
| NFR-GRV | PRE-PRODUCTION VALIDATED | Additive migration; bounded cursor polling; no WebSocket dependency; feature switches; dedicated grievance regression suites including review-remediation coverage; non-destructive rollback posture; migration/typecheck/build/browser gates passed. | Merge/deployment release-marker verification and production UAT. |

## Current Validation State

The review-ready implementation head `087d5cf5ba900026ef290ed9aef7f75713836c9b` passed **HOAHub MySQL CI run #688** (`31990647376`) end-to-end on 2026-08-17. Successful gates were:

- dependency install and lint;
- Prisma validate/generate;
- `prisma migrate deploy` and database seed;
- full unit suite;
- database finance integration suite;
- critical verification suite;
- TypeScript typecheck;
- production build;
- controlled Chromium preparation; and
- production smoke / critical browser suite.

The first Codex review raised **10 findings (2 P1 and 8 P2)**. All ten were remediated and the corresponding review threads were resolved after the complete CI pass. Remediation includes:

- committee grievance UI authority derived from active grievance permissions;
- formal grievance/verification filters applied before the queue result cap;
- rejection of mismatched vehicle/homeowner subjects;
- anonymous retry reuse of the same client idempotency key until success/content change;
- atomic verification status, grievance activity, and audit writes;
- authoritative `senderType` mapping for staff/complainant/system messages even when staff author records are later deleted;
- a server gate requiring verification `PASSED` before grievance `VERIFIED`;
- distinct `VERIFICATION_STARTED` activity for in-progress work;
- enforcement-blocking semantics sourced only from a policy row that also requires verification; and
- generic unauthenticated API responses for unexpected internal failures.

`tests/unit/grievance-review-remediation.test.ts` and aligned Phase 1 regression suites protect these corrections. A fresh `@codex review` was requested after the fixes; any new valid finding remains a release blocker until resolved and the current head is revalidated.

## Primary Files Added or Changed

- `prisma/migrations/20260817093000_grievance_foundation_phase1/migration.sql`
- `lib/services/complaint-anonymous-session.ts`
- `lib/services/grievance-foundation.ts`
- `lib/services/grievance-admin.ts`
- `lib/services/grievance-authorization.ts`
- `lib/services/grievance-feature.ts`
- `lib/services/grievance-reporting.ts`
- `lib/services/grievance-sla.ts`
- `lib/actions/grievance.ts`
- `lib/actions/grievance-sla.ts`
- `lib/anonymous-request-security.ts`
- `app/api/complaints/anonymous/session/route.ts`
- `app/api/complaints/anonymous/messages/route.ts`
- `components/complaint-track-form.tsx`
- `components/grievance-foundation-panel.tsx`
- `components/grievance-settings-panel.tsx`
- `components/grievance-operational-sla-control.tsx`
- `app/complaints/track/page.tsx`
- `app/admin/complaints/[id]/page.tsx`
- `app/admin/complaints/page.tsx`
- `app/admin/complaints/settings/page.tsx`
- `app/admin/complaints/grievance-report/page.tsx`
- `tests/unit/grievance-foundation-phase1.test.ts`
- `tests/unit/grievance-admin-phase1.test.ts`
- `tests/unit/grievance-feature-switch.test.ts`
- `tests/unit/grievance-reporting-phase1.test.ts`
- `tests/unit/grievance-migration-safety.test.ts`
- `tests/unit/grievance-review-remediation.test.ts`
- `docs/complaints/GRIEVANCE_PHASE1_TRACEABILITY.md`
- `Agent.md`

## Security and Privacy Decisions Implemented

- Tracking Code + PIN establishes a short-lived anonymous session; the PIN is not resent during polling or message posting.
- The raw anonymous session token is delivered only as an HttpOnly cookie; `ComplaintAnonymousSession` stores only its SHA-256 digest.
- `ComplaintAnonymousSession` has no `userId`, `homeownerId`, resident email, account number, IP, user-agent, or other resident identity linkage.
- Anonymous message responses expose only PUBLIC messages and safe labels (`Anonymous complainant`, `HOA Staff`, `HOAHub`). `senderType` is authoritative so deletion of a staff user cannot reclassify an HOA response as a complainant message.
- Anonymous follow-up attachments remain out of scope for Phase 1.
- Message bodies are not copied into audit metadata.
- State-changing anonymous requests require same-origin `Origin` or `Referer` validation.
- Unexpected anonymous API failures do not serialize raw Prisma/SQL/internal exception messages.
- Grievance/verification records never automatically reveal confidential complainant identity.
- Platform roles cannot gain tenant grievance authority through committee appointment.
- Disabling the grievance foundation blocks grievance workflow writes while settings remain available to authorized admins for recovery/re-enable.

## Migration and Rollback

The migration is additive. It creates grievance-foundation tables and anonymous-message metadata/indexes without replacing the existing Complaint domain. Routine rollback must revert application behavior while leaving grievance, verification, deadline, committee, anonymous-session, message-idempotency, activity, and audit history intact.

CI run #688 successfully executed the Phase 1 migration against its CI MySQL database. No production database change has been executed from this feature branch.

## Release Gate

The implementation is **pre-production validated but not deployed**. Before production can be marked complete:

1. any final review finding must be resolved and the latest PR head must pass the complete HOAHub validation pipeline;
2. an authorized production release must merge PR #122 to `main`;
3. Hostinger must publish the expected merged `main` commit;
4. production `/release.txt` must match that expected commit SHA;
5. production `/api/health` must succeed; and
6. production smoke/UAT must confirm anonymous messaging, tenant isolation, verification enforcement, complaint-subject isolation, committee permissions, deadlines/SLA separation, queue/report privacy, and existing complaint privacy regressions.

Do not represent this feature branch as deployed or production-live. The user-requested stopping point is **ready for production deployment**; actual production deployment remains a separate authorization/release action.
