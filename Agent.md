# HOAHub Agent Context

Last updated: 2026-08-23

## Purpose

This file is the repository-level operating contract for AI coding agents and maintainers working on HOAHub. It describes the current production structure, authority boundaries, release gates, and known deferred scope. Read this file before making any code, schema, workflow, payment, UI, deployment, or documentation change.

## Current Production Baseline

- Repository: `lowiesevilla-crypto/Hoapagsibol4B`.
- Authoritative application branch: `main`.
- Production hosting: Hostinger managed Node.js application connected to GitHub `main`.
- Current production application baseline at this update: `1d8b1e665da75786d615e324148ffce1e2833b9c` (`feat: support homeowner advance monthly dues payments (#149)`).
- Hostinger was visually confirmed `Running`, `Auto-deployment`, `Current`, and `Completed` on short commit `1d8b1e66` after PR #149.
- Never assume an old feature branch, draft PR, closed PR, issue branch, local workspace, or previous AI branch is newer or safer than current `main`.

### Stale PR / Branch Safety

The following previously open PRs were intentionally closed without merge on 2026-08-23 and are historical only:

- PR #134 — `Clarify and support large-community onboarding batches` — closed, not merged.
- PR #129 — `fix(auth): make logout recovery fail-safe across browser history` — closed, not merged.
- PR #102 — `Fix stale Payment Rejected status after successful retry` — closed, not merged.

Agents MUST NOT reopen, merge, auto-merge, or use these PR heads as implementation bases unless the user explicitly requests a fresh review. Do not blindly cherry-pick them. If a historical idea is still relevant, re-evaluate it against current `main`, current tests, and this file, then implement from a new branch based on current `main`.

For every new implementation, start from the latest `main` commit unless the user explicitly identifies another base.

## Mandatory Agent.md and User Manual Maintenance

`Agent.md` must be reviewed and updated for every repository change before merge or deployment when the change affects architecture, workflows, permissions, deployment behavior, operational rules, or user-visible functionality.

The tenant-facing HOAHub User Manual is also a controlled product artifact. For each deployed user-visible feature, fix, enhancement, permission change, navigation change, or workflow change:

1. Update the relevant User Manual procedure.
2. Update the role/access matrix when permissions or role visibility change.
3. Replace obsolete screenshots and add screenshots for new or materially changed workflows when practical.
4. Keep screenshots tenant-safe and avoid exposing secrets or unnecessary personal information.
5. Update the manual revision history and production baseline.
6. Do not describe deferred or unimplemented features as live.

## Product and Architecture Baseline

- HOAHub is a multi-tenant community/homeowners-association SaaS platform.
- Primary stack: Next.js App Router, React, TypeScript, Tailwind CSS, Prisma, MySQL.
- Platform/commercial data and tenant operational data have separate authority boundaries.
- Tenant-owned data must remain tenant-scoped at every UI, API, Server Action, service, cron/job, raw SQL query, cache, storage, export, report, webhook, and AI boundary.
- Authenticated server-side session context is authoritative. Browser-supplied tenant IDs, roles, homeowner IDs, account owners, route parameters, return URLs, payment state, payment amount, gateway account IDs, or document ownership are never proof of authority.

## Non-Negotiable Security Rules

1. Preserve tenant isolation and fail closed when tenant/user authority is ambiguous.
2. Preserve RBAC, granular permissions, module entitlements, and record-ownership checks on server-side operations.
3. Do not weaken session validation, passkey verification, account-choice authorization, safe redirect logic, CSRF/same-origin protections, or authentication recovery controls.
4. Never commit production secrets or expose them in logs, browser payloads, screenshots, AI/model payloads, docs, or test fixtures.
5. Never expose raw database credentials or unrestricted query execution to browser or AI surfaces.
6. Financial, approval, publication, refund, forfeiture, payroll, grievance, and destructive operations require server-side business validation and audit/history evidence.
7. Security-sensitive and finance-sensitive behavior must remain covered by regression tests.
8. CI passing is not equivalent to production deployment.
9. A browser success redirect is never payment authority.
10. Do not bypass a failing verifier or browser test by weakening its business/security invariant.

## Roles and Access Structure

HOAHub uses role checks, granular permissions, enabled tenant modules, subscription entitlements, and record ownership. UI visibility is not the security boundary; server authorization is.

### Platform / Control Plane

- `SUPER_ADMIN` — platform-wide authority plus allowed tenant/system surfaces. Use with care; tenant actions still must preserve tenant scope.
- `PLATFORM_ADMIN` — platform commercial/operations authority according to platform route permissions.
- Platform routes include tenants, subscriptions, plans/features, invoices, agreements, licenses, document usage, AI usage metadata, audit/security, and platform profile.
- Platform roles do not automatically inherit tenant grievance, payroll, finance, or resident-record authority unless the server role/permission model explicitly grants it.

### Tenant Administration

- Tenant administrative users include system/association administrators and permission-scoped operational roles.
- Important permission domains include Billing, Payments, Documents, Complaints, Payroll/Workforce, AI, Document Repository, and Tenant Settings.
- `/admin/layout.tsx` and related authorization helpers are responsible for role filtering, enabled-module filtering, entitlement filtering, AI permission filtering, payroll access filtering, and tenant-scoped navigation/search serialization.
- A user who can read a module is not automatically allowed to mutate it. Server actions must enforce the appropriate manage/approve permission.

### Homeowner

- Homeowners may access only their authenticated tenant and their own authorized account data plus tenant-public/community content.
- Homeowner profile, billing, payment, SOA, document request, complaint, vehicle, and AI account queries must remain owner-scoped and tenant-scoped.

### Employee

- Employee portal is separate from Tenant Admin payroll authority.
- Employee-facing functions include own profile, clock in/out, attendance correction, attendance history, own payslips, and support/chat as enabled.
- Employees must never gain administrative payroll visibility merely because they have an employee account.

## Current Tenant Admin Functional Structure

The authorized Admin command catalog is broader than the compact sidebar. Current major workspaces are:

### Overview and Administration

- `/admin/dashboard` — executive tenant dashboard with active homeowners, current collections, open receivables, action queues, financial pulse, and recent activity.
- `/admin/actions` — Action Center aggregator for authorized complaint, payment-review, overdue-account, document-request, and payroll queues. It does not replace the underlying authoritative workflows.
- `/admin/onboarding` — tenant onboarding and homeowner bulk import.
- `/admin/homeowners` — homeowner directory, filters, operational status, digital activation status, invitations, and profile maintenance.
- `/admin/profile`, `/admin/subscription`, `/admin/agreement` — tenant admin account/commercial access according to role controls.

### Residents and Security

- `/admin/homeowners` — homeowner master data and account activation.
- `/admin/contractors` — contractor directory and contractor-bond context.
- `/admin/vehicles` — homeowner vehicles, HOA sticker monitoring, payment linkage, validity, and status.

### Finance

- `/admin/billing` — Monthly Dues billing records, bill maintenance, reminders, exemptions, and generation controls according to billing mode.
- `/admin/settings/billing-rules` — effective Monthly Dues rule amount, frequency, effective period, resolution reference, penalties, due day, and automatic billing controls.
- `/admin/settings/billing-exemptions` — billing exemption management.
- `/admin/settings/payments` — tenant homeowner payment flow configuration: Manual QR or PayMongo Online, linked child account, and readiness status.
- `/admin/payments/record` — homeowner-first Record Payment including zero-balance advance Monthly Dues support.
- `/admin/payments/requests` — payment proof/payment request review queue.
- `/admin/payments/active` — active posted payments.
- `/admin/payments/history` — payment transaction history.
- `/admin/payments/online` — PayMongo online-payment operational monitor when applicable.
- `/admin/receipts` — receipt register.
- `/admin/collections` — Other Collections, fees, refundable bonds, refunds, forfeitures, and central collection receipts.
- `/admin/rentals` — Rental Management workspace.
- `/admin/expenses` — expense categories and expense/disbursement records.
- `/admin/reports` and `/admin/reports/dashboard` — financial reporting and finance dashboard.
- `/admin/data` and `/admin/data/migrations` — bulk data, exports/imports, and previous-balance migration.

### Resident Services and Documents

- `/admin/documents` — document definitions, templates, requests, walk-in/office requests, issued documents, workflow processing, and archive/operations views.
- `/admin/document-management` — secure association document repository with categories, status, visibility, revision, quota, upload/download permissions, and homeowner-public publishing controls.
- `/admin/complaints` — complaint intake/triage/assignment/status tracking with separate grievance and verification states where authorized.

### Community

- `/admin/announcements` — create/edit, draft/publish/archive, image, email flag, and Facebook posting integration.
- `/admin/events` — create/edit, publish/archive, schedule/location/image, and Facebook posting integration.
- `/admin/chat` — tenant community/support messaging according to authorization and privacy policy.

### Workforce

- `/admin/workforce` — HRIS & Payroll command center.
- `/admin/employees` — employee master data.
- `/admin/attendance` — attendance operations and correction workflows.
- `/admin/payroll` — protected payroll processing, deductions, loans/cash advances, payslips, and period state.

### AI and Knowledge

- `/admin/ai-copilot` — Staff Copilot for authorized tenant-scoped finance, resident, document/policy, workflow, report, and drafting assistance.
- `/admin/ai-assistance` — AI governance/configuration for authorized administrators.
- AI may draft and explain but must not silently perform final approval, financial posting, publication, rejection, or other authoritative state change unless a separately authorized workflow explicitly exists.

## Homeowner Portal Functional Structure

Current homeowner navigation includes:

- `/portal/dashboard` — homeowner overview.
- `/portal/pay` — configured payment flow for dues/assessments and eligible document fees.
- `/portal/billing` — homeowner billing history/current charges.
- `/portal/soa` — Statement of Account.
- `/portal/payments` — payment history/status.
- `/portal/collections` — homeowner-visible collections and bonds.
- `/portal/requests` — resident request hub.
- `/portal/documents` — document requests/history when the Documents module is enabled.
- `/portal/complaints` and `/portal/complaints/new` — homeowner complaint submission/tracking when enabled.
- `/portal/community`, `/portal/announcements`, `/portal/events`, `/portal/chat`, `/portal/organization` — community information and communication according to enabled modules.
- `/portal/profile` — own account/profile.
- `/portal/vehicles` — own registered vehicles when enabled.
- `/portal/ai` — Association Assistant when commercially/governance enabled.

Homeowner UI is mobile/PWA-first. Use safe-area insets, approximately 48px touch targets where practical, no page-level horizontal overflow, reduced-motion support, `100dvh` when appropriate, and private/no-store handling for authenticated content.

## Monthly Dues Billing Authority

### Billing Rules

- Monthly Dues rates come from the effective tenant Billing Rule, not arbitrary browser-entered amounts.
- Billing rules may define amount, billing frequency, billing day, due day, grace period, penalty configuration, effective start/end period, resolution reference/date, notes, and status.
- Overlapping active effective periods are blocked.
- Historical bills keep their resolved rate/rule snapshot.

### Automatic Billing

Automatic billing is implemented and active in the application architecture.

- Automatic Monthly Dues generation is controlled by the effective Billing Rule generation mode.
- The tenant defines the Monthly Dues billing day.
- The daily secured scheduler invokes tenant automatic-billing checks; the service decides whether a tenant is due.
- Catch-up behavior is intentional: when the current Manila day is at or past the configured billing day, the current period may be generated if it has not already been completed.
- Automatic generation is idempotent and retry-safe.
- Existing same-period Monthly Dues bills are skipped. Duplicate authority is tenant + homeowner + recurring charge type + coverage year + coverage month.
- Existing manually generated bills for the same current coverage period must therefore be skipped by automation rather than billed again.
- Exempt homeowners are skipped according to effective exemption rules.
- Large communities are processed in bounded homeowner ID batches; do not replace bounded batching with one unbounded write transaction.
- Automatic-run audit evidence is required.

### Manual Generation Lock

- When the effective Billing Rule is in `AUTOMATIC` mode for the selected coverage period, manual bulk generation and individual bill generation must be disabled in the Admin UI.
- Server actions must also reject manual generation while Automatic Billing is authoritative. UI disabling alone is insufficient.
- Editing/maintaining an already-created bill remains a separate maintenance operation and must keep its own authorization/history rules.
- When automatic mode is OFF/MANUAL, authorized manual preview/generation may be used.

## Admin Record Payment and Advance Monthly Dues

The current production Record Payment workflow is homeowner-first.

- `/admin/payments/record` searches ACTIVE homeowners, not only homeowners with open bills.
- Search must work at database scale and support homeowner name, account number, block, lot, and email without requiring all homeowners to be loaded into the browser.
- A homeowner with zero outstanding balance may still be selected.
- Current open Monthly Dues obligations are applied first according to the ledger allocation rules.
- A payment amount above current open Monthly Dues, or a pure zero-balance advance payment, creates unapplied homeowner credit.
- Payment coverage metadata records the intended coverage period for audit/presentation.
- Unapplied homeowner credit is automatically consumed by eligible future Monthly Dues oldest-due-first.
- Allocation must remain idempotent; the same payment credit must never be allocated twice.
- `PaymentAllocation` is the authoritative allocation relationship. Do not regress to assuming one payment equals one bill.
- Pure advance payments must remain correctable/voidable through ledger-safe handling rather than assuming every active payment already has an allocation.

### Important Deferred Homeowner Self-Service Scope

The separate homeowner feature to select a future `From` month and `To` month in the portal, have the server calculate the exact future Monthly Dues amount from effective Billing Rules, and pay those not-yet-billed months as one homeowner-initiated advance transaction is NOT yet the confirmed production baseline as of this file update. Do not present or implement against it as if already live. It requires its own reviewed change.

## Rental Management Current Architecture

Rental Management is the operational entry point for rental-specific activity, while Collection remains the authoritative cash/receipt ledger.

Current `/admin/rentals` sections:

- Overview — rental operational snapshot.
- Assets — parking, stalls, spaces, and other rentable inventory.
- Renters — homeowner-linked or external renter records.
- Agreements — asset assignment, contract terms, monthly rate, security deposit, billing day, due day, and status.
- Billing — rental invoices/receivables.
- Payments — rental payment entry and advance rental credits.
- Reconciliation — apply/reconcile eligible receipts to rental invoices.

Rules:

- Outside renters remain standalone renter records. Do not create fake Homeowner/User records.
- Rental payment entry should occur through Rental Management; HOAHub creates the official Collection receipt and then reconciles it to rental billing or advance rental credit.
- Collection remains cash/receipt authority. `RentalPaymentAllocation` is reconciliation authority and must not duplicate cash or cross tenant boundaries.
- Normal RENT receipts must not be treated as refundable security-deposit liabilities.
- Rental security deposits are liabilities until valid refund/forfeiture treatment; they are not rental income.
- Excess rental payment may remain as advance rental credit.
- Advance rental credit is automatically consumed against eligible RENT invoices oldest-due-first.
- Active Rental Agreements generate recurring rental invoices according to their own agreement billing day when tenant automatic billing is enabled.
- Monthly rental invoice creation is duplicate-safe/idempotent per tenant/agreement/charge type/period.
- Agreement End Date/status governs whether recurring billing continues. Open-ended agreements continue until ended.
- Ending an agreement releases the asset while preserving historical invoices, receipts, and allocations.
- Agreement maintenance uses the focused agreement page `/admin/rentals/agreements/[id]`; do not reintroduce the full edit form inline inside the broad agreements table.

### Deferred Rental Reservation Scope

Homeowner self-service browsing/reservation of available rental assets, with admin-side reserved-homeowner visibility and concurrency-safe one-active-reservation-per-asset rules, is NOT yet the confirmed production baseline as of this update. Do not assume it exists without a new reviewed implementation.

## Other Collections, Bonds, and Expenses

- `/admin/collections` separates association income from refundable liabilities.
- Supported payer authority uses explicit payer type; external renter/other payer names remain bounded free text and must not fabricate Homeowner/User records.
- Construction/contractor bonds preserve their payer restrictions.
- Refundable bonds remain liabilities until refunded or validly forfeited.
- Forfeiture must be explicit, reasoned, authorized, and auditable.
- Rental security-deposit allocation must not inflate recognized income.
- `/admin/expenses` uses administrator-defined expense categories and records date, description, payee, amount, method, reference, voucher, and remarks for financial reporting.

## Financial Reports

- `/admin/reports` accepts tenant-scoped From/To date filters.
- Current reporting includes recognized income, operating expenses, operating surplus/deficit, cash receipts/disbursements, Monthly Dues received/applied/unapplied credit, refundable-bond accountability, rental security-deposit liability treatment, employee loan/cash-advance activity, receivables, and monthly billing summaries.
- PDF, DOCX, and CSV exports must use the same tenant-scoped accounting authority as the screen.
- Raw SQL involving rental MVP tables must include explicit authenticated tenant predicates.

### Deferred Payment-Channel Reporting

Detailed financial-report breakdown by posting path/payment rail such as Admin Cash, Admin GCash, PayMongo QR Ph, PayMongo GCash, PayMongo Maya, etc. is NOT yet the confirmed production baseline as of this update. Do not fabricate gateway-rail classification from generic payment method fields. If implemented, persist/derive the successful provider rail from authoritative gateway data and keep reporting consistent across screen/PDF/DOCX/CSV.

## Homeowner Payment Choice and PayMongo Linked Accounts

- Each tenant selects exactly one flow for new homeowner payment attempts: `MANUAL_QR` or `PAYMONGO`.
- Manual QR uses the tenant's official QR/proof-verification workflow.
- PayMongo Online uses HOAHub's centrally managed homeowner platform credential; tenant admins must never enter or view the secret key.
- Tenant configuration stores/uses the linked child merchant organization ID (`org_...`) under authenticated tenant authority.
- HOAHub creates checkout on behalf of the tenant child account using server-side `Account-ID` routing.
- The verified child-scoped webhook or authenticated server-to-server PayMongo reconciliation is financial authority; browser redirect/query state is presentation only.
- Tenant, homeowner, child account, reference, checkout/payment identifiers, currency, amount, and fee metadata must reconcile before posting.
- Successful gateway confirmation must use the normal idempotent ledger/receipt posting path.
- HOAHub SaaS subscription billing credentials are separate from homeowner payment credentials.
- HOAHub convenience fee is platform-controlled. The tenant HOA principal and HOAHub platform fee must remain separately accounted/routed according to the verified PayMongo split policy.
- Tenant admins cannot change the platform convenience fee from the tenant payment settings page.

## Homeowner Statement of Account and Payment Status

- SOA is the authoritative homeowner account presentation over tenant-scoped ledger data.
- Current balance must be derived from authoritative posted billing/payment state, not from an old failed attempt.
- Historical rejected/cancelled payment attempts remain audit history but must not override a later successfully settled account state.
- Browser redirects cannot manufacture a receipt, approval, or paid state.

## Homeowner Onboarding and Scale

- `/admin/onboarding` supports CSV dry-run and apply with tenant-scoped validation, duplicate/property/account-number checks, exact-file/replay safety, privacy acknowledgement, opening-balance authority, and audit evidence.
- Operational single-upload ceiling remains 5,000 homeowner rows unless a separately reviewed architecture changes it.
- Large imports use bounded/batched database operations rather than per-row unbounded work.
- Large imports defer mass activation credential/email generation rather than performing thousands of synchronous bcrypt/email operations inside one request.
- Deferred homeowner invitations are issued later through the authenticated Homeowners activation workflow.
- Do not reintroduce a 500-row hard cap as the production assumption.

## Document Requests and Document Repository

Two related but distinct systems exist:

1. Resident document-service workflow (`/admin/documents`) — document definitions, templates, request processing, approvals, issue/output lifecycle, homeowner requestability, and office/walk-in requests.
2. Association Document Repository (`/admin/document-management`) — governance/policy/compliance/community files with category, status, visibility, revision, quota, and download/upload permissions.

Rules:

- Tenant-public repository documents are intentionally published; internal/restricted records must never appear to homeowners.
- Published official document templates and generated output remain governed by the document workflow, not ad hoc UI text.
- Homeowner document access must enforce same-tenant ownership/visibility and document-balance policy.
- Repository downloads must enforce repository permissions and never expose internal storage paths.

## Complaint and Grievance Architecture

- Complaint is the intake/operational case layer.
- Formal grievance/compliance/verification remains a separate domain; do not collapse it into one oversized ComplaintStatus state machine.
- Anonymous complaint access must expose only public-safe information and preserve anonymous token/privacy rules.
- Confidential identity reveal, verification, grievance authority, committee access, deadlines, and formal transitions require separate authorization/audit controls.
- Platform roles do not automatically inherit tenant grievance authority.
- Do not weaken complaint/grievance privacy to simplify reporting or AI access.

## Workforce and Payroll

- `/admin/workforce`, `/admin/employees`, `/admin/attendance`, and `/admin/payroll` are protected by payroll/workforce access rules.
- Salary, payroll, deductions, loans/cash advances, corrections, and payslips are confidential tenant data.
- Employees may see only their own authorized employment/payroll data in the employee portal.
- Finalization/paid state must remain server-authoritative and auditable.
- Employee loans/cash advances are receivables; payroll repayments reduce the balance only through the authoritative paid-payroll workflow.

## AI Governance

- AI assistance is commercially/tenant governed and permission controlled.
- Staff Copilot answers only within the authenticated tenant and the user's permitted data domains.
- Homeowner Association Assistant may use approved tenant knowledge plus only the homeowner's own authorized account records.
- AI must not receive raw secrets, unrestricted database access, confidential payroll data outside permission, confidential complaint identity outside permission, or another tenant's data.
- AI-generated drafts remain drafts for human review. AI does not become approval/publishing/payment authority merely because it can draft content.

## Authentication and Protected Navigation

- `https://hoahub.tech/login` remains the universal login boundary.
- Multi-account credential identities must resolve the complete set of eligible active accounts and use signed short-lived server-controlled account-choice state.
- A selected account must be revalidated active and authorized before session creation.
- Protected Admin, Platform, Homeowner, and Employee surfaces must re-establish server session/RBAC authority after browser history restoration.
- Logout remains server-authoritative; GET must not mutate session state.
- Private/authenticated pages and sensitive responses remain no-store.
- Do not restore historical unmerged auth PR logic simply because a stale branch appears to contain a "fix". Compare against current main and current regression tests first.

## Homeowner Mobile and PWA Requirements

- Homeowner changes are phone/PWA-first.
- Use `100dvh` where full-height layout is appropriate.
- Respect safe-area insets.
- Keep important touch targets approximately 48px where practical.
- Avoid hover-only workflows and page-level horizontal overflow.
- Use shrink-safe `min-w-0` / `max-w-full` patterns.
- Honor `prefers-reduced-motion` for non-essential animation.
- Critical forms must remain usable above the mobile keyboard and bottom navigation.
- Preserve passkey support.
- Root layout owns the PWA install provider; do not duplicate providers inside the portal layout.
- Authenticated portal HTML, payments, receipts, documents, uploads, Server Actions, RSC, and router-prefetch traffic remain private/network-only/no-store according to the reviewed cache policy.

## UI and Navigation System

- Existing HOAHub visual tokens (`pine`, `leaf`, `ink`, `sand`, card/field/button/table patterns) remain the approved design system baseline unless a separately approved migration replaces them.
- Platform control-plane identity uses HOAHub branding; tenant workspaces use tenant identity where appropriate.
- Admin command search must serialize only authorized routes after role/module/entitlement filtering.
- Tables should scroll inside contained operational surfaces rather than causing page-level horizontal overflow.
- Functional UI controls must connect to real routes/actions. Canva/mock sample values are never production data.
- Official generated document output and production template formatting are not casually altered by general UI redesign work.

## Hostinger Production Deployment Model

The authoritative production path is the Hostinger managed Node.js application connected to GitHub `main`.

- Feature branches are not production deployment targets.
- Approved changes land on `main` through a reviewed merge or an explicitly authorized direct documentation commit.
- Push/merge to `main` may run repository verification and trigger Hostinger connected-GitHub auto-deployment.
- Node.js production runtime is 22.x.
- `public/release.txt` is used as the production release marker when the managed pipeline stamps the current Git revision.
- Never expose or print production `.env` contents.
- Legacy PM2/SSH activation is not the authoritative managed-web-app deployment path.

### Production Release Identification

A runtime release is considered deployed only when the expected merged `main` candidate is verified and Hostinger reports/publishes that release successfully. When available, confirm the expected release marker and `/api/health`. A Hostinger screenshot showing `Current` + `Completed` on the expected commit is valid deployment evidence for the user-facing deployment status, but do not claim authenticated functional UAT that was not actually performed.

## Standard Exact-Head Validation Gate

Before merge/deploy of runtime changes, the exact candidate should pass all applicable gates:

- dependency install with lockfile
- lint
- Prisma validate/generate/migrate on CI MySQL when applicable
- database seed
- unit tests
- integration/finance/security tests
- critical/static verification
- typecheck
- production build
- controlled Chromium preparation
- production smoke and critical browser/E2E tests
- Canva Visual Parity for UI initiatives

A passing older branch SHA is not evidence for a changed head. Do not merge a known failing candidate merely to trigger deployment.

Documentation-only changes may use a narrower validation path when they do not alter runtime code, schema, workflow, package configuration, build configuration, or deployment logic; however, documentation must remain factually aligned with current `main`.

## Change Discipline

For every repository change:

1. Fetch latest `main` and confirm the base SHA before implementation.
2. Read `Agent.md` before editing.
3. Review the implementation, tests, authorization boundary, accounting boundary, and tenant scope relevant to the change.
4. Do not use stale closed PR branches as the base.
5. Add/update regression coverage when behavior changes.
6. Preserve homeowner mobile/PWA acceptance for homeowner-facing changes.
7. Preserve financial idempotency, receipt authority, audit evidence, and tenant isolation.
8. Update `Agent.md` when the architecture or operating contract changes.
9. Update the tenant User Manual for deployed user-visible changes, including access/role guidance and screenshots when applicable.
10. Run exact-head CI appropriate to the change.
11. Merge only a candidate that satisfies the applicable gates.
12. Verify production deployment separately from CI.
13. Never report a deferred feature as production-ready.

## Current Deferred / Planned Scope Snapshot

As of 2026-08-23, agents must treat the following as planned/pending rather than already-live production behavior unless a later merged change updates this file:

- Homeowner self-service advance Monthly Dues payment by selecting future From/To months with server-calculated effective-rule amount.
- Detailed financial reporting broken down by posting path and successful online gateway rail/channel.
- Homeowner browsing/reservation of rental assets with admin reservation visibility and concurrency-safe reservation ownership.
- Any other issue/BRD requirement not present in current `main` merely because it exists in an issue, old PR, task file, or conversation.

When one of these is implemented and deployed, move it out of this deferred section and update the corresponding production architecture section plus the User Manual.