# HOAHub Release Governance

Status: ACTIVE
Baseline: `main` @ `34e62289d35163e17ea835a76cf63b3c509e3eaa`
Last updated: 2026-08-26

## Purpose

Define the release controls required to protect active HOAHub tenants while continuing rapid improvement. This governance is designed around small, independently testable and revertible releases.

## Current Release Baseline

The current production reference is the post-rollback `main` commit `34e62289d35163e17ea835a76cf63b3c509e3eaa`.

The rollback is important evidence: PR #189 attempted repository-wide interactive table standardization but was reverted after production breakage. Future UI changes must therefore minimize blast radius and carry workflow-specific regression evidence.

## Current Strengths

The existing HOAHub MySQL CI pipeline includes:

- dependency installation from lockfile;
- lint;
- Prisma validate/generate/migrate deploy;
- database seed on disposable MySQL;
- unit tests;
- database integration tests;
- targeted critical verifiers;
- typecheck;
- production build;
- controlled Chromium;
- production-mode smoke;
- critical browser E2E;
- managed Hostinger release marker verification after `main` push;
- public production health verification.

The Canva visual-parity workflow also captures real rendered application screenshots for selected routes.

## P0 Governance Gap

The GitHub branch metadata reviewed on 2026-08-26 reports `main` is not protected and has no enforced required status checks at the branch-protection layer.

Required administrative action:

- require pull requests for normal changes to `main`;
- require HOAHub MySQL CI before merge;
- require relevant visual-parity check for UI changes where repository policy supports conditional enforcement;
- prevent force-push/deletion of `main`;
- require the exact current PR head to be green before merge;
- define an emergency-break-glass process for urgent rollback only.

This repository policy change must be completed in GitHub administration because it is not implemented by application code.

## Release Classification

### Class A — Low Risk

Examples:

- wording;
- spacing;
- icon replacement;
- non-behavioral styling;
- documentation.

Required evidence:

- targeted review;
- lint/type/build as applicable;
- visual artifact for materially changed UI;
- no business logic diff.

### Class B — Medium Risk

Examples:

- search;
- filtering;
- pagination;
- navigation;
- forms;
- interactive tables;
- report presentation;
- new non-financial workflow screen.

Required evidence:

- full CI;
- affected browser E2E;
- tenant-scope/RBAC regression where applicable;
- visual regression;
- UAT tenant verification for production-critical screens;
- rollback plan.

### Class C — High Risk

Examples:

- billing;
- collections/payments;
- PayMongo;
- receipt numbering;
- refunds/voids;
- payroll;
- tenant isolation;
- RBAC/permissions;
- document approval/issuance authority;
- schema/migrations;
- background financial jobs.

Required evidence:

- full CI;
- focused unit regression;
- database integration;
- tenant isolation and denied-path tests;
- browser E2E for changed critical path;
- exact financial assertions where applicable;
- migration and recovery review;
- production-like UAT;
- deployment verification;
- post-deploy authenticated smoke when applicable;
- explicit rollback point.

## Mandatory PR Content

Every Class B/C PR should state:

1. Problem / requirement.
2. Root cause or design intent.
3. In-scope behavior.
4. Explicit non-goals.
5. Tenant isolation impact.
6. RBAC/permission impact.
7. Finance/data integrity impact.
8. Database migration impact.
9. UI/mobile impact.
10. Tests added.
11. Exact verification gates required.
12. Rollback approach.
13. Production UAT plan.

## Exact-Head Rule

Never approve or merge based on evidence from an older commit.

If the PR head changes after a green run:

- previous evidence is historical;
- required checks rerun on the new head;
- merge only when the current exact head is green.

## Small-Release Rule

Do not combine unrelated high-risk domains in one release.

Avoid combinations such as:

- Payroll change + broad table refactor;
- Payment posting change + navigation redesign;
- Database migration + unrelated styling sweep;
- RBAC change + general component replacement.

Small releases improve diagnosis, rollback, and production confidence.

## Database Change Rule

Prefer expand/contract:

1. Add backward-compatible schema.
2. Deploy code that can operate safely during transition.
3. Backfill/migrate with evidence.
4. Switch authoritative reads/writes.
5. Remove legacy structure only in a later verified release.

Before production:

- validate migration on realistic staging data;
- estimate lock/runtime impact;
- confirm backup/recovery path;
- reject destructive changes without an explicit recovery plan.

## Pre-Merge Gate

For applicable changes:

- [ ] PR head is current with intended base.
- [ ] Diff contains only intended scope.
- [ ] No secrets/test production data.
- [ ] Lint green.
- [ ] Prisma validation/migrations green where applicable.
- [ ] Unit tests green.
- [ ] Integration tests green.
- [ ] Critical verifiers green.
- [ ] Typecheck green.
- [ ] Production build green.
- [ ] Browser E2E green.
- [ ] Visual parity reviewed for UI change.
- [ ] Tenant/RBAC negative tests present for sensitive change.
- [ ] Rollback plan documented.
- [ ] UAT steps documented.

## Post-Merge / Deployment Gate

A merged PR is not automatically a verified production release.

Require, as applicable:

1. Hostinger serves the expected merged release marker.
2. Public `/api/health` succeeds.
3. No immediate deployment/runtime error signal.
4. Non-destructive authenticated UAT smoke completes for affected critical routes.
5. Financial/domain-specific reconciliation completes where necessary.
6. Status is updated from `IMPLEMENTED` to `VERIFIED` only after required evidence exists.

## Production Smoke Tiers

### Tier 1 — Infrastructure / Public

Current baseline includes:

- MySQL health;
- login page;
- security headers;
- unauthenticated route protection;
- cron credential rejection.

### Tier 2 — Authenticated Non-Destructive

Required future UAT tenant checks:

- login;
- dashboard;
- homeowner search/profile;
- billing list/search;
- payment history;
- online payment report;
- employee list/profile;
- document request list;
- complaints;
- report load;
- logout/fresh login.

### Tier 3 — Controlled Mutation

Only in an explicitly isolated production UAT tenant with deterministic test records:

- create/edit records;
- record test payment only if financially isolated and approved;
- document request lifecycle;
- other transactional checks.

Tier 3 must never run against real customer records.

## Rollback Policy

Rollback should be preferred over risky live patching when a new release creates a severe widespread regression and a known-good previous state exists.

Before rollback:

- assess whether migrations/data writes are backward compatible;
- preserve audit/evidence;
- stop additional harmful writes if needed;
- identify known-good commit;
- record incident scope.

After rollback:

- verify release marker;
- verify health;
- run critical smoke;
- open root-cause defect;
- add regression test before re-release.

## Emergency Change / Break-Glass

Emergency direct changes to `main` should be reserved for urgent containment or rollback when normal PR timing creates more risk.

Requirements:

- document why normal process was bypassed;
- keep change minimal;
- retain exact commit evidence;
- run post-change CI/health/smoke immediately;
- open follow-up issue/PR for root-cause and regression coverage.

## Release Status Vocabulary

- `IMPLEMENTED` — merged/deployed or code exists, but required production/UAT evidence is incomplete.
- `VERIFIED` — required automated, deployment, and UAT evidence passed.
- `ROLLED_BACK` — production change was intentionally reverted.
- `BLOCKED` — release cannot proceed due to named failure/dependency.

## Required Release Record

For each material release record:

- issue / requirement;
- PR number;
- exact PR head SHA;
- merge SHA;
- CI run link/result;
- visual run/artifact where applicable;
- deployment release marker;
- production health result;
- UAT result;
- defects found;
- rollback/recovery notes;
- final status.

## Governance Principle

Green automation is necessary but not sufficient. Release confidence comes from combining deterministic tests, limited blast radius, deployment identity verification, controlled UAT, and explicit rollback readiness.
