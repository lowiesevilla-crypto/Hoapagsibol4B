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
Open

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
Open

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
Open

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

---

## Improvement #032 – Automatic Receipt Preview After Successful Payment

Module:
Payments and Official Receipts

Priority:
High

Status:
Open

Requirement:
After a payment is successfully recorded, automatically open the generated Official Receipt preview for the administrator.

Acceptance Criteria:
- Successful payment redirects to the generated receipt preview.
- The receipt displays payer, total amount, covered bills, payment method, reference number, collector, and receipt number.
- The administrator can print immediately.
- Return to Record Payment and Return to Payments actions are available.
- Refreshing the receipt does not generate another receipt.
- Desktop and mobile are supported.