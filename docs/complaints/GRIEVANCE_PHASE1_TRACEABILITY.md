# HOAHub Grievance Foundation Phase 1 — BRD Traceability

**BRD:** `HOAHUB_GRIEVANCE_FOUNDATION_BRD_V1_0.md`  
**Implementation branch:** `feature/grievance-foundation-phase1`  
**Draft PR:** #122  
**Status date:** 2026-08-17  
**Deployment:** NOT DEPLOYED

This matrix records implementation evidence against the approved BRD. `IMPLEMENTED / VALIDATION PENDING` means code exists on the feature branch but must not be treated as released until CI, review, merge, Hostinger release verification, and production UAT complete.

| BRD group | Delivery status | Implementation evidence | Release evidence still required |
| --- | --- | --- | --- |
| ANM — secure anonymous two-way messaging | IMPLEMENTED / VALIDATION PENDING | `lib/services/complaint-anonymous-session.ts`; anonymous session/message API routes; short-lived opaque HttpOnly session cookie; SHA-256 token digest; PUBLIC-only DTO; cursor polling; safe author labels; idempotent text replies; separate auth/message rate limits; revoke; no follow-up attachments. | MySQL migration verification, unit/integration/browser UAT, privacy/cross-tenant review. |
| SUB — structured complaint subject | IMPLEMENTED / VALIDATION PENDING | `ComplaintSubject` table; `addComplaintSubject`; same-tenant homeowner/vehicle revalidation; phase/block/lot/address snapshots; admin subject workflow in `GrievanceFoundationPanel`; complaint `location` remains incident location. | CI/typecheck/browser UAT and subject lifecycle verification. |
| VER — independent verification | IMPLEMENTED / VALIDATION PENDING | verification policy/record tables; policy settings UI; `evaluateComplaintVerificationRequirement`; verification findings workflow; `assertComplaintEnforcementAllowed`; `READY_FOR_FORMAL_PROCESS` transition calls enforcement gate. | CI, policy-matching tests, punitive-action integration when a future enforcement action is introduced, UAT. |
| GRV — separate formal grievance | IMPLEMENTED / VALIDATION PENDING | additive `GrievanceCase`; explicit promotion; separate Phase 1 state machine; admin panel; queue/report display; board-review category flag is snapshot metadata only. | CI/browser UAT; Phase 2 notice/hearing/board workflow remains deferred. |
| COM — Grievance Committee | IMPLEMENTED / VALIDATION PENDING | tenant-scoped membership; Chair/Member/Secretary/Mediator; granular permissions; effective-role-aware appointment validation; platform-role denial; settings UI; appointment/end lifecycle. | Permission/UAT matrix and final security review. |
| DDL — process deadlines vs operational SLA | IMPLEMENTED / VALIDATION PENDING | `GrievanceDeadline`; explicit Manila start/due dates; policy source; deadline state lifecycle; separate operational-SLA pause/resume with mandatory pause reason; no universal 5/7-day default. | CI, timezone/browser UAT, SLA reporting verification. |
| GRV-005 / reporting | IMPLEMENTED / VALIDATION PENDING | complaint queue displays separate complaint/grievance/verification states and filters; `lib/services/grievance-reporting.ts`; `/admin/complaints/grievance-report` filters by complaint status, grievance state, verification, privacy, category, handler, and date range without complainant identity fields. | CI/typecheck, pagination/filter UAT, privacy review. |
| SEC-GRV | IN PROGRESS | explicit tenant predicates; state-change same-origin checks; no-store anonymous APIs; no resident identity FK in anonymous session; platform-role action denial; committee target effective-role validation; confidential identity storage untouched. | Full CI/security regression and cross-tenant negative UAT. |
| UX-GRV | IN PROGRESS | phone/PWA anonymous conversation; `Back to Home`; `100dvh`; safe-area padding; shrink-safe content; text-only composer; reduced-motion-aware scrolling. Admin grievance workflow and report surfaces added. | Narrow-screen/browser/accessibility UAT. |
| NFR-GRV | IN PROGRESS | additive migration; no WebSocket dependency; bounded REST polling; source-level regression suites; rollback retains additive history tables/columns. | Successful repository validation gate, Hostinger deployment verification and production smoke/UAT. |

## Key Security Decisions

- Anonymous complaint session persistence contains no `userId`, `homeownerId`, account number, email, IP address, or user-agent identity linkage.
- Tracking Code + PIN is used to establish the session and is not resent on polling/message requests.
- The raw anonymous session token is delivered only in an HttpOnly cookie; only its SHA-256 digest is persisted.
- Anonymous message APIs serialize only `PUBLIC` complaint messages and safe author labels; internal/confidential messages, staff IDs/emails, identity grants and storage paths are not returned.
- Grievance/verification records do not auto-reveal confidential complainant identity.
- Platform roles are rejected from tenant grievance actions and cannot be appointed as tenant committee members through the supported workflow.
- Committee appointments grant only grievance permissions and do not modify finance/platform/admin roles.
- Operational complaint status and formal grievance status remain separate.

## Known Validation History

An early CI attempt exposed an invalid composite anonymous-session foreign key using `ON DELETE SET NULL` across `(tenantId, anonymousSessionId)` while `ComplaintMessage.tenantId` is non-null. The migration was corrected to reference the globally unique `ComplaintAnonymousSession.id` from nullable `ComplaintMessage.anonymousSessionId`, while tenant/complaint binding remains enforced by server predicates and the anonymous idempotency key. `tests/unit/grievance-migration-safety.test.ts` protects this invariant.

A previous lint attempt also identified an unused grievance-panel type import; that source issue was corrected. These historical failures are not evidence that the current branch is green. The current head must pass the complete repository validation pipeline before the PR is review-complete.

## Deferred by BRD

Phase 1 does not claim implementation of notice/proof-of-service, mediation scheduling, hearing records/minutes, evidence vault, board vote/quorum/recusal, formal decision, appeal, resolution agreement/e-signature, regulatory dossier export, retention/legal hold automation, or real malware scanning. Those remain Phase 2/3 unless the approved BRD is revised.
