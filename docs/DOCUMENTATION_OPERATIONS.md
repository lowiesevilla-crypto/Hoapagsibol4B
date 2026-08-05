# HOAHub Documentation Module Operating Standard

**Owner:** HOA Operations / Document Administrator  
**Last reviewed:** August 5, 2026  
**Applies to:** Tenant administrators, document officers, finance reviewers, support personnel, and authorized homeowners

This standard defines how a tenant configures, operates, monitors, exports, recovers, and supports the HOAHub Documentation module. The application remains the implementation authority. Use the in-product **Document Operations Command Center**, **Administrator Runbook**, and **Homeowner Document Request Guide** for daily execution.

## Production readiness

A tenant must not declare a document type production-ready while its readiness result is **Blocking**. Before accepting live requests, verify:

- the definition is active and not archived;
- a published template version is assigned;
- numbering includes a sequence token;
- required workflow and approver settings are configured;
- an active signatory is assigned when the document requires one;
- document fees, receipt rules, and payment instructions are internally consistent;
- request fields and subject rules are complete;
- homeowner visibility and download policy are intentional;
- the tenant's balance policy and permitted override behavior are approved.

Warnings require an administrator decision and should be recorded in the tenant's operating procedure.

## Daily operations

1. Open `/admin/documents/operations`.
2. Resolve blocking readiness items before processing affected document types.
3. Review new submissions, payment-pending, approval/review, generation-pending, returned, and issued queues.
4. Prioritize requests in the 4–7 day and 8+ day aging bands.
5. Record clear remarks for correction, rejection, exceptional balance override, revocation, reissue, and archive actions.
6. Inspect stale generation attempts and correct the underlying configuration before retrying.
7. Confirm the immutable issued version, document number, verification state, and release state before delivery.

## Lifecycle controls

- Do not create duplicate requests to bypass a failed generation attempt.
- Do not manually edit generated output outside the official lifecycle.
- Use correction/resubmission for homeowner data changes.
- Use retry only after resolving a generation blocker.
- Use revoke/reissue for official corrections after issuance.
- Archive does not delete immutable versions, payment records, verification history, or audit evidence.
- Public verification must expose authenticity information only, never private request data.

## Operational export

The administrator CSV export is tenant-scoped, authenticated, bounded to 10,000 rows, and supports search, date, status, type, and origin filters. It excludes passwords, sessions, storage paths, generated document content, private verification tokens, and unrelated tenant records.

Exports may contain homeowner, property, account, payment, and lifecycle data. Store and transmit them under the HOA's approved privacy and retention controls.

## Incident and recovery data

For an operational or support escalation, capture:

- tenant name;
- request reference and document number;
- current request and version status;
- latest generation state, failure code, and correlation ID when available;
- expected and actual result;
- actor and exact date/time;
- steps already taken.

Do not include passwords, session cookies, database credentials, private verification tokens, or full generated document content in unsecured support channels.

## Homeowner support

Homeowners use `/portal/documents/guide` for request, household-member, payment, correction, status, balance, download, and verification guidance. Support personnel should ask for the public request reference, not account credentials.

Escalate when profile/property data is incorrect, an eligible household member cannot be selected, payment remains unreviewed, correction remarks are unclear, generation remains failed or stale, or a released document contains incorrect official information.

## Validation evidence

A Documentation-module release is complete only when the disposable-MySQL pipeline passes lint, Prisma validation/generation/migrations/seed, unit tests, database integration tests, critical verification, typecheck, production build, smoke tests, and browser UAT. Browser UAT must include administrator readiness and export, homeowner guidance and self-service, authorized document download, unauthorized administrator-export denial, and secondary-tenant isolation.
