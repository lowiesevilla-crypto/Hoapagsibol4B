# HOAHub Finance Engine

**Product:** HOAHub – Multi-Tenant Digital Community Management Platform

**Version:** 1.0

**Last Updated:** July 11, 2026

**Document Owner:** Lowie M. Sevilla

---

# 1. Purpose

The Finance Engine is the core financial processing module of HOAHub.

It manages billing, collections, receipts, statements, balances, exemptions, and financial reporting while ensuring tenant isolation and auditability.

---

# 2. Design Principles

The Finance Engine follows these principles:

- Single Source of Truth
- Tenant Scoped
- Audit Ready
- Immutable Financial Records
- Mobile Friendly
- AI Ready
- Configurable
- Production Safe

---

# 3. Finance Modules

Current modules:

- Billing Rules
- Billing Generation
- Billing Exemptions
- Payments
- Official Receipts
- Statement of Account
- Ledger
- Financial Reports

Future modules:

- Refunds
- Payment Gateway
- Collections Dashboard
- Budgeting
- General Ledger Integration

---

# 4. Billing Rules

Billing Rules define how recurring charges are created.

Configuration includes:

- Charge Type
- Amount
- Frequency
- Effective Start
- Effective End
- Resolution Reference
- Resolution Date
- Generation Mode
- Penalty Rules

Rules are tenant-specific.

---

# 5. Billing Generation

Supported generation modes:

- All Eligible Homeowners
- Individual Homeowner
- Selected Homeowners
- Block / Phase (when supported)

Individual homeowner billing is generated through the same preview and posting engine as bulk billing. The create workflow submits numeric `coverageYear` and `coverageMonth` values with `scope=HOMEOWNER`, previews the effective rule and skipped rows, then posts only through the shared generation service.

Generation Process:

1. Resolve Tenant
2. Resolve Coverage Period
3. Resolve Effective Billing Rule
4. Check Exemptions
5. Check Duplicates
6. Create Bill
7. Update Balances
8. Record Audit Log

Billing generation revalidates the Billing page, dedicated Payment routes, and affected homeowner detail pages so newly generated balances are immediately available for payment recording.

---

# 6. Billing Exemptions

Billing Exemptions allow specific homeowners to be excluded from recurring charges.

Configuration:

- Homeowner
- Coverage Period
- Charge Type
- Reason
- Resolution Reference
- Approval
- Active / Inactive

---

# 7. Payments

Payment routes:

- `/admin/payments/record`
- `/admin/payments/requests`
- `/admin/payments/active`
- `/admin/payments/history`

The legacy `/admin/payments` route redirects to Record Payment.

Record Payment supports:

- Cash
- Bank Transfer
- GCash
- Maya (Future)
- Online Gateway (Future)

Payment Posting:

1. Validate the payer, selected bills, current balances, reference rules, and idempotency key.
2. Allocate one tenant receipt number.
3. Create one Payment transaction header with the total amount.
4. Create one or more PaymentAllocation rows for the covered bills.
5. Recalculate every affected bill and ledger balance.
6. Record one transaction-level audit event.
7. Commit atomically and redirect to `/receipts/payment/{paymentId}`.

`Payment.amount` must equal the sum of its positive allocation amounts. New payments use allocations as the authoritative bill links; the nullable legacy `Payment.billId` remains only for backward compatibility. Reads prefer allocations and fall back to the legacy bill link only when no allocations exist.

Record Payment uses a tenant-scoped server-side search over current open bill balances. Searchable fields include homeowner name, block, lot, account ID, email, bill ID, and resolution reference. Search results are not truncated by a small client-side limit.

Payment Requests are tenant-scoped on submission, review, approval, rejection, and webhook approval. Approved monthly dues requests post through the existing payment process and update bill balances and receipts.

---

# 8. Official Receipts

Receipt features:

- Tenant-specific numbering
- Receipt Types
- Collector Name
- Printed Name
- Digital Signature (Future)
- QR Verification (Future)

---

# 9. Statement of Account

SOA includes:

- Homeowner Details
- Financial Summary
- Billing History
- Payment History
- Running Ledger
- Outstanding Balance
- PDF Export
- Browser Print
- Mobile Layout

SOA print and PDF output rules:

- Print uses a client-side `button type="button"` that invokes browser printing from a direct user gesture.
- Browser print uses SOA-scoped A4 rules, compact section spacing, fixed table column widths, and normal word wrapping so Chrome and Edge avoid horizontal overflow and blank carryover pages.
- PDF generation uses content-flow layout for tables, signatures, and footer content.
- Short statements must not create a nearly empty second page.
- Long statements paginate naturally while repeating table headers where practical and keeping signature lines together.
- SOA output preserves tenant branding, homeowner details, statement number, QR verification, ledger, aging, billing, and payment history.

---

# 10. Ledger

The ledger provides a chronological history of:

- Bills
- Payments
- Adjustments
- Credits
- Refunds (Future)

Every financial movement must appear in the ledger.

---

# 11. Duplicate Prevention

Duplicate billing is prevented using:

- tenantId
- homeownerId
- recurringChargeType
- coverageYear
- coverageMonth

Only one bill is allowed for the same combination.

---

# 12. Balance Management

Balances are updated through a single financial posting process.

Rules:

- Bills increase balance
- Payments reduce balance
- Exemptions do not affect balance
- Duplicate bills do not affect balance

---

# 13. Audit Logging

Every financial transaction records:

- Tenant
- User
- Action
- Timestamp
- Amount
- Reference
- Before Value
- After Value

---

# 14. Reports

Current reports:

- Statement of Account
- Official Receipt
- Billing History
- Payment History

Planned reports:

- Aging Analysis
- Collections Dashboard
- Delinquency Report
- Monthly Collections
- Treasurer Dashboard

---

# 15. Security

Finance operations require appropriate roles.

Examples:

- HOA_ADMIN
- FINANCE

Payroll functions remain isolated.

Every financial query must enforce tenant isolation.

---

# 16. AI Integration

Future AI capabilities:

- Payment Status
- Balance Inquiry
- SOA Explanation
- Receipt Lookup
- Billing Questions
- Collection Insights

AI responses must:

- Respect tenant isolation
- Respect user permissions
- Never expose another tenant's data

---

# 17. Roadmap

Completed

- Statement of Account
- Billing Rules
- Billing Exemptions
- Billing Generation (Core)
- Finance Integration
- Payment Synchronization
- Individual Billing Workflow
- Split Payments Routes

Planned

- Payment Gateway
- Webhooks
- Finance Dashboard
- Advanced Reports
- Predictive Collections
- AI Finance Assistant

---

# Document History

| Version | Date | Description |
|----------|------|-------------|
| 1.0 | July 11, 2026 | Initial Finance Engine Documentation |
| 1.1 | July 11, 2026 | Documented Sprint 2.3B individual billing and split payments workflow |
| 1.2 | July 11, 2026 | Documented final SOA browser print and PDF pagination rules |
| 1.3 | July 12, 2026 | Documented one-header multi-bill payments, idempotency, receipt preview, and atomic voiding |
| 1.4 | July 12, 2026 | Documented transaction-safe tenant validation and derived unapplied homeowner credit |

## 18. Unapplied Homeowner Credit

- `Payment.amount` is the total cash received.
- The sum of active `PaymentAllocation.amount` values is the amount applied to bills.
- The positive difference is unapplied credit owned by the same tenant and homeowner.
- Allocations never exceed bill balances; excess cash is not automatically applied to future bills.
- Voided payments are excluded from active credit balances and financial totals.
- Dues revenue includes applied allocations only. Cash receipts include the full payment, with unapplied credit disclosed separately as a liability.
- Historical migrated payments have matching header and allocation totals, so their derived unapplied credit is zero.
