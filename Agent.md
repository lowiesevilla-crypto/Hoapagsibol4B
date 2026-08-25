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

Employee portal is separate from Tenant Admin payroll authority. Employees may access only their own authorized profile, attendance/corrections, clocking, overtime, leave, paid payslips, loans/cash advances, and enabled support/chat functions.

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
- `/admin/petty-cash` — separately entitled Petty Cash Voucher register/create/print workflow when included in the tenant plan.
- `/admin/reports`, `/admin/reports/dashboard` — finance reports.
- `/admin/data`, `/admin/data/migrations` — bulk data and opening-balance migration.
- `/admin/documents` — resident document service, request/approval/issue/archive workflows.
- `/admin/settings/document-definitions` — tenant document definition/workflow configuration.
- `/admin/document-management` — association repository, distinct from issued resident documents.
- `/admin/complaints` — complaint operations with separate grievance/verification authority.
- `/admin/announcements`, `/admin/events`, `/admin/chat` — community operations.
- `/admin/workforce`, `/admin/employees`, `/admin/attendance`, `/admin/leave`, `/admin/payroll` — protected workforce/payroll.
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

## Petty Cash Voucher Candidate

Implementation branch: `feat/petty-cash-voucher-urgent-fixes-20260824`. This section describes that candidate and becomes production baseline only after exact-head verification, merge, deployment, and UAT confirmation.

- Commercial feature code is `PETTY_CASH_VOUCHER`. Platform Plan create/edit has a Petty Cash Voucher checkbox; tenant route/navigation access requires the Billing module, `EXPENSES_MANAGE`, and the feature entitlement. Direct route access must fail closed when not entitled.
- Tenant `ExpenseCategory` is the Particular authority. `Other` persists/reactivates the entered Particular as a reusable tenant expense type.
- Payee types are Employee, Homeowner, Renter, Contractor, and Other. Directory lookups are tenant-scoped; saved address populates automatically, while a missing address may be typed. `Received By` follows the resolved payee name.
- Voucher identity is tenant/year sequenced as `PCV-YYYY-######`; vouchers support multiple Particular/Amount rows and a computed total.
- Approved By may be the authenticated Admin or an active tenant Organization Officer. Homeowner-facing Organization/Community pages must never expose stored officer signature images.
- Each voucher line posts an ordinary tenant-scoped `Expense` in the same transaction, linked by voucher/reference number. Petty Cash must not create a competing Financial Engine path for payroll repayment.
- `Employee Cash Advance` requires Payroll + Loans, an active employee, and configured deduction-per-cutoff. Voucher creation creates the linked `EmployeeLoan` and stores its schedule.
- `lib/petty-cash/payroll-integration.ts` materializes the schedule before payroll reads assigned deductions. Each voucher uses a distinct Payroll Deduction Type so multiple advances can coexist. Automatic amount is the lesser of configured deduction and remaining unreserved loan balance; unpaid linked deductions reserve balance, the final deduction may be smaller, and no deduction is created when available balance is zero.
- The generated Payroll Deduction retains `employeeLoanId`. PR #166's idempotent Financial Engine PAYMENT processing remains authoritative for increasing `amountPaid`, decreasing/closing Employee Loan balance, journal/outbox behavior, and reversal restoration. Never mutate loan balance when merely calculating a Petty Cash schedule.
- Because the candidate extends previously verified `PAY-DED-001` and `PAY-LOAN-001`, those requirement statuses are `IMPLEMENTED` until this new exact head has linked acceptance evidence; do not inherit PR #166 VERIFIED evidence for the changed behavior.
- Petty Cash Voucher print is the compact half-A4/A5 voucher format. Receipt / Acknowledgement Receipt is a separate print contract: browser printing uses **A4 portrait paper** with the Receipt/AR content rendered at a **half-A4 portrait footprint**, while downloaded PDF remains **full A4 portrait**. Do not set Receipt/AR `@page` to A5 and do not generate an A5 Receipt/AR PDF.
- Detailed implementation status and release gate are in `docs/petty-cash/PETTY_CASH_VOUCHER_IMPLEMENTATION.md`.

## PayMongo Homeowner Collections

- Each tenant uses either `MANUAL_QR` or `PAYMONGO` for new homeowner payment attempts.
- PayMongo homeowner collections use the platform credential plus tenant Linked Account (`Account-ID`) routing. Tenant admins never see platform secret keys.
- Verified child-scoped webhook or authenticated server-to-server reconciliation is payment authority; browser redirects are presentation only.
- Tenant, homeowner, child account, reference, identifiers, currency, amount, and fee metadata must reconcile before posting.
- HOAHub subscription billing credentials remain separate from homeowner-collection credentials.
- Platform convenience fee routing is platform-controlled; tenant admins cannot alter it.
- Settlement visibility candidate `codex/paymongo-settlement-trace-20260825` adds a read-only `/admin/payments/online/[id]` trace for authorized tenant payment managers. It resolves the opaque request under authenticated tenant scope, retrieves Checkout evidence with the snapshotted child `Account-ID`, separates HOA principal/platform fee/processing fee, and matches generated payout transactions only by exact organization plus original Payment ID. Aggregate upcoming schedules must remain labeled as estimates and never be represented as proof that an individual payment is included.
- The settlement trace must never return PayMongo credentials, authorization headers, bank-account details, or unfiltered parent/cross-tenant payout data. PR #179 passed exact-head HOAHub MySQL CI run `32793090994` and Canva Visual Parity run `32793090998`, then merged to `main` at `4d1f794576eae66dd77bb0bf6b6498fcf9bc55fa`. Hostinger served release marker `4d1f794576ea`, public MySQL health returned HTTP 200, and post-merge CI/managed-production verification run `32794934089` passed. Status is `DEPLOYED`; authenticated tenant production UAT remains pending before the feature is marked fully `VERIFIED`. See `docs/payments/PAYMONGO_SETTLEMENT_TRACE_IMPLEMENTATION.md`.

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
- Effective-dated employee compensation/pay-frequency/attendance policy persistence passed exact-head PR #164 MySQL CI #1108 and Canva Visual Parity #298 and is `VERIFIED` in the payroll registry.
- Expanded lifecycle/corrections passed exact-head PR #165 HOAHub MySQL CI #1111 and Canva Visual Parity #300 at `1743245f3d676f50fe026cf6831e9663ab8a666b`, merged to `main` at `8b6f07f2b9139ee89d104414a3e17e94d6c1f366`, and remains `VERIFIED`.
- PR #166 (`Complete payroll statutory, finance, and leave workflows`) merged to `main` at `57a10d5f17dff7e98474997178852162ca6edf9a`; its implementation head `f596c850a113bcd73d50d5a71116e9951685ffdb` passed HOAHub MySQL CI #1114 and Canva Visual Parity #302. The product owner confirmed that baseline was deployed to Hostinger.
- PR #168 merged to `main` at `a1f2f05` and owns Petty Cash Voucher issuance plus its cash-advance source integration. PR #171 preserves both materializers and its implementation head `c47416e83bc3c40d6bf317786bab264f7b757a15` passed exact-head HOAHub MySQL CI #1136 and Canva Visual Parity #321, including the Petty Cash integration regressions. Generic payroll schedules must preserve the Petty Cash ledger/materializer and must not mutate the voucher ledger or loan balance during calculation.
- `PAY-TASK-011` merged in PR #171 to `main` at `28a45e8322e74590859e42093b0db08717ec86ae`. It adds effective-dated `ONE_TIME`, `RECURRING`, and `UNTIL_FULLY_PAID` generic deduction schedules; loan-installment materialization; tenant/employee statutory applicability versions; a six-task admin payroll workspace; and employee schedule/statutory visibility. Its implementation head passed exact-head HOAHub MySQL CI #1136 and Canva Visual Parity #321, so `PAY-DED-001`, `PAY-DED-002`, `PAY-LOAN-001`, `PAY-LOAN-002`, `PAY-STAT-003`, `PAY-UX-001`, and `PAY-TASK-011` are `VERIFIED`. Separate deployment confirmation is still required; do not report the PR #171 scope as production merely because the earlier payroll baseline is deployed.
- PR #167's billing-search/homeowner-selection work and PR #170's receipt browser-print work are merged and remain outside payroll scope.

## Current Billing and Petty Cash Hotfix Evidence

- Billing Edit Save month validation is fixed in PR #176. Exact implementation head `7d7eb1ce9e3b2edacd84aed2348e2401ea4195be` passed HOAHub MySQL CI #1150 and Canva Visual Parity #330, then merged to `main` at `230d3d09f268fd8aeb201898597ac0c08c6affe8`. The server now accepts the `YYYY-MM` value submitted by the HTML month control while rejecting impossible months. See `docs/billing/BILLING_EDIT_SAVE_MONTH_VALIDATION_HOTFIX.md`.
- Petty Cash Voucher edit prefill and Enter-to-select behavior is fixed in PR #175. Refreshed exact head `a4ffe36f182f069f3e2c0fdca41f010fbbdf0bea` passed HOAHub MySQL CI #1152 and Canva Visual Parity #331, then merged to `main` at `70eda4af51759b491a0ab2380b03a8fc1c76e7c4`. See `docs/petty-cash/PETTY_CASH_VOUCHER_EDIT_PREFILL_HOTFIX.md`.
- These repository changes are merged and verified by exact-head CI. Do not report them as Hostinger production-deployed until the managed deployment/release marker and authenticated production UAT confirm the merged `main` commit.

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
- Any issue/task/old-PR requirement not present in current `main` merely because it exists in documentation or conversation.

### Effective-Dated Employee Payroll Configuration

Implementation task: `PAY-TASK-004`.

Verification evidence: exact-head PR #164 HOAHub MySQL CI #1108 and Canva Visual Parity #298 passed at `aafe4eef87454745064b4c52178b610087b78119`; merged to `main` at `bb7588a524847b23f68430e92d92e48a6065e589`.

- `EmployeeCompensation` is the payroll-history authority for employee compensation terms. Compensation basis, pay frequency and attendance policy are independent fields; do not re-collapse them into legacy `SalaryType`.
- Existing `EmployeeProfile.salaryType`, `baseRate`, `standardWorkDays`, `fixedAllowance`, and `fixedDeduction` remain compatibility mirrors during migration. New payroll calculations must resolve `EmployeeCompensation` first.
- Payroll configuration edits create a new effective-dated version and close the prior version. Do not update historical compensation rows in place.
- New configuration effective dates must not overlap finalized/paid payroll history for that employee.
- Payroll resolves the configuration effective on the cutoff end date and stores `Payslip.compensationId` plus `Payslip.compensationSnapshot`. Later master-data changes must not mutate that snapshot.
- Pre-migration payslips are legacy historical evidence and are not mass-rewritten by the compensation backfill.
- `NOT_REQUIRED` and `EXCEPTION_ONLY` attendance policies are supported only for monthly/fixed-per-period compensation in the current implementation; Daily and Hourly require attendance.
- Effective-dated statutory rates are now a separate verified authority under `PAY-TASK-006`; compensation versions continue to own employee-specific terms only.

### Payroll Lifecycle and Immutable Revisions

Implementation task: `PAY-TASK-005`. PR #165 is merged to `main` at `8b6f07f2b9139ee89d104414a3e17e94d6c1f366`. Status: `VERIFIED` by exact-head HOAHub MySQL CI #1111 and Canva Visual Parity #300 at `1743245f3d676f50fe026cf6831e9663ab8a666b`.

- Persisted lifecycle states are `DRAFT`, `CALCULATED`, `FINALIZED`, `POSTING`, `POSTED`, `POST_FAILED`, and `PAID`.
- Only `DRAFT` and `CALCULATED` working data is mutable. Finalized or later payroll must not be recalculated, have deductions/attendance changed directly, or be destructively deleted.
- `PayrollCalculationRevision` and `PayrollCalculationRevisionPayslip` are immutable historical authority for finalized calculations. Each revision carries tenant/payroll identity, monotonic revision number, type, actor, reason, parent/source revision, period/input snapshots, totals, and per-employee/aggregate deltas.
- Controlled correction of finalized unpaid payroll requires a 10–500 character reason, preserves the source revision, returns working data to `CALCULATED`, and creates a new child revision on re-finalization.
- Finalized/posted/paid evidence may receive one immutable reversal revision. Reversal evidence does not delete or overwrite the source payroll. Paid remains terminal.
- `POSTING`, `POSTED`, and `POST_FAILED` transition only through the durable `PayrollPostingOutbox`/`PayrollFinancialPosting` contract. Finalized payroll posts accrual before payment; net-pay disbursement is required before `PAID`.
- The legacy `PayrollArchive` pre-correction snapshot remains compatibility evidence; it does not replace first-class calculation revisions.

### Statutory Payroll Rules

Implementation task: `PAY-TASK-006`. Status: `VERIFIED` by PR #166 HOAHub MySQL CI #1114 and Canva Visual Parity #302 at `f596c850a113bcd73d50d5a71116e9951685ffdb`; PR #166 merged to `main` at `57a10d5f17dff7e98474997178852162ca6edf9a`.

- `PayrollStatutoryRuleSet` is effective-dated legal evidence selected by jurisdiction and payroll pay date.
- The first candidate rule set is `PH_STATUTORY_2025_2026_V1`, verified as of 2026-08-24 against official DOLE, BIR, SSS, PhilHealth, and Pag-IBIG publications recorded in its source snapshot.
- Payroll stores rule-set identity and immutable calculation evidence on period, payslip, and finalized calculation revision. Historical legacy payroll is not relabeled.
- Legal formula changes require a new effective-dated rule set and boundary tests; never update historical rule JSON in place.

### Financial Engine Posting

Implementation task: `PAY-TASK-007`. Status: `VERIFIED` by PR #166 HOAHub MySQL CI #1114 and Canva Visual Parity #302 at `f596c850a113bcd73d50d5a71116e9951685ffdb`; PR #166 merged to `main` at `57a10d5f17dff7e98474997178852162ca6edf9a`.

- Posting identity is authenticated tenant + immutable payroll revision + event (`POST`, `PAYMENT`, or `REVERSAL`).
- `PayrollPostingOutbox`, `PayrollFinancialPosting`, and `FinancialJournalEntry` preserve durable retry, idempotency, reconciliation, error, and source-revision evidence.
- `POST` recognizes gross/employer payroll expense and liabilities; `PAYMENT` clears net-pay to cash and applies loan deductions once; `REVERSAL` references immutable reversal evidence and restores receivable evidence where required.
- Repeating an already posted event returns its existing result. Never bypass the outbox with a direct payroll status or loan-balance mutation.

### Employee Leave

Implementation task: `PAY-TASK-009`. Status: `VERIFIED` by PR #166 HOAHub MySQL CI #1114 and Canva Visual Parity #302 at `f596c850a113bcd73d50d5a71116e9951685ffdb`; PR #166 merged to `main` at `57a10d5f17dff7e98474997178852162ca6edf9a`.

- `LeaveType`, `LeaveRequest`, `EmployeeLeaveBalance`, and `LeaveBalanceTransaction` are tenant-scoped payroll data.
- Employees submit/cancel only their own requests. Payroll Manager, HR Admin, or System Administrator review remains server-authoritative.
- Approval uses immutable policy/date evidence, rechecks payroll locks/balance, consumes balance once, and creates linked paid/unpaid attendance in one Serializable transaction. Track-only leave does not fabricate ordinary wage attendance.
- Protected Service Incentive, Maternity, Paternity, Solo Parent, VAWC, and Special Leave for Women rows cannot be edited/deactivated through tenant actions. HR must still validate each employee’s legal eligibility/evidence.
