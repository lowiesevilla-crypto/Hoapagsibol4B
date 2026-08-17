# HOAHub Complaint-to-Grievance Foundation BRD v1.0 — Implementation and Release Record

**Requirements baseline:** `HOAHUB_GRIEVANCE_FOUNDATION_BRD_V1_0.md`  
**Baseline version/date:** v1.0 / 2026-08-17  
**Record date:** 2026-08-17  
**Business scope:** unchanged  
**Implementation status:** PHASE 1 PRODUCTION DEPLOYED — AUTOMATED VERIFICATION COMPLETE  
**Deployment status:** DEPLOYED / VERIFIED  
**Implementation PR:** #122 — MERGED  
**Production feature SHA:** `e34bf48a8519cf6a8389a78f998bbfafd46653c0`

## 1. Document-Control Purpose

The approved v1.0 BRD is retained as the immutable business/acceptance baseline. This companion record updates implementation, validation, review, merge, deployment, and UAT status without rewriting the approved business intent or silently changing Phase 1 scope.

If this release record conflicts with the baseline on a business requirement, the approved BRD governs. If the baseline header contains a historical implementation state such as `NOT STARTED`, this release record and `GRIEVANCE_PHASE1_IMPLEMENTATION_STATUS.md` govern current implementation/deployment state only.

## 2. Phase 1 Scope Delivered

The production release implements the approved Phase 1 groups:

- **ANM:** secure anonymous two-way text messaging over bounded REST polling;
- **SUB:** structured complaint subject/property/vehicle targeting separate from incident location;
- **VER:** policy-driven independent verification and server-enforced formal/enforcement gate;
- **GRV:** additive, separate `GrievanceCase` foundation;
- **COM:** tenant-scoped Grievance Committee appointments and granular permissions;
- **DDL:** formal process deadlines separate from complaint operational SLA; and
- **SEC-GRV / UX-GRV / NFR-GRV:** tenant isolation, privacy, auditability, mobile/PWA, compatibility, validation, rollback, and production release controls.

The release does **not** replace `ComplaintStatus` with a combined legal workflow and does not claim the BRD-deferred notice, mediation, hearing, board vote/quorum/recusal, appeal, evidence vault, e-signature, regulatory dossier, legal-hold automation, or real malware-scanning capabilities.

## 3. Security/Correctness Release Decisions

Production includes the review-driven hardening completed before merge:

- anonymous sessions are revalidated against the exact complaint public reference so another tracker tab cannot redirect polling/posting through a replaced cookie;
- anonymous message throttling uses stable tenant/complaint scope and cannot be reset by obtaining a new short-lived session;
- initial complaint messages and later anonymous/staff/system messages preserve authoritative sender classification;
- anonymous message creation, required timeline/activity history, and audit evidence commit atomically;
- older public messages remain retrievable through bounded backward pagination;
- vehicle/homeowner subject mismatch is rejected and vehicle subject references are protected from hard-delete dangling records;
- verification and grievance transitions use serialized transaction locks so a passing verification cannot race with a downgrade into contradictory verified/formal-ready state;
- verification, activity, and audit writes commit atomically;
- grievance promotion is idempotent for creation history;
- deadline creation and its history are atomic;
- process-deadline and operational-SLA pause reasons remain reconstructable after resume/state changes;
- committee appointments reject route-ineligible ordinary users and platform roles;
- active committee permissions govern grievance UI/report/action authority without granting unrelated tenant/platform privileges;
- confidential complainant identity remains separately authorized, reasoned, confirmed, no-store, and audited; and
- unexpected unauthenticated API failures return generic responses instead of internal database/query details.

## 4. Validation and Production Deployment Evidence

### Pre-Merge Release Candidate

Implementation head `858badf7ce2efc7db35d7dd570aebef8c82f5531` passed HOAHub MySQL CI run #713 (`32034186355`) end-to-end. The documentation-synchronized PR head `140a3698add0efa74949fcafcb59cc13903c3923` also passed the complete CI gate after a transient GitHub codeload HTTP 429 was retried successfully; that transient setup failure was external to the application and no code waiver was used.

All PR #122 inline review threads were resolved before merge.

### Merged Main Release

PR #122 merged to `main` as:

- **Full SHA:** `e34bf48a8519cf6a8389a78f998bbfafd46653c0`
- **Short production marker:** `e34bf48a8519`
- **Main CI/deployment run:** HOAHub MySQL CI #718 (`32037027056`)

The exact merged-main build passed:

- dependency installation and lint;
- Prisma validate/generate;
- clean migration deployment and seed;
- full unit suite;
- database integration suite;
- critical verification suite;
- TypeScript typecheck;
- production build;
- controlled Chromium setup; and
- production smoke / critical browser suite.

The Hostinger production verifier then:

1. confirmed the managed deployment configuration;
2. observed the previous production release marker `f8becc4228d8`;
3. waited for the connected-GitHub Hostinger rollout;
4. confirmed production `/release.txt` changed to the exact expected `e34bf48a8519`; and
5. passed the public production `/api/health` check.

Therefore the release is not merely CI-green: the expected merged revision was actually published and its public health endpoint passed.

## 5. Definition-of-Done Status

| BRD DoD item | Production release state |
| --- | --- |
| Phase 1 requirements implemented | PASS |
| Additive Prisma migration validated | PASS — clean CI migration deployment on exact main build |
| Anonymous privacy/session isolation | PASS — automated/review gates on exact main release |
| Phone/PWA two-way tracker | PASS — source/browser critical gates on exact main release |
| Tenant-safe subject/property linkage | PASS — automated/review gates |
| Verification enforcement gate | PASS — automated/review/concurrency gates |
| Committee authority tenant/effective-role safe | PASS — automated/review gates |
| Process deadlines separate from operational SLA | PASS — automated/review gates |
| Existing complaint regression behavior | PASS — critical/browser gates |
| Agent/documentation synchronized before feature merge | PASS |
| PR #122 review threads | PASS — resolved before merge |
| Repository CI on merged main | PASS — run #718 |
| Merge to `main` | PASS — `e34bf48a8519cf6a8389a78f998bbfafd46653c0` |
| Hostinger release marker | PASS — `e34bf48a8519` |
| Production public health | PASS |
| Automated production release UAT | PASS |
| Separate authenticated live-tenant business sign-off | NOT SEPARATELY EXECUTED / not claimed by automated deployment evidence |

## 6. Production State and Operational Handoff

Phase 1 is **production deployed and technically verified**. The automated release workflow proves that the exact merged main build passed the repository verification suite, Hostinger published that build, the public release marker matched, and production health passed.

A separate authenticated live-tenant business acceptance session was not executed by the automated deployment workflow. If rollout governance requires a named tenant representative sign-off, that is an operational handoff item and should be recorded separately; it does not change the verified production deployment evidence above.

The production-record documentation branch/PR exists only to synchronize `Agent.md`, implementation status, traceability, and this BRD companion with the already verified production state. It makes no grievance runtime behavior change.

## 7. Rollback Position

The grievance foundation remains additive. Application rollback must preserve grievance, verification, subject, committee, deadline, anonymous-session, idempotency, activity, timeline, and audit history. Feature/configuration switches may disable new workflow behavior while investigation or rollback proceeds. Destructive schema reversal is not the routine rollback mechanism.

## 8. Deferred Scope

The following remain outside Phase 1 unless the approved BRD is revised: notice/proof-of-service, mediation, hearing/witness/exhibit/minutes records, evidence vault/provenance, board vote/quorum/recusal/formal decision, appeal/reconsideration, resolution agreement/e-signature, regulatory/adjudication dossier export, retention/legal-hold automation, advanced redaction/notification workflows, and real malware scanner integration.
