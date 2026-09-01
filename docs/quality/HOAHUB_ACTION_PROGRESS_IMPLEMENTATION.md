# HOAHub Action Progress and Duplicate-Submission Protection

Task: `HOAHUB-UX-P0-001`

Tracking issue: #273

Status: IN PROGRESS — foundation, payment result/reconciliation, and billing server-confirmed result state are VERIFIED and production-deployed; durable bulk progress and rollout gates remain open; rollout remains default off

## Active-tenant safety

HOAHub serves an active tenant. This enhancement remains additive and preserves the existing UI and business behavior unless `ux_action_progress_v1` is explicitly enabled for an approved target. The master switch defaults to disabled and fails closed when configuration is absent or invalid. Disabling `UX_ACTION_PROGRESS_V1_ENABLED` is the immediate application rollback; no financial records or historical audit evidence are removed.

## Foundation increment

- Flag name: `ux_action_progress_v1`.
- Runtime controls: `UX_ACTION_PROGRESS_V1_ENABLED` and `UX_ACTION_PROGRESS_V1_TARGETS`.
- Targeting supports global, tenant, module, role, and ordered tenant/module/role rules.
- Shared UI: `ActionProgressButton`, exposed through the existing `SubmitButton` API.
- Shared synchronous submission lock rejects repeated click/Enter attempts before React pending state renders.
- Truthful standard stages are shown only when verified. The shared component can show 25% after accepted submit intent/client validation and 50% while the Server Action request is pending. It does not invent a 75% stage where no durable server-processing checkpoint exists.
- Reduced-motion users retain percentage feedback without rotation; meaningful stage text uses a polite live region and the processing button exposes `aria-busy`.

## Verified financial increments

### Record Payment result state — PR #276

- Flagged Admin Record Payment uses a structured Server Action result beside the legacy redirecting path.
- The enabled UI reaches 100% only after the server confirms the persisted payment result.
- Existing tenant-scoped payment idempotency, duplicate reference checks, notification side effects, and revalidation remain authoritative.
- Exact head `616e07a422b7a20491864b77b7d7adf2ed469af6` passed MySQL #1385, Canva #466, Edge #59, Firefox #55, and Mobile #54; merge `111ceffa06a8b2fc1ec533e1158f3c7585091b24`; post-merge MySQL #1386 and Hostinger/public health passed.

### Payment uncertain-response reconciliation — PR #281

- The flagged payment path includes a read-only reconciliation action using the same tenant-scoped submission token before retry.
- Lookup is scoped to `(tenantId, idempotencyKey)` and does not create, update, void, allocate, notify, or revalidate payments.
- Exact head `92e8fdbe88920442c4859b52cc81b664f45bcdbd` passed MySQL #1395, Canva #472, Edge #65, Firefox #61, and Mobile #60; merge `c43895cab823ec2d01538c28c372a628644d4379`; post-merge verification and Hostinger/public health passed.

### Monthly Billing server-confirmed result state — PR #285 / #286

- PR #285 introduced a default-off structured result path for `Generate for Eligible Homeowners`.
- The flagged UI reaches 100% only after `generateBillingFromRules` returns persisted created, duplicate, exempt, and failed counts.
- The legacy redirect path remains authoritative while the rollout flag is disabled.
- The structured action repeats `BILLING_GENERATE` permission enforcement and the server-side `ux_action_progress_v1` tenant/module/role resolver.
- Existing Billing Rule resolution, automatic/manual mode guard, tenant isolation, database uniqueness, exemptions, and duplicate-skip behavior remain unchanged.
- PR #285 exact head `12a737312fbfb5ec35f91faebaf82f0f984ee8d5` passed MySQL #1412, Canva #485, Edge #78, Firefox #74, and Mobile #73 and merged as `e744afe0a8589f9be45da9ceb745a14a5a0f4a29`.
- PR #286 corrected two post-merge review edge cases: the flagged billing result state is remounted when preview inputs change so an earlier 100% state cannot disable a new preview, and framework authorization/session redirects are rethrown instead of being converted to inline billing errors.
- PR #286 exact head `2c8f8f7017a5793bacb973f6657880a847a1acae` passed MySQL #1414, Canva #486, Edge #79, Firefox #75, and Mobile #74; merged as `9f58fb2ac9df352ce86972076815ff93f8bfdb48`.
- Post-merge MySQL CI #1415 run `33474363771` passed the full verification suite, production smoke / critical browser suite, Hostinger managed-deployment wait, and public production health.
- This increment still does not claim durable `completed / total` background-job progress. That is the next bounded #273 increment.

## Billing scale evidence

### Automatic Billing — VERIFIED at 5,001 homeowners

- Issue #278 / PR #283 provides disposable MySQL evidence for 5,001 ACTIVE homeowners.
- PR #283 exact head `704f97151e9290e43edd1353e43392afe270b21d` passed MySQL #1408, Canva #483, Edge #76, Firefox #72, and Mobile #71 and merged as `117339d1488a2dc77b7b181f831c58adc6396d73`.
- Post-merge MySQL #1409 plus Hostinger/public health passed.
- Evidence covers bounded automatic generation, duplicate prevention, retry/completion behavior, failure isolation, rental billing correctness, advance-credit allocation, and second-tenant isolation.

### Manual Billing — explicit 5,001-homeowner qualification REQUIRED

The Admin-triggered Manual Billing flow uses the same tenant-scoped generation engine and bounded write controls as the automatic path, but automatic-billing evidence must not be used as a substitute for a dedicated Manual Billing acceptance run.

Before large-tenant manual billing is labeled 5,000+ production-proven or enabled with durable progress for an active tenant, CI/staging must prove the manual flow with at least 5,001 ACTIVE homeowners and verify:

- manual Monthly Dues generation through the actual manual generation service path;
- exemptions and pre-existing duplicates are skipped correctly;
- repeat/manual retry produces no prohibited duplicate bills;
- bounded write/audit/notification work and acceptable runtime/memory behavior;
- injected row failure is isolated without rolling back successful rows;
- persisted created/succeeded/failed counts reconcile to the target population;
- a second tenant cannot read, mutate, block, or contaminate the first tenant's run;
- the durable progress contract reports actual `floor(completed / total * 100)` and remains readable after refresh/reconnection/navigation;
- retry is limited to failed records only after a partial result.

The durable-billing implementation and the 5,001-homeowner manual qualification should ship together as one bounded #273 increment so scale safety and truthful progress are proven on the same exact release head.

## Durable bulk progress contract — next increment

For Monthly Billing and other large batch operations, the implementation must persist and expose:

- job reference;
- tenant ID and authorized actor identity;
- total target records;
- completed records;
- succeeded records;
- failed records;
- status and timestamps;
- idempotency-key hash / duplicate-request protection;
- failed-record-only retry lineage where applicable.

User-visible percentage is computed as:

`floor(completed records / total records × 100)`

Progress must survive refresh, reconnection, and navigation. A user may leave the Billing page and later inspect the same job. The UI must not reach 100% before the durable job reaches a terminal server-confirmed state.

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

- Implement and verify durable Monthly Billing progress with persisted total/completed/succeeded/failed state and failed-only retry.
- Add the dedicated 5,001-homeowner Manual Billing qualification on the same generation path.
- Add a verified 75% standard-action stage only where an action exposes a real server-processing checkpoint.
- Extend server-side idempotency, database uniqueness, and privacy-safe observability to every remaining P0/P1 action after individual authority review.
- Complete concurrency, slow-network, timeout, two-tab, accessibility, selected-tenant staging, monitoring, rollback, and product-owner pilot evidence.
- Do not enable the flag for an active tenant until the applicable increment has exact-head CI, staging UAT, operational monitoring, and explicit pilot authorization.
