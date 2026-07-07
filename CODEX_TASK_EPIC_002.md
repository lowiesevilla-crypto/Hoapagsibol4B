# HOAHub EPIC-002 – Subscription & License Management Foundation

## Context

This project is a production-ready multi-tenant SaaS HOA management platform built with:

- Next.js 15
- TypeScript
- Prisma
- MySQL
- Tailwind CSS
- App Router

Current branch:

feature/subscription-management

DO NOT modify production behavior.

DO NOT break existing authentication.

DO NOT change tenant routing.

DO NOT modify RBAC.

---

## Objective

Build the initial Subscription Management module.

This task is ONLY the foundation.

No payment gateway yet.

No online billing yet.

No AI yet.

---

## Phase 1

Create new Platform pages:

/platform/subscriptions

/platform/plans

/platform/licenses

/platform/audit

---

## Navigation

Add new Platform navigation links:

Subscription Plans

Tenant Subscriptions

License Management

Audit Logs

Only visible to:

PLATFORM_ADMIN

SUPER_ADMIN

---

## UI

Create clean responsive tables.

Use existing HOAHub design language.

Each page should display placeholder data.

No database calls yet.

---

## Security

Reuse existing authentication.

Reuse existing Platform layout.

Unauthorized users must receive existing access behavior.

---

## Quality Gates

Before finishing:

pnpm typecheck

pnpm build

Fix every TypeScript error.

Fix every ESLint error.

No warnings.

---

## Deliverables

Working pages.

Navigation updated.

Responsive layout.

Placeholder data.

Passing build.

Passing typecheck.

No production regressions.

Commit only after all checks pass.