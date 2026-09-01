# HOAHub Master Regression Matrix

Status: ACTIVE RECONCILED QA REFERENCE
Baseline reviewed: production-verified `main` @ `117339d1488a2dc77b7b181f831c58adc6396d73`
Last updated: 2026-09-01

## Purpose

This matrix is the primary QA reference for what is verified, what has partial evidence, and what still requires controlled production UAT coverage. It remains conservative: an area is not marked VERIFIED unless the applicable evidence is known.

The earlier 2026-08-26 matrix contained several `PENDING` / `IN_PROGRESS` entries that were subsequently completed. This reconciliation updates those entries from the verified PR/gate evidence recorded in `HOAHUB_WORK_STATUS_REGISTER.md`, issue #254, issue #273, and the completed 5,001-homeowner automatic-billing proof under issue #278 / PR #283.

## Evidence Legend

- `YES` — current audit found explicit automated evidence.
- `PARTIAL` — some automated evidence exists but the full workflow is not covered.
- `NO / PENDING` — no sufficient evidence found in the reviewed critical suites.
- `N/A` — not applicable.
- `BLOCKED` — accepted evidence step cannot execute until a named external dependency is supplied.

## Core Regression Matrix

| Domain / Workflow | Unit / Static | DB Integration | Browser E2E / Verifier | Production UAT | Risk | Current Status | Next Action |
|---|---|---|---|---|---|---|---|
| Authentication / login | YES | YES | YES | PARTIAL | P0 | VERIFIED baseline | Keep stale-session/back-navigation regression mandatory |
| Tenant isolation / authorization | YES | YES | YES for critical cases | PARTIAL | P0 | VERIFIED baseline for covered cases | Expand paired authorized/denied checks with every new sensitive workflow |
| Homeowner registration / activation | YES/PARTIAL | YES/PARTIAL | YES | PARTIAL | P0 | VERIFIED in CI | Preserve activation/fresh-login coverage |
| Homeowner profile / household self-service | YES | PARTIAL | YES targeted | PARTIAL | P1 | VERIFIED approved slices | PR #260 verified Admin add Household Member; PR #263 verified homeowner Account Information collapsible without changing profile authority |
| Billing generation | YES | YES including 5,001-homeowner end-to-end harness | YES | PARTIAL | P0 | VERIFIED in CI / approved scale harness | Preserve idempotency, exemptions, duplicate prevention, failure isolation, and large-tenant scenarios |
| Billing edit / maintenance | YES regression | PARTIAL | YES through critical/release regression baseline | PARTIAL | P0 | VERIFIED current production path | Preserve edit prepopulation/save regression after collapsible UI changes |
| Billing rules / automatic billing | YES | YES approved 5,001-homeowner generation harness | YES/PARTIAL | PARTIAL non-destructive release verification | P0 | VERIFIED automated generation path | PR #283 exact head `704f97151e9290e43edd1353e43392afe270b21d` passed MySQL #1408, Canva #483, Edge #76, Firefox #72, Mobile #71; merge `117339d1488a2dc77b7b181f831c58adc6396d73`; post-merge MySQL #1409 + Hostinger health passed. Keep runtime monitoring and no destructive live-tenant scheduler tests. |
| Record Payment | YES/PARTIAL | YES | YES | PARTIAL | P0 | VERIFIED in CI for cash critical path | PR #281 verified uncertain-response reconciliation for flagged path; add payment-method variants where changed |
| Payment allocation / unapplied credit | YES | YES including rental advance-credit allocation proof | PARTIAL | PENDING | P0 | VERIFIED service behavior | Keep allocation authority server-side and preserve oldest-due-first isolation tests |
| Payment void | YES/PARTIAL | YES | YES critical regression | PARTIAL | P0 | VERIFIED | PR #200 exact-head regression evidence recorded in work-status register |
| Payment refund | YES/PARTIAL | YES for homeowner refund | YES critical regression | PARTIAL | P0 | VERIFIED | PR #202 exact-head regression evidence recorded in work-status register |
| PayMongo online homeowner payment | YES/PARTIAL | YES reconciliation | YES targeted | PENDING controlled live UAT | P0 | VERIFIED covered product paths | Do not use live tenant records for mutation testing |
| PayMongo settlement trace/report | YES | PARTIAL | YES report/navigation regression | PENDING controlled live UAT | P0 | VERIFIED automated covered path | Controlled authenticated production evidence remains part of separate #194 scope where applicable |
| Receipts / AR rendering | PARTIAL | YES through payment flow | YES for payment receipt | PARTIAL | P0 | VERIFIED critical path | Add print/export layout regression where changed |
| Other Collections / bonds | YES/PARTIAL | YES refund/liability | PARTIAL | PENDING | P0 | IMPLEMENTED | Add lifecycle browser evidence when materially changed |
| Expenses | PARTIAL | PARTIAL | PARTIAL | PENDING | P1 | PARTIAL / program presentation slice NOT_REQUIRED | Do not represent waived UI slice as implemented |
| Petty Cash | YES recent regressions | PARTIAL | YES critical regression | PARTIAL | P0 | VERIFIED | PR #198 exact-head regression evidence recorded in work-status register |
| Employee create | YES regression for nested transaction | PARTIAL | YES | PARTIAL | P0 | VERIFIED | PR #191 browser regression evidence retained |
| Employee edit | YES/PARTIAL | PARTIAL | YES | PARTIAL | P0 | VERIFIED | Nullable/zero-field persistence browser regression retained |
| Attendance | PARTIAL | PARTIAL | YES targeted | PARTIAL | P1 | VERIFIED approved UI/critical slice | PR #248 exact-head browser/mobile gates and post-merge baseline verified |
| Leave | PARTIAL | PARTIAL | PARTIAL | PENDING | P1 | PARTIAL | Add request/approval/denial browser regression when changed |
| Payroll | YES/PARTIAL | YES/PARTIAL | YES critical regression | PARTIAL | P0 | VERIFIED | PR #197 exact-head regression evidence recorded in work-status register |
| Employee loans / cash advances | YES/PARTIAL | PARTIAL | PARTIAL | PENDING | P0 | PARTIAL | Add deduction-to-loan lifecycle regression when changed |
| Rental management | YES/PARTIAL | YES for automatic invoice day/retry/advance-credit subset | PARTIAL | PENDING | P1 | PARTIAL overall; automatic billing/credit subset VERIFIED | PR #283 proves due-day filtering, rental retry idempotency, oldest-due-first advance-credit allocation, and cross-renter/cross-tenant isolation; presentation slice remains NOT_REQUIRED for completed Wave 6 |
| Document requests | YES/PARTIAL | YES/PARTIAL | YES | PARTIAL | P0 | VERIFIED critical path | Expand payment-required/custom workflow variants when changed |
| Document generation/download | YES/PARTIAL | YES | YES | PARTIAL | P0 | VERIFIED critical path | Preserve template/version/QR coverage |
| Document Management repository | YES/PARTIAL | YES | YES dedicated E2E | PARTIAL | P1 | VERIFIED | Scale and usability evidence include PR #214 and post-program PR #255 |
| Admin issued-document table | YES/PARTIAL | YES/PARTIAL | YES targeted | PARTIAL | P1 | VERIFIED | PR #257 verified search/pagination/sticky actions |
| Complaints | YES verifier | PARTIAL | YES targeted | PARTIAL | P1 | VERIFIED approved operational slice | PR #245 / verifier evidence retained |
| Announcements | PARTIAL | PARTIAL | YES publish + tenant visibility | PARTIAL | P1 | VERIFIED critical path | Add edit/delete/schedule/attachment where supported |
| Events | PARTIAL | Not fully evidenced | PENDING | PENDING | P2 | PARTIAL | Add RSVP/attendance browser flow where live |
| Vehicles | PARTIAL | PARTIAL | YES targeted | PARTIAL | P1 | VERIFIED approved operational slice | PR #246 exact-head gates recorded |
| Contractors | PARTIAL | PARTIAL | YES targeted | PARTIAL | P1 | VERIFIED approved operational slice | PR #247 exact-head gates recorded |
| Reports dashboard | YES/PARTIAL finance logic | YES finance | YES targeted | PARTIAL | P0 | VERIFIED approved Financial Reports slice | PR #206 and Wave 6 Finance Reports evidence retained |
| Report export PDF/CSV/DOCX | PARTIAL | PARTIAL | PARTIAL | PENDING | P0 | PARTIAL | Assert export uses same tenant/date accounting authority when changed |
| Platform tenant/subscription/entitlements | YES/PARTIAL | YES/PARTIAL | PARTIAL | PENDING | P1 | PARTIAL | Add create/edit/suspend/visibility browser flow when changed |
| AI assistant | YES | YES isolation/entitlement | YES dedicated E2E | PARTIAL | P1 | VERIFIED covered paths | Keep AI outage from blocking core modules |
| Homeowner mobile/PWA shell | YES multiple verifiers | PARTIAL | YES Edge/Firefox/Mobile | PARTIAL | P1 | VERIFIED | PR #270 corrected the reproducible repeated-update stale-client defect; exact head `d3f20ef37b046a72ea8103b537ce2a86bf596190` passed MySQL #1375, Canva #461, Edge #54, Firefox #50, Mobile #49; merge `ea981e9f125a8d6246c05fd5c2005fbc1c4f5481`, post-merge MySQL #1376 passed |
| Homeowner Account Information collapsible | YES presentation contract | N/A | YES triggered browser/mobile gates | PARTIAL | P1 | VERIFIED | PR #263 exact head `bc8a2e58833903c44fd0d2bdf40116fcdb9091b3` passed MySQL #1361, Canva #455, Edge #48, Firefox #44, Mobile #43; merged as `007daf133caf2f8a57fb7dcf91f9ecd87cd13989`; post-merge MySQL #1362 passed |
| Accessibility | YES critical-flow gate | N/A | YES | PARTIAL | P1 | VERIFIED critical-flow baseline | PR #216 established WCAG 2.1 AA critical-flow gate; continue route-specific review |
| Cross-browser compatibility | N/A | N/A | YES Edge + Firefox | PARTIAL | P1 | VERIFIED critical-flow baseline | PR #220 Edge and PR #221 Firefox evidence retained |
| Android/iOS responsive compatibility | N/A | N/A | YES Mobile Responsive Evidence | PARTIAL | P1 | VERIFIED critical-flow baseline | PR #222 responsive evidence retained and later UI PRs continued Mobile gate coverage |
| Large-tenant homeowner / finance / employee / document scale | YES bounded 5,001-homeowner, 2,001-row finance, 5,001-employee, and 5,001-document fixtures | YES automatic billing generation at 5,001 homeowners | YES selected search/library/billing paths | PENDING destructive production performance UAT; non-destructive deployment health VERIFIED | P0/P1 | VERIFIED approved scale fixtures | PR #211–#214 retain scale fixtures; PR #283 adds end-to-end 5,001-homeowner automatic-billing proof with second-tenant isolation. Keep production monitoring gap explicit. |
| Automatic/batch processing bounds and failure isolation | YES explicit bounded controls and failure capture | YES full automatic billing + rental subset at scale | Existing billing browser chain + cross-browser release gates | PARTIAL controlled harness | P0/P1 | VERIFIED automated contract and approved scale proof | PR #215 established bounded controls; PR #283 proves 5,001-homeowner execution, completion/retry idempotency, injected-row isolation, notification-failure persistence, rental correctness, and tenant isolation. Do not substitute destructive live-tenant scheduler mutation. |
| Action progress / duplicate-submission protection | YES foundation and reconciliation contracts | YES payment idempotency / tenant-scoped reconciliation | YES triggered release gates | PENDING selected-tenant pilot | P0/P1 | IN_PROGRESS | PR #274/#276/#281 increments VERIFIED and production-deployed default-off. Durable bulk `completed / total` progress, remaining action coverage, staging/UAT, monitoring, rollback verification, and pilot authorization remain under #273. |
| Backup/restore | N/A | Not evidenced in current audit | N/A | PENDING | P0 | PENDING | Establish periodic restore evidence and release runbook separately |
| Post-deploy authenticated smoke | YES source contract / repository preparation | N/A | YES read-only harness | BLOCKED live run | P0 | BLOCKED | Issue #194 requires administrator provisioning of dedicated authorized production-smoke identity and protected environment secrets; no real tenant credentials or destructive substitute testing |
| GitHub `main` branch protection | N/A | N/A | N/A | N/A | P0 | NOT_REQUIRED | Repository-control hardening remains waived unless separately re-approved; exact-head merge discipline remains operational |

## P0 Browser Scenarios of Record

The original priority scenarios are retained as regression contracts. Their current evidence state is reflected in the matrix above.

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

- Create deterministic disposable test payment.
- Void using authorized role.
- Confirm balance restoration.
- Confirm receipt status/history.
- Confirm audit evidence.
- Attempt repeated void and confirm safe rejection/idempotent behavior.

### BR-E2E-PMT-REFUND-001 — Refund

- Create refundable disposable test case.
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

The production smoke suite must remain non-destructive unless an explicitly isolated UAT tenant is used. Current authenticated live execution is blocked under #194 pending administrator-provisioned secrets.

| Check | Required | Mutation? |
|---|---:|---:|
| `/api/health` database status | YES | No |
| Login page and security headers | YES | No |
| Dedicated smoke identity login | YES once provisioned | Session only |
| Dashboard renders | YES once provisioned | No |
| Homeowner search/profile opens | YES once provisioned | No |
| Billing page/search | YES once provisioned | No |
| Payment history | YES once provisioned | No |
| Online Payments report | YES once provisioned | No |
| Employee list/profile | YES once provisioned | No |
| Document request list | YES once provisioned | No |
| Complaint list | YES once provisioned | No |
| Financial report loads | YES once provisioned | No |
| Logout and fresh login | YES once provisioned | Session only |

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

A row moves to `VERIFIED` only after its applicable automated and approved-environment evidence is linked. A row may remain `BLOCKED` where the only missing step requires an administrator-controlled environment/identity that is not available. Passing CI for unrelated suites is not sufficient.
