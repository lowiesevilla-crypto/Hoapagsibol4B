# HOAHub Payroll Requirements and Implementation Contract

Last updated: 2026-08-24
Owner: HOAHub Payroll / Workforce
Status source of truth: `docs/payroll/PAYROLL_IMPLEMENTATION_STATUS.json`

## 1. Purpose

This document is the canonical functional and technical requirement register for the HOAHub payroll enhancement. It complements `Agent.md` and the machine-readable status registry. Existing working payroll capability is retained unless a requirement below explicitly changes it.

Every requirement has a stable ID. Every implementation task and payroll function must map to at least one requirement ID and a status from the controlled vocabulary below. AI agents must read the machine-readable registry before changing payroll code and must update the registry in the same change when implementation status changes.

## 2. Controlled Status Vocabulary

- `NOT_STARTED` — requirement/task is accepted but implementation has not begun.
- `IN_PROGRESS` — implementation has begun but acceptance evidence is incomplete.
- `BLOCKED` — implementation cannot safely proceed until the documented dependency is resolved.
- `IMPLEMENTED` — code/configuration exists, but full acceptance evidence is not yet complete.
- `VERIFIED` — implementation exists and linked acceptance tests/evidence pass on the exact candidate SHA.
- `DEFERRED` — intentionally postponed and must not be represented as live.

`VERIFIED` is the only completion status. Code presence alone is not completion.

## 3. Cross-Cutting Invariants

1. Payroll is tenant-confidential. Every payroll, employee, attendance, overtime, loan, deduction, schedule, payslip, archive, report, and financial posting read/write must be tenant-scoped from the authenticated server session.
2. Browser-provided tenant IDs, employee IDs, payroll IDs, approval state, amounts, or calculation results are not authority.
3. Payroll calculations must be deterministic for the same effective-dated inputs and rule version.
4. Historical/final payroll evidence must not silently change when employee configuration, schedules, rates, or statutory rules change later.
5. Statutory values must be versioned/effective-dated and must not be invented or silently treated as current law.
6. Paid/finalized payroll mutations require an auditable correction/reversal path. A destructive shortcut must not erase financial history.
7. Finance posting must be idempotent and reconcilable before payroll-to-ledger automation is considered complete.

## 4. Requirements

### Traceability and Governance

#### PAY-REQ-001 — Machine-readable implementation status
The repository must contain a canonical payroll implementation/status registry readable by AI agents and humans. It must identify requirements, tasks, code functions, dependencies, test evidence, and current status.

Acceptance criteria:
- Registry exists at `docs/payroll/PAYROLL_IMPLEMENTATION_STATUS.json`.
- All statuses use the controlled vocabulary.
- Payroll implementation functions changed by this initiative include `@requirement` and `@status` tags.
- A regression test validates the registry shape/status values.

#### PAY-REQ-002 — Agent operating contract
`Agent.md` must identify the payroll status registry, status semantics, tenant-scope invariant, and the rule that deferred/blocking items must not be reported as live.

### Security / Tenant Isolation

#### PAY-SEC-001 — Tenant-scoped payroll actions
All payroll Server Actions and supporting queries must derive tenant scope from authenticated server context and reject cross-tenant record IDs.

Acceptance criteria:
- Payroll period creation explicitly stores authenticated `tenantId` rather than relying on a static/default tenant value.
- Payslip, overtime, loan, deduction, access, calendar, and schedule creation explicitly stores authenticated `tenantId`.
- Reads by opaque ID verify `tenantId` before mutation.
- Payroll-period employee/attendance/overtime/deduction refresh is tenant-filtered.

#### PAY-SEC-002 — Payroll RBAC remains server-authoritative
Existing Payroll Access roles and server checks remain authoritative. Employee self-service access does not grant payroll administration.

### Employee Compensation Configuration

#### PAY-COMP-001 — Separate compensation basis, pay frequency, and attendance policy
The payroll domain must represent these as independent concepts rather than overloading `salaryType`:
- Compensation basis: e.g. DAILY or MONTHLY.
- Pay frequency/cutoff behavior: payroll schedule/cutoff configuration.
- Attendance policy: how attendance affects payable time, lateness, undertime, absence, leave, rest day, and premiums.

Compatibility requirement: existing `SalaryType` behavior must continue until persisted configuration is migrated.

#### PAY-COMP-002 — Effective-dated employee payroll configuration
Changes to rate, compensation basis, workday divisor, fixed allowance/deduction, pay frequency, and attendance policy must be effective-dated. A payroll run resolves configuration applicable to the payroll coverage period and snapshots the resolved values.

#### PAY-COMP-003 — Historical configuration integrity
Later employee master-data edits must not recalculate finalized historical payroll unless an authorized correction/revision workflow is explicitly executed.

### Shift / Attendance / Overtime

#### PAY-SHIFT-001 — Effective-dated schedules
Employee schedules must support effective start/end dates, rest days, and overlap prevention.

#### PAY-ATT-001 — Attendance-derived payable time
Payroll calculation must consume attendance records for payable days/hours, absence, lateness, undertime, approved leave, holiday/rest-day context, and night differential according to the resolved calculation policy.

#### PAY-ATT-002 — Attendance corrections are auditable
Attendance correction requests/manager adjustments must preserve original and adjusted values and approval evidence.

#### PAY-OT-001 — Only approved overtime is payable
Payroll calculation must use approved overtime records or explicitly authorized payroll-manager adjustments. Pending/rejected overtime is excluded.

### Calculation Engine

#### PAY-CALC-001 — Deterministic calculation engine
The payslip calculation engine must be a pure/deterministic service for the same employee snapshot, attendance, deductions, approved overtime, and calculation policy.

#### PAY-CALC-002 — Explicit calculation policy
Premium multipliers, hours-per-day, and similar parameters must be supplied by an explicit calculation policy. Legacy constants may remain only as clearly named compatibility behavior until effective-dated policy persistence is implemented; they must not be labeled as verified current statutory rates.

#### PAY-CALC-003 — Non-negative payroll totals
Net pay and payable basic pay must not become negative because of lateness/undertime or deductions. Money is rounded consistently to two decimals.

### Deductions and Loans

#### PAY-DED-001 — Payroll-period deductions
Authorized users may assign configured deduction types to an employee for a draft payroll period. Finalized/paid payroll cannot be edited through normal deduction maintenance.

#### PAY-LOAN-001 — Loan/cash advance repayment integrity
Payroll loan repayment cannot exceed the remaining available balance. A repayment changes the loan ledger only when payroll is marked paid and must not be applied twice.

### Payroll Lifecycle / Corrections

#### PAY-RUN-001 — Payroll lifecycle
The target lifecycle must distinguish calculation/review/approval/finalization/payment sufficiently to prevent accidental historical mutation. Existing schema currently supports DRAFT, FINALIZED, and PAID; lifecycle expansion requires a schema migration and UI/action updates.

#### PAY-RUN-002 — Finalization validation
A payroll cannot finalize without calculated payslips and must preserve audit evidence of the actor and transition.

#### PAY-RUN-003 — Immutable finalized/paid evidence
Finalized and paid payroll must not be silently overwritten. Corrections must create an auditable correction/revision/reversal record instead of deleting historical evidence.

### Philippine Statutory Rules

#### PAY-STAT-001 — Effective-dated statutory rule sets
SSS, PhilHealth, Pag-IBIG, withholding tax, statutory holiday/rest-day/night differential/overtime rules, and other legally controlled values must be represented by effective-dated/versioned rule sets where applicable.

Safety constraint: do not embed a value as “current Philippine law” until the authoritative table/rule and effective date have been verified for the target production period.

#### PAY-STAT-002 — Statutory rule snapshot
Each finalized payroll must retain enough rule/version evidence to reproduce how statutory deductions/premiums were calculated.

### Finance Integration

#### PAY-FIN-001 — Idempotent payroll financial posting
A finalized/approved payroll financial event must post to the HOAHub Financial Engine exactly once using an idempotency key tied to tenant + payroll period/revision.

#### PAY-FIN-002 — Outbox/retry/reconciliation
Payroll-to-finance integration must use durable delivery/retry semantics (for example an outbox) and expose reconciliation state/errors without double posting.

#### PAY-FIN-003 — Payroll expense/liability traceability
Finance entries must retain source payroll period/revision references and reconcile gross pay, employer/employee deductions/contributions as designed, and net-pay liability/disbursement.

### Reports / Employee Self-Service

#### PAY-RPT-001 — Tenant date-filtered payroll reports
Payroll reports must remain tenant-scoped and support the agreed date/period filters, employee breakdown, totals, and export consistency.

#### PAY-EMP-001 — Employee payslip self-service
An employee may view only their own released/authorized payslips and own attendance/correction information.

#### PAY-EMP-002 — Employee mobile attendance UX
Mobile attendance/clocking/correction UX must remain owner-scoped and must not expose other employees or payroll administration.

## 5. Implementation Sequence

Foundation sequence:

1. Traceability/status governance (`PAY-REQ-*`).
2. Payroll tenant-isolation hardening (`PAY-SEC-*`).
3. Deterministic policy-driven calculation interface and tests (`PAY-CALC-*`).
4. Persisted compensation/pay-frequency/attendance-policy configuration with effective dating (`PAY-COMP-*`).
5. Lifecycle/correction model (`PAY-RUN-*`).
6. Effective-dated statutory rules (`PAY-STAT-*`) after authoritative rule verification.
7. Idempotent Finance Engine posting/outbox/reconciliation (`PAY-FIN-*`).
8. Remaining admin UX, reporting, and employee self-service acceptance coverage.

## 6. Definition of Done

A requirement may be moved to `VERIFIED` only when the implementation registry points to code and passing exact-head evidence that satisfies its acceptance criteria. If only part of a requirement is delivered, leave it `IN_PROGRESS` and record the missing work. If a dependency is unknown or unsafe, use `BLOCKED` and state the dependency explicitly.