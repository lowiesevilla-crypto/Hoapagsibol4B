# PayMongo Settlement Trace Implementation

Last updated: 2026-08-25

Status: **DEPLOYED; pending authenticated tenant production UAT before final VERIFIED status**.

Release evidence: PR #179 passed exact-head HOAHub MySQL CI run `32793090994` and Canva Visual Parity run `32793090998` at head `eb8d39d21d09b9ee9d753e217c15b53be559aa82`. It merged to `main` as `4d1f794576eae66dd77bb0bf6b6498fcf9bc55fa`. Hostinger reported that commit as the current completed deployment, `/release.txt` returned `4d1f794576ea`, `/api/health` returned HTTP 200 with MySQL healthy, and post-merge CI/managed-production verification run `32794934089` passed.

## Purpose

The settlement trace makes HOAHub's existing PayMongo Linked Account evidence understandable without exposing API secrets or bank-account details. It answers four separate questions for one homeowner checkout:

1. Did PayMongo create and pay the Checkout Session?
2. Did HOAHub post the verified HOA principal to its finance ledger?
3. Was the tenant child account and fixed platform-fee recipient recorded correctly?
4. Has PayMongo generated or deposited a matching parent/child payout?

## User workflow

Authorized tenant payment managers open **Payments → Online payment status** and select **Trace settlement** for a row. The detail route is `/admin/payments/online/[id]`.

The page displays:

- Checkout Session ID and original Payment ID;
- gateway/live-mode and HOAHub reconciliation state;
- HOA principal, HOAHub convenience fee, processing fee, and customer-paid total;
- masked child and parent organization identifiers;
- provider-returned or HOAHub-recorded split-routing evidence;
- exact generated payout matches when the payout transaction contains the original Payment ID;
- the account's next aggregate payout estimate when no exact generated payout exists yet.

Aggregate schedules are explicitly labeled as estimates. HOAHub never claims that one payment is included until PayMongo returns a generated payout transaction linked to that Payment ID.

## Security and accounting controls

- `Permission.PAYMENTS_MANAGE` is required.
- The route passes only the authenticated tenant ID to the service.
- The opaque Payment Request ID is resolved with `tenantId` and the internal PayMongo request marker.
- Batch leader, batch members, homeowner, child account, Checkout metadata, payout organization, and Payment ID are rechecked before evidence is returned.
- Checkout retrieval uses the tenant child `Account-ID`; payout matching requires exact organization and original Payment ID equality.
- No secret key, authorization header, full parent organization ID, bank name, account name, or account number is returned to the page.
- The page is read-only. It does not create payments, change payout schedules, issue refunds, or release funds.
- Provider/API failure produces bounded `UNAVAILABLE` evidence and does not alter payment or finance records.

## Files

- `lib/services/paymongo-settlement-trace.ts`
- `app/admin/payments/online/[id]/page.tsx`
- `app/admin/payments/online/page.tsx`
- `tests/unit/paymongo-settlement-trace.test.ts`

## Release gate

Exact-head CI, visual parity, merge, Hostinger release-marker verification, public health, and post-merge CI are complete. The remaining release gate is authenticated production UAT: an authorized tenant Payment Manager must open a real **Trace settlement** record and confirm tenant isolation, masked recipient IDs, the principal/fee split, and exact-or-estimated payout wording. Do not mark the feature fully `VERIFIED` until that evidence is recorded.
