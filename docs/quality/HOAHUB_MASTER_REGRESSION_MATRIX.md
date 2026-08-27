# HOAHub Master Regression Matrix

Status: ACTIVE
Baseline reviewed: `main` @ `34e62289d35163e17ea835a76cf63b3c509e3eaa`
Last updated: 2026-08-26

## Purpose

This matrix is the primary QA reference for what is verified, what has partial evidence, and what still requires automated or production UAT coverage. It is intentionally conservative: an area is not marked VERIFIED unless the required evidence is known.

## Evidence Legend

- `YES` — current audit found explicit automated evidence.
- `PARTIAL` — some automated evidence exists but the full workflow is not covered.
- `NO / PENDING` — no sufficient evidence found in the reviewed critical suites.
- `N/A` — not applicable.

## Core Regression Matrix

| Domain / Workflow | Unit / Static | DB Integration | Browser E2E / Verifier | Production UAT | Risk | Current Status | Next Action |
|---|---|---|---|---|---|---|---|
| Authentication / login | YES | YES | YES | PARTIAL | P0 | VERIFIED baseline | Keep stale-session/back-navigation regression mandatory |
| Tenant isolation / authorization | YES | YES | YES for critical cases | PARTIAL | P0 | VERIFIED baseline for covered cases | Expand to every new financial/operational workflow |
| Homeowner registration / activation | YES/PARTIAL | YES/PARTIAL | YES | PARTIAL | P0 | VERIFIED in CI | Add edit/deactivate/reactivate browser path |
| Homeowner profile / household self-service | YES | PARTIAL | PARTIAL | PENDING | P1 | IMPLEMENTED | Add Admin + Homeowner browser CRUD regression |
| Billing generation | YES | YES | YES | PARTIAL | P0 | VERIFIED in CI | Preserve idempotency and large-tenant scenarios |
| Billing edit / maintenance | YES regression | PARTIAL | PENDING | PENDING | P0 | IMPLEMENTED | Add browser edit/save validation test |
| Billing rules / automatic billing | YES | PARTIAL | PENDING | PENDING | P0 | IMPLEMENTED | Add scheduler/manual-lock browser + DB acceptance |
| Record Payment | YES/PARTIAL | YES | YES | PARTIAL | P0 | VERIFIED in CI for cash critical path | Add payment-method and advance-credit browser cases |
| Payment allocation / unapplied credit | YES | YES | PARTIAL | PENDING | P0 | VERIFIED service behavior | Add browser visibility and follow-on allocation evidence |
| Payment void | YES/PARTIAL | YES | PENDING | PENDING | P0 | IMPLEMENTED | Add browser void + receipt/balance restoration path |
| Payment refund | YES/PARTIAL | YES for homeowner refund | PENDING | PENDING | P0 | IMPLEMENTED | Add browser refund + finance audit path |
| PayMongo online homeowner payment | YES/PARTIAL | YES reconciliation | PARTIAL | PENDING | P0 | IMPLEMENTED | Add controlled gateway/UAT evidence without live-data mutation |
| PayMongo settlement trace/report | YES | PARTIAL | PENDING | PENDING | P0 | IMPLEMENTED | Add authenticated browser report/filter/trace UAT |
| Receipts / AR rendering | PARTIAL | YES through payment flow | YES for payment receipt | PARTIAL | P0 | VERIFIED critical path | Add print/export layout regression where changed |
| Other Collections / bonds | YES/PARTIAL | YES refund/liability | PENDING | PENDING | P0 | IMPLEMENTED | Add browser collection + bond refund path |
| Expenses | PARTIAL | PARTIAL | PENDING | PENDING | P1 | PARTIAL | Add create/edit/report regression |
| Petty Cash | YES recent regressions | PARTIAL | PENDING | PENDING | P0 | IMPLEMENTED / evidence incomplete | Add create/edit/search/Enter/print browser suite |
| Employee create | YES regression for nested transaction | PARTIAL | PENDING | PENDING | P0 | IMPLEMENTED | Add browser create and tenant-boundary confirmation |
| Employee edit | PARTIAL | PARTIAL | PENDING | PENDING | P0 | PARTIAL | Add browser edit nullable/zero-field persistence test |
| Attendance | PARTIAL | Not fully evidenced | PENDING | PENDING | P1 | PARTIAL | Add time/correction/approval browser regression |
| Leave | PARTIAL | Not fully evidenced | PENDING | PENDING | P1 | PARTIAL | Add request/approval/denial browser regression |
| Payroll | YES/PARTIAL | Not fully evidenced in current audit | PENDING | PENDING | P0 | PARTIAL | Build critical payroll browser and DB reconciliation suite |
| Employee loans / cash advances | YES/PARTIAL | PARTIAL | PENDING | PENDING | P0 | PARTIAL | Add deduction-to-loan lifecycle regression |
| Rental management | YES/PARTIAL | PARTIAL | PENDING | PENDING | P1 | PARTIAL | Add asset→agreement→billing→payment→reconciliation E2E |
| Document requests | YES/PARTIAL | YES/PARTIAL | YES | PARTIAL | P0 | VERIFIED critical path | Expand payment-required/custom workflow variants |
| Document generation/download | YES/PARTIAL | YES | YES | PARTIAL | P0 | VERIFIED critical path | Preserve template/version/QR coverage |
| Document Management repository | YES/PARTIAL | YES | YES dedicated E2E | PARTIAL | P1 | VERIFIED covered paths | Add large-library and permission matrix browser cases |
| Complaints | YES verifier | PARTIAL | TARGETED verifier, full E2E pending | PENDING | P1 | PARTIAL | Add filing→assignment→resolution browser lifecycle |
| Announcements | PARTIAL | PARTIAL | YES publish + tenant visibility | PARTIAL | P1 | VERIFIED critical path | Add edit/delete/schedule/attachment where supported |
| Events | PARTIAL | Not fully evidenced | PENDING | PENDING | P2 | PARTIAL | Add RSVP/attendance browser flow where live |
| Vehicles | PARTIAL | Not fully evidenced | Auth-protection smoke only | PENDING | P1 | PARTIAL | Add registration/edit/sticker status E2E |
| Contractors | PARTIAL | Not fully evidenced | PENDING | PENDING | P1 | PARTIAL | Add registration/permit/bond E2E |
| Reports dashboard | YES/PARTIAL finance logic | YES finance | PENDING | PENDING | P0 | PARTIAL | Add date filters, totals and navigation browser coverage |
| Report export PDF/CSV/DOCX | PARTIAL | PARTIAL | PENDING | PENDING | P0 | PARTIAL | Assert export uses same tenant/date accounting authority |
| Platform tenant/subscription/entitlements | YES/PARTIAL | YES/PARTIAL | PARTIAL | PENDING | P1 | PARTIAL | Add create/edit/suspend/visibility browser flow |
| AI assistant | YES | YES isolation/entitlement | YES dedicated E2E | PARTIAL | P1 | VERIFIED covered paths | Keep AI outage from blocking core modules |
| Homeowner mobile/PWA shell | YES multiple verifiers | PARTIAL | YES | PARTIAL | P1 | VERIFIED covered paths | Continue mobile route-by-route protection |
| Accessibility | NO formal complete gate | N/A | PENDING | PENDING | P1 | PENDING | Add WCAG 2.1 AA automation + manual keyboard review |
| Cross-browser compatibility | N/A | N/A | Chromium-focused only | PENDING | P1 | PENDING | Add Edge/Firefox-compatible evidence strategy |
| Large-tenant homeowner / finance / employee scale | YES bounded 5,001-homeowner, 2,001-row finance, and 5,001-employee fixtures | PARTIAL | Employee search browser regression in progress | PENDING | P0/P1 | IN_PROGRESS | PR #211 and #212 merged; employee server-side search/pagination increment is in progress |
| Backup/restore | N/A | Not evidenced in current audit | N/A | PENDING | P0 | PENDING | Establish periodic restore evidence and release runbook |
| Post-deploy authenticated smoke | YES source contract | N/A | YES read-only harness | PENDING live run | P0 | IMPLEMENTED | Configure protected UAT credentials and record controlled production evidence |

## P0 Browser Scenarios to Add First

### BR-E2E-EMP-001 — Employee Create

- Tenant Admin logs in.
- Open Employees.
- Create employee with required identity/employment/compensation.
- Save once.
- Confirm profile persists.
- Confirm no duplicate employee/compensation records.
- Confirm record belongs only to active tenant.

### BR-E2E-EMP-002 — Employee Edit

- Edit optional nullable fields.
- Clear a value and save.
- Persist a valid zero value where allowed.
- Reload and confirm saved result.
- Verify another tenant cannot edit/read by crafted identifier.

### BR-E2E-PAYROLL-001 — Payroll Critical Path

- Prepare eligible employee/pay period in disposable CI tenant.
- Calculate payroll.
- Validate gross/deductions/net.
- Confirm tenant-scoped employee set.
- Execute only approved workflow state transition.
- Confirm persisted payroll results and audit/financial linkage as applicable.
- Retry safe operation and verify no duplication.

### BR-E2E-PCV-001 — Petty Cash Create/Edit

- Search/select payee.
- Verify saved selection is preserved during edit.
- Press Enter in search and confirm the form does not accidentally submit.
- Save explicitly.
- Confirm voucher/expense records.
- Confirm print route and key values.

### BR-E2E-PMT-VOID-001 — Payment Void

- Create deterministic test payment.
- Void using authorized role.
- Confirm balance restoration.
- Confirm receipt status/history.
- Confirm audit evidence.
- Attempt repeated void and confirm safe rejection/idempotent behavior.

### BR-E2E-PMT-REFUND-001 — Refund

- Create refundable test case.
- Perform partial/full valid refund.
- Verify finance/liability/balance result.
- Reject over-refund and cross-tenant identifiers.

### BR-E2E-ONLINE-001 — Online Payments Report

- Open from navigation.
- Search by homeowner/reference/request ID.
- Apply status/date filter.
- Change page size.
- Navigate Previous/Next.
- Open settlement trace.
- Confirm no payment mutation controls exist in read-only trace/report.

### BR-E2E-RPT-001 — Financial Reports

- Apply From/To date.
- Verify rendered totals match deterministic fixture authority.
- Confirm no cross-tenant rows.
- Validate export uses the same filters/accounting source.

## Production Smoke Matrix

The production smoke suite must remain non-destructive unless an explicitly isolated UAT tenant is used.

| Check | Required | Mutation? |
|---|---:|---:|
| `/api/health` database status | YES | No |
| Login page and security headers | YES | No |
| Tenant Admin login to UAT account | YES | Session only |
| Dashboard renders | YES | No |
| Homeowner search/profile opens | YES | No |
| Billing page/search | YES | No |
| Payment history | YES | No |
| Online Payments report | YES | No |
| Employee list/profile | YES | No |
| Document request list | YES | No |
| Complaint list | YES | No |
| Financial report loads | YES | No |
| Logout and fresh login | YES | Session only |

## Regression Quality Rules

1. Finance tests assert exact centavo values.
2. Tenant isolation uses at least two tenants and overlapping human-readable identifiers where practical.
3. Authorized and denied paths are paired.
4. Every fixed production defect receives a permanent regression test.
5. Search tests use results beyond trivial first-page datasets.
6. Form tests cover exact browser-submitted formats.
7. Complex lookup inputs test Enter/Tab/Escape behavior.
8. Browser failures must capture URL, visible body summary, console/page errors, and screenshots/artifacts where practical.
9. No shared CI test is allowed to operate on production data.
10. No critical test may be weakened or permanently skipped to make a release green.

## Completion Rule

A row moves to `VERIFIED` only after its applicable automated and approved-environment evidence is linked. Passing CI for unrelated suites is not sufficient.
