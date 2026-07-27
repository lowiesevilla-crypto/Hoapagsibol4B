# Walk-In Request and Account Number UAT

Date: 2026-07-27
Scope: Admin Walk-In / Office document request enhancement and canonical 11-digit homeowner account number.

## Findings

- The previous walk-in page loaded every active homeowner during server render.
- The previous walk-in request action always used the homeowner as the official subject.
- The previous account-number helper produced a property-derived value such as `HOA-B10-L1`.
- Existing document workflow execution, generation failure recovery, retry, and idempotency services were already present and were reused.

## Implemented Local Checks

- Homeowner search is now server-backed and tenant-scoped.
- Search supports name, email, account number, block, lot, and phone.
- Household/family member choices are loaded after homeowner selection and include only active validated records.
- The walk-in server action reloads homeowner, definition, and household member records under the authenticated tenant.
- The action validates dynamic document fields with the shared configured-field parser.
- The action snapshots the selected homeowner or household member before invoking the shared workflow executor.
- Account numbers are generated through a reservation-backed service before new document snapshots are created.

## Manual UAT Checklist

1. Sign in as tenant admin.
2. Open `/admin/documents/new`.
3. Search by homeowner name, account number, block, lot, phone, and email.
4. Select an active homeowner.
5. Confirm the selected homeowner panel shows account number and property separately.
6. Select a walk-in-enabled document definition.
7. Select Homeowner as subject and submit required dynamic fields.
8. Confirm the request enters the existing workflow executor.
9. Repeat with Household / family member where the definition allows household subjects.
10. Confirm only active validated members are selectable.
11. Confirm generated subject snapshot uses the selected member, not the homeowner, when member subject is selected.
12. Confirm Free + Instant requests issue through the generation engine and expose document actions only after issuance.
13. Confirm generation failure returns a recoverable retry state through the existing executor.

## Verification Commands

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

## Status

Local schema validation, Prisma generation, migration apply, account-number backfill, and typecheck passed during implementation. Browser UAT remains dependent on a local signed-in admin session.
