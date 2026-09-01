# HOAHub Action Progress and Duplicate-Submission Protection

Task: `HOAHUB-UX-P0-001`

Tracking issue: #273

Status: IN PROGRESS — foundation and payment contracts VERIFIED and production-deployed; billing generation result-state implemented pending exact-head gates; rollout remains default off

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

- PR #276 branch: `codex/payment-progress-result-state-20260831`.
- Admin Record Payment now has a flagged structured Server Action result path beside the legacy redirecting action.
- The legacy default-off path still redirects directly to `/receipts/payment/[id]` and remains the production behavior unless the flag target is explicitly enabled.
- The flagged path reuses the same tenant-scoped payment service, idempotency-key replay handling, duplicate reference checks, notification side effects, and revalidation paths as the legacy action.
- The structured action enforces the same `ux_action_progress_v1` tenant/module/role resolver server-side before returning progress-specific state.
- On server-confirmed success, the enabled form renders an accessible status, drives the shared submit button to a verified 100% state, then opens the server-confirmed receipt. On validation or business-rule failure, the form renders an accessible alert and keeps the entered fields available for correction.
- This increment does not expose a 75% payment stage because persistence still completes within one request and there is no separate durable processing checkpoint to report truthfully.

## Payment uncertain-response reconciliation increment

- PR #281 branch: `codex/payment-progress-reconciliation-20260831`.
- The flagged Admin Record Payment path includes a read-only reconciliation action for the same tenant-scoped submission token before an administrator retries after an error or uncertain response.
- Reconciliation requires the same `PAYMENTS_RECORD` and `RECEIPTS_ISSUE` authority and the same server-side `ux_action_progress_v1` tenant/module/role resolver as the progress result action.
- The lookup is scoped to `(tenantId, idempotencyKey)` and does not create, update, void, allocate, notify, or revalidate payment records.
- If the payment already exists, the UI reports that the payment was recorded and opens the existing receipt. If no payment is found, the UI tells the administrator to review details and retry only if the payment was not already receipted elsewhere.
- The legacy redirecting production path is unchanged while the rollout flag remains disabled.
- This increment still does not expose a 75% payment stage because the reconciliation check is a post-response read, not a durable processing checkpoint.

## Billing generation result-state increment

- Branch: `codex/action-progress-charge-20260901`.
- The flagged monthly billing generation path returns a structured, server-confirmed success or recoverable error result instead of relying on a redirect.
- The enabled UI reaches 100% only after `generateBillingFromRules` returns its persisted created, duplicate, exempt, and failed counts; the default-off path retains the existing redirect contract.
- The structured action repeats the existing `BILLING_GENERATE` permission check and additionally enforces the server-side `ux_action_progress_v1` tenant/module/role resolver.
- Existing Billing Rule resolution, automatic/manual mode guard, tenant isolation, database uniqueness, and duplicate-skip behavior are unchanged. A repeated request continues to produce no prohibited duplicate billing rows.
- This increment does not claim a 75% stage or durable `completed / total` background-job progress. Those require a separately persisted job/checkpoint contract and remain open.

## Payment reconciliation release evidence

- PR #281 exact head `92e8fdbe88920442c4859b52cc81b664f45bcdbd` passed HOAHub MySQL CI #1395, Canva Visual Parity #472, Edge Critical Flow #65, Firefox Critical Flow #61, and Mobile Responsive Evidence #60.
- PR #281 merged to `main` as `c43895cab823ec2d01538c28c372a628644d4379`.
- Post-merge HOAHub MySQL CI run `33382703892` completed successfully, including the full verify job and Hostinger managed-production/public-health verification.
- Production deployment does not equal tenant rollout: the master switch remains default-off and no tenant target was enabled.

## Payment result-state release evidence

- `pnpm test:unit -- homeowner-advance-payment` passed 482 unit tests.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed.
- PR #276 exact head `616e07a422b7a20491864b77b7d7adf2ed469af6` passed HOAHub MySQL CI #1385, Canva Visual Parity #466, Edge Critical Flow #59, Firefox Critical Flow #55, and Mobile Responsive Evidence #54.
- PR #276 merged to `main` as `111ceffa06a8b2fc1ec533e1158f3c7585091b24`.
- Post-merge HOAHub MySQL CI #1386 passed the complete verification and critical browser suites, Hostinger managed-deployment wait, and public production-health verification.
- Production deployment does not equal tenant rollout: the master switch remains default-off and no tenant target was enabled.

## Foundation release evidence

- PR #274 exact head `51fe731f3751acc338595a418890adf2ffd635c6` passed HOAHub MySQL CI #1381, Canva Visual Parity #464, Edge Critical Flow #57, Firefox Critical Flow #53, and Mobile Responsive Evidence #52.
- PR #274 merged to `main` as `bed4ca020e1c8dd50a4ff2ad48c66339ffe9adc2`.
- Post-merge HOAHub MySQL CI #1382 passed the complete verification and critical browser suites, Hostinger managed-deployment wait, and public production-health verification.
- Production deployment does not equal feature rollout: the master switch remains default-off and no tenant target was enabled.

## Automatic billing scale safety evidence related to bulk progress

- PR #283 exact head `704f97151e9290e43edd1353e43392afe270b21d` passed HOAHub MySQL CI #1408, Canva Visual Parity #483, Edge Critical Flow #76, Firefox Critical Flow #72, and Mobile Responsive Evidence #71.
- PR #283 merged to `main` as `117339d1488a2dc77b7b181f831c58adc6396d73`.
- Post-merge HOAHub MySQL CI #1409 passed the complete verification and production smoke / critical browser suite; Hostinger managed-production/public-health verification also passed.
- Issue #278 is completed. The 5,001-homeowner automatic billing generation path is now verified for bounded batching, duplicate prevention, retry/completion behavior, failure isolation, rental billing correctness, and tenant isolation under the approved test harness.
- This evidence proves the safe generation path but does not by itself satisfy issue #273's durable user-visible `completed / total` background-job progress requirement.

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

- Verify the billing generation result-state increment through local tests, exact-head CI, post-merge managed deployment, and public production health.
- Add verified 75% status only where an action exposes a real server-processing checkpoint.
- Add durable bulk-job progress for monthly billing and other batch operations, including total/completed/succeeded/failed state that survives refresh/reconnection.
- Extend server-side idempotency, database uniqueness, and privacy-safe observability to every remaining P0/P1 action after individual authority review.
- Complete concurrency, slow-network, timeout, two-tab, accessibility, selected-tenant staging, monitoring, rollback, and product-owner pilot evidence.
- Do not enable the flag for an active tenant until the applicable increment has exact-head CI, staging UAT, operational monitoring, and explicit pilot authorization.
