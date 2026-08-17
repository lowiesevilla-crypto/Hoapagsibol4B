# HOAHub Grievance Foundation Phase 1 — BRD Traceability

**BRD:** `HOAHUB_GRIEVANCE_FOUNDATION_BRD_V1_0.md`  
**Implementation branch:** `feature/grievance-foundation-phase1`  
**PR:** #122 — Ready for review, NOT MERGED  
**Status date:** 2026-08-17  
**Deployment:** NOT DEPLOYED

This matrix records implementation evidence against the approved BRD. `PRE-PRODUCTION VALIDATED` means the Phase 1 code and repository validation gates have passed on the review-ready implementation head, but the feature is not released until an authorized merge/deployment, Hostinger release verification, and production UAT complete.

| BRD group | Delivery status | Implementation / validation evidence | Release evidence still required |
| --- | --- | --- | --- |
| ANM — secure anonymous two-way messaging | PRE-PRODUCTION VALIDATED | `lib/services/complaint-anonymous-session.ts`; anonymous session/message API routes; short-lived opaque HttpOnly session cookie; SHA-256 token digest; PUBLIC-only DTO; cursor polling; senderType-authoritative safe labels; retry-safe idempotent text replies; separate auth/message rate limits; revoke; no follow-up attachments; full run #688 passed. | Production privacy/cross-tenant smoke/UAT. |
| SUB — structured complaint subject | PRE-PRODUCTION VALIDATED | `ComplaintSubject`; `addComplaintSubject`; same-tenant homeowner/vehicle revalidation; vehicle/homeowner mismatch rejection; phase/block/lot/address snapshots; admin workflow; complaint `location` remains incident location; regression coverage passed. | Production negative cross-tenant UAT. |
| VER — independent verification | PRE-PRODUCTION VALIDATED | verification policy/record tables; policy settings UI; blocking only when the same matching policy also requires verification; atomic verification/activity/audit transaction; `VERIFICATION_STARTED` for in-progress work; `VERIFIED` requires `PASSED`; `assertComplaintEnforcementAllowed` gates `READY_FOR_FORMAL_PROCESS`; full CI passed. | Production policy/security UAT and reuse by future punitive actions. |
| GRV — separate formal grievance | PRE-PRODUCTION VALIDATED | additive `GrievanceCase`; explicit promotion; separate Phase 1 state machine; permission-aware admin panel; queue/report display; board-review category flag is snapshot metadata only; full CI/browser gate passed. | Production workflow UAT; Phase 2 notice/hearing/board workflow remains deferred. |
| COM — Grievance Committee | PRE-PRODUCTION VALIDATED | tenant-scoped membership; Chair/Member/Secretary/Mediator; granular permissions; effective-role-aware appointment validation; platform-role denial; grievance UI/actions derive from active committee permissions; regression coverage passed. | Production permission-matrix UAT. |
| DDL — process deadlines vs operational SLA | PRE-PRODUCTION VALIDATED | `GrievanceDeadline`; explicit Manila start/due dates; policy source; deadline state lifecycle; separate operational-SLA pause/resume with mandatory pause reason; no universal 5/7-day default; full CI passed. | Production timezone/SLA UAT. |
| GRV-005 / reporting | PRE-PRODUCTION VALIDATED | complaint queue displays separate complaint/grievance/verification states and filters; SQL applies formal filters before the row cap; `lib/services/grievance-reporting.ts`; `/admin/complaints/grievance-report` filters without complainant identity fields; tenant-scoped regression coverage passed. | Production filter/privacy UAT. |
| SEC-GRV | PRE-PRODUCTION VALIDATED | explicit tenant predicates; state-change same-origin checks; no-store anonymous APIs; generic unexpected public API errors; no resident identity FK in anonymous session; platform-role action denial; committee target validation; confidential identity storage untouched; 10 Codex review findings remediated and covered by regression tests. | Any new final-review finding plus production cross-tenant/privacy UAT. |
| UX-GRV | PRE-PRODUCTION VALIDATED | phone/PWA anonymous conversation; `Back to Home`; `100dvh`; safe-area padding; shrink-safe content; text-only composer; reduced-motion-aware scrolling; permission-aware admin grievance surfaces; critical Chromium/browser suite passed. | Production-device/accessibility smoke/UAT. |
| NFR-GRV | PRE-PRODUCTION VALIDATED | additive migration; no WebSocket dependency; bounded REST polling; source regression suites including `grievance-review-remediation.test.ts`; rollback retains additive history; migration, unit/integration/critical, typecheck, build, and browser gates passed in run #688. | Authorized merge/deployment, Hostinger release verification and production UAT. |

## Key Security Decisions

- Anonymous complaint session persistence contains no `userId`, `homeownerId`, account number, email, IP address, or user-agent identity linkage.
- Tracking Code + PIN is used to establish the session and is not resent on polling/message requests.
- The raw anonymous session token is delivered only in an HttpOnly cookie; only its SHA-256 digest is persisted.
- Anonymous message APIs serialize only `PUBLIC` complaint messages and safe author labels; `senderType` remains authoritative even when an author record is later deleted.
- Retry of the same uncertain anonymous message reuses its client idempotency key until success or a content change.
- Unexpected anonymous API/internal failures return generic external errors rather than raw database/query exception text.
- Grievance/verification records do not auto-reveal confidential complainant identity.
- Verification state, grievance activity, and audit evidence are committed atomically.
- A grievance cannot be marked `VERIFIED` unless independent verification is actually `PASSED`.
- Platform roles are rejected from tenant grievance actions and cannot be appointed as tenant committee members through the supported workflow.
- Committee appointments grant only grievance permissions and do not modify finance/platform/admin roles.
- Operational complaint status and formal grievance status remain separate.

## Validation and Review History

An early CI attempt exposed an invalid composite anonymous-session foreign key using `ON DELETE SET NULL` across `(tenantId, anonymousSessionId)` while `ComplaintMessage.tenantId` is non-null. The migration was corrected to reference globally unique `ComplaintAnonymousSession.id` from nullable `ComplaintMessage.anonymousSessionId`, while tenant/complaint binding remains enforced by server predicates and the anonymous idempotency key. `tests/unit/grievance-migration-safety.test.ts` protects this invariant.

Subsequent validation identified feature-switch enforcement, queue-filter coverage, and a TypeScript test-regex compatibility issue; each was corrected. The first Codex review then raised 10 correctness/security findings (2 P1, 8 P2). All ten were remediated and their threads resolved.

The review-ready implementation head `087d5cf5ba900026ef290ed9aef7f75713836c9b` passed **HOAHub MySQL CI run #688 (`31990647376`)** end-to-end: install, lint, Prisma validate/generate, migration deploy, seed, unit suite, database integration, critical verification, typecheck, build, Chromium preparation, and production smoke/critical browser suite.

A fresh `@codex review` has been requested on the remediated PR. Any new valid finding is a release blocker until corrected and the resulting latest head is fully revalidated.

## Deferred by BRD

Phase 1 does not claim implementation of notice/proof-of-service, mediation scheduling, hearing records/minutes, evidence vault, board vote/quorum/recusal, formal decision, appeal, resolution agreement/e-signature, regulatory dossier export, retention/legal hold automation, or real malware scanning. Those remain Phase 2/3 unless the approved BRD is revised.

## Production Release Boundary

This branch is not a production target. Production deployment is authorized only after final review/current-head validation and an explicit release decision. When production deployment is authorized, merge to `main`, verify the Hostinger-published release marker matches the expected merged SHA, confirm `/api/health`, and execute the production UAT matrix before marking Phase 1 production-complete.
