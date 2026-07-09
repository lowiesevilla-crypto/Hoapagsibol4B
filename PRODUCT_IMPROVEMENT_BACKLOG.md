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

🔴 Improvement #014 – Monthly Dues Exemption Period
Configurable exemption periods with reasons and audit logging.
🔴 Improvement #015 – Billing Rules Engine
Configurable billing policies (exemptions, discounts, penalties, rate types).
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

