# Issue #25 Test Coverage Traceability

Issue #25 establishes the automated quality baseline for HOAHub's highest-risk finance, authorization, tenant-isolation, and browser workflows.

## Automated layers

| Layer | Command | Primary evidence |
|---|---|---|
| Unit and policy | `pnpm test` | calculations, validation, route policy, role assignment, tenant filters |
| Disposable MySQL integration | `pnpm test:integration` | billing, payment, receipt, SOA, void, password reset, homeowner/property ownership, bond refunds |
| Critical regression | `pnpm test:critical` | complaints, document fees, mobile homeowner modules, PWA and cache safeguards |
| Production smoke | `pnpm smoke:production -- <base-url>` | health, headers, public login, protected routes and maintenance credentials |
| Browser end-to-end | `pnpm test:e2e` | critical business workflow, documents, RBAC, stale sessions and homeowner activation |

## Acceptance-criteria mapping

| Issue #25 criterion | Automated evidence |
|---|---|
| Supported framework and structure documented | `TESTING_GUIDE.md`, `tests/README.md`, Node test runner/tsx and Puppeteer structure |
| `pnpm test` standard local suite | `package.json` and unit/policy suite |
| CI runs all required layers | `.github/workflows/ci-deploy.yml` |
| Deterministic finance calculations | finance unit tests and exact-centavo integration assertions |
| At least two tenants in isolation tests | finance, password-reset, homeowner/property, browser announcement, document and RBAC fixtures |
| Allowed and denied RBAC scenarios | authorization matrix and RBAC browser suite |
| Duplicate billing repeated and concurrent | `tests/integration/finance-database.test.ts` |
| Void/refund consistency | payment void lifecycle plus audited partial/full bond refund lifecycle |
| Failed tests block merging | mandatory pull-request workflow job |
| Isolated and reset-safe data | process-specific `.invalid` fixtures and dependency-safe cleanup |
| No permanently optional critical tests | all test layers are mandatory in pull-request CI |
| Clean checkout passes core suites | clean MySQL migration/seed, production build, smoke and browser workflow |
| Deliberate authorization or billing regression fails | route/tenant negative matrices and duplicate/cross-tenant finance assertions |

## Finance mutation evidence

Payment and refund scenarios assert the source transaction, aggregate amount, allocation or refund rows, receipt relationship, resulting balance/status, audit events, rejected replay behavior, and unchanged non-target tenant state.

## Closure rule

Issue #25 may be closed only after the pull request containing the homeowner/property and audited bond-refund scenarios passes every mandatory CI gate without skipped critical checks.
