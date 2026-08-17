# HOAHub Grievance Foundation Phase 1 — BRD Traceability

**BRD:** `HOAHUB_GRIEVANCE_FOUNDATION_BRD_V1_0.md`  
**Implementation branch:** `feature/grievance-foundation-phase1`  
**PR:** #122 — Release candidate, NOT MERGED  
**Status date:** 2026-08-17  
**Deployment:** NOT DEPLOYED

This matrix maps the approved Phase 1 BRD groups to implemented controls, tests, review remediation, and remaining production evidence. The approved BRD business intent is unchanged. Current implementation/deployment state is also recorded in `GRIEVANCE_PHASE1_IMPLEMENTATION_STATUS.md` and `HOAHUB_GRIEVANCE_FOUNDATION_BRD_V1_0_RELEASE_RECORD.md`.

| BRD group | Delivery status | Implementation / validation evidence | Release evidence still required |
| --- | --- | --- | --- |
| ANM — secure anonymous two-way messaging | RELEASE CANDIDATE VALIDATED | `lib/services/complaint-anonymous-session.ts`; anonymous session/message API routes; Tracking Code + PIN session exchange; opaque HttpOnly cookie; SHA-256 token digest; no resident identity linkage; server checks expected complaint public reference on every session lookup; PUBLIC-only safe DTO; forward/backward bounded cursors; senderType-authoritative labels; retry-safe client idempotency; stable tenant/complaint message throttle across session renewal; atomic message/activity/timeline/audit write; text-only replies; no follow-up attachment. CI #713 passed. | Production privacy, multi-tab, rate-limit, session-expiry, and mobile/PWA smoke/UAT. |
| SUB — structured complaint subject | RELEASE CANDIDATE VALIDATED | `ComplaintSubject`; same-tenant homeowner/vehicle validation; explicit vehicle/homeowner mismatch rejection; Phase/Block/Lot/address snapshots; complaint incident location remains independent; vehicle relation protected from hard-delete dangling reference. | Production negative cross-tenant and referential-integrity UAT. |
| VER — independent verification | RELEASE CANDIDATE VALIDATED | Verification policy/record persistence; tenant configuration; blocking only when the same policy requires verification; verification/activity/audit transaction; `VERIFICATION_STARTED` for in-progress work; transaction locks serialize verification and grievance state; `VERIFIED`/formal-process gate requires `PASSED` where policy applies; confidential identity remains separate. | Production policy/security/concurrency UAT and reuse by future punitive actions. |
| GRV — separate formal grievance | RELEASE CANDIDATE VALIDATED | Additive `GrievanceCase`; explicit promotion; duplicate promotion is idempotent for creation history; small Phase 1 state machine; complaint status remains operational; board-review flag is metadata only. | Production workflow UAT; Phase 2 notice/hearing/board decision remains deferred. |
| COM — Grievance Committee | RELEASE CANDIDATE VALIDATED | Tenant-scoped membership; Chair/Member/Secretary/Mediator; granular permissions; platform-role denial; appointment target must have route-compatible complaint-admin/STAFF authority; grievance UI/report/actions honor active grievance permissions; identity reveal remains a distinct permission plus existing reason/confirmation/audit boundary. | Production effective-role/permission matrix UAT. |
| DDL — process deadlines vs operational SLA | RELEASE CANDIDATE VALIDATED | `GrievanceDeadline`; explicit Asia/Manila dates; policy source; deadline creation/history transaction; pause/update history preserves prior pause reason; operational-SLA pause history is separate and reconstructable; no universal 5/7-day period. | Production timezone/deadline/SLA/history UAT. |
| RPT / GRV-005 — queue and reporting | RELEASE CANDIDATE VALIDATED | SQL applies grievance/verification filters before the queue row cap; privacy-safe grievance report; tenant predicates; no complainant identity fields. | Production filter/privacy UAT. |
| SEC-GRV | RELEASE CANDIDATE VALIDATED | Server-authoritative tenant predicates; no anonymous resident identity FK; same-origin state changes; no-store; generic unexpected public API errors; feature switch; confidential identity isolation; all current PR review threads resolved; dedicated remediation tests. | Production cross-tenant/privacy/security smoke/UAT. |
| UX-GRV | RELEASE CANDIDATE VALIDATED | Phone/PWA tracker; Back to Home; `100dvh`; safe-area padding; shrink-safe text conversation; touch-safe text-only composer; reduced-motion-compatible behavior; permission-aware admin surfaces; production smoke/critical browser suite green in CI #713. | Production-device/accessibility smoke. |
| NFR-GRV / Prisma | RELEASE CANDIDATE VALIDATED | Additive migration chain; grievance desired-state Prisma models/enums/relations; follow-up vehicle FK; `prisma validate/generate/migrate deploy`, seed, unit, integration, critical, typecheck, build, Chromium, and browser suite all passed on head `858badf7ce2efc7db35d7dd570aebef8c82f5531` in run #713 (`32034186355`). | Latest documentation-head CI, merge, Hostinger release marker/health, production UAT. |

## Requirement-Level Security Decisions

- **ANM-001/002:** Session token is random/opaque, stored only as a digest, expires/revokes, and is revalidated against the exact anonymous complaint reference.
- **ANM-003:** REST transport is cursor-based and bounded; backward pagination prevents older public messages from becoming unreachable.
- **ANM-004/005:** Only public plain-text conversation content is exposed; internal/confidential notes are excluded.
- **ANM-006:** Same uncertain send reuses the client idempotency key until definitive success or content change.
- **ANM-007:** Authentication and posting have separate throttles; message throttle uses stable tenant/complaint scope so session renewal cannot reset allowance.
- **ANM-008:** PIN/token/message body are not copied to audit metadata; unexpected errors do not disclose Prisma/SQL details.
- **SUB:** Cross-tenant subjects fail closed; a vehicle cannot be paired with another homeowner and cannot be hard-deleted while referenced by a grievance subject.
- **VER:** Verification does not imply complainant identity disclosure. Blocking is policy-driven and enforcement/formal transitions are serialized against passing verification state.
- **COM:** Committee permissions do not confer broad tenant/platform authority. Platform roles are denied tenant grievance authority, and unusable HOMEOWNER/EMPLOYEE appointments are rejected by the route-compatible target gate.
- **DDL:** Process deadlines and complaint operational SLA remain different domains; pause reasons remain recoverable from immutable history.

## Validation and Review History

Validation/review discovered and corrected multiple implementation defects rather than waiving them. Key remediation waves included:

1. grievance feature-switch enforcement and queue-filter coverage;
2. TypeScript test compatibility;
3. first code-review set covering committee UI authority, filtering, subject consistency, idempotency, atomic verification, sender attribution, verified-state gating, verification events, policy aggregation, and public error leakage;
4. second review set covering committee report authority, anonymous staff attribution/backfill, atomic anonymous messaging, verification downgrade consistency, idempotent promotion, confidential identity permission, Prisma desired-state parity, operational-SLA reason history, vehicle referential integrity, and older-message pagination;
5. final review set covering cross-tab anonymous session binding, initial-message sender metadata, verification/grievance concurrency serialization, atomic deadline creation, route-compatible committee targets, stable post throttling across reauthentication, and process-deadline pause-reason history; and
6. source-contract test alignment after the implementation moved to safer locked/URLSearchParams-based forms.

All current PR #122 inline review threads are resolved.

Current implementation head `858badf7ce2efc7db35d7dd570aebef8c82f5531` passed **HOAHub MySQL CI run #713 (`32034186355`)** end-to-end: install, lint, Prisma validate/generate, clean migration deploy, seed, unit suite, database integration, critical verification, typecheck, build, controlled Chromium preparation, and production smoke/critical browser tests.

## Deferred by BRD

Phase 1 does not claim notice/proof-of-service, mediation scheduling, formal hearing/minutes, evidence vault, board vote/quorum/recusal, formal decision, appeal/reconsideration, resolution agreement/e-signature, regulatory dossier export, retention/legal-hold automation, advanced redaction, notification templates, or real malware scanning. These remain Phase 2/3 unless the approved BRD is revised.

## Production Release Boundary

The feature branch is not a production target. Production completion requires the synchronized documentation head to pass CI, PR #122 to have no unresolved review/merge blockers, merge to `main`, successful `main` validation, Hostinger publication of the expected short `main` SHA in `/release.txt`, successful `/api/health`, and production UAT covering the privacy/tenant/verification/committee/deadline/report/mobile boundaries above.
