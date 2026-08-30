# HOAHub Release Governance

Status: ACTIVE GOVERNANCE STANDARD
Baseline: production-verified `main` @ `ea981e9f125a8d6246c05fd5c2005fbc1c4f5481` before this documentation reconciliation
Last updated: 2026-08-30

## Purpose

Define the release controls required to protect active HOAHub tenants while continuing rapid improvement. This governance is designed around small, independently testable and revertible releases.

## Current Release Baseline

The current production reference before this documentation reconciliation is `ea981e9f125a8d6246c05fd5c2005fbc1c4f5481`, the merge of PR #270. Post-merge HOAHub MySQL CI #1376 passed including production smoke / critical browser suite, Hostinger expected-release verification, and public production health.

PR #263 Homeowner Account Information was verified from exact head `bc8a2e58833903c44fd0d2bdf40116fcdb9091b3`, passed MySQL #1361, Canva #455, Edge #48, Firefox #44 and Mobile #43, merged as `007daf133caf2f8a57fb7dcf91f9ecd87cd13989`, and passed post-merge MySQL #1362.

PR #270 corrected the reproducible repeated-update stale-PWA/client defect. Exact head `d3f20ef37b046a72ea8103b537ce2a86bf596190` passed MySQL #1375, Canva #461, Edge #54, Firefox #50 and Mobile #49; merge `ea981e9f125a8d6246c05fd5c2005fbc1c4f5481` passed post-merge MySQL #1376 and managed-production/public-health verification.

The historical rollback of PR #189 remains important evidence: repository-wide behavioral UI standardization can create production regressions. Future UI changes must minimize blast radius and carry workflow-specific regression evidence.

## Current Strengths

The HOAHub release pipeline includes:

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
- Edge and Firefox critical-flow evidence where triggered;
- Mobile Responsive Evidence where triggered;
- managed Hostinger release marker verification after `main` push;
- public production health verification.

The Canva visual-parity workflow also captures real rendered application screenshots for selected routes.

## Repository-Control Status

GitHub `main` branch protection / required-check enforcement at the repository-policy layer remains **NOT_REQUIRED** unless separately re-approved by the product owner. This supersedes the original 2026-08-26 P0 governance-gap action list.

Operational release discipline remains mandatory even without repository-enforced branch protection:

- use pull requests for normal product changes;
- require HOAHub MySQL CI and applicable visual/browser/mobile gates;
- merge only the exact current PR head that passed required gates;
- never treat a previous head's evidence as current;
- verify the merged `main` release marker and production health before the next product mutation;
- inspect and fix exact gate failures rather than bypassing or weakening tests.

Authenticated non-destructive production smoke is separately reopened under issue #194. Repository-side preparation is ready, but live execution is `BLOCKED` until an administrator provisions a dedicated authorized production-smoke identity and protected environment secrets. Real tenant credentials or destructive substitute testing must not be used.

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
- controlled UAT tenant verification where provisioned for production-critical screens;
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
- controlled production-like UAT where configured;
- deployment verification;
- post-deploy authenticated smoke where applicable and available;
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
13. Production UAT plan where applicable.

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

- validate migration on realistic disposable/staging data;
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
- [ ] UAT steps documented where applicable.

## Post-Merge / Deployment Gate

A merged PR is not automatically a verified production release.

Require, as applicable:

1. Hostinger serves the expected merged release marker.
2. Public `/api/health` succeeds.
3. No immediate deployment/runtime error signal.
4. Non-destructive authenticated UAT smoke completes for affected critical routes when the dedicated environment is provisioned.
5. Financial/domain-specific reconciliation completes where necessary.
6. Status is updated from `IMPLEMENTED` to `VERIFIED` only after required evidence exists.

## Production Smoke Tiers

### Tier 1 — Infrastructure / Public

Current baseline includes:

- MySQL health;
- login page;
- security headers;
- unauthenticated route protection;
- cron credential rejection;
- expected-release marker verification;
- public production health.

### Tier 2 — Authenticated Non-Destructive

Issue #194 scope once the dedicated authorized smoke identity and protected secrets are provisioned:

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

Current status: `BLOCKED` on administrator/environment provisioning.

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
- `VERIFIED` — required applicable automated, deployment, and configured UAT evidence passed.
- `ROLLED_BACK` — production change was intentionally reverted.
- `BLOCKED` — release evidence cannot proceed due to a named failure/dependency.
- `NOT_REQUIRED` — explicitly waived from the applicable Definition of Done by product-owner decision.

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
- UAT result or named blocker;
- defects found;
- rollback/recovery notes;
- final status.

## Governance Principle

Green automation is necessary but not sufficient. Release confidence comes from deterministic tests, limited blast radius, deployment identity verification, controlled UAT where provisioned, and explicit rollback readiness.