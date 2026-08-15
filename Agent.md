# HOAHub Agent Context

Last updated: 2026-08-15

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

### Multi-Account Login Selection

A user whose already-verified credentials match more than one active HOA/tenant account must authenticate **once** and then choose the isolated account/session to open.

- The first credential submission performs the normal server-side password verification and builds only the authorized account choices.
- When multiple choices exist, the server writes a short-lived signed `hoa_login_choice` cookie. It is `HttpOnly`, `SameSite=Lax`, secure in production, expires after approximately five minutes, contains only the allowed user IDs plus a purpose marker, and is signed with the same protected server secret boundary as authentication.
- A verified choice handoff is created only for a non-empty multi-account choice set; optional/undefined choice state must never be treated as an authenticated selection proof.
- If an authentication resolver ever produces a choice-bearing result with an empty or missing choice array, the login must fail closed with no session creation; it must never fall through to the normal authenticated-session path.
- The account-selection UI removes the username/email and password fields after identity verification. The second submission sends only `selectedUserId` plus normal navigation context; the password is never retained in React state, hidden inputs, session storage, local storage, or the choice cookie.
- The server accepts a selected account only when its user ID is present in the valid signed choice cookie, then revalidates the selected user and tenant as active before creating the tenant-scoped session.
- The temporary choice cookie is cleared after successful selection, when a new credential login starts, on expiry/error, and during logout flows.
- A missing, expired, tampered, or mismatched choice cookie fails closed and requires a fresh sign-in.
- Tenant isolation remains mandatory: choosing one account loads only that tenant/account into the authenticated session.
- Both `tests/unit/login-multi-account-selection.test.ts` and the existing `tests/unit/homeowner-multi-account-surface.test.ts` must assert the credential-free second step and tenant/account-isolated session behavior; stale tests must not require the former credential-resubmission UI.

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
- `lib/login-choice-cookie.ts`
- `tests/unit/community-pulse-login-transition.test.ts`
- `tests/unit/login-multi-account-selection.test.ts`
- `tests/unit/homeowner-multi-account-surface.test.ts`

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

## Homeowner Payment Status Authority

Homeowner-facing payment status must describe the current financial state, not allow an older failed attempt to override a later successful payment.

- The Statement of Account posted balance is authoritative for the homeowner's **current balance status**. If billing exists and `currentOutstandingBalance <= 0`, the current status is `Fully Paid` even when an older request was rejected, cancelled, or was previously pending.
- Historical rejected/cancelled attempts remain valid audit/history records; they must not be promoted into the current balance headline after the account is settled.
- When a balance remains outstanding, the latest relevant pending/rejected request may still be shown as `Payment Pending` or `Payment Rejected`.
- PayMongo requests are gateway-controlled. Manual approval/rejection remains prohibited while awaiting gateway confirmation. A payment is posted only through verified PayMongo webhook processing and the normal transactional ledger/receipt path.
- The PayMongo webhook is allowed to recover a request that was previously marked rejected by checkout cancellation when a later verified paid event for that same checkout arrives; it resets the request to a processable state and approves/posts it transactionally.
- A posted `Payment` or `Collection` linked to a request is stronger evidence of settlement than stale request-display metadata. UI changes must prefer posted ledger artifacts and the resulting SOA balance when describing current payment state.
- Every homeowner `Payment Status` card must resolve its displayed label/tone using the linked posted ledger artifacts (`request.payment` or `request.collection`) before stale request metadata. In particular, a PayMongo request with a linked posted artifact must display `Paid · PayMongo confirmed` even if an earlier request status remains `REJECTED` or `CANCELLED` in history.
- Do not call the PayMongo API merely to render each homeowner payment page. The authoritative local posted ledger is created only from verified PayMongo webhook processing; page rendering reads that tenant-scoped local financial state.
- Payment status corrections must never create a receipt merely from a browser redirect/query parameter. Only verified gateway confirmation or the existing authorized manual accounting workflow can post financial records.
- Core implementation: `lib/services/homeowner-payment-status.ts`, `app/portal/pay/page.tsx`, `lib/services/homeowner-paymongo.ts`, and `lib/services/payment-requests.ts`.
- Regression coverage: `tests/unit/homeowner-payment-status.test.ts`, including source-level wiring that ensures the homeowner page passes linked `Payment`/`Collection` evidence into the status resolver.

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

Community Pulse, the verified-login transition, the multi-account verified-choice cookie, and the post-login brand handoff introduce no dedicated database migration.

If the login UX causes a production regression:

- revert the relevant login/authentication merge commit on `main`;
- allow Hostinger's managed GitHub deployment to publish the reverted commit;
- confirm `/release.txt` matches the rollback commit;
- confirm `/api/health` succeeds;
- re-test credential login, multi-account selection without password re-entry, passkey login, tenant/account isolation, safe return navigation, authenticated logo handoff, and homeowner mobile/PWA login.

Authentication/session data should not require a database rollback for these interaction-layer changes.

## Change Discipline

For every repository change—not only security-sensitive changes:

- Read the existing implementation, tests, and relevant security boundaries first.
- Keep tenant/user authority server-controlled.
- Add or update regression tests for the intended invariant when behavior changes.
- Keep desktop and homeowner PWA/mobile behavior in the acceptance criteria when user-facing behavior is affected.
- Keep production deployment verification aligned with the actual Hostinger hosting model.
- Update `Agent.md` in the same branch/PR before merge and deployment.
