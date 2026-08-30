# HOAHub Action Progress and Duplicate-Submission Protection

Task: `HOAHUB-UX-P0-001`

Tracking issue: #273

Status: IN PROGRESS — foundation candidate, default off

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

- Return explicit standard-action success/failure/status contracts so enabled forms can render verified 75% and 100% states before navigation.
- Add uncertain-response reconciliation before retry is enabled.
- Add durable bulk-job progress for monthly billing and other batch operations.
- Extend server-side idempotency, database uniqueness, and privacy-safe observability to every remaining P0/P1 action after individual authority review.
- Complete concurrency, slow-network, timeout, two-tab, accessibility, selected-tenant staging, monitoring, rollback, and product-owner pilot evidence.
- Do not enable the flag for an active tenant until the applicable increment has exact-head CI, staging UAT, operational monitoring, and explicit pilot authorization.
