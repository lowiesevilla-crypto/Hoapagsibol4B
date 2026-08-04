# HOAHub Product Delivery Governance

**Status:** Proposed  
**Owner:** Lowie M. Sevilla  
**Effective date:** August 5, 2026  
**Related issue:** #27

## 1. Purpose

This document defines how HOAHub product work is captured, prioritized, implemented, tested, reviewed, and released. Its purpose is to eliminate competing task lists and provide traceability from product need to deployed outcome.

## 2. Authoritative delivery system

- **GitHub Issues:** source of truth for executable work, defects, security findings, technical debt, and documentation changes.
- **GitHub Project:** source of truth for priority, status, iteration/release, owner, effort, and product area.
- **Pull requests:** source of truth for proposed implementation and review evidence.
- **CI and UAT records:** source of truth for technical and business validation.
- **Roadmap and approved product documents:** source of truth for direction and scope, not day-to-day task status.
- **Architecture Decision Records:** source of truth for significant technical decisions and trade-offs.

Large Markdown backlogs, session notes, task prompts, and sprint documents may be retained for historical context, but they must not remain the only place where active work is tracked.

## 3. Work-item hierarchy

### Epic

A business outcome spanning several independently deliverable issues. An epic must define the target outcome, success measures, boundaries, risks, dependencies, and linked child issues.

### Feature or enhancement

A user-visible or operational capability with independently testable acceptance criteria.

### Bug

A reproducible deviation from approved behavior. Bugs must identify impact, severity, environment, reproduction steps, expected behavior, actual behavior, evidence, and regression requirements.

### Security or privacy issue

A vulnerability, tenant-isolation weakness, authorization defect, unsafe data exposure, secret-management problem, or compliance-control gap. Sensitive details must be handled through an approved private process when public disclosure would create risk.

### Technical debt

A maintainability, reliability, performance, observability, dependency, architecture, or automation gap with a documented operational or delivery impact.

### Documentation

A change to authoritative, user, operational, release, or historical documentation.

## 4. Required GitHub Project fields

Create one current HOAHub delivery project with these fields:

| Field | Values / purpose |
|---|---|
| Status | Intake, Ready, In Progress, In Review, UAT, Done, Deferred |
| Priority | P0 Critical, P1 High, P2 Medium, P3 Low |
| Work type | Epic, Feature, Enhancement, Bug, Security, Technical Debt, Documentation |
| Product area | Platform, Homeowners, Finance, Community, Documents, HRIS, Mobile, AI, Operations |
| Target release | Pilot, named release, or Backlog |
| Iteration | Current delivery iteration or planned period |
| Effort | XS, S, M, L, XL or agreed numeric scale |
| Owner | Directly accountable person |
| Risk | Critical, High, Medium, Low |

Recommended saved views:

- Commercial MVP / Pilot
- Current iteration
- Finance and billing risk
- Security and tenant isolation
- UAT queue
- Blocked work
- Unassigned intake
- Deferred roadmap

## 5. Status policy

### Intake

The item is captured but may not yet be sufficiently defined or approved.

### Ready

The problem, scope, acceptance criteria, dependencies, and test expectations are sufficiently clear for implementation.

### In Progress

An owner is actively implementing the issue. A branch or draft PR should be linked when practical.

### In Review

A PR is open and implementation is ready for technical/product review. Required CI should be running or complete.

### UAT

Technical review is complete and business validation is required or in progress.

### Done

The change is merged, required validation passed, documentation/release evidence is updated, and the issue is closed.

### Deferred

The item is intentionally postponed. The reason and reconsideration trigger must be recorded.

## 6. Issue readiness standard

An issue can move to Ready only when it includes, as applicable:

- user or operational problem;
- business value and affected users;
- scope and explicit exclusions;
- acceptance criteria;
- security, privacy, authorization, and tenant-isolation considerations;
- finance-integrity considerations;
- mobile and accessibility requirements;
- observability and operational requirements;
- test scenarios;
- data migration or compatibility impact;
- dependencies and known risks;
- definition of done.

A minor defect may use a shorter format, but it must remain reproducible and testable.

## 7. Priority definitions

### P0 Critical

Production outage, confirmed cross-tenant exposure, material financial corruption, credential compromise, unrecoverable data loss, or another incident requiring immediate coordinated response.

### P1 High

Blocks the commercial MVP, prevents a critical workflow, creates a substantial security/finance/reliability risk, or affects many users without an acceptable workaround.

### P2 Medium

Important improvement or defect with a workable temporary process and no immediate critical risk.

### P3 Low

Convenience, polish, exploratory work, or improvement with limited near-term impact.

Priority is based on impact and urgency, not document age or stakeholder volume alone.

## 8. Definition of done

Unless an issue defines stricter criteria, Done requires:

- acceptance criteria satisfied;
- implementation reviewed and merged;
- server-side authorization and tenant scope verified where applicable;
- tests added or updated at the appropriate level;
- lint, typecheck, build, required automated tests, and CI pass;
- database changes include migration, deployment, backup, and recovery notes;
- mobile/accessibility validation completed where applicable;
- audit and observability requirements implemented;
- documentation and release notes updated where required;
- UAT passed for user-facing or business-process changes;
- no unresolved critical review thread or linked blocking defect.

## 9. Backlog migration procedure

Actionable content must be reviewed from:

- `PRODUCT_BACKLOG.md`
- `PRODUCT_IMPROVEMENT_BACKLOG.md`
- `KNOWN_ISSUES.md`
- `SESSION_PROGRESS.md`
- `HOAHUB_FUNCTIONAL_AUDIT.md`
- `HOAHUB_PRODUCT_ROADMAP.md`
- sprint, Codex, implementation, and design task files
- empty or incomplete strategy/task files

For each candidate item:

1. Determine whether it is completed, active, duplicate, obsolete, historical evidence, or a future idea.
2. Search existing open and closed issues before creating a new issue.
3. Merge duplicates into the strongest existing issue and link supporting source material.
4. Create an issue for active actionable work using the approved issue-quality standard.
5. Assign product area, work type, priority, target release, owner, and status.
6. Link dependencies, related PRs, release evidence, and source documents.
7. Mark the source entry as migrated or superseded; do not maintain two active copies.
8. Archive historical files only after preserving required release/audit context.

## 10. Backlog review cadence

### Weekly delivery review

- review P0/P1 items and active blockers;
- confirm in-progress ownership;
- move technically complete work to UAT;
- review failed CI/UAT and production incidents;
- select the next Ready items within available capacity.

### Monthly product review

- review MVP/release progress and success metrics;
- confirm roadmap alignment;
- reassess Deferred items and scope changes;
- review security, privacy, finance, and operational risks;
- archive or merge stale and duplicate issues;
- review documentation owners and dates.

### Release review

- verify all release-gate evidence;
- confirm linked issues and PRs;
- confirm backup/restore and operational readiness;
- record explicit product-owner approval or rejection.

## 11. Pull-request traceability

Every material PR should:

- link its issue using `Closes #N`, `Fixes #N`, or `Relates to #N`;
- summarize user-visible and operational impact;
- describe database, environment, deployment, and rollback impact;
- list validation performed;
- identify security, authorization, tenant-isolation, finance, and privacy impact;
- include screenshots or evidence for material UI changes;
- keep unrelated changes out of the PR.

## 12. Documentation lifecycle

- Current documents require an owner and review date/cadence.
- Proposed documents require explicit approval before they govern implementation.
- Superseded documents must link to their replacement.
- Historical documents must state that they are not active direction.
- Empty files must be completed, removed, or archived with an explanation.
- Actionable checklists belong in GitHub Issues after migration.

## 13. Initial migration order

1. Commercial MVP and release-blocking work
2. Security, tenant isolation, authorization, finance integrity, backup/restore
3. Open known defects
4. Current in-progress work and incomplete PR follow-ups
5. Product-improvement backlog items
6. Roadmap ideas and deferred expansion
7. Historical session/task records

## 14. Issue #27 completion checklist

- [x] Delivery governance and source-of-truth policy defined.
- [x] Documentation index identifies authoritative and historical material.
- [x] Structured feature and bug issue forms added.
- [x] GitHub workflow updated with issue and project expectations.
- [ ] GitHub Project created with required fields and views.
- [ ] All active actionable Markdown backlog items migrated or linked.
- [ ] Duplicate items resolved explicitly.
- [ ] Historical/superseded files marked or archived.
- [ ] Every in-progress issue has an owner and current status.
- [ ] Product owner approves governance and migration completion.
