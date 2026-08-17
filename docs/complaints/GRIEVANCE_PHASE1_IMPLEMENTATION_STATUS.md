# HOAHub Grievance Foundation Phase 1 — Implementation Status

**BRD baseline:** `docs/complaints/HOAHUB_GRIEVANCE_FOUNDATION_BRD_V1_0.md`  
**Branch:** `feature/grievance-foundation-phase1`  
**PR:** #122 — Ready for merge after current-head documentation validation  
**Status date:** 2026-08-17  
**Overall implementation:** IMPLEMENTED — RELEASE CANDIDATE VALIDATED  
**Deployment:** NOT DEPLOYED  
**Production UAT:** NOT STARTED

This document is the live implementation/deployment companion to BRD v1.0. The BRD remains the approved requirements baseline. Delivery state, review remediation, validation evidence, merge state, deployment evidence, and production UAT are recorded here rather than changing the approved business intent.

## Delivery Status

| BRD group | Status | Current evidence | Remaining before PRODUCTION COMPLETE |
| --- | --- | --- | --- |
| ANM — Anonymous two-way messaging | RELEASE CANDIDATE VALIDATED | Tracking Code + PIN creates a short-lived anonymous session; HttpOnly cookie; SHA-256 token digest only; public-reference binding prevents a tracker tab from using a replaced cookie for another complaint; PUBLIC-only DTO; forward/backward bounded cursor retrieval; sender classification is authoritative; text-only replies; retry-safe idempotency; complaint-scoped throttling survives session renewal. | Merge, Hostinger deployment verification, production privacy/cross-tenant/device UAT. |
| API — Anonymous REST endpoints | RELEASE CANDIDATE VALIDATED | `POST/DELETE /api/complaints/anonymous/session`, `GET/POST /api/complaints/anonymous/messages`; same-origin state-change guard; no-store; generic unexpected error responses; request public reference is revalidated against the server session. | Production smoke/UAT. |
| SUB — Complaint subject | RELEASE CANDIDATE VALIDATED | `ComplaintSubject`; same-tenant homeowner/vehicle validation; vehicle/homeowner mismatch rejection; vehicle FK protects grievance subject integrity; Phase/Block/Lot/address snapshots remain separate from incident location. | Production negative cross-tenant UAT. |
| VER — Independent verification | RELEASE CANDIDATE VALIDATED | Policy-driven verification; blocking is sourced only from a policy that itself requires verification; verification/activity/audit commit atomically; `IN_PROGRESS` uses `VERIFICATION_STARTED`; grievance and verification rows are serialized with transaction locks; `VERIFIED` and `READY_FOR_FORMAL_PROCESS` require a passing verification where applicable. | Production policy/security UAT; future punitive actions must reuse the server gate. |
| GRV — Separate grievance case | RELEASE CANDIDATE VALIDATED | Additive `GrievanceCase`; explicit idempotent promotion; separate Phase 1 lifecycle; complaint operational status remains separate; board-review category flag remains policy metadata only. | Production workflow UAT. |
| COM — Grievance Committee | RELEASE CANDIDATE VALIDATED | Tenant-scoped membership; Chair/Member/Secretary/Mediator; granular permissions; platform-role denial; target users must have a route-compatible complaint-admin/STAFF role; committee permissions drive grievance UI/report/action authority; confidential identity reveal remains separately authorized. | Production permission-matrix UAT. |
| DDL — Process deadlines vs SLA | RELEASE CANDIDATE VALIDATED | Separate `GrievanceDeadline`; explicit Manila dates; policy source; deadline creation/activity/audit are atomic; process-deadline and operational-SLA pause reasons remain reconstructable in immutable history; no universal 5/7-day default. | Production timezone/SLA/history UAT. |
| Reporting / queue | RELEASE CANDIDATE VALIDATED | Complaint queue exposes distinct complaint/grievance/verification state; formal filters execute in SQL before row cap; `/admin/complaints/grievance-report` is tenant-scoped and omits complainant identity. | Production filter/privacy UAT. |
| Prisma / migration desired state | RELEASE CANDIDATE VALIDATED | Grievance models/enums/message metadata are represented in the Prisma desired state with required reverse relations; additive migration plus vehicle-FK follow-up migration pass `prisma validate`, `prisma generate`, and clean `prisma migrate deploy`. | Production migration execution through managed deployment. |
| SEC-GRV / UX-GRV / NFR-GRV | RELEASE CANDIDATE VALIDATED | Explicit tenant predicates; no resident identity FK in anonymous session; same-origin/no-store public APIs; feature switch; phone/PWA tracker with Back to Home, `100dvh`, safe-area and shrink-safe behavior; source/unit/integration/critical/type/build/browser gates green. | Verified production release marker, health, and production UAT. |

## Current Validation State

Current implementation head `858badf7ce2efc7db35d7dd570aebef8c82f5531` passed **HOAHub MySQL CI run #713 (`32034186355`) end-to-end** on 2026-08-17.

Successful gates:

- dependency install and lint;
- Prisma validate and generate;
- clean `prisma migrate deploy` and seed;
- full unit suite;
- database finance integration suite;
- critical verification suite;
- TypeScript typecheck;
- production build;
- controlled Chromium preparation; and
- production smoke / critical browser suite.

The earlier Prisma desired-state validation defect was corrected by modeling the grievance foundation in Prisma with the required reverse relations and reviewed referential behavior. Subsequent stale source-contract tests were updated only where the safer implementation had intentionally changed the asserted implementation shape; the underlying security/business invariants remain asserted.

## Review Remediation State

All current inline review threads on PR #122 are resolved. Remediations include both the original review set and subsequent review findings:

- committee permissions drive grievance UI/report/action access;
- queue grievance/verification filtering occurs before result limiting;
- mismatched vehicle/homeowner subjects are rejected;
- vehicle-linked structured subjects are protected from hard-delete dangling references;
- verification writes and required history are atomic;
- grievance/verification concurrency is serialized before allowing verified/formal-process states;
- verification downgrade cannot leave an already verified/formal-ready grievance with a non-passing result;
- in-progress verification uses the correct non-completion event;
- enforcement blocking comes only from a policy that also requires verification;
- anonymous errors do not disclose raw internal exceptions;
- staff message attribution survives staff-account deletion;
- initial complaint messages are explicitly classified as complainant-originated;
- anonymous retry reuses the pending idempotency key;
- anonymous message insert, timeline/activity, and audit are atomic;
- anonymous session lookup binds the cookie to the expected complaint public reference, preventing cross-tab complaint confusion;
- anonymous message throttling is stable across session renewal;
- older public messages remain retrievable through bounded backward pagination;
- duplicate grievance promotion does not write duplicate creation history;
- confidential identity reveal permission is enforced separately and remains reasoned/confirmed/audited;
- committee appointment rejects users who cannot cross the complaint route boundary;
- deadline creation/history is atomic; and
- both process-deadline and operational-SLA pause reasons remain reconstructable after resume/state change.

## Primary Files

- `prisma/schema.prisma`
- `prisma/grievance-foundation.prisma`
- `prisma/migrations/20260817093000_grievance_foundation_phase1/migration.sql`
- grievance follow-up migration(s) for reviewed referential integrity
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
- grievance Phase 1 unit/regression suites including `tests/unit/grievance-review-remediation.test.ts`
- `docs/complaints/GRIEVANCE_PHASE1_TRACEABILITY.md`
- `docs/complaints/HOAHUB_GRIEVANCE_FOUNDATION_BRD_V1_0_RELEASE_RECORD.md`
- `Agent.md`

## Security and Privacy Decisions

- Raw anonymous PINs and raw session tokens are never persisted in complaint-domain audit metadata.
- Anonymous sessions contain no resident `userId`, `homeownerId`, email, account number, IP, user-agent, or equivalent identity linkage.
- Anonymous message APIs expose only `PUBLIC` content and safe display labels.
- Anonymous follow-up attachments remain out of scope for Phase 1.
- Message bodies are not copied into audit metadata.
- Anonymous state-changing requests require same-origin validation.
- Unexpected anonymous API failures return generic external errors.
- Grievance/verification records never automatically reveal confidential complainant identity.
- Platform roles cannot gain tenant grievance authority through committee appointments.
- Feature disablement blocks grievance workflow writes while allowing authorized configuration recovery.

## Migration and Rollback

The grievance foundation is additive. Routine rollback must revert application behavior while preserving grievance, verification, deadline, committee, anonymous-session, message-idempotency, activity, and audit history. Do not destructively drop those records during routine application rollback.

The clean CI database successfully applied the current migration chain in run #713. No production database change is considered complete until the merged `main` release is actually published by Hostinger and production verification succeeds.

## Release Gate

The implementation is **release-candidate validated but not yet deployed**. Production completion requires:

1. current documentation/Agent synchronization committed on PR #122 and its resulting latest head passing the complete CI gate;
2. no unresolved PR review threads or mergeability/synchronization blocker;
3. merge PR #122 to `main`;
4. successful `main` verification pipeline;
5. Hostinger serving `/release.txt` equal to the expected merged `main` short SHA;
6. successful production `/api/health`; and
7. production smoke/UAT confirming anonymous messaging, tenant isolation, verification enforcement, structured subject integrity, committee permissions, deadline/SLA separation, queue/report privacy, and existing complaint privacy behavior.

Only after those gates pass may this initiative be recorded as production-complete.
