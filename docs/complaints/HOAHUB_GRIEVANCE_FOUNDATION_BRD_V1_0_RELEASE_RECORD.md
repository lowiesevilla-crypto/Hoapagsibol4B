# HOAHub Complaint-to-Grievance Foundation BRD v1.0 — Implementation and Release Record

**Requirements baseline:** `HOAHUB_GRIEVANCE_FOUNDATION_BRD_V1_0.md`  
**Baseline version/date:** v1.0 / 2026-08-17  
**Record date:** 2026-08-17  
**Business scope:** unchanged  
**Implementation status:** PHASE 1 IMPLEMENTED — RELEASE CANDIDATE VALIDATED  
**Deployment status:** NOT DEPLOYED  
**Implementation PR:** #122 — `feat: grievance foundation phase 1`

## 1. Document-Control Purpose

The approved v1.0 BRD is retained as the immutable business/acceptance baseline. This companion record updates implementation, validation, review, merge, deployment, and UAT status without rewriting the approved business intent or silently changing Phase 1 scope.

If this release record conflicts with the baseline on a business requirement, the approved BRD governs. If the baseline header still states a historical implementation state such as `NOT STARTED`, this release record and `GRIEVANCE_PHASE1_IMPLEMENTATION_STATUS.md` govern the current delivery/deployment state only.

## 2. Phase 1 Scope Delivered

The release candidate implements the approved Phase 1 groups:

- **ANM:** secure anonymous two-way text messaging over bounded REST polling;
- **SUB:** structured complaint subject/property/vehicle targeting separate from incident location;
- **VER:** policy-driven independent verification and server-enforced formal/enforcement gate;
- **GRV:** additive, separate `GrievanceCase` foundation;
- **COM:** tenant-scoped Grievance Committee appointments and granular permissions;
- **DDL:** formal process deadlines separate from complaint operational SLA; and
- **SEC-GRV / UX-GRV / NFR-GRV:** tenant isolation, privacy, auditability, mobile/PWA, compatibility, validation, rollback, and production release controls.

The implementation does **not** replace `ComplaintStatus` with a combined legal workflow and does not claim the BRD-deferred notice, mediation, hearing, board vote/quorum/recusal, appeal, evidence vault, e-signature, regulatory dossier, legal-hold automation, or real malware-scanning capabilities.

## 3. Security/Correctness Release Decisions

The final release candidate incorporates review-driven hardening in addition to the initial implementation:

- anonymous session cookies are revalidated against the exact complaint public reference so one tracker tab cannot silently send/poll against another complaint after cookie replacement;
- anonymous message throttling uses stable tenant/complaint scope and cannot be reset by obtaining a new short-lived session;
- initial complaint messages and subsequent anonymous/staff/system messages preserve authoritative sender classification;
- anonymous message creation, required timeline/activity history, and audit evidence commit atomically;
- older public messages remain retrievable using bounded backward pagination;
- vehicle/homeowner subject mismatch is rejected and vehicle subject references are protected from hard-delete dangling records;
- verification and grievance state transitions use serialized transaction locks so a passing result cannot race with a downgrade into a contradictory verified/formal-ready case;
- verification, activity, and audit writes commit atomically;
- grievance promotion is idempotent for creation history;
- deadline creation and its history are atomic;
- process-deadline and operational-SLA pause reasons remain reconstructable after resume/state changes;
- committee appointments reject route-ineligible ordinary users and platform roles;
- active committee permissions govern grievance UI/report/action authority without granting unrelated tenant/platform privileges;
- confidential complainant identity remains separately authorized, reasoned, confirmed, no-store, and audited; and
- unexpected unauthenticated API failures return generic responses instead of raw internal database/query errors.

## 4. Validation Evidence

Implementation head `858badf7ce2efc7db35d7dd570aebef8c82f5531` passed **HOAHub MySQL CI run #713 (`32034186355`)** end-to-end before this documentation synchronization.

Passing gates included:

- dependency install and lint;
- Prisma validate/generate;
- clean migration deployment and seed;
- full unit suite;
- database integration suite;
- critical verification suite;
- TypeScript typecheck;
- production build;
- controlled Chromium setup; and
- production smoke / critical browser suite.

All current inline review threads on PR #122 were resolved before this release-record update. The resulting documentation-synchronized PR head must pass the same CI gate before merge.

## 5. Definition-of-Done Status

| BRD DoD item | Release-candidate state |
| --- | --- |
| Phase 1 requirements implemented | PASS — subject to production UAT |
| Additive Prisma migration validated | PASS in clean CI MySQL |
| Anonymous privacy/session isolation | PASS in automated/review gates; production UAT pending |
| Phone/PWA two-way tracker | PASS in source/browser gates; production device smoke pending |
| Tenant-safe subject/property linkage | PASS automated/review; production negative UAT pending |
| Verification enforcement gate | PASS automated/review; production policy UAT pending |
| Committee authority tenant/effective-role safe | PASS automated/review; production matrix UAT pending |
| Process deadlines separate from operational SLA | PASS automated/review; production timezone/history UAT pending |
| Existing complaint regression behavior | PASS CI critical/browser gates; production smoke pending |
| Agent/documentation synchronized | IN PROGRESS on PR #122; required before merge |
| Repository CI | PASS on implementation head; documentation-synchronized head pending |
| Merge to `main` | PENDING |
| Hostinger release marker + health | PENDING |
| Post-deployment production UAT | PENDING |

## 6. Production Authorization Boundary

Production deployment is authorized only after:

1. the final PR head contains synchronized `Agent.md`, implementation status, traceability, and this release record;
2. the complete PR CI gate passes on that exact head;
3. no unresolved review thread or mergeability/synchronization blocker remains;
4. PR #122 merges to `main` through the approved GitHub flow;
5. the `main` verification workflow succeeds;
6. Hostinger serves the expected short merged `main` SHA at `/release.txt`;
7. `/api/health` passes; and
8. production smoke/UAT confirms no tenant/privacy regression in anonymous messaging, verification, subject, committee, deadline/SLA, reporting, and mobile/PWA behavior.

After those conditions pass, this record, the implementation status, traceability, and `Agent.md` should be updated to the actual deployed `main` SHA and production UAT result.

## 7. Rollback Position

The grievance foundation remains additive. Application rollback must preserve grievance, verification, subject, committee, deadline, anonymous-session, idempotency, activity, timeline, and audit history. Feature/configuration switches may disable new workflow behavior while investigation or rollback proceeds. Destructive schema reversal is not the routine rollback mechanism.
