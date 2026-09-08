# HOAHub Homeowner Activation Email & Bulk Invitation — Implementation Status

Last updated: 2026-09-08
Implementation branch: `feature/homeowner-activation-bulk-delivery-hardening`
Pull request: PR #316
Production state: **MERGE READY AFTER FINAL EXACT-HEAD CI / BULK DELIVERY NOT ENABLED**
Feature gate: `HOMEOWNER_ACTIVATION_BULK_DELIVERY_ENABLED=true` is required before the new bulk action/worker can run.

This register tracks implementation against `HOAHUB_HOMEOWNER_ACTIVATION_EMAIL_AND_BULK_INVITATION_REQUIREMENTS.md`. HOAHub already has active tenants and homeowners, so code-merge gates and production bulk-enablement gates are deliberately separated. The new mass-activation path fails closed unless the production feature flag is explicitly set to `"true"`.

## Status legend

- **COMPLETE (CODE)** — implemented on the feature branch; subject to final exact-head CI before merge.
- **PASS / REVALIDATE FINAL HEAD** — passed on the prior exact code head; revalidate after this documentation-only synchronization.
- **PRODUCTION ENABLEMENT BLOCKER** — does not prevent merging disabled code, but must be closed before enabling broad production bulk delivery.
- **OPERATIONAL** — configuration/evidence outside application source code.

## Requirement traceability

| Requirement | Status | Current evidence / implementation | Remaining gate |
|---|---|---|---|
| Requirements/specification documented | COMPLETE (CODE) | Production-safety, deliverability, eligibility, selection, job, progress, security, scale and release requirements documented | Keep this register synchronized |
| Correct first-time eligibility | COMPLETE (CODE) | Never-invited only; already issued/cancelled/activated/disabled records excluded from first-time action | Final exact-head CI |
| Correct first-time KPI/filter | COMPLETE (CODE) | Admin count/filter requires `NOT_INVITED` and no prior `activationSentAt` | Final exact-head CI |
| Select all eligible on current page | COMPLETE (CODE) | Header client control selects only rendered eligible checkboxes | Final exact-head browser CI |
| Select all eligible matching filters | COMPLETE (CODE) | Server calculates eligible filtered count and resolves final recipient IDs under tenant scope | Final exact-head CI |
| Duplicate-click protection | COMPLETE (CODE) | Bulk submit control locks after confirmation and shows queueing progress | Final exact-head browser CI |
| Durable bulk job model | COMPLETE (CODE) | Additive job/item Prisma models plus MySQL migration | Final exact-head MySQL CI |
| Tenant-scoped recipient uniqueness | COMPLETE (CODE) | Unique tenant/job/homeowner item key and tenant-scoped job queries; DB integration test covers cross-tenant invisibility | Final exact-head MySQL CI |
| Request idempotency | COMPLETE (CODE) | Tenant-scoped SHA-256 idempotency hash uniqueness collapses duplicate queue requests; DB integration test covers duplicate queue collapse | Final exact-head MySQL CI |
| Background processing | COMPLETE (CODE) | Existing authenticated email cron worker drains activation jobs in bounded batches; DB integration test covers single-claim worker behavior | Verify production scheduler before enablement |
| Re-check eligibility immediately before processing | COMPLETE (CODE) | Worker loads tenant homeowner and re-evaluates first-time eligibility before credential creation/send | Final exact-head MySQL CI |
| Avoid automatic duplicate resend after ambiguous worker failure | COMPLETE (CODE) | Ambiguous `PROCESSING` items become manual-review failures rather than being automatically resent | Operational failure-injection/canary evidence before broad enablement |
| Persistent progress API | COMPLETE (CODE) | Admin-authenticated tenant-scoped job progress route | Final exact-head CI |
| Persistent progress UI | COMPLETE (CODE) | Polls job state and shows processed/total, provider accepted, queued, skipped and failed/review | Final exact-head browser CI |
| Accurate provider-accepted wording | COMPLETE (CODE) | Admin UI does not claim SMTP acceptance equals mailbox delivery | Async delivery callbacks remain an enablement gate |
| Feature-gated rollout | COMPLETE (CODE) | Queue action and worker are disabled unless production env flag is explicitly enabled | Keep disabled until production enablement gates pass |
| Initial first-time eligibility unit tests | COMPLETE (CODE) | Never invited / already invited / expired / activated / disabled cases | Final exact-head CI |
| Secure activation/reset URL metadata redaction | COMPLETE (CODE) | Security-sensitive action URLs are redacted from ordinary notification metadata; only queued billing/reminder metadata keeps action URLs needed by the worker | Final exact-head CI |
| Legacy individual-send result truthfulness | COMPLETE (CODE) | Single-homeowner activation action treats FAILED/SKIPPED as not accepted and records delivery-not-accepted audit metadata | Final exact-head CI |
| Detailed confirmation preview by skip reason | COMPLETE (CODE) | Homeowner list shows eligible/already-invited/activated/missing-email/disabled/other-blocked counts for current filters | Final exact-head browser CI |
| Explicit resend/reissue workflow | COMPLETE (CODE) | First-time send and reissue use separate server eligibility checks; reissue is explicit, audited, and revokes unused credentials | Final exact-head browser CI |
| Raw idempotency key hashing at rest | COMPLETE (CODE) | Raw request idempotency keys are tenant-context SHA-256 hashed before job/audit persistence; raw keys are not stored | Final exact-head CI |
| Job lease release/concurrency proof | COMPLETE (CODE) | DB integration test races two workers and proves only one claims the queued activation job | Final exact-head MySQL CI |
| 2,000-recipient scale proof | COMPLETE (CODE) | DB-backed 5,001-recipient queue test exceeds the 2,000-recipient requirement without inline SMTP | Final exact-head MySQL CI |
| 5,000+ recipient scale proof | COMPLETE (CODE) | DB integration test queues 5,001 first-time eligible homeowners into durable job items without inline SMTP | Final exact-head MySQL CI |
| Retry failed-only without resending successful recipients | COMPLETE (CODE) | Retry route creates a new tenant-scoped job from `FAILED` items only and leaves provider-accepted recipients out of the retry set; DB integration test covers accepted/skipped exclusion | Final exact-head MySQL CI |
| SPF validation | OPERATIONAL / PRODUCTION ENABLEMENT BLOCKER | Read-only production DNS readiness check is implemented | Verify live production DNS against actual provider |
| DKIM validation | OPERATIONAL / PRODUCTION ENABLEMENT BLOCKER | DKIM selector configuration/readiness check is implemented | Verify live selector/key and passing signature |
| DMARC validation/alignment | OPERATIONAL / PRODUCTION ENABLEMENT BLOCKER | DMARC readiness check is implemented | Verify live policy and From-domain alignment |
| Return-Path/bounce-domain validation | OPERATIONAL / PRODUCTION ENABLEMENT BLOCKER | Requirements documented | Verify actual production Return-Path/bounce domain with selected provider |
| Bounce/complaint/delivery callbacks | PRODUCTION ENABLEMENT BLOCKER | SMTP acceptance and synchronous permanent-recipient suppression are implemented | Confirm/integrate asynchronous provider bounce and complaint handling before broad sending |
| Sender reputation monitoring | OPERATIONAL / PRODUCTION ENABLEMENT BLOCKER | Google Postmaster/provider monitoring required | Configure and capture baseline evidence |
| Controlled canary/warm-up | PRODUCTION ENABLEMENT BLOCKER | Feature remains disabled by default | Seed test -> small tenant batch -> staged ramp before mass send |
| Required CI gates | PASS / REVALIDATE FINAL HEAD | On code head `bf69128b165906e9ff18745d98dd7b2d0d2cc999`: MySQL #1541, Edge #172, Firefox #168, Mobile #167, Canva #579 all passed | Revalidate all required workflows on this final documentation-synchronized head |
| Production merge/deploy | READY AFTER FINAL EXACT-HEAD CI | PR is mergeable and has no review blockers; mass activation remains feature-gated off | Merge only the exact head after all required workflows pass |

## Current release decision

**MERGE AFTER FINAL EXACT-HEAD CI; DO NOT ENABLE BULK DELIVERY YET.**

The code can be merged safely once the final exact-head CI gates pass because both the admin queue action and background worker require `HOMEOWNER_ACTIVATION_BULK_DELIVERY_ENABLED === "true"`. With the flag absent or false, the new mass-activation path remains inactive for existing production tenants.

Broad production sending remains blocked by live SPF/DKIM/DMARC and Return-Path validation, asynchronous bounce/complaint handling, sender-reputation evidence, and a controlled canary/warm-up. These operational controls must be completed before the feature flag is enabled.

## Next implementation sequence

1. Run final exact-head CI after this status synchronization.
2. If all required gates pass, mark PR #316 ready and merge only that exact passing head.
3. Confirm the merge is present on `main` and that the bulk feature remains disabled by default.
4. Track and complete live SPF, DKIM, DMARC, Return-Path, bounce/complaint, reputation, and canary evidence before production bulk enablement.
