# Walk-In Document Request Enhancement

Date: 2026-07-27
Branch: current working branch

## Summary

This change enhances Admin Walk-In / Office document requests and introduces canonical 11-digit homeowner account numbers.

## UI Changes

- Admin walk-in request page no longer preloads all active homeowners.
- Homeowner lookup is server-backed, debounced, tenant-scoped, and limited.
- Search includes homeowner name, email, 11-digit account number, block, lot, and phone.
- Selected homeowner summary shows account number and property separately.
- Household/family member selector appears only after homeowner selection and only for definitions that allow household subjects.
- Dynamic request fields are rendered from the selected document definition.

## Server and Workflow Changes

- Walk-in action reloads homeowner, definition, and household member records server-side.
- Dynamic fields are validated with the shared document configured-field parser.
- Household member eligibility uses the existing validation service.
- The request subject snapshot uses the selected household member when applicable.
- The shared workflow executor remains responsible for payment, approval, generation, issuance, recoverable failure, and retry.
- Request-time account-number assignment prevents new official request snapshots from missing the canonical account number.

## Account-Number Changes

- Added `HomeownerProfile.accountNumber`.
- Added `HomeownerAccountNumberReservation` to prevent number reuse after deletion/archive/deactivation.
- Added a collision-safe generator with P2002 retry.
- Added idempotent backfill script.
- Updated SOA/profile/directory/report helper behavior through `homeownerAccountNumber`.
- Added `property.accountNumber` document placeholder.

## Migration and Backfill

Apply migration:

```bash
pnpm exec prisma migrate deploy
```

Backfill local or target environment after migration:

```bash
pnpm exec tsx scripts/backfill-homeowner-account-numbers.ts
```

Do not use `prisma migrate reset`, `prisma db push`, or `prisma db seed` for this rollout.

## Verification

```bash
pnpm exec prisma validate
pnpm exec prisma migrate status
pnpm exec prisma generate
pnpm exec tsx scripts/verify-homeowner-account-numbers.ts
pnpm exec tsx scripts/verify-walk-in-document-request-enhancement.ts
NODE_OPTIONS="--require ./scripts/register-server-only-shim.cjs" pnpm exec tsx scripts/verify-document-workflow-executor.ts
pnpm typecheck
pnpm build
```

## Known Limitations

- Browser UAT still requires a local authenticated admin session.
- The schema keeps `HomeownerProfile.accountNumber` nullable for additive rollout safety; application code assigns missing values before new official request snapshots are created.
- Existing historical generated documents keep their original snapshots and content.
