# HOAHub Authenticated Post-Deploy UAT

Tracking: #194, #192

## Purpose

Provide a production-safe, authenticated, non-destructive smoke after a deployed HOAHub release. This complements the anonymous `scripts/production-smoke.mjs` health/authentication checks and does not replace exact-head PR CI.

## Controlled account requirement

Run only with a dedicated Tenant Admin UAT account inside an explicitly controlled UAT tenant. The tenant must contain at least one controlled homeowner record matching `HOAHUB_UAT_HOMEOWNER_QUERY` and at least one employee record. Do not point the workflow at an ordinary client administrator account.

Production environment configuration required by `.github/workflows/authenticated-production-uat.yml`:

- Secret `HOSTINGER_APP_URL` — deployed HOAHub origin.
- Secret `HOAHUB_UAT_ADMIN_EMAIL` — dedicated UAT Tenant Admin account.
- Secret `HOAHUB_UAT_ADMIN_PASSWORD` — dedicated UAT credential.
- Environment variable `HOAHUB_UAT_HOMEOWNER_QUERY` — deterministic search value for the controlled UAT homeowner.

Secrets must remain in the protected GitHub `production` environment and must never be committed, printed, attached to issues, or copied into test fixtures.

## Read-only contract

`scripts/authenticated-production-smoke.mjs` intercepts browser traffic. It permits `GET`, `HEAD`, and `OPTIONS` requests plus the two authentication POST endpoints required for login and logout. Any other state-changing request is blocked client-side and fails the run.

The smoke does not create, edit, approve, pay, refund, post, publish, delete, send, generate, or reconcile tenant business records. Normal authentication/session/audit metadata produced by login/logout may still be recorded by the application.

## Coverage

The workflow verifies:

1. Public production health.
2. Authenticated Tenant Admin login.
3. Dashboard load.
4. Homeowner search using the controlled UAT selector.
5. Controlled homeowner profile open.
6. Billing list/search.
7. Payment history.
8. Online Payments report.
9. Employee list and read-only profile open.
10. Document requests workspace.
11. Complaints workspace.
12. Financial Reports load.
13. Logout.
14. Fresh login and dashboard load.
15. Zero forbidden mutation requests during the run.

## Release identity

The workflow accepts an optional `expected_release_sha` input. When supplied, the run first compares the first 12 characters with production `/release.txt` and refuses to test a different deployed release.

## Execution

Use GitHub Actions → **HOAHub Authenticated Production UAT** → **Run workflow** after Hostinger has deployed the intended `main` release. Supply the expected deployed SHA whenever the run is being used as release evidence.

A passing run is evidence only for the release marker and controlled UAT account tested. Record the workflow run number, deployed SHA, and result in issue #194 / #192 and `HOAHUB_WORK_STATUS_REGISTER.md`.

## Current administrative dependencies

Repository branch metadata still reports `main` as unprotected. Issue #194 therefore remains open until repository administration enables the required pull-request/check/force-push/delete protections. The authenticated production run also requires the controlled UAT secrets/selector above to be configured in the protected `production` environment.
