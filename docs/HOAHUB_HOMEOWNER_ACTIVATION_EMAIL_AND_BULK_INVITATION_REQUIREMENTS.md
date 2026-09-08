# HOAHub Homeowner Activation Email & Bulk Invitation Requirements

Status: Approved for safe implementation
Owner: HOAHub Product / Engineering
Scope: Multi-tenant homeowner digital activation and email delivery
Production constraint: Existing tenants and homeowners are actively using the platform. All changes must be backward-compatible, tenant-isolated, observable, idempotent, and releasable through existing CI/release gates.

## 1. Objectives

1. Improve homeowner activation email deliverability and reduce spam-folder placement.
2. Correct first-time invitation eligibility so already-invited or activated homeowners are not unintentionally re-issued activation credentials.
3. Add safe bulk selection: select eligible homeowners on the current page and select all eligible homeowners matching the active filters.
4. Replace request-bound mass activation sending with a persistent background job and progress tracking.
5. Make bulk delivery idempotent and tenant-safe, including retries, double-click protection, and multiple-admin concurrency protection.
6. Improve email delivery status semantics and auditability.
7. Prevent secure activation/reset tokens or full credentials from being persisted in ordinary logs/metadata.
8. Preserve all existing homeowner activation, billing, payment, document, and tenant-isolation behavior.

## 2. Production safety requirements

- No destructive migration.
- No cross-tenant reads, writes, queue claims, or recipient selection.
- Existing single-recipient activation and resend flows must continue to work.
- Existing activation links issued before deployment must remain valid unless explicitly re-issued by an authorized administrator.
- Bulk jobs must survive page refresh/navigation and must not depend on a browser request remaining open.
- Repeated submission of the same operation must not produce duplicate activation emails.
- A failed or retried job must never resend recipients already successfully processed by that same job.
- Any rollout must be reversible without data loss.

## 3. Email deliverability requirements

### 3.1 Infrastructure / DNS validation

Before broad production rollout, validate the active production sending domain and provider for:

- SPF alignment.
- DKIM signing.
- DMARC record and alignment.
- TLS.
- Provider-supported Return-Path / bounce domain.
- Provider reputation, bounce, and complaint visibility.
- Google Postmaster Tools or equivalent reputation monitoring where applicable.

Recommended target architecture: use a stable authenticated transactional sending subdomain such as `notify.hoahub.tech`, with tenant branding in the display name/content while keeping the authenticated sender domain consistent.

### 3.2 Provider architecture

The application email abstraction must remain provider-neutral. HOAHub may continue supporting SMTP, but production high-volume activation delivery should be compatible with a transactional email provider that supports bounce/complaint/delivery callbacks.

### 3.3 Delivery state semantics

Do not treat SMTP/provider acceptance as mailbox delivery. UI/audit states must distinguish, where the provider allows:

- QUEUED
- PROCESSING
- PROVIDER_ACCEPTED / SENT
- DELIVERED
- SKIPPED
- DEFERRED / RETRYING
- BOUNCED
- COMPLAINED
- FAILED

If the active provider does not expose mailbox delivery, the UI must not claim `Delivered`.

## 4. First-time invitation eligibility

A homeowner is eligible for a first-time activation invitation only when all are true:

- Same authenticated tenant.
- Homeowner operational status is ACTIVE.
- Digital user is active.
- A valid contact email is registered.
- A valid HOAHub homeowner account number exists.
- The homeowner has never completed digital activation.
- The homeowner is not disabled/cancelled.
- The homeowner does not currently have a valid, unexpired activation invitation that was already sent.

Already-invited homeowners must not be labeled or counted as `Eligible for First-Time Activation` while their invitation is active.

### 4.1 Resend eligibility

Resend/reissue must be a separate explicit operation. It may be allowed for expired, failed, cancelled, or otherwise administratively reissued activation invitations. Reissue can revoke prior unused credentials, so it must never happen as a side effect of a normal `first-time bulk send`.

## 5. Bulk selection UX

### 5.1 Select current page

Add a table-header checkbox/action that selects all eligible homeowners on the current page only. Ineligible rows remain unselected and visible with the reason.

### 5.2 Select all matching filters

After current-page selection, provide an explicit option to select all eligible homeowners matching the current server-side filters. The server must resolve the final recipient set; the browser must not submit thousands of trusted homeowner IDs.

Selection context must include the current tenant and filter snapshot (search, operational status, digital status, and any supported eligibility mode). Changing filters clears global selection.

### 5.3 Confirmation preview

Before starting a global bulk job, show server-calculated totals:

- Matching homeowners.
- Eligible new invitations.
- Already invited/unexpired skipped.
- Activated skipped.
- Missing/invalid email skipped.
- Disabled/inactive skipped.

The confirmation must identify the tenant and selected scope.

## 6. Background bulk job

Create a persistent tenant-scoped bulk activation job. Recommended fields:

- id
- tenantId
- initiatedById
- status
- mode/scope
- filterSnapshot
- totalTargets
- eligibleCount
- queuedCount
- processedCount
- acceptedCount
- skippedCount
- failedCount
- startedAt
- completedAt
- idempotencyKey
- createdAt / updatedAt

Each recipient operation must be represented by a tenant-scoped job recipient/item record or equivalent durable unique claim that prevents duplicate processing.

### 6.1 Worker behavior

- Resolve/claim a bounded batch.
- Re-check tenant and current eligibility immediately before processing.
- Generate secure activation credential/token only when that recipient is being processed.
- Send/queue the email.
- Persist recipient outcome and job counters.
- Continue until complete or paused by provider circuit/retry policy.
- Do not keep a web request open for the whole job.

### 6.2 Progress UI

Display persistent progress, for example:

- Progress percentage.
- Processed / total.
- Accepted/sent.
- Skipped.
- Failed.
- Current job state.
- Start/completion timestamps.
- Details/retry option for failures.

Progress must survive refresh/navigation. Polling every few seconds is acceptable; WebSockets are not required.

## 7. Idempotency and concurrency

- Disable the submit/confirm control immediately when accepted.
- Generate/use a server-side idempotency key for each bulk request.
- Enforce a database uniqueness rule for job recipient processing.
- Prevent multiple active equivalent jobs from sending duplicate invitations for the same tenant/scope.
- Retrying a job processes only retryable failed/unprocessed items.
- Successfully processed items are immutable for that job.

## 8. Security and logging

- Never store raw activation verification tokens, password reset tokens, temporary passwords, or full account numbers in normal logs/audit metadata.
- Do not persist token-bearing activation/reset URLs in notification metadata.
- Store only safe correlation IDs, hashes/fingerprints, masked identifiers, and non-sensitive action metadata.
- Preserve existing recipient masking and suppression logic.

## 9. Multi-tenant isolation

Every query, count, job, recipient item, log, status endpoint, retry, cancel, and worker claim must be constrained by tenantId. Job IDs alone must never authorize access across tenants.

## 10. Scale targets

Validate at minimum:

- 100-recipient page selection.
- 2,000-recipient tenant batch.
- 5,000+ homeowner tenant simulation.
- No request timeout while a background job is running.
- Accurate counter reconciliation.
- Bounded provider throughput and retry behavior.

## 11. Required automated tests

1. First-time eligibility excludes active unexpired invitations.
2. Explicit resend remains available where allowed.
3. Select current page includes eligible rows only.
4. Select-all-filtered is resolved server-side and tenant-scoped.
5. Cross-tenant IDs/filters cannot enter a job.
6. Duplicate submission creates one effective job/send set.
7. Concurrent workers cannot process the same recipient twice.
8. Retry does not resend successful recipients.
9. Failed provider responses do not increment successful/accepted counters.
10. Secure activation/reset URLs and tokens are absent from ordinary persisted metadata/log output.
11. Existing individual activation flow remains functional.
12. 5,000-recipient scale test completes through bounded batches without request timeout.

## 12. Release gates

Do not merge/deploy unless:

- Lint passes.
- Typecheck passes.
- Unit/integration tests pass.
- Relevant homeowner activation E2E passes.
- Tenant-isolation tests pass.
- Scale/idempotency tests pass.
- Migration is additive/backward-compatible.
- Production DNS/provider authentication is validated separately before broad send rollout.
- Canary/controlled initial batch is performed before mass invitation.

## 13. Implementation phases

### Phase A - application correctness and security
- Fix first-time eligibility.
- Fix activation email result accounting.
- Remove token-bearing URLs from persisted ordinary notification metadata.
- Add regression tests.

### Phase B - durable bulk processing
- Add persistent tenant-scoped job + recipient model.
- Add idempotent worker/processor.
- Add status/progress endpoint.
- Add scale/concurrency tests.

### Phase C - admin UX
- Add select-all-current-page.
- Add select-all-matching-filters.
- Add confirmation preview.
- Add persistent progress UI and failure summary.

### Phase D - deliverability operations
- Validate production SPF/DKIM/DMARC/Return-Path.
- Configure reputation monitoring.
- Integrate delivery/bounce/complaint callbacks when supported by provider.
- Warm up high-volume sender gradually.

## 14. Definition of done

This requirement is complete when a tenant administrator can safely select all eligible first-time homeowner activation recipients, start one idempotent background job, leave/refresh the page, return to accurate progress, and complete large-tenant delivery without duplicate sends, cross-tenant leakage, misleading delivery status, or token exposure in ordinary logs/metadata; and production sender authentication has been validated for broad rollout.
