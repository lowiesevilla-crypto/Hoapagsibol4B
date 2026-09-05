# HOAHub P0 Email Delivery Safety Hotfix

**Status:** Implementation in progress  
**Priority:** P0 / production safety  
**Requested:** 2026-09-05  
**Production constraint:** HOAHub already has active tenants. Changes must preserve tenant isolation, billing persistence, authentication security, and existing business records. Merge is prohibited unless all required CI gates pass on the exact PR head.

## 1. Incident context and assessment

The configured transactional mailbox was temporarily suspended by the email provider after suspicious outbound activity. Repository review found application behaviors capable of increasing sender-risk even though repository evidence alone cannot prove the provider's exact suspension cause.

Confirmed application risks before this hotfix:

- HOAHub intentionally uses `@no-email.hoahub.invalid` internal placeholder addresses for homeowners without a contact email. Activation eligibility recognizes those placeholders, but Monthly Billing previously passed `homeowner.user.email` directly to the central sender.
- Monthly Billing used batches of 50 notification operations with `Promise.all`, allowing a billing event to create a burst of SMTP attempts.
- The central SMTP sender had no universal recipient safety preflight, hard-bounce suppression, or provider-wide circuit breaker.
- A permanently rejected recipient could be attempted again by later notification events because delivery failure did not create durable suppression state.
- Platform subscription invoice email used a separate direct Nodemailer path, bypassing any protection added only to the normal notification service.
- Notification logs already provide a durable `QUEUED/SENT/FAILED/SKIPPED` record and are reused by this hotfix to avoid a risky production schema migration.

## 2. Mandatory requirements

### EMAIL-SAFE-001 — Zero SMTP for known-invalid recipients

Before any SMTP transport is created, the delivery gateway must normalize and validate the recipient. It must skip SMTP entirely for:

- missing addresses;
- malformed addresses;
- control characters or whitespace injection;
- HOAHub internal `@no-email.hoahub.invalid` placeholders;
- reserved non-deliverable domains such as `.invalid`, `.test`, `.example`, and `.localhost`;
- addresses already persistently suppressed after a permanent recipient rejection.

The application must not use SMTP `VRFY` or mailbox-probing as an address-validation technique.

### EMAIL-SAFE-002 — Permanent rejection suppression

A recipient-specific permanent SMTP rejection such as `5.1.1 user unknown`, `no such user`, or equivalent hard recipient rejection must create a tenant-scoped suppression record. Later automatic delivery to the same normalized-address fingerprint must be skipped without contacting SMTP.

Suppression audit data must store only privacy-safe information: recipient fingerprint, masked address, failure category/code, and bounded provider response detail. Raw recipient addresses must not be copied into new audit metadata.

### EMAIL-SAFE-003 — Provider circuit breaker

Provider-wide conditions must stop additional SMTP attempts rather than allowing the current job to continue through the recipient population. Circuit-triggering conditions include:

- SMTP authentication failure;
- mailbox/account suspension or outbound sending disabled;
- sender identity rejection/configuration failure;
- provider quota or sending-limit rejection;
- provider rate-limit/spam-policy rejection.

The circuit is tenant/mail-configuration scoped, persisted in the Audit Log, and has a bounded retry-after window. A successful administrator SMTP verification explicitly closes the circuit.

### EMAIL-SAFE-004 — Billing and reminder decoupling

`BILLING_NOTIFICATION` and `BILL_REMINDER` must no longer call SMTP inside bill generation, automatic billing, manual billing, or daily reminder persistence paths. Those paths may create durable notification records only.

Financial persistence must remain successful even when the email provider is unavailable.

### EMAIL-SAFE-005 — Serialized, paced bulk delivery

Bulk queue processing must be sequential at the SMTP boundary and must not recreate the previous 50-concurrent-send behavior. Worker controls:

- per-tenant batch size: default `25`, allowed `1..100`;
- minimum delay between bulk SMTP attempts: default `500 ms`, allowed `0..5000 ms`;
- maximum temporary-failure attempts: `3` with exponential backoff;
- provider-circuit detection stops the tenant worker immediately and leaves untouched rows queued.

### EMAIL-SAFE-006 — Fail-closed production rollout

`EMAIL_BULK_DELIVERY_ENABLED` defaults to `false` and bulk billing/reminder SMTP delivery remains disabled after code deployment until the mailbox is restored and a controlled canary is approved.

Queue creation remains active while delivery is disabled so business events are not lost.

### EMAIL-SAFE-007 — Security-sensitive email remains immediate

Password reset, homeowner activation, and similar security-sensitive messages continue to request immediate delivery because delayed delivery can invalidate security semantics. They still pass through recipient validation, suppression, serialized SMTP, and provider circuit protection.

Security-sensitive failed messages are not automatically retried from the bulk queue. Existing password-reset behavior that invalidates a reset token when delivery fails must remain intact.

### EMAIL-SAFE-008 — Platform invoice centralization

Platform subscription invoice email must not import or create Nodemailer transports directly. Each recipient must be passed sequentially through the same protected raw-email gateway. Invalid/suppressed recipients are skipped and a provider circuit stops subsequent recipients.

### EMAIL-SAFE-009 — Privacy-safe delivery observability

New delivery-safety audit records must not expose full email addresses or SMTP credentials. Platform invoice audit metadata must use masked recipient values/counts rather than raw recipient addresses. Scheduler output must remain aggregate-only.

### EMAIL-SAFE-010 — Multi-tenant isolation

Every queue read/update, suppression lookup, provider-circuit lookup, and delivery operation must include the target `tenantId`. The privileged platform Prisma client may be used only for explicit tenant-scoped safety/audit records and cross-tenant scheduler enumeration. Tenant queue processing must execute inside `runWithTenant`.

### EMAIL-SAFE-011 — Protected scheduler

A dedicated authenticated cron endpoint drains the email queue in controlled batches. The production GitHub Actions scheduler calls only the protected endpoint using the existing production `CRON_SECRET` and logs aggregate counts only.

### EMAIL-SAFE-012 — Release governance

- Start from current `main`.
- No destructive production-data test.
- Do not weaken CI or security controls to obtain a pass.
- Inspect every failed CI job/step, fix the root cause, push a new head, and rerun.
- Merge only the exact head SHA that passed all required gates.
- After merge, verify the merged `main` release and public/managed production health before enabling bulk email.

## 3. Implementation design

### Central safety gateway

`lib/services/email-delivery-safety.ts` contains pure recipient validation, address fingerprinting/masking, and SMTP failure classification.

`lib/services/notifications.ts` is the only module allowed to create a Nodemailer SMTP transport after this hotfix. It adds:

- recipient preflight before SMTP;
- durable hard-recipient suppression using tenant-scoped Audit Log records;
- provider circuit state using tenant-scoped Audit Log records;
- serialized SMTP access;
- durable queue behavior for billing notifications/reminders;
- bounded bulk retry/backoff;
- fail-closed delivery enablement;
- administrator verification that closes a recovered provider circuit.

### Durable queue without a production migration

The existing `NotificationLog` is deliberately reused as the first protected outbox implementation:

`QUEUED -> SENT`

`QUEUED -> SKIPPED` for invalid/suppressed/inactive recipients

`QUEUED -> QUEUED` with bounded `nextAttemptAt` for temporary failures

`QUEUED -> FAILED` after retry exhaustion or non-retryable failure

Provider-wide failure stops the worker and leaves remaining records `QUEUED`.

This avoids introducing a database migration during an email-provider incident affecting active tenants.

### Production controls

```text
EMAIL_BULK_DELIVERY_ENABLED=false
EMAIL_DELIVERY_BATCH_SIZE=25
EMAIL_DELIVERY_MIN_INTERVAL_MS=500
```

`EMAIL_BULK_DELIVERY_ENABLED=true` must not be configured until the rollout checklist below is approved.

## 4. Required regression evidence

CI/unit coverage must prove at minimum:

1. Normal valid recipients pass normalization.
2. `@no-email.hoahub.invalid` is rejected before SMTP.
3. Malformed and reserved non-deliverable domains fail closed.
4. Authentication, suspension, and provider rate-limit errors classify as provider-circuit failures.
5. `5.1.1`/user-unknown errors classify as permanent recipient failures.
6. Temporary 4xx/timeout errors classify as temporary.
7. Billing/reminder notification types return durable queue records instead of calling SMTP inline.
8. Platform invoice service has no direct Nodemailer import and uses the protected gateway.
9. Queue worker is tenant-scoped and the production scheduler targets the authenticated email-delivery endpoint.
10. Existing billing, authentication, document, browser, responsive, and MySQL gates remain green.

## 5. Production rollout checklist

Do **not** enable bulk SMTP merely because the code is merged.

1. Merge only after exact-head CI is green.
2. Confirm the merged `main` deployment is healthy.
3. Keep `EMAIL_BULK_DELIVERY_ENABLED=false`.
4. Have the provider restore/unsuspend the mailbox and confirm credentials/sender authorization.
5. In HOAHub Mail Settings, run **Verify Connection**. Successful verification closes any provider circuit.
6. Send a small controlled canary to one to three known-valid authorized recipients.
7. Confirm no new provider suspension/rate-limit response and review aggregate email safety audit status.
8. Only then set `EMAIL_BULK_DELIVERY_ENABLED=true`.
9. Start with the default 25-record per-tenant worker batch and 500 ms pacing. Do not increase throughput until provider limits and delivery health are verified.
10. Monitor hard recipient suppressions and correct homeowner email data instead of repeatedly retrying bad addresses.

## 6. Rollback / containment

If provider risk reappears:

- set `EMAIL_BULK_DELIVERY_ENABLED=false` immediately; queued billing/reminder records remain durable;
- provider-circuit failures automatically stop additional SMTP attempts for the affected configuration;
- do not delete queued notifications or homeowner records;
- restore SMTP only after the mailbox/provider issue is corrected and Verify Connection succeeds.

Financial billing generation, collections, documents, authentication data, and tenant records must never be rolled back merely to stop email delivery.

## 7. Deferred follow-up after P0 containment

The P0 design intentionally minimizes production schema change. Future controlled enhancements may add a dedicated recipient-delivery-state table, administrative email-health dashboard, bounce/webhook ingestion where supported by the chosen transactional provider, richer event-key idempotency, and a non-sending aggregate hygiene report across existing homeowner data. Those follow-ups must preserve the P0 zero-SMTP, suppression, circuit-breaker, tenant-isolation, and fail-closed guarantees.
