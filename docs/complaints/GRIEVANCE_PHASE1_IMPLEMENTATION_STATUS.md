# HOAHub Grievance Foundation Phase 1 — Implementation Status

**BRD baseline:** `docs/complaints/HOAHUB_GRIEVANCE_FOUNDATION_BRD_V1_0.md`  
**Branch:** `feature/grievance-foundation-phase1`  
**Draft PR:** #122  
**Status date:** 2026-08-17  
**Overall implementation:** IN PROGRESS  
**Deployment:** NOT DEPLOYED  
**Production UAT:** NOT STARTED

This document is the live implementation-status companion to BRD v1.0. The BRD remains the approved requirements baseline; this file records delivery evidence without rewriting the approved requirement text while work is underway.

## Delivery Status

| BRD group | Status | Current evidence | Remaining before COMPLETE |
| --- | --- | --- | --- |
| ANM — Anonymous two-way messaging | IMPLEMENTED / VALIDATION PENDING | Additive anonymous-session persistence; tracking-code + PIN session exchange; HttpOnly cookie; REST polling; PUBLIC-only message DTO; anonymous reply with idempotency key; separate auth/message rate limits; session revoke; mobile conversation composer. | Automated validation, migration execution in CI, browser/UAT, security review. |
| API — Anonymous REST endpoints | IMPLEMENTED / VALIDATION PENDING | `POST/DELETE /api/complaints/anonymous/session`, `GET/POST /api/complaints/anonymous/messages`; same-origin state-change guard; no-store responses. | Automated API/integration tests and CI. |
| SUB — Complaint subject | FOUNDATION IMPLEMENTED | `ComplaintSubject` persistence and service-level same-tenant homeowner/vehicle validation; structured Phase/Block/Lot/address snapshots remain separate from `Complaint.location`. | Admin/intake UI, complete lifecycle/display UAT, reporting surfaces. |
| VER — Independent verification | FOUNDATION IMPLEMENTED | Verification policy/record persistence; policy evaluation; verification result recording; reusable server-side enforcement gate. | Wire gate into future punitive/enforcement actions, admin policy/verification UI, end-to-end UAT. |
| GRV — Separate grievance case | FOUNDATION IMPLEMENTED | Minimal `GrievanceCase`; explicit promotion service; Phase 1 statuses; `requiresBoardReview` snapshot only. | Admin workflow UI/actions, status lifecycle controls, end-to-end UAT. |
| COM — Grievance Committee | FOUNDATION IMPLEMENTED | Tenant-scoped membership, positions, JSON permission allow-list, appointment/end lifecycle, effective-role-aware permission checks. | Admin committee management UI and permission UAT. |
| DDL — Process deadlines vs SLA | FOUNDATION IMPLEMENTED | Separate `GrievanceDeadline`; explicit caller-supplied start/due dates; policy-source field; operational-SLA pause recorded separately on grievance case. | Deadline lifecycle UI/actions, SLA reporting behavior, timezone/deadline UAT. |
| SEC-GRV | IN PROGRESS | Explicit tenant predicates in raw SQL services; anonymous session has no resident identity FK; raw token stored only in HttpOnly cookie while DB stores SHA-256 digest; confidential identity tables untouched; state-changing anonymous APIs enforce same origin. | CI security/regression tests and cross-tenant UAT. |
| UX-GRV | IN PROGRESS | Anonymous tracker converted from read-only result to phone/PWA conversation; text-only composer; `Back to Home`, `100dvh`, safe-area padding, shrink-safe content. | Narrow-screen browser verification and accessibility/UAT. |
| NFR-GRV | IN PROGRESS | Additive migration; bounded polling; cursor-based incremental reads; no WebSocket dependency; dedicated source-level BRD regression suite added. | Full repository validation gate and production smoke/UAT after merge/deploy. |

## Files Added or Changed

- `prisma/migrations/20260817093000_grievance_foundation_phase1/migration.sql`
- `lib/services/complaint-anonymous-session.ts`
- `lib/services/grievance-foundation.ts`
- `lib/anonymous-request-security.ts`
- `app/api/complaints/anonymous/session/route.ts`
- `app/api/complaints/anonymous/messages/route.ts`
- `components/complaint-track-form.tsx`
- `app/complaints/track/page.tsx`
- `tests/unit/grievance-foundation-phase1.test.ts`
- `docs/complaints/GRIEVANCE_PHASE1_IMPLEMENTATION_STATUS.md`
- `Agent.md` (must reflect the same live status before review/merge)

## Security and Privacy Decisions Implemented

- Anonymous tracking Code + PIN is used to establish a short-lived session; the PIN is not resent during polling or message posting.
- Session tokens are random opaque values. The browser receives the raw token only as an HttpOnly cookie; `ComplaintAnonymousSession` stores only its SHA-256 digest.
- `ComplaintAnonymousSession` deliberately has no `userId`, `homeownerId`, email, account number, IP, user-agent, or other resident identity linkage.
- Anonymous message responses expose only PUBLIC complaint messages and safe labels (`Anonymous complainant`, `HOA Staff`, `HOAHub`). Internal user IDs/emails and confidential/internal messages are not serialized.
- Anonymous follow-up attachments remain out of scope for Phase 1.
- Message bodies are not copied into audit metadata.
- State-changing anonymous API requests require same-origin `Origin` or `Referer` validation.
- Existing anonymous complaint opening messages are normalized to complainant/anonymous-tracker metadata when a secure anonymous session is established, so legacy Prisma inserts cannot cause the tracker to label the complainant as HOA staff.

## Migration and Rollback

The migration is additive. It adds grievance-foundation tables plus anonymous-message metadata columns/indexes to `ComplaintMessage`. The application rollback strategy is to revert the application commit/merge while leaving the new tables/columns in place. Do not drop grievance, verification, deadline, committee, anonymous-session, message-idempotency, or activity history as part of routine rollback.

The new grievance-domain services initially use explicit tenant-scoped parameterized SQL over migration-backed tables. This follows the repository's existing narrow migration/raw-SQL pattern for additive domains and avoids destabilizing the generated Prisma schema while Phase 1 is still under review. Promotion into generated Prisma models may be performed as a later hardening/refactor, but tenant predicates and regression coverage are mandatory either way.

No production database change has been executed from this branch. Repository CI, `prisma migrate deploy`, merge to `main`, Hostinger publication, release-marker verification, health verification, and production UAT are still pending.

## Release Gate

Do not change the status to `DEPLOYED` until all of the following are true:

1. the implementation PR is approved and merged to `main`;
2. the normal HOAHub validation pipeline passes, including migration deployment, unit/integration/critical tests, typecheck and build;
3. Hostinger publishes the expected merged `main` commit;
4. production `/release.txt` matches that expected commit SHA;
5. production `/api/health` succeeds;
6. production smoke/UAT confirms anonymous messaging, tenant isolation, verification gate behavior, committee/deadline behavior, and existing complaint privacy regressions.
