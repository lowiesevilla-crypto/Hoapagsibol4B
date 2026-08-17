# HOAHub Grievance Foundation Phase 1 — Implementation Status

**BRD baseline:** `docs/complaints/HOAHUB_GRIEVANCE_FOUNDATION_BRD_V1_0.md`  
**Branch:** `feature/grievance-foundation-phase1`  
**Draft PR:** #122  
**Status date:** 2026-08-17  
**Overall implementation:** IMPLEMENTED — VALIDATION IN PROGRESS  
**Deployment:** NOT DEPLOYED  
**Production UAT:** NOT STARTED

This document is the live implementation-status companion to BRD v1.0. The BRD remains the approved requirements baseline; this file records delivery evidence, validation findings, release readiness, and deployment state without changing the approved business scope.

## Delivery Status

| BRD group | Status | Current evidence | Remaining before COMPLETE |
| --- | --- | --- | --- |
| ANM — Anonymous two-way messaging | IMPLEMENTED / VALIDATION IN PROGRESS | Additive anonymous-session persistence; tracking-code + PIN session exchange; HttpOnly cookie; REST cursor polling; PUBLIC-only DTO; text-only anonymous replies with idempotency; separate auth/message rate limits; session revoke; mobile/PWA conversation composer. | Full current-head CI, browser/UAT, privacy/cross-tenant review. |
| API — Anonymous REST endpoints | IMPLEMENTED / VALIDATION IN PROGRESS | `POST/DELETE /api/complaints/anonymous/session`, `GET/POST /api/complaints/anonymous/messages`; same-origin state-change guard; no-store responses; short-lived anonymous session instead of PIN-on-every-poll. | Current-head API/integration/browser validation. |
| SUB — Complaint subject | IMPLEMENTED / VALIDATION IN PROGRESS | `ComplaintSubject`; same-tenant homeowner/vehicle revalidation; Phase/Block/Lot/address snapshots separate from incident location; admin subject add/remove workflow. | Lifecycle/browser UAT and negative cross-tenant verification. |
| VER — Independent verification | IMPLEMENTED / VALIDATION IN PROGRESS | Verification policy/record persistence; tenant settings UI; verification findings workflow; reusable enforcement gate; `READY_FOR_FORMAL_PROCESS` is blocked when required verification has not passed. | Policy-matching/security UAT; future punitive actions must reuse the gate. |
| GRV — Separate grievance case | IMPLEMENTED / VALIDATION IN PROGRESS | Additive `GrievanceCase`; explicit promotion; separate Phase 1 state machine; admin workflow; queue/report visibility; board-review category flag remains policy metadata only. | Current-head CI and browser/UAT. |
| COM — Grievance Committee | IMPLEMENTED / VALIDATION IN PROGRESS | Tenant-scoped membership; Chair/Member/Secretary/Mediator; granular grievance permissions; effective-role-aware target validation; platform-role denial; settings UI and appointment/end lifecycle. | Permission matrix/security UAT. |
| DDL — Process deadlines vs SLA | IMPLEMENTED / VALIDATION IN PROGRESS | Separate `GrievanceDeadline`; explicit Asia/Manila start/due dates; policy-source field; deadline lifecycle UI/actions; separate operational-SLA pause/resume with feature-switch enforcement. | Timezone/browser UAT and SLA reporting verification. |
| Reporting / queue | IMPLEMENTED / VALIDATION IN PROGRESS | Complaint queue exposes separate complaint, grievance, and verification states/filters; privacy-safe `/admin/complaints/grievance-report`; report service contains explicit tenant predicates and no complainant identity fields. | Current-head CI, pagination/filter/browser privacy UAT. |
| SEC-GRV | IN PROGRESS | Explicit tenant predicates; anonymous session has no resident identity FK; DB stores only SHA-256 session-token digest; confidential identity tables remain separate; state-changing anonymous APIs use same-origin checks; workflow writes honor the tenant foundation switch. | Full security regression, cross-tenant negative tests, browser UAT. |
| UX-GRV | IN PROGRESS | Phone/PWA anonymous tracker with `Back to Home`, `100dvh`, safe-area padding, shrink-safe content, text-only composer, reduced-motion-aware behavior; admin grievance workflow/settings/report surfaces added. | Narrow-screen/accessibility browser UAT. |
| NFR-GRV | IN PROGRESS | Additive migration; bounded cursor polling; no WebSocket dependency; feature switches; dedicated grievance regression suites; non-destructive rollback posture. | Complete repository validation gate, merge/release verification, production smoke/UAT. |

## Current Validation State

A previous PR #122 CI run reached the unit-test stage after successfully completing dependency installation, lint, Prisma validation/generation, `prisma migrate deploy`, and database seeding. The unit suite exposed two source-contract defects: grievance workflow writes did not consistently call the foundation feature switch, and the complaint queue did not yet expose the promised grievance/verification filters.

Both defects have now been corrected on the feature branch:

- `lib/actions/grievance.ts` centralizes enabled-workflow authorization through `requireEnabledGrievanceActor`, which calls `assertGrievanceFoundationEnabled(user.tenantId)` while leaving the grievance-settings action recoverable when the feature is disabled.
- `lib/actions/grievance-sla.ts` now applies the same foundation switch before operational-SLA pause/resume writes.
- `app/admin/complaints/page.tsx` now displays separate grievance and verification filters/states and uses `getGrievanceReport` plus `getGrievanceMetadataForComplaints` for tenant-scoped formal-process metadata.

These corrections require a new complete CI run. Do not treat the earlier partially successful run as a green release.

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
- `docs/complaints/GRIEVANCE_PHASE1_TRACEABILITY.md`
- `Agent.md`

## Security and Privacy Decisions Implemented

- Tracking Code + PIN establishes a short-lived anonymous session; the PIN is not resent during polling or message posting.
- The raw anonymous session token is delivered only as an HttpOnly cookie; `ComplaintAnonymousSession` stores only its SHA-256 digest.
- `ComplaintAnonymousSession` has no `userId`, `homeownerId`, resident email, account number, IP, user-agent, or other resident identity linkage.
- Anonymous message responses expose only PUBLIC messages and safe labels (`Anonymous complainant`, `HOA Staff`, `HOAHub`). Internal IDs/emails, confidential/internal messages, identity-access grants, and storage paths are not serialized.
- Anonymous follow-up attachments remain out of scope for Phase 1.
- Message bodies are not copied into audit metadata.
- State-changing anonymous requests require same-origin `Origin` or `Referer` validation.
- Grievance/verification records never automatically reveal confidential complainant identity.
- Platform roles cannot gain tenant grievance authority through committee appointment.
- Disabling the grievance foundation blocks grievance workflow writes while settings remain available to authorized admins for recovery/re-enable.

## Migration and Rollback

The migration is additive. It creates grievance-foundation tables and anonymous-message metadata/indexes without replacing the existing Complaint domain. Routine rollback must revert application behavior while leaving grievance, verification, deadline, committee, anonymous-session, message-idempotency, activity, and audit history intact.

The earlier CI run successfully executed the Phase 1 migration against its CI MySQL database. No production database change has been executed from this feature branch.

## Release Gate

Do not change the status to `DEPLOYED` until all of the following are true:

1. the current feature-branch head passes the complete HOAHub validation pipeline, including migration deployment, unit/integration/critical tests, typecheck, build, and browser gates;
2. PR #122 is reviewed/approved and merged to `main`;
3. Hostinger publishes the expected merged `main` commit;
4. production `/release.txt` matches that expected commit SHA;
5. production `/api/health` succeeds;
6. production smoke/UAT confirms anonymous messaging, tenant isolation, verification enforcement, complaint-subject isolation, committee permissions, deadlines/SLA separation, queue/report privacy, and existing complaint privacy regressions.
