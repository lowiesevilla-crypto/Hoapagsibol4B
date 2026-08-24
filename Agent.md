# HOAHub Agent Context

Last updated: 2026-08-24

## Purpose

Repository-level operating contract for AI coding agents and maintainers working on HOAHub. Read this before changing code, schema, workflows, payments, documents, permissions, UI, deployment, or product documentation.

## Current Production Baseline

- Repository: `lowiesevilla-crypto/Hoapagsibol4B`.
- Authoritative application branch: `main`.
- Hosting: Hostinger managed Node.js application connected to GitHub `main`.
- Last user-confirmed runtime production baseline: `1d8b1e665da75786d615e324148ffce1e2833b9c` (`feat: support homeowner advance monthly dues payments (#149)`). Hostinger was shown `Running`, `Auto-deployment`, `Current`, and `Completed` on short commit `1d8b1e66`.
- A later documentation-only commit on `main` is not evidence that a later runtime feature is deployed.
- Always start new implementation from latest `main` unless the user explicitly identifies a different reviewed base.

### Stale PR Safety

PRs #134, #129, and #102 were intentionally closed without merge on 2026-08-23. They are historical only. Do not reopen, auto-merge, blindly cherry-pick, or use their heads as implementation bases. Re-evaluate any still-useful idea against current `main` and current tests.

## Mandatory Documentation Maintenance

`Agent.md` must be updated whenever repository behavior, architecture, permissions, operational rules, deployment behavior, or user-visible workflows change.

The tenant-facing HOAHub User Manual is also a controlled product artifact. For each deployed user-visible feature/fix/enhancement:

1. Update the affected procedures.
2. Update the role/access matrix when permissions or visibility change.
3. Replace obsolete screenshots and add screenshots for materially changed workflows when practical.
4. Keep screenshots tenant-safe and free of secrets/unnecessary personal data.
5. Update revision history and production baseline.
6. Never describe deferred functionality as live.

## Platform and Security Baseline

- HOAHub is a multi-tenant HOA/community SaaS using Next.js App Router, React, TypeScript, Tailwind CSS, Prisma, and MySQL.
- Tenant-owned data must remain tenant-scoped at every UI, API, Server Action, service, cron/job, raw SQL query, cache, storage, export, report, webhook, and AI boundary.
- Authenticated server session context is authoritative. Browser-supplied tenant IDs, roles, account/homeowner IDs, payment state, gateway IDs, return URLs, document ownership, or workflow state are never proof of authority.
- Preserve RBAC, granular permissions, module entitlements, record ownership, CSRF/same-origin checks, session validation, passkeys, account-choice authorization, and safe redirects.
- State-changing financial, approval, publication, refund, forfeiture, payroll, grievance, template-assignment, and destructive operations require server-side validation plus audit/history evidence.
- Never expose production secrets in source, logs, screenshots, browser payloads, AI payloads, docs, or fixtures.
- CI passing is not equivalent to production deployment.

## Roles and Access Structure

### Platform / Control Plane

- `SUPER_ADMIN` — platform-wide authority where explicitly permitted; tenant boundaries still apply.
- `PLATFORM_ADMIN` — platform commercial/operations authority. Platform routes include tenants, plans/features, subscriptions, invoices, agreements, licenses, document usage/template distribution, AI usage metadata, audit/security, and platform profile.
- Platform roles do not automatically inherit tenant payroll, grievance, finance, or resident-record authority.

### Tenant Administration

Tenant administrative access is permission/module scoped. Important domains include Billing, Payments, Documents, Complaints, Payroll/Workforce, AI, Document Repository, and Tenant Settings. UI visibility is not the security boundary; server actions must enforce read/manage/approve authority independently.

### Homeowner

Homeowners access only their authenticated tenant, their own authorized account data, and tenant-public/community content. Billing, payments, SOA, documents, complaints, vehicles, profile, and AI account data remain owner-scoped.

### Employee

Employee portal is separate from Tenant Admin payroll authority. Employees may access only their own authorized profile, attendance/corrections, clocking, payslips, and enabled support/chat functions.

## Current Tenant Admin Functional Structure

- `/admin/dashboard` — executive community/finance snapshot.
- `/admin/actions` — Action Center aggregator; underlying modules remain authoritative.
- `/admin/onboarding` — tenant onboarding and bulk homeowner import.
- `/admin/homeowners` — homeowner master data and digital activation.
- `/admin/contractors` — contractor records/bond context.
- `/admin/vehicles` — vehicle/sticker monitoring.
- `/admin/billing` — Monthly Dues billing records, maintenance, reminders, generation controls.
- `/admin/settings/billing-rules` — effective dues rule and Automatic Billing controls.
- `/admin/settings/billing-exemptions` — exemptions.
- `/admin/settings/payments` — Manual QR vs PayMongo Online tenant payment configuration.
- `/admin/payments/record` — homeowner-first Record Payment including zero-balance advance dues.
- `/admin/payments/requests`, `/active`, `/history`, `/online` — payment review/ledger/gateway operations.
- `/admin/receipts`, `/admin/collections` — receipt and Other Collection/bond authority.
- `/admin/rentals` — Rental Management.
- `/admin/expenses` — expenses/disbursements.
- `/admin/reports`, `/admin/reports/dashboard` — finance reports.
- `/admin/data`, `/admin/data/migrations` — bulk data and opening-balance migration.
- `/admin/documents` — resident document service, request/approval/issue/archive workflows.
- `/admin/settings/document-definitions` — tenant document definition/workflow configuration.
- `/admin/document-management` — association repository, distinct from issued resident documents.
- `/admin/complaints` — complaint operations with separate grievance/verification authority.
- `/admin/announcements`, `/admin/events`, `/admin/chat` — community operations.
- `/admin/workforce`, `/admin/employees`, `/admin/attendance`, `/admin/payroll` — protected workforce/payroll.
- `/admin/ai-copilot`, `/admin/ai-assistance` — governed tenant AI assistance/settings.

## Homeowner Portal

Current major surfaces include `/portal/dashboard`, `/portal/pay`, `/portal/billing`, `/portal/soa`, `/portal/payments`, `/portal/collections`, `/portal/requests`, `/portal/documents`, `/portal/complaints`, `/portal/community`, `/portal/announcements`, `/portal/events`, `/portal/chat`, `/portal/organization`, `/portal/profile`, `/portal/vehicles`, and `/portal/ai` according to tenant modules/entitlements.

Homeowner UI is phone/PWA-first: safe areas, approximately 48px touch targets where practical, no page-level horizontal overflow, reduced-motion support, `100dvh` where appropriate, and private/no-store behavior for authenticated content.

## Monthly Dues Billing

- Effective Billing Rules are authoritative for dues amounts and periods; historical bills keep their resolved snapshots.
- Automatic mode uses the tenant billing day and secured daily scheduler. Catch-up after a missed scheduler day is intentional.
- Automatic generation is idempotent. Existing same-period Monthly Dues bills are skipped using tenant + homeowner + charge type + coverage year/month identity.
- Exempt homeowners are skipped.
- Large communities are processed in bounded batches.
- While the effective rule is AUTOMATIC, manual bulk and individual generation are disabled in UI and blocked server-side. Existing bills may still be maintained through authorized maintenance actions.

## Admin Advance Monthly Dues

- `/admin/payments/record` searches ACTIVE homeowners, including zero-balance homeowners, at database scale.
- Current obligations are applied first; excess or pure advance payment remains unapplied homeowner credit.
- `PaymentAllocation` is authoritative; do not assume one payment equals one bill.
- Future eligible Monthly Dues consume advance credit oldest-due-first without double allocation.
- Pure advances must remain correctable/voidable through ledger-safe handling.

Homeowner self-service future From/To-month advance calculation/payment is still deferred unless a later merged change updates this file.

## Rental Management

- Rental Management is the operational rental entry point; Collection remains cash/receipt authority.
- Assets, renters, agreements, billing, payments, reconciliation, and advance rental credit are tenant scoped.
- Outside renters remain standalone records; do not fabricate homeowner/user records.
- Active agreements generate monthly RENT invoices on each agreement's billing day when tenant automatic billing is enabled.
- Rental invoice generation is duplicate-safe. Advance rental credit applies oldest-due-first.
- Security deposits are refundable liabilities, not rental income.
- Agreement maintenance uses `/admin/rentals/agreements/[id]` rather than a broad inline edit form.

Homeowner rental asset reservation remains deferred unless a later merged change updates this file.

## Collections and Reports

- Collection is authoritative for Other Collections and refundable bonds.
- Refundable bonds remain liabilities until valid refund/forfeiture treatment.
- `/admin/reports` supports tenant From/To date ranges and accounting for dues, credits, other income, expenses/payroll, cash movement, receivables, bonds, rental deposits, and employee loans.
- PDF/DOCX/CSV exports must use the same tenant accounting authority.
- Detailed payment-rail reporting (Admin Cash, PayMongo QR Ph/GCash/Maya, etc.) is still deferred; never infer an authoritative provider rail from a generic method field.

## PayMongo Homeowner Collections

- Each tenant uses either `MANUAL_QR` or `PAYMONGO` for new homeowner payment attempts.
- PayMongo homeowner collections use the platform credential plus tenant Linked Account (`Account-ID`) routing. Tenant admins never see platform secret keys.
- Verified child-scoped webhook or authenticated server-to-server reconciliation is payment authority; browser redirects are presentation only.
- Tenant, homeowner, child account, reference, identifiers, currency, amount, and fee metadata must reconcile before posting.
- HOAHub subscription billing credentials remain separate from homeowner-collection credentials.
- Platform convenience fee routing is platform-controlled; tenant admins cannot alter it.

## Document Platform Architecture

HOAHub has two distinct systems:

1. Resident document service (`/admin/documents`) — `DocumentDefinition`, dynamic fields, workflow, template versions, requests, approvals, generation, verification, release/revocation, and homeowner/office requests.
2. Association Document Repository (`/admin/document-management`) — governance/policy/community files, categories, visibility, revisions, quota, upload/download controls.

Resident document invariants:

- `DocumentDefinition` is tenant scoped and is the authoritative configurable document rule.
- `DocumentTemplateSet` and `DocumentTemplateVersion` are tenant scoped. Published versions are immutable historical artifacts; new edits occur through new versions.
- Requests snapshot definition/template data so later template upgrades do not rewrite historical requests or issued `DocumentVersion` output.
- A requestable definition must be active, complete, have a valid PUBLISHED assigned template, and satisfy numbering/QR/workflow requirements.
- QR verification uses server-generated verification tokens/URLs/codes; browser input cannot manufacture validity.
- Tenant admins may configure definition fields, workflow, approver, payment policy, balance/release policy, validity, signatory, and tenant template versions according to Document permissions.

## Platform Free Professional Document Template Library

Implementation branch: `feat/platform-free-document-template-library-20260823`. This section becomes production baseline only after the exact branch head is green, merged, and deployment is confirmed.

Platform route: `/platform/document-management/templates`.

Library package version: `v2`.

The platform library provides these eleven professional starting documents:

- Certificate of Residency
- Certificate of Indigency
- Certificate of Good Standing
- Clearance Certificate
- Payment Certification
- Construction Bond Certification
- Contractor Bond Certification
- Gate Pass
- Move-In Pass
- Move-Out Pass
- Work Permit

Approved visual/functional standard:

- Certificate of Residency, Certificate of Indigency, Certificate of Good Standing, Clearance Certificate, Payment Certification, Construction Bond Certification, and Contractor Bond Certification use formal legal/institutional A4 layouts with a restrained navy/gold identity, structured information/status panels, official numbering, signature area, security text, watermarking, and QR validation.
- Certificate typography prioritizes print readability: legal headings use Georgia/Times New Roman where appropriate, operational labels use Arial, the library enforces a 7pt minimum for intentionally rendered legal/permit text, and principal body/certification text is generally 10.5pt or larger.
- Good Standing and Clearance use prominent status bands; Payment Certification has an account/payment-detail panel; construction/contractor bond certifications have structured compliance-record panels.
- Gate Pass, Move-In Pass, and Move-Out Pass reuse the reviewed professional two-copy A4 operational layouts for Security/Holder use and QR validation.
- Work Permit is an operational A4 authorization containing permit number, property/requestor, contractor/work lead, approved date/time, approved work scope/location, vehicle/tools/material information, permit conditions, authorization/signatory, and QR validation.
- Library field keys must map to the existing generation runtime. Gate driver/representative uses `representativeName`; Move-In/Move-Out provider data uses `contractorDetails`; item/material text uses `items` so the runtime resolves `request.itemsSummary` correctly.

Assignment contract:

1. Platform Admin explicitly selects the target tenant. Cross-tenant bulk assignment without explicit target is prohibited.
2. Templates are professional A4 layouts with official document numbering and QR verification. Gate/Move passes use the reviewed two-copy A4 pass layouts; Work Permit uses a dedicated operational authorization layout.
3. Library assignments use `DocumentTemplateOwnership.TENANT` and an editable `DocumentTemplateSet`. They are **not** immutable CERTIFIED templates. This is intentional: after assignment, authorized tenant administrators may continue configuring the Document Definition, workflow, approver, fee/payment settings, policies, signatory, fields, and create/edit later tenant template versions.
4. The Platform Admin UI offers `Apply recommended workflow`. When checked, the library installs/refreshes the recommended Approval Required starting workflow. When cleared, an existing tenant workflow is preserved. If the definition has no usable workflow, a safe approval workflow is still created so assignment does not leave an incomplete request path.
5. Existing tenant fields are preserved. Library assignment adds only missing recommended fields; it does not delete tenant fields or historical field evidence.
6. If the same document identity already exists, use that tenant definition rather than silently creating a duplicate. Ambiguous duplicate identity fails closed for manual resolution.
7. On a real template upgrade, create a new PUBLISHED tenant-editable library version, atomically assign it, and retire only the previously assigned PUBLISHED template version. Do not delete old versions.
8. Existing `DocumentRequest` and `DocumentVersion` records are never mass-rewritten during assignment. Their snapshots remain historical authority.
9. Full-library assignment runs in one tenant-scoped Serializable transaction; any unsafe template/identity failure rolls back the entire all-template assignment.
10. All assignment/upgrade operations are audited with source, library version, template version, workflow choice, retired version, and field additions.
11. Default library workflow has zero document fee, but the tenant may later configure the definition/workflow according to normal tenant authority. Platform assignment is a starting configuration, not permanent ownership of tenant policy.
12. Template packages must validate through `validateTemplateDefinition`; QR-enabled definitions require sequence-based numbering. Library templates avoid mandatory preconfigured signatory dependency so assignment does not fail for a tenant that has not yet configured officers; tenant signatory can be configured afterward.
13. Do not reduce font sizes merely to force content to fit. Preserve the approved readability floor, use layout/spacing changes instead, and keep body text suitable for printed A4 output.

Primary regression surface:

- `lib/services/platform-document-template-catalog.ts`
- `lib/services/platform-document-template-library.ts`
- `lib/actions/platform-document-template-library.ts`
- `app/platform/document-management/templates/page.tsx`
- `app/platform/document-management/page.tsx`
- `tests/unit/platform-document-template-library.test.ts`

Do not replace this safe clone/version model with shared mutable cross-tenant rows. Do not make assigned library templates read-only unless product requirements explicitly change.

## Complaint / Grievance

Complaint remains the intake/operational layer; formal grievance, verification, committee/identity, deadlines, and evidence controls remain separate. Anonymous/confidential data must preserve privacy and tenant boundaries. Platform roles do not automatically inherit tenant grievance authority.

## Workforce / Payroll

Payroll, salary, deductions, loans/cash advances, corrections, and payslips are confidential tenant data. Employee portal access does not imply payroll administration. Finalization/paid state remains server-authoritative and auditable.

### Payroll Requirement Traceability

- Canonical human-readable requirements: `docs/payroll/PAYROLL_REQUIREMENTS.md`.
- Canonical machine-readable implementation ledger: `docs/payroll/PAYROLL_IMPLEMENTATION_STATUS.json`.
- Controlled statuses are `NOT_STARTED`, `IN_PROGRESS`, `BLOCKED`, `IMPLEMENTED`, `VERIFIED`, and `DEFERRED`. Only `VERIFIED` means the requirement is complete with linked exact-head acceptance evidence.
- Every payroll implementation task and every payroll function added or materially changed by the payroll initiative must map to stable `PAY-*` requirement IDs. Changed payroll functions must include nearby `@requirement` and `@status` tags.
- AI agents must read and update the payroll implementation ledger in the same change whenever implementation status, blockers, code paths, or evidence change. Never infer `VERIFIED` from code presence alone.
- Payroll records created by Server Actions must explicitly carry the authenticated tenant ID where the schema permits it; do not rely on static/default tenant values for new payroll, payslip, overtime, loan, deduction, access, calendar, schedule, or archive data.
- Opaque payroll/employee/attendance/loan/deduction/schedule IDs must be resolved under authenticated tenant scope before mutation.
- `LEGACY_COMPATIBILITY_POLICY` in `lib/services/payroll.ts` exists only to preserve pre-existing behavior while effective-dated policies are being implemented. Its values are not an assertion of current Philippine statutory law.
- Effective-dated employee compensation/pay-frequency/attendance policy persistence, expanded lifecycle/corrections, effective-dated statutory tables, and idempotent Financial Engine posting/outbox remain incomplete until their registry entries become `VERIFIED`.

## AI Governance

AI is commercially/governance/permission controlled. Staff Copilot is tenant scoped and permission scoped; homeowner AI may use approved knowledge plus only that homeowner's authorized data. AI may draft/explain but is not final approval, publication, payment, or grievance authority unless a separately authorized workflow explicitly exists.

## Authentication and Protected Navigation

- `https://hoahub.tech/login` is the universal login boundary.
- Multi-account identities use signed, short-lived server-controlled account-choice state and revalidation before session creation.
- Protected Admin/Platform/Homeowner/Employee surfaces re-establish server authority after history restoration.
- Logout remains server-authoritative; GET must not mutate session state.
- Sensitive authenticated content remains private/no-store.

## Hostinger Production Deployment

- Feature branches are not production targets.
- Runtime changes merge to `main` only after exact-head applicable CI passes.
- Hostinger managed GitHub deployment is authoritative; Node.js production runtime is 22.x.
- `public/release.txt` is the release marker when stamped by the managed pipeline.
- Never expose production `.env` values.
- Production is confirmed separately from CI. A user screenshot showing expected commit `Current` + `Completed` is valid deployment evidence, but not authenticated UAT unless the workflow was actually exercised.

## Standard Exact-Head Release Gate

Applicable runtime candidates should pass dependency install/lockfile, lint, Prisma validate/generate/migrate, seed, unit/integration/security/finance verification, typecheck, production build, controlled Chromium, production smoke/critical browser tests, and Canva Visual Parity for UI initiatives. A passing older SHA is not evidence for a changed head.

## Change Discipline

1. Fetch latest `main` before implementation.
2. Read this file.
3. Review authorization, tenant scope, accounting, workflow, and historical-data boundaries relevant to the change.
4. Never use stale closed PR branches as base.
5. Add/update regression tests.
6. Preserve finance/document idempotency and audit evidence.
7. Update `Agent.md` and the User Manual for user-visible deployed changes.
8. Run exact-head CI.
9. Merge only a passing candidate.
10. Verify production separately.
11. Never report deferred functionality as live.

## Current Deferred / Planned Scope

Unless a later merged change updates this file, these remain pending:

- Homeowner self-service advance Monthly Dues by selecting future From/To months with server-calculated effective Billing Rules.
- Detailed finance reporting by successful payment posting path/provider rail.
- Homeowner rental asset browsing/reservation with concurrency-safe ownership and Admin reserved-homeowner visibility.
- Payroll effective-dated compensation/pay-frequency/attendance policy persistence, expanded correction/revision lifecycle, verified statutory rule sets, and idempotent Financial Engine posting/outbox while their payroll registry entries are not `VERIFIED`.
- Any issue/task/old-PR requirement not present in current `main` merely because it exists in documentation or conversation.

### Effective-Dated Employee Payroll Configuration

Implementation task: `PAY-TASK-004`.

- `EmployeeCompensation` is the payroll-history authority for employee compensation terms. Compensation basis, pay frequency and attendance policy are independent fields; do not re-collapse them into legacy `SalaryType`.
- Existing `EmployeeProfile.salaryType`, `baseRate`, `standardWorkDays`, `fixedAllowance`, and `fixedDeduction` remain compatibility mirrors during migration. New payroll calculations must resolve `EmployeeCompensation` first.
- Payroll configuration edits create a new effective-dated version and close the prior version. Do not update historical compensation rows in place.
- New configuration effective dates must not overlap finalized/paid payroll history for that employee.
- Payroll resolves the configuration effective on the cutoff end date and stores `Payslip.compensationId` plus `Payslip.compensationSnapshot`. Later master-data changes must not mutate that snapshot.
- Pre-migration payslips are legacy historical evidence and are not mass-rewritten by the compensation backfill.
- `NOT_REQUIRED` and `EXCEPTION_ONLY` attendance policies are supported only for monthly/fixed-per-period compensation in the current implementation; Daily and Hourly require attendance.
- This configuration foundation is not a statutory-rate engine. `PAY-STAT-001` remains separately blocked until authoritative Philippine rule tables/effective dates are verified and persisted.
