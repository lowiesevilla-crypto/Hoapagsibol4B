# HOAHub Agent Context

Last updated: 2026-08-14

## Purpose

This file is the repository-level operating context for AI coding agents and maintainers working on HOAHub. Treat production safety, tenant isolation, authentication integrity, mobile/PWA usability, auditable deployment, and repository-context maintenance as release gates rather than optional improvements.

## Mandatory Agent.md Maintenance

`Agent.md` must be reviewed and updated for **every change** made to the repository before that change is merged or deployed.

This requirement applies to feature work, bug fixes, refactors, UX/UI changes, tests, CI/CD changes, deployment changes, security changes, database changes, integrations, mobile/PWA changes, documentation-affecting behavior, and operational fixes.

For every branch/PR/change:

1. Read `Agent.md` before implementation.
2. Update the relevant section(s) to reflect the new behavior, constraints, files, architecture, deployment assumptions, tests, or rollback information.
3. If the change does not alter an existing section, add a concise entry or clarification so the repository context still records the change.
4. Keep `Last updated` current.
5. Do not merge or deploy a repository change that leaves `Agent.md` stale.
6. Never place credentials, secret values, access tokens, database passwords, private keys, or other sensitive production values in `Agent.md`.

A missing `Agent.md` update is considered an incomplete change.

## Product and Architecture Baseline

- HOAHub is a multi-tenant community/homeowners-association SaaS platform.
- Primary application stack: Next.js, React, TypeScript, Tailwind CSS, Prisma, and MySQL.
- Production hosting is Hostinger.
- Tenant-owned data must remain tenant-scoped at every UI, API, service, job, storage, cache, export, and AI boundary.
- Server-side authenticated session context is authoritative. Never trust a browser-supplied tenant identifier, role, account owner, or redirect destination as proof of authorization.

## Non-Negotiable Security Rules

1. Preserve tenant isolation and fail closed when tenant/user authority is ambiguous.
2. Preserve RBAC/permission checks and record-ownership checks on server-side actions.
3. Do not weaken `safeReturnTo`, session validation, passkey verification, or authentication redirect controls.
4. Never commit production secrets, API keys, passwords, private certificates, or Hostinger credentials.
5. Do not expose raw database access to client code or AI/model surfaces.
6. State-changing operations must continue to use server-side business validation and audit controls.
7. Security-sensitive behavior must remain covered by automated tests when implementation details change.

## Homeowner Mobile and PWA Requirements

Homeowner-facing changes must be designed for installed PWA and mobile-browser use, not desktop only.

- Use dynamic viewport behavior (`100dvh`) where full-height layouts are required.
- Respect `env(safe-area-inset-top/right/bottom/left)` for notches and home indicators.
- Support standalone display mode where applicable.
- Keep primary touch controls at least 48px high where practical.
- Avoid desktop-only hover as the sole interaction cue.
- Avoid expensive decorative animation on mobile; keep motion lightweight and non-blocking.
- Honor `prefers-reduced-motion`.
- Ensure critical cards/forms can scroll safely on short mobile viewports without horizontal overflow.
- Preserve passkey support on compatible mobile devices.

## Current Release: Community Pulse Premium Login

Community Pulse is the premium HOAHub login experience introduced through PR #103 and strengthened through subsequent mobile/PWA, web, verification, and post-login handoff work.

### Current Login Motion

- Desktop/web uses staged branding, animated grid/pulse layers, aurora glows, light sweeps, feature-card sheen, focused-field illumination, button sheen, passkey micro-motion, and a clearly visible blue/green secure orbit around the stable tenant/HOA logo.
- Mobile/PWA uses a clearly visible community mesh, moving blue/green signal wave, traveling nodes, animated logo orbit/halo, signal rail, animated card beam, ambient glows, and touch-safe form motion.
- The HOAHub/tenant logo itself remains visually stable during idle login on both desktop/web and mobile/PWA; only the surrounding orbit/halo rotates so brand legibility is preserved.
- Desktop/web and mobile/PWA use the same authentication-state language: idle secure orbit, `Verifying access…`, branded `Access verified`, then authenticated-shell handoff.
- All non-essential motion must honor `prefers-reduced-motion`.

### Login Verification Transition

The current release adds an explicit authentication-state sequence without replacing the existing authentication logic:

1. Idle: stable HOAHub/tenant logo with a rotating secure orbit and visible Community Pulse motion on desktop/web and mobile/PWA.
2. Pending credential authentication: the primary button displays `Verifying access…` with a restrained spinner while the existing server action is pending.
3. Successful credential authentication: the form transitions out and a dedicated success state shows the branded logo, one completing blue/green orbit, green confirmation badge, `Access verified`, and `Opening your HOAHub dashboard…`.
4. Redirect: navigation occurs after an approximately 800 ms visible confirmation window using the existing safe redirect target (`returnTo` first, otherwise the authenticated `redirectTo`).
5. Authenticated-shell handoff: the first shared HOA/tenant logo rendered after successful login receives one short blue/green orbit and confirmation pulse, then returns to a fully static logo.

The success animation must never be shown before the existing server authentication action returns a valid redirect target.

### Post-Login Brand Handoff

A short-lived browser session marker (`hoahub.login.handoff.v1`) is written only after successful credential or passkey authentication.

- The marker contains only a local timestamp; it contains no identity, tenant, session, credential, or authorization data.
- `AssociationLogo` uses the shared `PostLoginBrandOrbit` wrapper so the handoff applies consistently across authenticated homeowner, admin, desktop/web, and mobile/PWA shells without duplicating layout logic.
- Login, forgot-password, and reset-password routes explicitly do not consume or display the post-login handoff orbit.
- The marker is accepted only for approximately 10 seconds after successful authentication.
- The authenticated-logo handoff is visible for approximately 1.7 seconds, performs one rotation/pulse sequence, removes the marker, and does not continuously animate during normal navigation.
- If browser session storage is blocked or unavailable, authentication and navigation must continue normally; the animation is optional presentation only.
- `prefers-reduced-motion` removes the rotating/pulsing motion while preserving a minimal confirmation state.

### Community Pulse Files

- `components/tenant-login-screen.tsx`
- `components/login-form.tsx`
- `components/passkey-login-button.tsx`
- `components/association-logo.tsx`
- `components/post-login-brand-orbit.tsx`
- `components/post-login-brand-orbit.module.css`
- `components/community-pulse-login.module.css`
- `components/community-pulse-mobile-premium.module.css`
- `components/community-pulse-web-premium.module.css`
- `components/login-verified-transition.module.css`
- `tests/unit/community-pulse-login-transition.test.ts`

### Client/Server Branding Boundary

- `lib/tenant-logo.ts` is a server-side logo upload/storage utility and imports Node-only APIs including `node:crypto`, `node:fs/promises`, and `node:path`.
- Client components such as `components/login-form.tsx` must never import `lib/tenant-logo.ts`, even only to reuse `DEFAULT_TENANT_LOGO_URL`, because doing so pulls Node-only modules into the browser bundle and breaks the production build.
- `TenantLoginScreen` resolves the tenant/default logo on the server and passes the resolved URL into client presentation components.
- When a client-only defensive fallback is still required, use the static public path `/Hoahub-logo.png` locally rather than importing the server utility.
- `tests/unit/community-pulse-login-transition.test.ts` enforces this boundary.

### Authentication Boundary

Community Pulse is a presentation/interaction enhancement. It must not bypass or replace the existing authentication action, server-side session validation, tenant/account selection, safe redirect handling, homeowner account selection, or passkey verification.

The post-login animation marker is never authoritative authentication state. Authenticated server/session checks remain the only authority for protected routes.

The homeowner identifier remains compatible with either verified email or the 11-digit homeowner account number.

## Validation Gate

Before production deployment, the applicable CI pipeline must pass. The repository production workflow currently covers:

- `pnpm install --frozen-lockfile`
- `pnpm lint`
- `pnpm exec prisma validate`
- `pnpm exec prisma generate`
- `pnpm exec prisma migrate deploy` against the CI database
- `pnpm db:seed`
- `pnpm test`
- `pnpm test:integration`
- `pnpm test:critical`
- `pnpm typecheck`
- `pnpm build`
- production smoke tests and critical browser/E2E tests

Do not merge a known failing release merely to trigger deployment. Fix the defect or update a brittle test only when the changed test continues to assert the intended security/business invariant.

### CI Browser Runtime

- GitHub Actions browser verification must prepare the repository-controlled `@sparticuz/chromium` executable and export its path as `PUPPETEER_EXECUTABLE_PATH` before the critical browser suite begins.
- The currently verified browser protocol pair is exactly `@sparticuz/chromium` `149.0.0` with `puppeteer-core` `25.1.0`. Keep both dependencies pinned without semver ranges; Chromium 149 must not be driven by a Puppeteer release mapped to a later Chrome major.
- `@sparticuz/chromium` provides a `chrome-headless-shell` binary, not a normal headed/new-headless Chrome executable. HOAHub Puppeteer launch sites using this runtime must use `headless: "shell"` and merge `chromium.args` through `await puppeteer.defaultArgs({ args: chromium.args, headless: "shell" })` rather than using `headless: true`.
- Do not create non-default Chromium `BrowserContext` instances with this controlled runtime. That path can close the target at `Target.createTarget` before an HOAHub assertion begins.
- `tests/e2e/safe-browser-context-cleanup.mjs` preserves logical context isolation without non-default contexts: every call to `browser.createBrowserContext()` launches a separate Chromium process and returns that process's `defaultBrowserContext()`. This gives admin, homeowner, tenant-isolation, and production smoke flows independent browser storage and session state.
- Closing a logical context must close its pages and its dedicated Chromium process with bounded cleanup. Closing the coordinator browser must also close any orphan isolated browser processes. Do not replace this with one shared default context unless cookie, localStorage, sessionStorage, IndexedDB, cache, and authentication isolation are explicitly proven.
- Every Chromium-based E2E entry point must preload `tests/e2e/safe-browser-context-cleanup.mjs`. `tests/e2e/run-critical-path.mjs` preloads it for `critical-path.mjs`, and every other browser script in `package.json` `test:e2e` must use Node `--import` with the same runtime before execution. New browser E2E scripts must be added under this shared runtime contract before merge.
- Do not use the GitHub-hosted runner's mutable system Chrome as the primary HOAHub E2E executable when the repository-controlled Chromium runtime is available; runner image/browser revisions have repeatedly closed before assertions begin.
- `tests/e2e/critical-path.mjs` gives `PUPPETEER_EXECUTABLE_PATH` first priority, so the workflow-level export selects the controlled runtime without weakening business assertions.
- Keep the bounded startup retry limited to the exact transient `Target.setDiscoverTargets` + `Target closed` condition. Authentication, authorization, tenant-isolation, payment, document, and other business assertion failures must still fail immediately. A deterministic launch-contract error such as `Target.createTarget` must be fixed rather than hidden by retry expansion.
- Production authenticated login-motion verification imports the same safe browser-isolation runtime and uses the supported `chrome-headless-shell` launch contract before exercising the live site.
- When Puppeteer or `@sparticuz/chromium` versions are changed, verify their Chromium-major compatibility against Puppeteer's supported-browser mapping; do not upgrade either side independently without that check.
- `tests/unit/browser-cleanup-policy.test.ts` protects controlled-browser ordering, full browser-entry-point preload coverage, the exact compatible dependency pair, default-context process isolation, shell launch mode, bounded retry behavior, and cleanup invariants.
- `tests/unit/production-login-motion.test.ts` protects the shared isolation runtime and shell launch contract for the production verifier.

## Hostinger Production Deployment Model

The live HOAHub application is a Hostinger managed Node.js web application connected to the GitHub `main` branch. Hostinger's managed GitHub deployment is the normal production activation path.

- Production feature branches are not deployment targets.
- Production changes must land on `main` through the approved GitHub flow.
- A push/merge to `main` runs the HOAHub verification workflow and triggers Hostinger's connected-GitHub auto-deployment.
- GitHub CI must not claim a release is live merely because CI passed or because files were copied through SSH.
- `scripts/write-release-id.mjs` stamps the build's short Git commit SHA into `public/release.txt`.
- The production verification job waits until `${HOSTINGER_APP_URL}/release.txt` matches the expected `main` commit SHA, then checks `${HOSTINGER_APP_URL}/api/health`.
- A release is considered deployed only after the expected release marker and public health check both pass.
- Do not rely on a global `pm2` executable for the normal Hostinger managed-web-app deployment path; Hostinger manages the application process lifecycle for the connected web app.
- Hostinger's install layer can invoke pnpm while the managed application build subprocess does not necessarily expose the `pnpm` executable in `PATH`. Production build scripts therefore must not shell out to a nested `pnpm` command. Invoke Node scripts and installed package binaries directly from the lifecycle command instead.
- `tests/unit/hostinger-build-script.test.ts` protects this Hostinger build-PATH invariant.

### Production Login Motion Verification

After the expected Hostinger release marker is live and `/api/health` passes, GitHub may run `tests/e2e/production-login-motion.mjs` against the real production login using a dedicated low-privilege homeowner smoke-test account.

- Production login credentials must be stored only as GitHub `production` Environment secrets. Never place them in repository files, workflow logs, `Agent.md`, screenshots, PR text, or chat.
- Required GitHub secret names are `E2E_PROD_LOGIN` and `E2E_PROD_PASSWORD`; the workflow maps them into process-local verifier variables and never prints their values.
- Optional `E2E_PROD_TENANT_SLUG` selects a tenant-specific login route; otherwise the universal `/login` route is used.
- Optional `E2E_PROD_EXPECTED_PATH_PREFIX` defaults to `/portal/` and must remain a same-origin absolute path prefix.
- Use a dedicated homeowner account with no sensitive production data and no administrative, finance, document-approval, or tenant-management authority.
- The smoke test performs authentication/session creation only. It must not navigate to payment, billing, document submission, complaint submission, administration, or other business-operation routes.
- The verification runs isolated desktop/web and mobile/PWA-sized browser flows and asserts the visible secure orbit, `Verifying access…`, `Access verified`, dashboard navigation, and the one-shot authenticated-logo orbit/pulse.
- The script intentionally delays the authentication POST briefly so the pending verification state can be observed deterministically; it does not alter the server action or authentication result.
- The production workflow runs this smoke only after release and public-health verification. If the dedicated credentials are not configured, the workflow emits an explicit warning and skips the authenticated production smoke rather than using CI fixture credentials against production.
- `tests/unit/production-login-motion.test.ts` protects ordering, credential requirements, viewport coverage, required transition assertions, shared safe browser isolation, the supported headless-shell browser launch, and the no-business-route constraint.

### Hostinger Runtime and Filesystem

- Hostinger production is configured for Node.js 22.x.
- The confirmed Node 22 binary directory exposed on the account is `/opt/alt/alt-nodejs22/root/usr/bin`.
- Non-interactive SSH sessions may not automatically include that runtime in `PATH`; legacy/diagnostic SSH scripts must source `scripts/hostinger-runtime.sh` before invoking Node-based tooling.
- `HOSTINGER_APP_PATH`, when used by legacy/diagnostic SSH tooling, is the application root `/home/u309242896/domains/hoahub.tech`, not the `storage` directory or `.env` file.
- The persistent server-side environment file created for SSH tooling is `$HOSTINGER_APP_PATH/shared/.env`.
- Never expose, print, commit, or copy the contents of the production `.env` into CI logs or repository files.
- The older immutable-release/PM2 SSH activation script is not the authoritative production activation path for the Hostinger managed web app. Do not report its PM2 failure as evidence that the Hostinger GitHub-connected deployment failed.

## Release Identification

`package.json` invokes `node scripts/write-release-id.mjs` directly before both the normal Next.js build and `hostinger:build`. Do not replace this with a nested `pnpm release:stamp` call in managed Hostinger build commands, because pnpm may be unavailable inside the build subprocess even though Hostinger used pnpm for dependency installation. The stamp script writes a short Git revision to `public/release.txt`.

Production verification should compare that public marker with the expected `main` commit before asserting that a UI fix or feature is live. This avoids confusing an older healthy production build with the newly merged release.

## Community Pulse Rollback

Community Pulse, the verified-login transition, and the post-login brand handoff introduce no dedicated database migration.

If the login UX causes a production regression:

- revert the relevant Community Pulse/login-transition merge commit on `main`;
- allow Hostinger's managed GitHub deployment to publish the reverted commit;
- confirm `/release.txt` matches the rollback commit;
- confirm `/api/health` succeeds;
- re-test credential login, passkey login, tenant/account selection, safe return navigation, authenticated logo handoff, and homeowner mobile/PWA login.

Authentication/session data should not require rollback for these presentation-layer changes.

## Change Discipline

For every repository change—not only security-sensitive changes:

- Read the existing implementation, tests, and relevant security boundaries first.
- Keep tenant/user authority server-controlled.
- Add or update regression tests for the intended invariant when behavior changes.
- Keep desktop and homeowner PWA/mobile behavior in the acceptance criteria when user-facing behavior is affected.
- Keep production deployment verification aligned with the actual Hostinger hosting model.
- Update `Agent.md` in the same branch/PR before merge and deployment.
