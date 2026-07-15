Library
/
PRODUCT_IMPROVEMENT_BACKLOG_RESOLVED.md


# HOAHub Product Improvement Backlog

Version: 1.1

Purpose

Track all usability, functionality, UX, mobile, AI, and business improvements identified during Product Review and UAT.

---

Priority Legend

🔴 Critical

🟠 High

🟡 Medium

🟢 Low

---

Status

Backlog

Analysis

Development

Testing

Completed

# Improvement #001

Module

Dashboard

Priority

🔴 Critical

Status

Backlog

Problem

Dashboard does not immediately help users make decisions.

Recommended Solution

Create an Executive Command Center.

Requirements

- Community Health
- Outstanding Collections
- Pending Approvals
- Resident Complaints
- Today's Visitors
- Employee Attendance
- Payroll Reminder
- Recent Payments
- Active Announcements
- Upcoming Events
- AI Daily Brief

Expected Result

Users understand the HOA status within 10 seconds after login.

---

# Bug #062

Module

Documents

Priority

🔴 Critical

Status

Testing

Problem

Certificate of Residency request can fail when document availability is controlled only by legacy templates and does not support tenant-configurable active/inactive policy, request subjects, or configured fields.

Engineering Update

Sprint 6A document architecture migration adds tenant document configurations, active/inactive catalog controls, household/family subjects, immutable snapshots, delivery modes, fees, and admin edit audit.

Release Gate

Do not mark fixed until Product Owner UAT verifies active Certificate of Residency submission, inactive hiding, subject selection, snapshots, and tenant isolation.

# Improvement #063

Module

Documents

Priority

🟠 High

Status

Testing

Problem

Homeowners need to request documents for Self or authorized household/family members.

Engineering Update

Added `HouseholdMember`, Self/family request subject UI, and server-side tenant/homeowner ownership validation.

# Improvement #064

Module

Documents

Priority

🟠 High

Status

Testing

Problem

Tenants need configurable document fees, fields, templates, approval rules, and delivery modes.

Engineering Update

Added `/admin/settings/document-types` backed by tenant-scoped configuration and field tables.

# Improvement #065

Module

Documents

Priority

🟠 High

Status

Testing

Problem

Admin review needs editable document-visible values with audit history before approval.

Engineering Update

Added reviewed data snapshots and `DocumentRequestEditAudit` field-level records.

# Improvement #066

Module

Documents / Finance

Priority

🟡 Medium

Status

Backlog

Problem

Paid document requests need complete accounting integration.

Engineering Update

Sprint 6A stores fee/payment snapshots and blocks download when payment is required. Full collection posting is deferred to Sprint 6B.
# Improvement #002

Dashboard KPI Cards

Priority

🔴 Critical

Problem

Dashboard cards are informational only.

Solution

Every KPI Card must be clickable.

Clicking opens the related module with filters already applied.

Example

Outstanding Collection

↓

Billing Module

↓

Outstanding Accounts Filter

↓

Ready for Follow-up
# Improvement #003

Tables

Priority

🔴 Critical

Problem

Tables require manual searching.

Solution

Every table must include

Search

Filter

Sort

Pagination

Export Excel

Export PDF

Print

Responsive Mobile View
# Improvement #004

Navigation

Priority

🟠 High

Problem

Users don't know where to go next.

Solution

Improve navigation with

Quick Actions

Role-based shortcuts

Favorites

Recently Used

Smart 

🔴 Improvement #005 – Navigation Redesign

Problem
Navigation is organized by technical modules rather than business functions.

Solution
Group menus into:

Administration
Finance
Resident Services
Security
HR & Payroll
Reports
Settings

Priority
Critical

🔴 Improvement #006 – Collapsible Navigation

Problem
The left menu becomes overwhelming as more features are added.

Solution
Implement collapsible/expandable menu groups with icons and remembered expand/collapse state.

Priority
Critical

🔴 Improvement #007 – Role-Based Navigation

Problem
Every user sees more menu items than necessary.

Solution
Display navigation based on the user's role and permissions while still enforcing RBAC on the backend.

Priority
Critical

🔴 Improvement #008 – Flexible Payer Type
Problem

The Payer Type dropdown is limited to:

Homeowner
Contractor

However, an HOA receives payments from many other entities.

Business Requirement

The system must support configurable payer types.

Default Payer Types
Homeowner
Tenant
Contractor
Visitor
Guest
Supplier
Utility Company
Employee
Board Member
Resident
External Customer
Others
Enhancement

Instead of hardcoding the list:

Add a Manage Payer Types setting.
Platform Admin or HOA Admin can add, edit, disable, or reorder payer types.
Preserve historical values even if a type is later disabled.

Priority: 🔴 Critical

🔴 Improvement #009 – Enterprise Table Standard

You mentioned:

Tables should have search and pagination.

I want to make this a global standard across HOAHub.

Every data table should include:

Search
Advanced Filters
Sorting
Pagination
Export to Excel
Export to PDF
Print
Responsive mobile layout
Column visibility
Saved filters (future)

This shouldn't be implemented module by module—it should become a reusable table component.

Priority: 🔴 Critical

🔴 Improvement #010 – Smart Validation

Your observation:

Reference Number is required if Payment Method is Bank or GCash.

Excellent.

Let's formalize it.

Business Rules
Payment Method	Reference Number Required
Cash	❌ No
Bank Transfer	✅ Yes
GCash	✅ Yes
Maya	✅ Yes
Cheque	✅ Yes (Cheque No.)
Online Banking	✅ Yes
UX Behavior
Hide the reference number field until a payment method requiring it is selected.
Display a clear validation message if missing.
Prevent saving until the required reference is provided.

Priority: 🔴 Critical

🟠 Improvement #011 – Collection Intelligence

Your AI idea is strong. I'd expand it into a complete Collection Intelligence Dashboard.

AI Reports
Bond Collections
Bonds Refunded
Pending Refunds
Construction Bonds
Contractor Bonds
Sticker Fees
Amenity Fees
Monthly Collection Trends
Yearly Collection Trends
Forecasted Collections
Available Funds by Collection Type
AI Insights

Examples:

"Three construction bonds have been refundable for over 30 days."

"Sticker fee collection increased 18% compared to last month."

"Contractor bond liabilities total ₱350,000."

Priority: 🟡 Future (after core functionality)

🔴 Improvement #012 – Dashboard Drill-Down

You've mentioned this several times, which tells me it's becoming a product principle rather than a single feature.

New Product Principle:

Every dashboard KPI must be actionable.

For example:

KPI	Click Action
Other Collections	Opens filtered collection list
Pending Refunds	Opens refund queue
Bond Balance	Opens active bond records
Today's Payments	Opens today's payment transactions

No KPI should be "display only."

Priority: 🔴 Critical

🔴 Improvement #013 – Official Statement of Account (SOA)
Business Problem

HOA staff frequently need to issue a Statement of Account (SOA) to homeowners.

Currently, this is either unavailable or not sufficiently formal.

Business Requirement

The system must generate an official printable Statement of Account.

SOA should include:
HOA Information
HOA Logo
HOA Name
Address
Contact Information
Homeowner Information
Homeowner Name
Property Address
Block & Lot
Account Number
Contact Number
Billing Summary
Coverage	Charge	Payment	Balance
Jan 2026	₱500	₱500	₱0
Feb 2026	₱500	₱250	₱250
Mar 2026	₱500	₱0	₱500
Totals
Current Charges
Previous Balance
Total Payments
Penalties
Discounts
Total Outstanding
Footer
Treasurer Signature
Generated Date
QR Verification
Official Document Number
Export
PDF
Print

Priority: 🔴 Critical

🔴 Improvement #014 – Monthly Dues Exemption Period

This is a feature I haven't seen implemented well in many HOA systems.

Business Scenario

A homeowner may be exempt from monthly dues because:

The property is developer-owned.
A Board resolution grants an exemption.
The property is under renovation.
A promotional period applies.
Other policy-based reasons.
Business Requirement

Each homeowner should support one or more exemption periods.

Example:

From	To	Reason
Jan 2026	Jun 2026	Developer Unit
Jul 2027	Dec 2027	Board Resolution
System Behavior

When generating monthly dues:

If the billing month falls within an exemption period:

Do not generate dues.
Record the reason in the audit trail.
Allow reporting of exempted accounts.

Priority: 🔴 Critical

🔴 Improvement #013 – Official Statement of Account
Printable SOA with HOA branding, billing history, totals, QR verification, and PDF export.

Sprint 2.1 Phase 1 Status:
Development complete for SOA v1.

Delivered:
- Admin homeowner SOA route at `/admin/homeowners/[id]/soa`
- Tenant-scoped financial view from existing bills, payments, collections, and bond refunds
- HOA header, homeowner profile, account summary, running ledger, payment history, billing history, aging summary
- Print SOA and Download PDF actions
- Homeowner detail action for Statement of Account

Remaining:
- Persisted public SOA verification records
- Homeowner portal self-service SOA route
- Configurable SOA numbering policy
- Treasurer signature workflow

Hotfix #001:
- Bug #028 Fixed: Print SOA now invokes browser printing and falls back to PDF when print is unavailable.
- Bug #029 Fixed: Outstanding Balance and summary currency values now use non-overlapping right-aligned layouts on screen, print, and PDF.

Hotfix #002:
- Bug #028 Fixed: Print SOA now uses a dedicated SOA Client Component with a native `button type="button"` and direct `window.print()` click handler.
- Bug #029 Fixed: SOA PDF signatures and generated footer now use exact remaining-space flow layout, keeping the 1-ledger / 0-payment / 1-billing sample on one A4 page and adding a page only when the footer block cannot fit.

🔴 Improvement #014 – Monthly Dues Exemption Period
Configurable exemption periods with reasons and audit logging.
🔴 Improvement #015 – Billing Rules Engine
Configurable billing policies (exemptions, discounts, penalties, rate types).

Status:
Completed through Sprint 2.3 local implementation on 2026-07-11

Sprint 2.3 Completion:
The Billing page now supports preview-first tenant-scoped monthly dues generation from Billing Rules and Dues Exemptions. It supports all eligible homeowners, one homeowner, selected homeowners, block, and phase scopes where data exists. Duplicate bills and exempt homeowners are skipped, eligible bills store coverage fields and the billing rule snapshot, and audit logs record summary plus skip/failure details. Automatic scheduled execution remains deferred.
🟡 Improvement #016 – AI Billing Assistant
Role-aware AI capable of explaining balances, dues, and statements while respecting tenant isolation and user permissions.
🟡 Improvement #017 – Billing Timeline View
Visual monthly payment status for both staff and homeowners.
## Improvement #018

Module:
Navigation

Priority:
High

Problem:
Menu groups cannot be collapsed or expanded.

Business Value:
Large installations with many modules become difficult to navigate.

Solution:
Implement collapsible sidebar groups.

Requirements:
- Expand/Collapse animation
- Remember expanded state
- Collapse all / Expand all (future)
- Mobile compatible

Status:
Backlog

md
## Improvement #019

Module:
Platform RBAC

Priority:
Critical

Status:
Fixed in release blocker hotfix on 2026-07-09

Problem:
SUPER_ADMIN cannot access new Platform pages.

Business Requirement:
SUPER_ADMIN must inherit all PLATFORM_ADMIN permissions.

Acceptance Criteria:
- SUPER_ADMIN can access /platform/plans
- SUPER_ADMIN can access /platform/subscriptions
- SUPER_ADMIN can access /platform/licenses
- SUPER_ADMIN can access /platform/audit
- PLATFORM_ADMIN can access Platform pages
- HOA_ADMIN cannot access Platform pages
- Tenant users cannot access Platform pages

## Improvement #020

Module:
Chat

Priority:
High

Status:
Backlog

Requirement:
SUPER_ADMIN should have a Platform Chat view that can communicate with HOA Admins across all tenants.

Acceptance Criteria:
- SUPER_ADMIN can see HOA Admin contacts grouped by tenant
- SUPER_ADMIN can start chat with HOA Admins only
- SUPER_ADMIN cannot see private homeowner/employee chats unless explicitly authorized
- Tenant data privacy is preserved

md
🔴 Improvement #021 – Separate Platform Login Experience

Priority: Critical

Business Problem

Platform administrators currently see tenant branding on the login page, which is confusing and does not reflect the platform-level administration experience.

Business Requirement

Provide a dedicated Platform login page at /platform/login with HOAHub branding, while keeping tenant-specific branding for /{tenantSlug}/login.

Acceptance Criteria

/platform/login uses HOAHub branding.
/{tenantSlug}/login uses the tenant's logo, colors, and community information.
Platform users are redirected to the Platform Dashboard after login.
Tenant users are redirected to their tenant dashboard.
No tenant information is shown on the Platform login page.

## Improvement / Bug #022

Module:
Platform Tenant Management

Priority:
Critical

Status:
Fixed in urgent finance migration and hotfix on 2026-07-12

Problem:
The tenant slug login URL link is not working when clicked from the HOAHub Platform on web and mobile.

Expected:
When Platform Admin clicks the tenant login URL, it should open the correct tenant login page.

Example:
`/pagsibol4b/login`

Acceptance Criteria:
- Tenant login URL is clickable on desktop
- Tenant login URL is clickable on mobile
- Link opens correct tenant login page
- No broken routing
- No wrong redirect
- Works for all tenants

Fix Summary:
Platform Admin and Super Admin sessions can now open tenant login pages from Platform Tenant Management without being redirected back to the platform dashboard. Tenant-user login redirect behavior remains unchanged.

## Improvement #042 – Searchable Homeowner Selector in Create Individual Bill

Module:
Billing

Priority:
High

Status:
Fixed (2026-07-12)

Problem:
The Create Individual Bill form displays homeowners in a standard dropdown. This becomes difficult to use when the tenant has many homeowners.

Business Requirement:
Replace the standard dropdown with a searchable homeowner selector.

Acceptance Criteria:
- Search by homeowner name.
- Search by block.
- Search by lot.
- Search by account number, if available.
- Search results remain tenant-scoped.
- Keyboard navigation works.
- Mobile-friendly.
- Shows a clear “No homeowner found” state.
- Existing bill creation behavior remains unchanged.

## Bug #043 – Billing Rule Creation Failure

Module:
Billing Rules

Priority:
Critical

Status:
Fixed in Sprint 2.2 functional hotfix on 2026-07-11

Problem:
Completed Billing Rule submissions could show a vague failure message instead of explaining the exact validation or effective-period blocker.

Fix Summary:
Optional blank fields are normalized, numeric/date/enum values are parsed precisely, overlap failures name the existing active rule, and unexpected save errors are logged server-side with tenant-safe diagnostic context.

## Bug #044 – Billing Rule Edit Values Missing

Module:
Billing Rules

Priority:
High

Status:
Fixed in Sprint 2.2 functional hotfix on 2026-07-11

Problem:
Editing a saved Billing Rule did not reliably expose every persisted value, especially inactive status and optional end/date/note fields.

Fix Summary:
Edit mode now loads tenant-scoped active or inactive rules and maps amount, enums, period fields, resolution reference/date, notes, and active status back into the form.

## Bug #045 – Billing Rules Notification Cannot Be Dismissed

Module:
Billing Rules

Priority:
High

Status:
Fixed in Sprint 2.2 functional hotfix on 2026-07-11

Problem:
Billing settings pages rendered persistent inline query alerts alongside the shared toast, making notifications appear stuck.

Fix Summary:
Billing settings now rely on the shared transaction toast, which supports close button dismissal, Escape key dismissal, and timed auto-dismiss without permanently obscuring the page.
## Bug #046 – Billing Rule Resolution Date Not Populated

Module:
Billing Rules

Priority:
High

Status:
Fixed in Sprint 2.2 final UI hotfix on 2026-07-11

Problem:
The saved Resolution Date does not populate when editing a Billing Rule. The date input only displays its placeholder format.

Expected Behavior:
The saved date must appear in the HTML date input using `YYYY-MM-DD`.

Acceptance Criteria:
- Existing resolution date loads correctly.
- Date input receives `YYYY-MM-DD`.
- Saving without changing the date preserves the original value.
- Empty resolution date remains optional.
- No timezone shift changes the stored day.

Fix Summary:
Billing Rule edit mode now formats stored Date/string values into a date-input-safe `YYYY-MM-DD` value without using localized display strings or ISO timestamp values.

---

## Bug #047 – Billing Rule Notifications Cannot Be Dismissed

Module:
Billing Rules Notifications

Priority:
High

Status:
Fixed in Sprint 2.2 final UI hotfix on 2026-07-11

Problem:
Success and error notifications have no working close action and do not disappear automatically.

Acceptance Criteria:
- Visible close button.
- Close action removes the notification immediately.
- Success notification auto-dismisses.
- Error notification auto-dismisses after a reasonable delay.
- Keyboard accessible.
- Mobile friendly.
- Multiple messages do not permanently cover the screen.

Fix Summary:
The shared transaction toast now captures URL-driven messages into client state, clears transient toast query parameters, supports close/Escape dismissal, and uses separate auto-dismiss delays for success and error notifications while preserving field-level validation messages.

## Bug #048 – Billing Rule End Month Does Not Persist

Module:
Billing Rules

Priority:
Critical

Status:
Fixed in Sprint 2.2 end period hotfix on 2026-07-11

Problem:
When editing a Billing Rule and changing the Effective End Month to December, the saved rule still displays Open Ended.

Expected Behavior:
The selected Effective End Year and Effective End Month must persist and display correctly after saving.

Acceptance Criteria:
- End Year persists after save.
- End Month persists after save.
- December is stored as month 12.
- Open Ended is shown only when both end year and end month are null.
- Saving an existing rule must not clear its end period.
- Editing other fields must preserve the end period.
- Effective period validation remains enforced.
- No historical bills are modified.

Fix Summary:
Billing Rule end-period validation now requires end year and end month to be supplied or cleared together, and the history display only labels a rule Open Ended when both stored end-period fields are null.

## Bug #049 - Billing Rule End Period Display and Clearing

Module:
Billing Rules

Priority:
Critical

Status:
Fixed in Sprint 2.2 end period display and clearing hotfix on 2026-07-11

Problem:
Stored Effective End Month value `12` persisted successfully but did not reliably display as December, and explicitly clearing both Effective End Year and Effective End Month did not save the rule back to Open Ended.

Expected Behavior:
Month values stored as 1 through 12 must map directly to January through December, and submitted blank end-period fields must be saved as `null` values so the rule becomes Open Ended.

Acceptance Criteria:
- Stored month `1` displays January.
- Stored month `12` displays December.
- Edit dropdown selects the saved end month.
- History displays `December 2026` for end month `12` and end year `2026`.
- Clearing both Effective End Year and Effective End Month saves both fields as null.
- Open Ended displays only when both end-period fields are null.
- One-sided end periods return precise validation messages.
- Notes-only edits keep an Open Ended rule open-ended.
- Rule creation still stores December as month `12`.
- No historical bills are modified.

Fix Summary:
Billing Rules now use a deterministic `MONTH_NAMES[month - 1]` helper for all month labels, validation converts submitted blank end-period fields to `null` while preserving absent fields as undefined, and the update action uses `FormData.has()` to distinguish explicit clearing from omitted fields.
# Sprint 2.3A – Finance Integration Hotfix

## Bug #050 – Resolution Reference Missing in Billing Preview
Priority: Critical
Status: Fixed in Sprint 2.3A finance integration hotfix on 2026-07-11

Preview Billing does not display the Billing Rule Resolution Reference before generation.

Fix Summary:
Billing Preview now displays the effective rule, Resolution Reference, effective period, rule amount, generation mode, penalty configuration, and a clear no-rule state. Preview rows carry the same Resolution Reference persisted on generated Bill records.

---

## Bug #051 – Individual Billing Generation Incomplete
Priority: Critical
Status: Fixed in Sprint 2.3A finance integration hotfix on 2026-07-11

Issues:
- No Preview
- Cannot Generate Individual Bill
- Billing Rule not linked
- Resolution Reference not shown
- Balance not updated

Fix Summary:
Individual preview and generation use the same shared Billing Rules service as all-homeowner generation. Rule-based individual bill creation persists billingRuleId, billingRuleSnapshot, resolutionReference, recurringChargeType, coverageYear, and coverageMonth while preserving tenant and duplicate checks.

---

## Bug #052 – Exemption Count Incorrect
Priority: High
Status: Fixed in Sprint 2.3A finance integration hotfix on 2026-07-11

Preview shows Exempt Homeowners = 0 even when SKIP_EXEMPT is correctly identified.

Fix Summary:
Preview and generation summaries now compute counts from the final normalized row actions through one helper, so SKIP_EXEMPT rows and Exempt Homeowners totals stay aligned.

---

## Bug #053 – Billing and Payment Synchronization
Priority: Critical
Status: Fixed in Sprint 2.3A finance integration hotfix on 2026-07-11

After billing generation:
- Record Payment does not immediately reflect newly generated bills.
- Newly billed homeowners are not searchable.
- Outstanding balances are not refreshed.

Fix Summary:
Generated bills remain the balance source of truth, and Billing/Payments views are revalidated after generation. The payment posting path now scopes selected bills and created payments to the authenticated tenant.

---

## Bug #054 – Payment Search Dataset Incomplete
Priority: High
Status: Fixed in Sprint 2.3A finance integration hotfix on 2026-07-11

Record Payment search does not include all homeowners with outstanding balances.

Fix Summary:
Record Payment now queries tenant-scoped open bills and searchable homeowner options by name, block, lot, email, account ID, bill ID, resolution reference, and billing month.

---

## Improvement #055 – Billing Preview Search
Priority: Medium
Status: Completed in Sprint 2.3A finance integration hotfix on 2026-07-11

Add:
- Search
- Sort
- Pagination

to the Billing Preview table.

Fix Summary:
Billing Preview now has client-side full-result search, sorting, pagination, and responsive table handling while summary counts remain based on the complete preview dataset.

---

## Improvement #056 – Finance Navigation Redesign
Priority: Medium
Status: Completed in Sprint 2.3A finance integration hotfix on 2026-07-11

Split the Payments module into:

Payments
├── Record Payment
├── Payment Requests
├── Active Payments
├── Transaction History
├── Refunds
└── Reports

Fix Summary:
Payments now provides mobile-friendly sub-navigation for Record Payment, Payment Requests, Active Payments, and Transaction History while preserving the existing route and actions.
# Sprint 2.3A Remaining Finance Integration Blockers

## Bug #057 – Individual Billing Date Validation Failure

Module:
Billing – Create Individual Bill

Priority:
Critical

Status:
Fixed in Sprint 2.3B individual billing and payments workflow completion on 2026-07-11

Problem:
Creating an individual bill fails with:
“Something went wrong. We couldn't finish that request. Invalid date.”

Expected Behavior:
The selected coverage month and year must be converted into a valid billing date and processed through the shared Billing Generation Engine.

Acceptance Criteria:
- Valid coverage month/year produces a valid billing date.
- No locale-dependent date parsing.
- Individual billing preview is available before creation.
- Individual generation succeeds for an eligible homeowner.
- Clear validation is shown for invalid coverage.
- Existing bulk generation remains unchanged.

Fix Summary:
Individual bill creation no longer uses locale-dependent date parsing. The create form submits numeric `coverageYear` and `coverageMonth` into the shared billing generation preview, and server validation rejects invalid month/year values before generation.

---

## Bug #058 – Individual Billing Does Not Use Billing Rules Engine

Module:
Billing – Create Individual Bill

Priority:
Critical

Status:
Fixed in Sprint 2.3B individual billing and payments workflow completion on 2026-07-11

Problem:
The individual billing workflow does not show or persist:
- Effective Billing Rule
- Resolution Reference
- Coverage
- Rule Amount
- Updated balance

Expected Behavior:
Individual billing must use the same preview and generation service as bulk billing.

Acceptance Criteria:
- Effective rule is shown before generation.
- Resolution reference is shown and saved.
- Billing rule ID and snapshot are saved.
- Coverage month/year are saved.
- Correct rule amount is used.
- Homeowner balance updates immediately.
- Duplicate and exemption checks apply.
- Generated bill appears in Billing and Payments.

Fix Summary:
Individual billing now uses the same preview/generation engine as bulk billing by submitting `scope=HOMEOWNER`, persisting the Billing Rule linkage, rule snapshot, resolution reference, coverage fields, amount, and balance updates through the existing generation service.

---

## Improvement #059 – Searchable Individual Homeowner Selector

Module:
Billing – Create Individual Bill

Priority:
High

Status:
Fixed in Sprint 2.3B individual billing and payments workflow completion on 2026-07-11

Problem:
The homeowner dropdown is not searchable.

Acceptance Criteria:
- Search by homeowner name.
- Search by block.
- Search by lot.
- Search by account number.
- Full tenant dataset is searchable.
- No arbitrary small result limit.
- Keyboard and mobile friendly.
- Clear empty state.

Fix Summary:
Added a reusable searchable homeowner selector for individual billing and removed the arbitrary small option limit so the full tenant-scoped homeowner dataset can be searched by name, block, lot, account, and email.

---

## Bug #060 – Payments Navigation Not Separated

Module:
Payments

Priority:
High

Status:
Fixed in Sprint 2.3B individual billing and payments workflow completion on 2026-07-11

Problem:
Navigation buttons were added, but all payment functions remain rendered on the same overcrowded page.

Expected Structure:
- `/admin/payments/record`
- `/admin/payments/requests`
- `/admin/payments/active`
- `/admin/payments/history`

Acceptance Criteria:
- Each route displays only its related function.
- Payments parent menu is collapsible.
- Current links redirect safely.
- Mobile navigation works.
- Existing payment actions remain unchanged.

Fix Summary:
Payments now has dedicated routes for Record Payment, Payment Requests, Active Payments, and Transaction History. The old `/admin/payments` path redirects safely to `/admin/payments/record`, and the sidebar exposes Payments as its own grouped section.

---

## Bug #061 – Record Payment Homeowner Search Incomplete

Module:
Payments – Record Payment

Priority:
Critical

Status:
Fixed in Sprint 2.3B individual billing and payments workflow completion on 2026-07-11

Problem:
Not all tenant homeowners are searchable. Newly billed homeowners and newly generated balances may not appear.

Acceptance Criteria:
- All eligible tenant homeowners are searchable.
- Lowie Sevilla is searchable when in the authenticated tenant.
- Search by name, block, lot, account number, and email.
- Search operates on the full server-side dataset.
- Newly billed homeowners appear immediately.
- Current outstanding balance refreshes after billing.
- No cross-tenant results.
- No arbitrary result truncation.

Fix Summary:
Record Payment now uses a tenant-scoped server-side query over current open bill balances with search across homeowner name, block, lot, email, account ID, bill ID, and resolution reference. Client-side truncation was removed.

---

## Bug #062 – Newly Generated Billing Not Reflected in Record Payment

Module:
Finance Integration

Priority:
Critical

Status:
Fixed in Sprint 2.3B individual billing and payments workflow completion on 2026-07-11

Problem:
Newly generated bills and balances are not consistently visible in the Record Payment workflow.

Acceptance Criteria:
- Billing generation revalidates Billing and Payment routes.
- Newly generated bills appear without restarting the app.
- Current outstanding balance is recalculated from the authoritative source.
- Record Payment uses current bill data.
- Payment reduces balance correctly.
- Official Receipt generation remains functional.

Fix Summary:
Billing generation and payment mutations now revalidate the dedicated payment routes. Record Payment reads current open bill balances from the database so newly generated bills are available immediately for payment posting and receipt generation.

---

# Payments Module Product Review

## Current Assessment

- Ease of Use: Very useful
- Mobile Experience: Continue improving UI/UX for all screen and device sizes
- Missing Feature: Tenant-specific payment webhook configuration
- Business Process Requirement: Successful payments must automatically update related balances, reports, ledgers, and receipt records
- AI Opportunity: A tenant-scoped Finance AI may answer payment-status questions only within the authenticated tenant and the user’s authorized access, in compliance with the Philippine Data Privacy Act of 2012

---

## Bug #028 – Print SOA Button

Module:
Statement of Account

Priority:
Critical

Status:
Fixed in Sprint 2.4 SOA finalization on 2026-07-11

Problem:
The Print SOA button remains visible but does not open the browser print dialog.

Expected Behavior:
Clicking Print SOA must open the browser print dialog.

Acceptance Criteria:
- Print control is interactive.
- Browser print dialog opens.
- Works in Chrome and Edge.
- Keyboard accessible.
- No console or hydration errors.
- PDF download remains available.

Fix Summary:
Print SOA now uses a dedicated client button with `type="button"`, a direct `window.print()` mouse handler, and explicit Enter/Space keyboard activation. Chrome and Edge local verification confirmed print invocation, active pointer events, no disabled state, no runtime errors, and preserved PDF Download/Return links.

---

## Bug #029 – SOA PDF Pagination and Footer

Module:
Statement of Account

Priority:
Critical

Status:
Fixed in Sprint 2.4 SOA finalization on 2026-07-11

Problem:
Short SOA documents still create an unnecessary second page containing the signature or footer area.

Expected Behavior:
A short SOA should fit on one A4 portrait page when content allows.

Acceptance Criteria:
- Signature block remains on page 1 when space permits.
- Footer remains on page 1 when space permits.
- No nearly empty final page.
- Long statements paginate correctly.
- No overlapping text or decorative lines.
- Tables remain aligned.

Fix Summary:
SOA PDF table flow now measures the first row with the header, uses compact empty-state rows, reduces excess table gaps, removes crowded decorative value lines, and draws the signature/footer block only after confirming measured remaining space. The verified 1-ledger / 0-payment / 1-billing sample renders as exactly one A4 page.

## Bug #030 – Browser Print Preview Pagination and Horizontal Overflow

Module:
Statement of Account

Priority:
Critical

Status:
Fixed in Sprint 2.4 SOA finalization on 2026-07-12

Problem:
The SOA browser print preview produces three pages even though the content should fit more efficiently. The preview also reports horizontal overflow.

Observed Result:
- Page 1 ends after part of Account Summary.
- Page 2 contains Aging Summary and Running Ledger with excessive unused space.
- Page 3 contains Payment History, Billing History, and signatures.
- Some table headers wrap awkwardly.
- Browser print output differs significantly from the downloaded PDF layout.

Expected Behavior:
Browser printing must produce a professional A4 portrait statement with compact and natural pagination.

Acceptance Criteria:
- No horizontal overflow.
- Account Summary remains together when space permits.
- Sections do not force unnecessary page breaks.
- Payment History and Billing History use remaining space before creating a new page.
- No mostly empty intermediate page.
- Table headers remain readable.
- Signature block stays together.
- Action buttons and application navigation remain hidden.
- Chrome and Edge print previews are supported.
- Long statements still paginate correctly.

Fix Summary:
Browser Print SOA now uses SOA-scoped print CSS for compact A4 flow, table-specific fixed column widths, normalized table wrapping, stacked print history sections, compact header/summary/footer spacing, and a small print-only sheet zoom for Chrome/Edge. Local verification for homeowner `ABAD, JOHN DARYL ENFANSO` produced 1 printed A4 page in both Chrome and Edge with no horizontal overflow and full statement content.
## Bug #031 – Multiple Official Receipts Generated for One Payment Transaction

Module:
Payments and Official Receipts

Priority:
Critical

Status:
Ready for Product Owner UAT

Problem:
When an administrator records one payment covering multiple open bills, the system creates multiple receipt numbers instead of one receipt for the complete payment transaction.

Business Rule:
One payment transaction must create exactly one Official Receipt, regardless of how many bills or billing periods are covered.

Expected Behavior:
- One payment transaction
- One Official Receipt number
- One payment reference number
- One payer
- One total amount
- Multiple bill allocations under the same transaction and receipt
- Receipt coverage lists all selected bills or months
- Receipt total equals the total payment

Acceptance Criteria:
- A single-bill payment creates one receipt.
- A multi-bill payment creates one receipt.
- All selected bill allocations reference the same receipt number.
- Registered Receipts shows one receipt record for the transaction.
- Active Payments and Transaction History do not double-count the transaction.
- Reprinting or refreshing the receipt does not create another receipt.
- Payment history and SOA show the transaction consistently.
- Tenant isolation and audit logging remain enforced.

Fix Summary:
`Payment` now represents one transaction header and Official Receipt, while tenant-safe `PaymentAllocation` rows represent the covered bills. Multi-bill recording allocates one receipt number once, creates one payment header, writes one transaction audit event, and recalculates every covered bill atomically. The local migration backfilled one allocation for each legacy payment without changing historical IDs, amounts, batches, or receipt numbers.

---

## Improvement #032 – Automatic Receipt Preview After Successful Payment

Module:
Payments and Official Receipts

Priority:
High

Status:
Fixed in urgent finance migration and hotfix on 2026-07-12

Requirement:
After a payment is successfully recorded, automatically open the generated Official Receipt preview for the administrator.

Acceptance Criteria:
- Successful payment redirects to the generated receipt preview.
- The receipt displays payer, total amount, covered bills, payment method, reference number, collector, and receipt number.
- The administrator can print immediately.
- Return to Record Payment and Return to Payments actions are available.
- Refreshing the receipt does not generate another receipt.
- Desktop and mobile are supported.

Fix Summary:
Successful Record Payment submissions now redirect to the persisted `/receipts/payment/{paymentId}` preview. The preview and PDF show all allocation lines, the transaction total, property/account details, remaining balance, reference, remarks, and collector, with Print Receipt, Return to Record Payment, and Return to Payments actions. Refresh and retry reuse the persisted transaction and do not allocate another receipt.
## Bug #033 – Payment Allocation Cross-Tenant Validation False Positive

Module:
Payments and Payment Allocations

Priority:
Critical

Status:
Open

Problem:
Recording a payment for a valid homeowner and valid bills inside the authenticated tenant fails with:

`Cross Tenant block for paymentallocation.payment`

Observed Tenant:
- Tenant slug: test-hoa
- Payment initiated by the authenticated tenant administrator
- Selected bills belong to the same tenant and homeowner

Expected Behavior:
A payment and its allocations must save successfully when Payment, PaymentAllocation, Bill, Homeowner, and authenticated session all belong to the same tenant.

Acceptance Criteria:
- Valid same-tenant payment succeeds.
- Payment header tenantId comes from the authenticated session.
- Allocation tenantId matches the Payment and Bill tenant.
- Composite relation fields are populated consistently.
- Cross-tenant payment attempts remain blocked.
- Error messages identify the exact mismatched entity.
- Single-bill, multi-bill, partial, and overpayment transactions work within the tenant.
- Tenant isolation tests remain passing.

Fix Summary:
Composite tenant relation checks now distinguish a committed cross-tenant target from a same-tenant row created inside the active interactive transaction. Existing cross-tenant targets are blocked with server-side entity diagnostics, while new Payment rows are validated atomically by the tenant-composite database foreign key. Same-tenant PaymentAllocation creation and the tenant isolation regression both pass.

---

## Improvement #034 – Support Payment Overpayment and Unapplied Credit

Module:
Payments

Priority:
Critical

Status:
Fixed (2026-07-12)

Business Requirement:
The system must allow a homeowner to pay more than the total selected outstanding bills.

Example:
- Selected bills total: PHP 1,500
- Payment received: PHP 2,000
- Applied to bills: PHP 1,500
- Unapplied credit: PHP 500

Expected Behavior:
The overpayment amount must be recorded as homeowner credit and available for future billing application.

Acceptance Criteria:
- Payment amount may exceed selected bill balances.
- Allocations to selected bills cannot exceed their outstanding balances.
- Difference between payment total and allocated total is stored as unapplied credit.
- Receipt shows:
  - total amount received
  - amount applied to bills
  - unapplied credit
- Homeowner ledger shows the credit.
- SOA includes the credit in the account summary.
- Future billing may apply available credit through an authorized workflow.
- Credit remains tenant-scoped and homeowner-scoped.
- Voiding the payment reverses both allocations and unapplied credit.
- Reports do not treat unapplied credit as duplicate collection.

Fix Summary:
Payment.amount stores the full cash received, PaymentAllocation totals store the applied amount, and their positive difference is the authoritative tenant- and homeowner-scoped unapplied credit. Recording, payment-request approval, controlled amount edits, voiding, receipts, SOA, portal history, receipt register, CSV/PDF/DOCX reports, and active/history views now preserve and display that distinction. Future automatic credit application remains intentionally deferred to a separately authorized workflow.
## Bug #035 – Receipt Uses Incorrect Tenant Branding

Module:
Official Receipts

Priority:
Critical

Status:
Fixed

Problem:
A receipt created in the `test-hoa` tenant displays branding and organization information from PAGSIBOL VILLAGE PH2 4B EAST.

Expected Behavior:
Receipt preview and PDF must use the authenticated transaction tenant's organization profile.

Acceptance Criteria:
- Tenant name is correct.
- Tenant logo is correct.
- Tenant address and contact details are correct.
- Tenant registration and TIN values are correct when configured.
- Receipt preview and PDF use the same tenant information.
- No default or previously cached tenant branding appears.
- Cross-tenant receipt access remains blocked.

---

## Bug #036 – Receipt Property and Account Information Incorrect

Module:
Official Receipts

Priority:
High

Status:
Fixed

Problem:
The Property / Account section displays an internal identifier such as:

`Block 1, Lot 1 | cmrhb41ys0005tymwel3yfzcd`

Expected Behavior:
The receipt must display user-facing property and account details.

Acceptance Criteria:
- Show Block and Lot.
- Show property address.
- Show homeowner account number.
- Do not expose internal database IDs.
- Use the correct property linked to the payment homeowner.
- Preview and PDF display the same information.

---

## Bug #037 – Authorized HOA Processor Shows Role Instead of Real Name

Module:
Official Receipts

Priority:
Critical

Status:
Fixed

Problem:
The receipt displays a role such as `Test Role` instead of the actual name of the authorized HOA processor.

Expected Behavior:
The receipt must show the full name of the authenticated user who processed or approved the transaction.

Acceptance Criteria:
- Printed processor name is the user's real display name.
- Role or position may appear separately.
- Signature/printed-name block does not use the role as the person's name.
- Preview and PDF remain consistent.
- Historical receipt processor identity remains immutable.

---

## Bug #038 – Voided Payment Reference Cannot Be Reused

Module:
Payments

Priority:
High

Status:
Fixed

Problem:
After a payment is voided, recording a replacement payment using the same external GCash or bank reference is rejected as already used.

Business Rule:
A voided transaction must not permanently block the external reference from being reused for its authorized replacement transaction.

Acceptance Criteria:
- Active non-voided transactions retain unique reference protection.
- A reference belonging only to a voided transaction may be reused.
- Reuse is tenant-scoped.
- The new payment audit trail links or refers to the prior void when appropriate.
- No duplicate active payment exists for the same reference.
- GCash and Bank Transfer follow the same rule.

---

## Bug #039 – Transaction History Does Not Show Each Payment Transaction Clearly

Module:
Payments – Transaction History

Priority:
High

Status:
Fixed

Problem:
Transaction History combines or obscures separate Payment transactions and displays internal IDs as the primary transaction reference.

Expected Behavior:
Each Payment header must appear as one separate transaction row.

Acceptance Criteria:
- One row per Payment transaction.
- Each row shows the Official Receipt number prominently.
- Separate receipts such as `AR-MD-2026-0000002` and `AR-MD-2026-0000003` appear as separate rows.
- Internal database ID is hidden or shown only as secondary technical detail.
- Voided transactions remain visible and clearly marked Void.
- Allocation details may be expandable.
- Totals are not double-counted.

---

## Bug #040 – Voiding Does Not Update SOA and Homeowner Credit

Module:
Payments, SOA, and Ledger

Priority:
Critical

Status:
Fixed

Problem:
Voiding a payment reverses the transaction but does not correctly update the homeowner SOA, ledger, balances, or unapplied credit.

Expected Behavior:
Voiding must reverse the complete financial effect of the Payment transaction.

Acceptance Criteria:
- Every PaymentAllocation is reversed.
- Covered bill balances are restored.
- Bill statuses are recalculated.
- Unapplied homeowner credit is reversed.
- SOA outstanding balance is updated.
- SOA payment history marks the payment void or excludes it from active totals according to policy.
- Running Ledger reflects the reversal.
- Account Summary credit value is corrected.
- Registered Receipt remains preserved and marked Void.
- One transaction-level void audit event is recorded.
- No partial reversal remains.

---

## Bug #041 – Receipt Preview and PDF Layout Are Inconsistent

Module:
Official Receipts

Priority:
High

Status:
Fixed

Problem:
The downloaded receipt PDF uses a different layout or data composition from the on-screen receipt preview.

Expected Behavior:
Preview and PDF must display the same transaction data, allocation coverage, tenant branding, totals, processor identity, and receipt number.

Acceptance Criteria:
- Same tenant branding.
- Same payer and property/account details.
- Same receipt number.
- Same allocations and coverage.
- Same total received, applied amount, and unapplied credit.
- Same processor name.
- Professional A4 print layout.
- No internal IDs exposed.

Fix Summary:
Bugs #035-#041 were verified locally on July 12, 2026. Receipts now use one tenant-authorized view model for preview, print, and PDF values; show public property/account details and persisted processor identity; preserve voided receipts; permit tenant-scoped replacement use of voided GCash and bank references; show one transaction-history row per Payment header; and represent complete payment void reversals in bills, active credit, SOA totals, and the running ledger. No Prisma schema or migration change was required.
## Bug #045 – Browser Tab Title Uses Default Tenant

Module:
Multi-Tenant Branding

Priority:
High

Status:
Open

Problem:
When accessing:

/test-hoa/login

the browser tab still displays:

Pagsibol Village PH2 4B East

instead of:

Test HOA

Expected Behavior:

The browser title must be generated from the current tenant.

Acceptance Criteria:

- Login page title matches tenant.
- Admin pages title matches tenant.
- Homeowner pages title matches tenant.
- Browser tab updates correctly after tenant switch.
- No default tenant title appears for authenticated or tenant-specific pages.
- Favicon should also be tenant-aware if configured.
## Bug #045 – Global Metadata Uses Hard-Coded Tenant Branding

Module:
Multi-Tenant Platform

Priority:
Critical

Status:
Open

Problem:
The root layout (`app/layout.tsx`) hard-codes:

- Pagsibol Village PH2 4B East

as the application title.

Every tenant therefore sees the wrong browser tab title.

Expected Behavior:

Metadata must be tenant-aware.

Acceptance Criteria:

- Login page title matches current tenant.
- Admin page title matches current tenant.
- Homeowner portal title matches current tenant.
- Browser tab updates correctly after login.
- Default branding is only used during bootstrap.
- Favicon supports tenant branding when configured.
- Manifest/PWA name uses tenant branding.
## Improvement #046 – Add Search to Billing Rules

Module:
Billing Rules

Priority:
Medium

Status:
Open

Problem:
The Billing Rules page has pagination but no search function.

Expected Behavior:
Administrators should be able to search billing rules without manually browsing pages.

Acceptance Criteria:
- Search by resolution reference.
- Search by recurring charge type.
- Search by amount where practical.
- Search by effective year and month.
- Search by active or inactive status.
- Search remains tenant-scoped.
- Pagination works with search results.
- Mobile layout remains usable.
## Improvement #047 – Add Pagination to Billing Records

Module:
Billing

Priority:
Medium

Status:
Open

Problem:
The Billing table does not provide pagination for larger datasets.

Acceptance Criteria:
- Server-side or scalable pagination.
- Page size control where appropriate.
- Search and filters continue to work with pagination.
- Tenant isolation is preserved.
- Mobile layout remains usable.

---

## Improvement #048 – Add Processing State to Billing Preview and Generation

Module:
Billing

Priority:
High

Status:
Open

Problem:
When Preview Billing or Generate Billing is running, there is no visible progress or processing state.

Expected Behavior:
Users must receive immediate feedback that the request is being processed.

Acceptance Criteria:
- Preview button shows a loading state.
- Generate button shows a loading state.
- Buttons are disabled while processing.
- Duplicate submissions are prevented.
- Clear success or failure feedback appears.
- Works for individual, selected, and all-homeowner generation.
- Mobile layout remains usable.
## Bug #049 – SOA Browser Print Preview and Downloaded PDF Are Inconsistent

Module:
Statement of Account

Priority:
High

Status:
Ready for Product Owner UAT

Problem:
The SOA browser Print Preview and the downloaded SOA PDF use different formatting and composition.

Expected Behavior:
Both outputs must present the same business data and a visually consistent statement structure.

Acceptance Criteria:
- Same tenant branding
- Same homeowner information
- Same account summary
- Same outstanding balance
- Same aging summary
- Same running ledger
- Same payment history
- Same billing history
- Same signature and footer content
- Same ordering of sections
- No data appears in one output but not the other
- Print Preview remains optimized for browser printing
- Downloaded PDF remains optimized for A4
- Minor spacing differences are acceptable, but the document structure and data must match

Sprint 5B Engineering Update:
- SOA screen print and downloaded PDF now consume the same tenant-scoped SOA service values and avoid visible database-id-derived statement/reference labels.
- Browser print payment-history columns were aligned to the same 10-column structure as the PDF, with generated footer content present in both outputs.
- PDF rows wrap instead of truncating long cell content.
- Status remains pending Product Owner UAT; do not mark Bug #049 complete until local print/PDF parity UAT passes.
- Improvements #056-#058 must retain their current statuses until Product Owner UAT passes.
## Improvement #050 – Add Search and Pagination to Active Payments

Module:
Payments – Active Payments

Priority:
Medium

Status:
Open

Acceptance Criteria:
- Search by homeowner name.
- Search by receipt number.
- Search by payment reference.
- Search by payment method.
- Filter by date range.
- Server-side or scalable pagination.
- Tenant isolation remains enforced.
- Mobile layout remains usable.

---

## Improvement #051 – Add Search and Pagination to Transaction History

Module:
Payments – Transaction History

Priority:
Medium

Status:
Open

Acceptance Criteria:
- Search by homeowner name.
- Search by receipt number.
- Search by external reference.
- Filter by Active and Void status.
- Filter by date range and payment method.
- One row per Payment transaction.
- Server-side or scalable pagination.
- Tenant isolation remains enforced.
- Mobile layout remains usable.

---

## Improvement #052 – Add Search and Pagination to Payment Requests

Module:
Payments – Payment Requests

Priority:
Medium

Status:
Open

Acceptance Criteria:
- Search by homeowner name.
- Search by request reference.
- Filter by status.
- Filter by payment method and date range.
- Server-side or scalable pagination.
- Tenant isolation remains enforced.
- Mobile layout remains usable.

---

## Sprint 5A - Executive Finance Dashboard

Module:
Reports / Finance

Priority:
High

Status:
Ready for Product Owner UAT

Delivery Criteria:
- Tenant-scoped executive KPIs, reconciliation, monthly collection trend, receivables aging, payment-method mix, and billing-type performance are available at `/admin/reports/dashboard`.
- Top delinquent homeowners support search and pagination; recent finance activity is bounded and excludes internal identifiers.
- PDF and DOCX exports use the same date range and authoritative report service as the screen.
- Access requires an authenticated tenant, an authorized finance or administrative role, and Billing plus Reports module entitlement where applicable.
- No Prisma schema or migration change is required.

Release Gate:
- Product Owner must complete the Sprint 5A checklist in `FINANCE_UAT_CHECKLIST.md` before this dashboard is approved for release.
- Existing Improvements #053-#055 retain their current statuses and are not changed by this delivery.
## Improvement #061 – Preserve Table Focus During Pagination

Module:
Shared UI / Pagination Component

Priority:
High

Status:
Open

Problem:
When the user clicks Next or Previous on a paginated table, the browser scrolls away from the table and the user's reading position is lost. This requires the user to manually scroll back to continue reviewing the data.

Affected Modules:
- Finance Dashboard – Recent Finance Activity
- Finance Dashboard – Top Delinquent Homeowners
- Active Payments
- Transaction History
- Payment Requests
- Billing Rules
- Billing Exemptions
- Billing Preview
- Any future paginated tables

Expected Behavior:
After changing pages, the viewport should remain focused on the table that initiated the pagination.

Acceptance Criteria:
- Clicking Next or Previous keeps the table visible.
- The table header remains in view.
- Keyboard focus moves to the updated table or heading.
- Search filters remain applied.
- Date filters remain applied.
- Sorting remains applied.
- URL parameters remain synchronized.
- Works on desktop and mobile.
- No console or hydration errors.
- Implement in the shared pagination component so all modules inherit the behavior automatically.

Engineering Notes:
- Added reusable pagination focus restoration using URL hash targets and keyboard-focus repair after navigation.
- Applied to Finance Dashboard delinquency/activity pagination and the shared payments pager used by Active Payments, Transaction History, Payment Requests, and Record Payment.
- Applied to client-side Billing Preview pagination.
- Billing Rules and Billing Exemptions currently have no Next/Previous pagination controls; future pagination should use the shared focus target pattern.
- Local verification completed in the authenticated Chromium in-app browser and 390px mobile viewport; Chrome and Edge Product Owner browser UAT remains pending.
## Improvement #061 – Preserve Table Focus During Pagination

Module:
Shared UI / Pagination Component

Priority:
High

Status:
Completed

Resolution:
A reusable pagination focus helper was implemented and applied to the Finance Dashboard, Payments tables, Record Payment, and Billing Preview.

Validated:
- Viewport returns to the initiating table.
- Keyboard focus moves to the updated table.
- Search, date filters, sorting, and URL parameters persist.
- Desktop and 390px mobile pass.
- No console errors.

---

## Sprint 6A - Homeowner Mobile Foundation

Module:
Homeowner Portal / Mobile Shell

Priority:
High

Status:
Ready for Product Owner UAT

Delivery Criteria:
- Homeowner portal uses a mobile-first authenticated application shell with tenant branding, profile access, safe-area-aware bottom navigation, and active-route states.
- Primary homeowner routes include `/portal/dashboard`, `/portal/profile`, `/portal/pay`, `/portal/soa`, `/portal/documents`, `/portal/announcements`, `/portal/events`, and `/portal/chat`.
- Dashboard foundation uses the existing tenant-safe SOA service plus bounded homeowner, billing, payment request, document request, announcement, and event reads.
- Quick actions are filtered by tenant module entitlements and never accept tenant IDs from client input.
- Portal content reads were tightened with explicit tenant predicates for billing, payments, collections, documents, announcements, events, vehicles, and HOA officers.
- PWA foundation adds neutral HOAHub install metadata without offline caching of authenticated financial data.
- No Prisma schema or migration change is required.

Release Gate:
- Product Owner must verify the homeowner portal at 360px, 390px, 430px, tablet, and desktop widths before Sprint 6A is approved.
- Sprint 6B remains responsible for deeper feature redesigns, offline strategy, and expanded native-app behaviors.
## Bug #062 – Available Document Type Cannot Be Requested

Module:
Homeowner Document Requests

Priority:
Critical

Status:
Open

Problem:
A homeowner can select Certificate of Residency and enter the purpose and remarks, but submission fails with:

`This document type is currently unavailable`

Expected Behavior:
A document type displayed as selectable must be available for submission for the authenticated tenant.

Acceptance Criteria:
- Only active tenant document types appear in the homeowner request form.
- Certificate of Residency can be requested when enabled.
- Purpose and remarks are saved.
- Request is created for the logged-in homeowner only.
- Request belongs to the authenticated tenant.
- Disabled document types are hidden or clearly marked unavailable.
- No cross-tenant document templates or fees are exposed.
- Mobile submission works.
- Clear success and failure messages are displayed.

---

## Improvement #063 – Configurable Free or Paid Document Requests

Module:
Document Requests and Tenant Settings

Priority:
High

Status:
Open

Business Requirement:
Each tenant must be able to define whether a document type is free or paid and configure its fee.

Example:
- Certificate of Residency
- Fee: PHP 150
- Another tenant may configure the same certificate as free

Acceptance Criteria:
- Each document type has a tenant-scoped fee configuration.
- Fee may be zero.
- Admin can mark a document as free or paid.
- Homeowner sees the fee before submission.
- Request records preserve the fee snapshot at the time of request.
- Paid requests show payment status.
- Free requests do not require payment.
- Approval workflow works for free and paid requests.
- Tenant isolation is enforced.
- Existing document requests remain unchanged.
## Improvement #064 – Document Requests for Registered Family Members

Module:
Homeowner Document Requests

Priority:
High

Status:
Open

Requirement:
Homeowners may request eligible documents for themselves or registered household/family members linked to their account and property.

Acceptance Criteria:
- Subject selection supports self and registered household members.
- Server validates homeowner, household-member, property, and tenant ownership.
- Request stores a subject snapshot.
- Another homeowner’s household members cannot be selected.
- Mobile workflow is supported.
- Existing generated documents remain unchanged if household data is later updated.

---

## Improvement #065 – Admin Review and Editing Before Document Approval

Module:
Document Administration

Priority:
Critical

Status:
Open

Requirement:
Authorized administrators must be able to review and edit all information that will appear in a requested document before approval.

Acceptance Criteria:
- Admin can edit subject, address, property, purpose, dates, copies, remarks, signatory, and document-specific fields.
- Original and edited values are auditable.
- Approved document uses the final reviewed values.
- Only tenant-authorized roles can edit and approve.
- Existing generated document snapshots remain immutable.

---

## Improvement #066 – Tenant-Configured Instant Download and Approval Rules

Module:
Tenant Document Configuration

Priority:
Critical

Status:
Open

Requirement:
Each tenant defines whether each document type is available for instant download, requires payment, requires approval, requires both, or is request-only.

Acceptance Criteria:
- Delivery mode is persisted per tenant document type.
- Free instant documents may download after validated submission.
- Paid documents enforce payment.
- Approval documents enforce admin approval.
- Payment-and-approval documents enforce both.
- Request and status history are recorded for instant downloads.
- Tenant isolation is enforced.
