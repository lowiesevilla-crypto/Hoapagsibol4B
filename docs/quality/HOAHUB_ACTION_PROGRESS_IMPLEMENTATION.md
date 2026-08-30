# HOAHub Action Progress and Duplicate-Submission Protection

Task: `HOAHUB-UX-P0-001`

Tracking issue: #273

Status: IN PROGRESS — foundation VERIFIED and production-deployed, payment success/failure contract in candidate verification, rollout default off

## Active-tenant safety

HOAHub already serves an active tenant. This change is additive and preserves the existing UI and business behavior unless the rollout flag is explicitly enabled for a matching target. The master switch defaults to disabled and fails closed when configuration is absent or invalid. Disabling `UX_ACTION_PROGRESS_V1_ENABLED` is the immediate application rollback; no financial records or historical audit evidence are removed.

## Foundation increment

- Flag name: `ux_action_progress_v1`.
- Runtime controls: `UX_ACTION_PROGRESS_V1_ENABLED` and `UX_ACTION_PROGRESS_V1_TARGETS`.
- Targeting supports global, tenant, module, role, and ordered tenant/module/role rules.
- Shared UI: `ActionProgressButton`, exposed through the existing `SubmitButton` API.
- Shared synchronous submission lock rejects repeated click/Enter attempts before React pending state renders.
- Truthful standard stages in this increment are 25% after native client validation and accepted submit intent, then 50% while the Server Action request is pending. The UI deliberately holds at 50% because current redirect-based Server Actions do not expose a separate server-persistence stage.
- Reduced-motion users retain percentage feedback without rotation; meaningful stage text uses a polite live region and the processing button exposes `aria-busy`.
- Pilot integrations are limited to Admin Record Payment and Generate for Eligible Homeowners. With the default-off flag, both continue using the pre-existing `Working...` behavior.
- Payment recording retains its tenant-scoped `(tenantId, idempotencyKey)` uniqueness and replay handling. Monthly billing retains its tenant/homeowner/charge/coverage duplicate protection.

## Payment result-state increment

- Candidate branch: `codex/payment-progress-result-state-20260831`.
- Admin Record Payment now has a flagged structured Server Action result path beside the legacy redirecting action.
- The legacy default-off path still redirects directly to `/receipts/payment/[id]` and remains the production behavior unless the flag target is explicitly enabled.
- The flagged path reuses the same tenant-scoped payment service, idempotency-key replay handling, duplicate reference checks, notification side effects, and revalidation paths as the legacy action.
- The structured action enforces the same `ux_action_progress_v1` tenant/module/role resolver server-side before returning progress-specific state.
- On server-confirmed success, the enabled form renders an accessible status, drives the shared submit button to a verified 100% state, then opens the server-confirmed receipt. On validation or business-rule failure, the form renders an accessible alert and keeps the entered fields available for correction.
- This increment does not expose a 75% payment stage because persistence still completes within one request and there is no separate durable processing checkpoint to report truthfully.

Local candidate verification:

- `pnpm test:unit -- homeowner-advance-payment` passed 482 unit tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.

## Foundation release evidence

- PR #274 exact head `51fe731f3751acc338595a418890adf2ffd635c6` passed HOAHub MySQL CI #1381, Canva Visual Parity #464, Edge Critical Flow #57, Firefox Critical Flow #53, and Mobile Responsive Evidence #52.
- PR #274 merged to `main` as `bed4ca020e1c8dd50a4ff2ad48c66339ffe9adc2`.
- Post-merge HOAHub MySQL CI #1382 passed the complete verification and critical browser suites, Hostinger managed-deployment wait, and public production-health verification.
- Production deployment does not equal feature rollout: the master switch remains default-off and no tenant target was enabled.

## Configuration contract

The master switch must be exactly `true`. Targets are JSON. Non-empty top-level selector lists are ANDed. Explicit rules are evaluated from last to first and may enable or disable a narrower target.

```json
{
  "global": false,
  "rules": [
    {
      "tenantId": "approved-tenant-id",
      "module": "BILLING",
      "roles": ["ADMIN", "HOA_ADMIN", "BILLING_MANAGER"],
      "enabled": true
    }
  ]
}
```

Never place credentials or tenant-private form data in this configuration.

## Remaining gates

- Promote the payment result-state candidate only after exact-head PR CI, merge, and post-merge managed-production/public-health verification.
- Add uncertain-response reconciliation before retry is enabled.
- Add verified 75% status only where an action exposes a real server-processing checkpoint.
- Add durable bulk-job progress for monthly billing and other batch operations.
- Extend server-side idempotency, database uniqueness, and privacy-safe observability to every remaining P0/P1 action after individual authority review.
- Complete concurrency, slow-network, timeout, two-tab, accessibility, selected-tenant staging, monitoring, rollback, and product-owner pilot evidence.
- Do not enable the flag for an active tenant until the applicable increment has exact-head CI, staging UAT, operational monitoring, and explicit pilot authorization.
