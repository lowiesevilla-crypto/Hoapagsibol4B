# HOAHub Community Intelligence UI System v1

Status: Approved design baseline; implementation begins with UI foundation and shell separation.

## Purpose

This document records the repository-facing implementation contract for the approved HOAHub Phase 3 UI direction. It does not authorize changes to tenant isolation, RBAC, subscription entitlements, authentication, payments, document issuance, payroll confidentiality, complaint privacy, AI governance, or deployment controls.

## Product Surfaces

### Tenant Workspace

- Association identity remains explicit.
- Navigation is operational and role/module filtered.
- Dashboard and future Action Center prioritize work requiring attention.
- Finance, Documents, Workforce, Community, and AI remain authoritative module workflows.

### Platform Control Plane

- Platform identity must be visually distinct from any tenant.
- HOAHub platform branding must not use a customer/tenant logo.
- Primary taxonomy: Platform Home, Customers, Commercial, Operations/Governance, Account.
- Platform dashboard may aggregate only platform-authorized cross-tenant/commercial data.

### Homeowner / PWA

- Existing primary destinations remain Home, Payments, Requests, Community, and More.
- Existing entitlement filtering, PWA safe-area behavior, viewport rules, and AI governance remain authoritative.
- Mobile task completion is favored over decorative density.

## Foundation Tokens

Existing `pine`, `leaf`, `ink`, and `sand` brand tokens remain supported. v1 adds semantic aliases for:

- surfaces;
- success / info / warning / critical states;
- AI/intelligence state;
- platform control-plane accents;
- workspace/floating elevation.

## Reusable Components

Initial shared primitives:

- `components/ui/page-header.tsx`
- `components/ui/metric-card.tsx`
- `components/ui/status-badge.tsx`
- `components/ui/workspace-card.tsx`

New abstractions should be added only when they replace repeated production patterns; do not create a parallel UI framework.

## Accessibility and Responsive Contract

- Preserve visible focus treatment.
- Do not use color as the sole status signal.
- Keep primary touch controls approximately 48px where practical.
- Honor reduced motion.
- Avoid horizontal overflow and clipped actions.
- Preserve `100dvh`/safe-area behavior where currently required by mobile/PWA surfaces.

## Implementation Waves

1. UI tokens and shared primitives.
2. Tenant/Platform shell separation.
3. Tenant Dashboard V2, Action Center, Resident 360.
4. Finance, Documents, Workforce, and AI workspaces.
5. Platform Command Center, Tenant 360, commercial and governance workspaces.
6. Homeowner/PWA visual normalization.

Each wave requires `Agent.md` maintenance, targeted regression coverage, build/typecheck/lint validation, authorization/tenant-isolation review, and explicit approval before production deployment.

## Deployment Rule

Feature branches are not production. Do not merge/deploy UI work merely because it is visually approved. Production remains governed by the existing GitHub `main` -> CI -> Hostinger release-marker/health process.
