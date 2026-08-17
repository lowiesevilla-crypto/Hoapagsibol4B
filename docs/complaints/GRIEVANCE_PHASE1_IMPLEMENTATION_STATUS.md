# HOAHub Grievance Foundation Phase 1 — Implementation Status

**BRD baseline:** `docs/complaints/HOAHUB_GRIEVANCE_FOUNDATION_BRD_V1_0.md`  
**Feature PR:** #122 — MERGED  
**Feature merge SHA:** `e34bf48a8519cf6a8389a78f998bbfafd46653c0`  
**Status date:** 2026-08-17  
**Overall implementation:** PRODUCTION DEPLOYED — AUTOMATED VERIFICATION COMPLETE  
**Deployment:** DEPLOYED / VERIFIED  
**Production UAT:** AUTOMATED RELEASE UAT PASS; live tenant business sign-off was not separately executed

This document is the live implementation/deployment companion to BRD v1.0. The BRD remains the approved requirements baseline. Delivery, review, validation, merge, deployment, and production verification are recorded here without changing the approved business intent.

## Delivery Status

| BRD group | Status | Production evidence | Operational follow-up |
| --- | --- | --- | --- |
| ANM — Anonymous two-way messaging | PRODUCTION DEPLOYED / VERIFIED | Tracking Code + PIN short-lived anonymous session; HttpOnly cookie; SHA-256 token digest only; exact public-reference binding; PUBLIC-only DTO; bounded forward/backward cursors; authoritative sender classification; text-only replies; retry-safe idempotency; stable complaint-scoped throttling; atomic message/history/audit. Exact merged-main build passed unit/critical/browser gates. | Monitor real-world usage and privacy events; live tenant business sign-off may be performed operationally. |
| API — Anonymous REST endpoints | PRODUCTION DEPLOYED / VERIFIED | Session/messages APIs enforce same-origin state changes, no-store, expected complaint-reference binding, and generic unexpected error responses. | Monitor abuse/error telemetry. |
| SUB — Complaint subject | PRODUCTION DEPLOYED / VERIFIED | Same-tenant homeowner/vehicle validation; mismatched vehicle/homeowner rejection; reviewed vehicle referential integrity; Phase/Block/Lot/address snapshots separate from incident location. | Operational tenant UAT as desired. |
| VER — Independent verification | PRODUCTION DEPLOYED / VERIFIED | Policy-driven verification; blocking only from a policy that requires verification; atomic result/history; serialized grievance/verification transition locks; `VERIFIED` and `READY_FOR_FORMAL_PROCESS` require passing verification where applicable. | Future punitive actions must continue to reuse the server enforcement gate. |
| GRV — Separate grievance case | PRODUCTION DEPLOYED / VERIFIED | Additive `GrievanceCase`; idempotent promotion history; complaint operational status remains separate; board-review flag remains metadata only. | Phase 2 formal-process capabilities remain deferred. |
| COM — Grievance Committee | PRODUCTION DEPLOYED / VERIFIED | Tenant-scoped appointments; granular permissions; platform-role denial; route-compatible target validation; grievance UI/report/actions use active grievance permissions; identity reveal remains separately authorized. | Operational permission-matrix review for each tenant's appointments. |
| DDL — Process deadlines vs SLA | PRODUCTION DEPLOYED / VERIFIED | Separate `GrievanceDeadline`; explicit Manila dates; atomic deadline/history creation; process-deadline and operational-SLA pause reasons are reconstructable; no universal 5/7-day default. | Tenant policy owners remain responsible for configured legal/process dates. |
| Reporting / queue | PRODUCTION DEPLOYED / VERIFIED | Grievance/verification filters execute before result cap; privacy-safe tenant-scoped grievance report omits complainant identity. | Monitor report/filter use with tenant data. |
| Prisma / migration desired state | PRODUCTION DEPLOYED / VERIFIED | Grievance models/enums/message metadata represented in Prisma desired state; migration chain passed clean MySQL deployment on exact merged `main`; production managed release completed successfully. | Preserve additive rollback/history posture. |
| SEC-GRV / UX-GRV / NFR-GRV | PRODUCTION DEPLOYED / VERIFIED | Exact merged-main CI passed lint, Prisma, migrations, unit/integration/critical/type/build/browser gates; Hostinger release marker and public health passed. | Continue normal monitoring and incident-response controls. |

## Production Deployment Evidence

Feature PR #122 merged to `main` as:

- **Full main SHA:** `e34bf48a8519cf6a8389a78f998bbfafd46653c0`
- **Expected production release marker:** `e34bf48a8519`
- **Main workflow:** HOAHub MySQL CI run #718 (`32037027056`)
- **Repository verification job:** PASS
- **Hostinger managed production verification job:** PASS
- **Production `/release.txt`:** matched `e34bf48a8519`
- **Production `/api/health`:** PASS

The managed deployment verifier observed the previous live marker `f8becc4228d8`, waited for Hostinger's connected-GitHub deployment, then confirmed the expected `e34bf48a8519` release before running the successful public health check.

## Automated Release Verification

The exact merged-main build passed:

- dependency installation and lint;
- Prisma validate and generate;
- clean `prisma migrate deploy` and seed;
- full unit suite;
- database finance integration suite;
- critical verification suite;
- TypeScript typecheck;
- production build;
- controlled Chromium preparation;
- production smoke / critical browser suite;
- Hostinger release-marker verification; and
- public production health verification.

This is recorded as **automated production release UAT complete**. A separate authenticated live-tenant business sign-off session was not executed as part of the automated deployment workflow and is not claimed here.

## Review Remediation State

All PR #122 inline review threads were resolved before merge. Remediations included:

- committee permission-driven grievance UI/report/action access;
- queue grievance/verification filtering before limiting;
- vehicle/homeowner subject mismatch rejection and vehicle referential integrity;
- atomic verification/history and serialized verification/grievance state transitions;
- correct in-progress verification event;
- policy-consistent enforcement blocking;
- anonymous public error hardening;
- sender attribution preservation and explicit initial-message classification;
- retry-safe idempotency and atomic anonymous message/history/audit writes;
- exact complaint-reference binding for anonymous sessions;
- stable message throttling across session renewal;
- bounded backward pagination for older public messages;
- idempotent grievance promotion history;
- separately enforced confidential-identity reveal permission;
- route-compatible committee appointment validation;
- atomic deadline creation/history; and
- reconstructable process-deadline and operational-SLA pause reasons.

## Primary Files

- `prisma/schema.prisma`
- `prisma/grievance-foundation.prisma`
- `prisma/migrations/20260817093000_grievance_foundation_phase1/migration.sql`
- grievance follow-up referential-integrity migration(s)
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
- anonymous session/message API routes
- complaint tracker and grievance admin/settings/report UI
- grievance Phase 1 unit/regression suites
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

## Production State

Phase 1 is **deployed and technically verified in production**. The application release marker and public health gate passed for main SHA `e34bf48a8519cf6a8389a78f998bbfafd46653c0` in run #718. This production-record documentation update changes documentation only and does not alter grievance runtime behavior.

The approved BRD-deferred Phase 2/3 scope remains out of this release. Live tenant business acceptance/sign-off, if required by rollout governance, is an operational handoff activity rather than an unverified claim in this record.
