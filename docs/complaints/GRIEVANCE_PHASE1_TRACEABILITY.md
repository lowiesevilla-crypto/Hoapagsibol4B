# HOAHub Grievance Foundation Phase 1 — BRD Traceability

**BRD:** `HOAHUB_GRIEVANCE_FOUNDATION_BRD_V1_0.md`  
**Feature PR:** #122 — MERGED  
**Production feature SHA:** `e34bf48a8519cf6a8389a78f998bbfafd46653c0`  
**Status date:** 2026-08-17  
**Deployment:** DEPLOYED / VERIFIED

This matrix maps the approved Phase 1 BRD groups to implemented controls, validation, review remediation, and production deployment evidence. The approved BRD business intent is unchanged. Current delivery/deployment state is also recorded in `GRIEVANCE_PHASE1_IMPLEMENTATION_STATUS.md` and `HOAHUB_GRIEVANCE_FOUNDATION_BRD_V1_0_RELEASE_RECORD.md`.

| BRD group | Delivery status | Implementation / production evidence | Remaining non-code follow-up |
| --- | --- | --- | --- |
| ANM — secure anonymous two-way messaging | PRODUCTION DEPLOYED / VERIFIED | `lib/services/complaint-anonymous-session.ts`; anonymous session/message API routes; opaque HttpOnly session; SHA-256 digest; exact complaint-reference binding; no resident identity linkage; PUBLIC-only DTO; bounded forward/backward cursors; senderType-authoritative labels; retry-safe idempotency; stable complaint-scoped post throttle; atomic message/activity/timeline/audit; text-only replies. Exact merged-main CI/browser and live release/health gates passed. | Optional live tenant business sign-off and ongoing monitoring. |
| SUB — structured complaint subject | PRODUCTION DEPLOYED / VERIFIED | Same-tenant homeowner/vehicle validation; vehicle/homeowner mismatch rejection; property snapshots separate from incident location; vehicle relation protected from hard-delete dangling reference. | Tenant operational adoption/UAT as desired. |
| VER — independent verification | PRODUCTION DEPLOYED / VERIFIED | Policy-driven verification; blocking only when same policy requires verification; atomic verification/activity/audit; `VERIFICATION_STARTED` for in-progress; transaction locks serialize verification and grievance state; `VERIFIED`/formal-ready requires `PASSED` where policy applies; confidential identity remains separate. | Tenant policy owners configure/validate their actual evidence policies. |
| GRV — separate formal grievance | PRODUCTION DEPLOYED / VERIFIED | Additive `GrievanceCase`; explicit/idempotent promotion; separate Phase 1 lifecycle; complaint operational status remains separate; board-review flag remains policy metadata. | Phase 2 formal notice/hearing/board-decision scope remains deferred. |
| COM — Grievance Committee | PRODUCTION DEPLOYED / VERIFIED | Tenant-scoped membership; granular permissions; platform-role denial; route-compatible target validation; UI/report/actions honor active grievance permissions; identity reveal remains a distinct reasoned/confirmed/audited permission boundary. | Tenant-specific committee appointments/business sign-off. |
| DDL — process deadlines vs operational SLA | PRODUCTION DEPLOYED / VERIFIED | Separate `GrievanceDeadline`; explicit Asia/Manila dates; policy source; atomic deadline/history creation; process-deadline and operational-SLA pause reasons retained in reconstructable history; no universal 5/7-day period. | Tenant legal/policy owners remain responsible for configured dates. |
| RPT / GRV-005 — queue and reporting | PRODUCTION DEPLOYED / VERIFIED | SQL applies grievance/verification filters before row cap; privacy-safe tenant-scoped report; no complainant identity fields. | Operational report review with real tenant data. |
| SEC-GRV | PRODUCTION DEPLOYED / VERIFIED | Server-authoritative tenant predicates; same-origin/no-store public APIs; generic unexpected errors; exact anonymous complaint binding; feature switch; confidential identity isolation; all PR #122 review threads resolved; exact merged-main security/critical/browser gates passed; live marker and health passed. | Ongoing security/privacy monitoring. |
| UX-GRV | PRODUCTION DEPLOYED / VERIFIED | Phone/PWA tracker; Back to Home; `100dvh`; safe-area/shrink-safe layout; text-only composer; reduced-motion-compatible behavior; permission-aware admin surfaces; browser critical suite passed on exact merged-main build. | Optional device-by-device tenant acceptance session. |
| NFR-GRV / Prisma | PRODUCTION DEPLOYED / VERIFIED | Additive Prisma desired state and migration chain; `prisma validate/generate/migrate deploy`, seed, unit, integration, critical, typecheck, build, Chromium/browser suite passed on merged main; Hostinger published expected release and public health passed. | Preserve monitored additive rollback posture. |

## Production Deployment Evidence

- **Merged main SHA:** `e34bf48a8519cf6a8389a78f998bbfafd46653c0`
- **Expected/live release marker:** `e34bf48a8519`
- **Main CI/deployment run:** #718 (`32037027056`)
- **Repository verification:** PASS
- **Hostinger managed deployment verification:** PASS
- **Production `/release.txt`:** PASS — exact expected marker
- **Production `/api/health`:** PASS

The deployment verifier observed the previously live marker `f8becc4228d8`, waited for Hostinger's GitHub-connected rollout, then confirmed `e34bf48a8519` before the successful public health check. Thus CI success and actual production publication were independently distinguished and both verified.

## Requirement-Level Security Decisions

- **ANM-001/002:** Session token is random/opaque, stored only as a digest, expires/revokes, and is revalidated against the exact anonymous complaint reference.
- **ANM-003:** REST transport is bounded and supports forward/backward cursor pagination so older public messages remain accessible.
- **ANM-004/005:** Only public plain-text conversation content is exposed; internal/confidential notes are excluded.
- **ANM-006:** An uncertain retry reuses the client idempotency key until success or content change.
- **ANM-007:** Authentication and posting have separate throttles; posting uses stable tenant/complaint scope across session renewal.
- **ANM-008:** PIN/token/message body are not copied to audit metadata; unexpected errors do not disclose Prisma/SQL details.
- **SUB:** Cross-tenant subjects fail closed; a vehicle cannot be paired with another homeowner or hard-deleted while referenced.
- **VER:** Verification does not imply complainant identity disclosure. Enforcement/formal transitions are serialized against passing verification state.
- **COM:** Committee permissions do not confer unrelated tenant/platform authority. Platform roles and route-ineligible ordinary users cannot receive unusable appointments.
- **DDL:** Process deadlines and complaint operational SLA remain different domains; required pause reasons remain recoverable from immutable history.

## Validation and Review History

Validation/review found and corrected implementation defects rather than waiving them. Remediation waves included:

1. grievance feature-switch enforcement and formal queue-filter coverage;
2. TypeScript test compatibility;
3. committee UI authority, subject consistency, idempotency, atomic verification, sender attribution, verified-state gating, verification event semantics, policy aggregation, and public error leakage;
4. committee report authority, anonymous attribution/backfill, atomic anonymous messaging, verification downgrade consistency, idempotent promotion, confidential identity permission, Prisma desired-state parity, SLA reason history, vehicle referential integrity, and older-message pagination;
5. cross-tab anonymous session binding, initial-message sender metadata, verification/grievance concurrency serialization, atomic deadline creation, route-compatible committee targets, stable post throttling across reauthentication, and process-deadline pause-reason history; and
6. source-contract test alignment after safer locked/URLSearchParams-based implementation changes.

All PR #122 inline review threads were resolved before merge.

The exact merged-main release `e34bf48a8519cf6a8389a78f998bbfafd46653c0` passed HOAHub MySQL CI run #718 (`32037027056`) end-to-end: install, lint, Prisma validate/generate, clean migration deploy, seed, unit suite, database integration, critical verification, typecheck, build, controlled Chromium preparation, production smoke/critical browser tests, Hostinger release-marker verification, and public production health.

## Production UAT Interpretation

Automated production release verification is complete and passing. A separate authenticated live-tenant business sign-off session was not executed by the deployment workflow and is not represented as completed. This does not change the verified fact that the exact merged release is deployed and healthy.

## Deferred by BRD

Phase 1 does not claim notice/proof-of-service, mediation scheduling, formal hearing/minutes, evidence vault, board vote/quorum/recusal, formal decision, appeal/reconsideration, resolution agreement/e-signature, regulatory dossier export, retention/legal-hold automation, advanced redaction, notification templates, or real malware scanning. These remain Phase 2/3 unless the approved BRD is revised.

## Production Release State

The Phase 1 implementation has crossed the production deployment boundary: PR #122 is merged, the exact main build passed verification, Hostinger served the expected release marker, and public health passed. This documentation-only production-record change does not alter runtime behavior; it records the already verified release state for future maintainers and auditors.
