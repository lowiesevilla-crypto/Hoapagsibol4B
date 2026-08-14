# HOAHub Agent Context

Last updated: 2026-08-14

## Purpose

This file is the repository-level operating context for AI coding agents and maintainers working on HOAHub. Treat production safety, tenant isolation, authentication integrity, mobile/PWA usability, and auditable deployment as release gates rather than optional improvements.

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

## Current Release: Community Pulse Login v1

Community Pulse is the premium HOAHub login experience introduced through PR #103.

### Scope

- Desktop staged entrance for HOA branding, trust badge, headline, explanatory copy, and feature cards.
- Slow grid drift, restrained ambient glows, and a subtle light sweep.
- Premium but conservative feature-card, field-focus, primary-button, and passkey micro-interactions.
- Short `Access verified` success state before navigation after successful credential login.
- Mobile/PWA-specific layout using dynamic viewport sizing, safe-area handling, lightweight ambient motion, contained scrolling, and touch-friendly form controls.
- The homeowner identifier remains compatible with either verified email or the 11-digit homeowner account number.
- No new animation runtime/library is required; Community Pulse motion is CSS-based.

### Files

- `components/tenant-login-screen.tsx`
- `components/login-form.tsx`
- `components/passkey-login-button.tsx`
- `components/community-pulse-login.module.css`

### Authentication Boundary

Community Pulse is a presentation/interaction enhancement. It must not bypass or replace the existing authentication action, server-side session validation, tenant/account selection, safe redirect handling, or passkey verification.

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

## Production Deployment Rules

- Feature branches are not production deployment targets.
- Production changes must land on `main` through the approved GitHub flow.
- A push/merge to `main` runs the HOAHub verification workflow.
- Hostinger production deployment runs only after verification succeeds and when the production deployment configuration/flag and required environment secrets are enabled.
- `HOSTINGER_APP_PATH` is the application root (currently `/home/u309242896/domains/hoahub.tech`), not the `storage` directory and not the `.env` file.
- The persistent production environment file is `$HOSTINGER_APP_PATH/shared/.env`. Never place production secrets in a release directory or Git.
- Confirm the production deployment job result before reporting a feature as live.
- Run/confirm production smoke checks after deployment.

## Hostinger Production Runtime

The Hostinger production web application is configured for Node.js 22.x. Interactive and non-interactive SSH sessions may not include that runtime in `PATH` by default.

- The current Hostinger Node 22 binary directory is `/opt/alt/alt-nodejs22/root/usr/bin`.
- Production deployment and backup scripts must source `scripts/hostinger-runtime.sh` before invoking Node-based tooling.
- `scripts/hostinger-runtime.sh` prepends the Hostinger Node 22 directory and fails closed if Node 22 cannot be resolved.
- Prefer `corepack pnpm ...` in Hostinger SSH deployment scripts rather than `corepack enable` plus a global `pnpm` shim, because the `/opt/alt` runtime location may not be writable by the application user.
- `scripts/backup-production.sh` depends on Node to parse `DATABASE_URL` before running `mysqldump`; do not move backup execution ahead of runtime initialization.
- The custom SSH activation path currently expects `corepack`, `mysqldump`, `gzip`, `tar`, and `pm2` to be available after runtime initialization. If a required runtime command is absent, deployment must stop with an explicit error rather than switching the `current` release or claiming production success.
- Do not expose, print, or copy the contents of `$HOSTINGER_APP_PATH/shared/.env` into CI logs.

## Community Pulse Rollback

Community Pulse v1 introduces no dedicated database migration. If the release causes a login UX regression, revert the Community Pulse merge/commit on `main` and redeploy the previous application version. Authentication/session data should not require rollback for this UI-only release.

## Change Discipline

When changing authentication, payments, homeowner identity, multi-account behavior, tenant switching, documents, or AI access:

- Read the existing tests and security boundaries first.
- Keep tenant/user authority server-controlled.
- Add or update regression tests for the intended invariant.
- Keep desktop and homeowner PWA/mobile behavior in the acceptance criteria.
- Update this file when deployment rules, critical architecture assumptions, or agent-facing release constraints materially change.
