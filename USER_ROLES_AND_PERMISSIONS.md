# HOAHub User Roles and Permissions

**Product:** HOAHub – Multi-Tenant Digital Community Management Platform

**Version:** 1.0

**Last Updated:** July 11, 2026

**Document Owner:** Lowie M. Sevilla

---

# 1. Purpose

This document defines the official Role-Based Access Control (RBAC) model for HOAHub.

Every authenticated user must belong to one or more authorized roles. Access to modules, data, and actions is determined by these roles and always enforced within the user's tenant.

---

# 2. RBAC Principles

The RBAC model follows these principles:

- Tenant Isolation First
- Least Privilege
- Server-side Authorization
- Audit Logging
- Configurable Permissions
- No Cross-Tenant Access
- Philippine Data Privacy Act of 2012 Compliance

---

# 3. Standard Roles

Current system roles:

- SUPER_ADMIN
- HOA_ADMIN
- FINANCE
- PAYROLL_MANAGER
- EMPLOYEE
- HOMEOWNER
- SECURITY

Future roles:

- BOARD_MEMBER
- COMMITTEE_MEMBER
- AUDITOR
- PROPERTY_MANAGER

---

# 4. SUPER_ADMIN

Purpose

Platform Administrator

Scope

All Tenants

Responsibilities

- Manage Tenants
- Subscription Management
- Platform Configuration
- View Platform Analytics
- Manage Global Settings

Restrictions

- Must explicitly select a tenant before viewing tenant data.
- Cannot bypass audit logging.

---

# 5. HOA_ADMIN

Scope

Single Tenant

Access

- Dashboard
- Homeowners
- Properties
- Finance
- Documents
- Community
- Reports
- Settings

Responsibilities

- Manage HOA operations
- Approve requests
- Manage users
- Configure billing rules
- Generate reports

Restrictions

- Cannot access other tenants.

---

# 6. FINANCE

Scope

Single Tenant

Access

- Billing
- Billing Rules
- Billing Generation
- Billing Exemptions
- Payments
- Official Receipts
- Statement of Account
- Finance Reports

Responsibilities

- Generate bills
- Record payments
- Manage exemptions
- Produce financial reports

Restrictions

- Cannot access HRIS or Payroll.
- Cannot change tenant settings.

---

# 7. PAYROLL_MANAGER

Scope

Single Tenant

Access

- Employees
- Attendance
- Payroll
- Loans
- Cash Advance
- Payslips

Responsibilities

- Payroll Processing
- Attendance Approval
- Salary Management

Restrictions

- Salary data visible only to Payroll Manager and HOA Admin when authorized.

---

# 8. EMPLOYEE

Scope

Single Tenant

Access

- Personal Profile
- Attendance
- Leave
- Payslips
- Announcements

Restrictions

- Cannot access Finance Administration.
- Cannot access other employees' records.

---

# 9. HOMEOWNER

Scope

Single Tenant (Future enhancement: multi-property across multiple tenants)

Access

- Dashboard
- Personal Profile
- Properties
- Statement of Account
- Billing
- Payments
- Official Receipts
- Documents
- Announcements
- Events
- Complaints
- Chat

Restrictions

- Cannot view other homeowners.
- Cannot access HOA administration.

---

# 10. SECURITY

Scope

Single Tenant

Access

- Visitor Management
- Gate Pass
- Vehicle Verification
- Incident Logs

Restrictions

- No Finance
- No Payroll
- No Administration

---

# 11. Module Permission Matrix

| Module | Super Admin | HOA Admin | Finance | Payroll | Employee | Homeowner | Security |
|----------|:----------:|:---------:|:--------:|:--------:|:---------:|:----------:|:--------:|
| Dashboard | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Homeowners | ✓ | ✓ | View | No | No | Own Profile | No |
| Billing | ✓ | ✓ | ✓ | No | No | View Own | No |
| Payments | ✓ | ✓ | ✓ | No | No | View Own | No |
| Official Receipts | ✓ | ✓ | ✓ | No | No | View Own | No |
| SOA | ✓ | ✓ | ✓ | No | No | View Own | No |
| Documents | ✓ | ✓ | ✓ | No | No | Own | No |
| Community | ✓ | ✓ | View | No | View | View | View |
| HRIS | ✓ | ✓ | No | ✓ | Own | No | No |
| Payroll | ✓ | Authorized | No | ✓ | Own Payslip | No | No |
| Settings | ✓ | ✓ | Limited | No | No | No | No |

---

# 12. AI Permissions

AI responses must follow the same RBAC rules.

Examples

Finance AI

May answer:

- Balance
- Payment History
- Billing

Only for the authenticated homeowner.

HR AI

May answer:

- Attendance
- Leave
- Payslip

Only for the authenticated employee.

---

# 13. Tenant Isolation Rules

Every permission is evaluated within the authenticated tenant.

No role may access another tenant unless explicitly operating as SUPER_ADMIN with tenant context selected.

---

# 14. Audit Requirements

Every privileged action must record:

- Tenant
- User
- Role
- Module
- Action
- Timestamp

---

# 15. Future Enhancements

- Custom Roles
- Configurable Permissions
- Delegated Administration
- Temporary Access
- Approval Workflows
- MFA Enforcement by Role

---

# Document History

| Version | Date | Description |
|----------|------|-------------|
| 1.0 | July 11, 2026 | Initial RBAC Specification |