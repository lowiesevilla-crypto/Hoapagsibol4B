# HOAHub Testing Guide

**Product:** HOAHub – Multi-Tenant Digital Community Management Platform

**Version:** 1.0

**Last Updated:** July 11, 2026

**Document Owner:** Lowie M. Sevilla

---

# 1. Purpose

This document defines the official testing process for HOAHub.

Every feature, bug fix, enhancement, and release candidate must follow this guide before merging into the `develop` or `main` branches.

---

# 2. Testing Principles

Every release must be:

- Functional
- Secure
- Mobile Responsive
- Tenant Isolated
- Auditable
- Production Ready

---

# 3. Testing Levels

## 3.1 Unit Testing

Validate individual functions or services.

Examples:

- Billing calculations
- Balance updates
- Duplicate prevention
- Validation rules

---

## 3.2 Integration Testing

Verify interaction between modules.

Examples:

- Billing → Payment
- Payment → Receipt
- Receipt → SOA
- Billing Rules → Billing Generation

---

## 3.3 User Acceptance Testing (UAT)

Conducted after development is complete.

Checklist:

- Feature works as expected
- UI/UX is intuitive
- Mobile responsive
- No console errors
- Business process is correct

---

## 3.4 Regression Testing

Ensure existing functionality still works after changes.

Modules to verify:

- Authentication
- Homeowners
- Finance
- Documents
- Community
- HRIS

---

## 3.5 Security Testing

Verify:

- Tenant Isolation
- Role-Based Access
- Session Security
- Data Privacy
- Authorization

---

# 4. UAT Process

For every sprint:

1. Execute the feature.
2. Verify business process.
3. Record PASS/FAIL.
4. Document findings.
5. Update backlog.
6. Apply hotfixes if needed.
7. Retest.
8. Approve or reject the sprint.

---

# 5. Mandatory Quality Gates

Before merge:

- Prisma Validate
- Prisma Generate
- Typecheck
- Clean Build
- Mobile Test
- UAT
- Regression Test

---

# 6. Git Validation

Before merge:

```bash
git branch
git status
git log --oneline -1
```

Working tree must be clean.

---

# 7. Build Validation

```bash
pnpm exec prisma validate
pnpm exec prisma generate
pnpm typecheck
pnpm build
```

All commands must pass.

---

# 8. Mobile Testing

Verify on:

- Desktop
- Tablet
- Mobile

Check:

- Navigation
- Tables
- Forms
- Dialogs
- Buttons
- Responsive Layout

---

# 9. Release Approval

A release is approved only if:

- Development Complete
- Documentation Updated
- UAT Passed
- Regression Passed
- Build Passed
- Product Owner Approved

---

# Document History

| Version | Date | Description |
|----------|------|-------------|
| 1.0 | July 11, 2026 | Initial Testing Guide |