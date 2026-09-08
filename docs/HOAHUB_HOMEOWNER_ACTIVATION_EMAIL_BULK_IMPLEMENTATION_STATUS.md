# HOAHub Homeowner Activation Email & Bulk Invitation — Implementation Status

Last updated: 2026-09-08
Implementation branch: `feature/homeowner-activation-bulk-delivery-hardening`
Pull request: Draft PR #316
Production state: **NOT ENABLED / NOT MERGED**
Feature gate: `HOMEOWNER_ACTIVATION_BULK_DELIVERY_ENABLED=true` is required before the new bulk action/worker can run.

This register tracks implementation against `HOAHUB_HOMEOWNER_ACTIVATION_EMAIL_AND_BULK_INVITATION_REQUIREMENTS.md`. Because HOAHub already has active tenants and homeowners, items remain pending until their required CI, security, tenant-isolation, scale, and operational deliverability evidence is complete.

## Status legend

- **COMPLETE (CODE)** — implemented on the feature branch; still subject to release gates.
- **IN PROGRESS** — implementation or CI validation is underway.
- **PENDING / BLOCKER** — required before production enablement or merge where stated.
- **OPERATIONAL** — configuration/evidence outside application source code.

## Requirement traceability

| Requirement | Status | Current evidence / implementation | Remaining gate |
|---|---|---|---|
| Requirements/specification documented | COMPLETE (CODE) | Production-safety, deliverability, eligibility, selection, job, progress, security, scale and release requirements documented | Keep this register synchronized |
| Correct first-time eligibility | COMPLETE (CODE) | Never-invited only; already issued/cancelled/activated/disabled records excluded from first-time action | Integration/regression gates |
| Correct first-time KPI/filter | COMPLETE (CODE) | Admin count/filter requires `NOT_INVITED` and no prior `activationSentAt` | UI regression gate |
| Select all eligible on current page | COMPLETE (CODE) | Header client control selects only rendered eligible checkboxes | Browser/UI evidence |
| Select all eligible matching filters | COMPLETE (CODE) | Server calculates eligible filtered count and server resolves final recipient IDs under tenant scope | Confirmation preview + DB tests |
| Duplicate-click protection | COMPLETE (CODE) | Bulk submit control locks after confirmation and shows queueing progress | Browser regression |
| Durable bulk job model | COMPLETE (CODE) | Additive job/item Prisma models plus MySQL migration | Database CI + scale tests |
| Tenant-scoped recipient uniqueness | COMPLETE (CODE) | Unique tenant/job/homeowner item key and tenant-scoped job queries; DB integration test covers cross-tenant invisibility | Concurrency/scale evidence |
| Request idempotency | COMPLETE (CODE) | Tenant + idempotency key uniqueness collapses duplicate queue requests; DB integration test covers duplicate queue collapse | Hash-at-rest improvement recommended |
| Background processing | COMPLETE (CODE) | Existing authenticated email cron worker can drain activation jobs in bounded batches | Worker concurrency/lease test and operational scheduling verification |
| Re-check eligibility immediately before processing | COMPLETE (CODE) | Worker loads tenant homeowner and re-evaluates first-time eligibility before credential creation/send | DB test |
| Avoid automatic duplicate resend after ambiguous worker failure | COMPLETE (CODE) | Ambiguous `PROCESSING` items become manual-review failures rather than being automatically resent | Failure-injection test |
| Persistent progress API | COMPLETE (CODE) | Admin-authenticated tenant-scoped job progress route | API isolation test |
| Persistent progress UI | COMPLETE (CODE) | Polls job state and shows processed/total, provider accepted, queued, skipped and failed/review | Browser evidence |
| Accurate provider-accepted wording | COMPLETE (CODE) | Admin UI no longer claims SMTP acceptance equals mailbox delivery | Delivery webhook remains pending |
| Feature-gated rollout | COMPLETE (CODE) | Queue action and worker are disabled unless production env flag is explicitly enabled | Keep disabled until all gates pass |
| Initial first-time eligibility unit tests | COMPLETE (CODE) | Never invited / already invited / expired / activated / disabled cases | Broader integration tests |
| Secure activation/reset URL metadata redaction | COMPLETE (CODE) | Security-sensitive action URLs are redacted from ordinary notification metadata; only queued billing/reminder metadata keeps action URLs needed by the worker | CI regression gate |
| Legacy individual-send result truthfulness | COMPLETE (CODE) | Single-homeowner activation action treats FAILED/SKIPPED as not accepted and records delivery-not-accepted audit metadata | CI regression gate |
| Detailed confirmation preview by skip reason | COMPLETE (CODE) | Homeowner list shows eligible/already-invited/activated/missing-email/disabled/other-blocked counts for current filters | Browser/UI evidence |
| Explicit resend/reissue workflow | COMPLETE (CODE) | First-time send and reissue use separate server eligibility checks; reissue is explicit, audited, and revokes unused credentials | Browser/UI evidence |
| Raw idempotency key hashing at rest | PENDING HARDENING | Current job schema stores normalized key for uniqueness | Align with billing job pattern using SHA-256 tenant-scoped hash before merge if feasible |
| Job lease release/concurrency proof | PENDING HARDENING | Lease-based claim exists | Add concurrent worker test and ensure lease is released promptly between successful batches |
| 2,000-recipient scale proof | PENDING | Architecture supports filtered job item creation | Add DB-backed scale test |
| 5,000+ recipient scale proof | PENDING / BLOCKER | Bounded worker/job architecture implemented | Add 5,001-recipient creation/processing simulation without real SMTP |
| Retry failed-only without resending successful recipients | COMPLETE (CODE) | Retry route creates a new tenant-scoped job from `FAILED` items only and leaves provider-accepted recipients out of the retry set; DB integration test covers accepted/skipped exclusion | CI pass on MySQL |
| SPF validation | OPERATIONAL / PENDING | Requirements documented | Verify live production DNS against actual provider |
| DKIM validation | OPERATIONAL / PENDING | Requirements documented | Verify selector/key and passing signature |
| DMARC validation/alignment | OPERATIONAL / PENDING | Requirements documented | Verify policy and From-domain alignment |
| Return-Path/bounce-domain validation | OPERATIONAL / PENDING | Requirements documented | Verify with selected production provider |
| Bounce/complaint/delivery callbacks | PENDING | SMTP acceptance currently available | Integrate provider webhooks before claiming delivery/bounce/complaint states |
| Sender reputation monitoring | OPERATIONAL / PENDING | Google Postmaster/provider monitoring required | Configure and capture baseline evidence |
| Controlled canary/warm-up | PENDING / BLOCKER FOR BROAD SEND | Feature remains disabled | Seed test -> small tenant batch -> staged ramp before mass send |
| Required CI gates | IN PROGRESS | Current branch CI is executing; lint, Prisma validate/generate/migrate, seed and unit tests have passed on the current validation run | Complete integration, typecheck, build, browser, Edge/Firefox/Mobile/Canva gates |
| Production merge/deploy | PENDING / BLOCKER | Draft PR only | Do not merge until required blockers/gates are closed |

## Current release decision

**DO NOT MERGE / DO NOT ENABLE BULK DELIVERY YET.**

The architecture and core admin workflow are now staged safely behind a disabled-by-default feature gate. Production enablement remains blocked by dedicated tenant/concurrency/scale regression evidence, completion of all CI gates, and live sender-authentication/deliverability validation.

## Next implementation sequence

1. Close CI failures on the exact branch head until the current code is green.
2. Add database-backed concurrent-worker and 5,001-recipient scale tests.
3. Complete all UI/browser gates.
4. Validate SPF, DKIM, DMARC alignment, Return-Path and provider reputation in production infrastructure.
5. Perform a controlled canary with the bulk feature flag enabled only after evidence is complete.
