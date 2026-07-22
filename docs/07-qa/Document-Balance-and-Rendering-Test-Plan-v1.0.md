# Document Balance and Rendering Test Plan v1.0

## Automated Tests

Run:

- `pnpm exec prisma format`
- `pnpm exec prisma validate`
- `pnpm exec prisma generate`
- `pnpm exec prisma migrate status`
- `pnpm typecheck`
- `pnpm build`
- `NODE_OPTIONS='--conditions=react-server' pnpm tsx scripts/verify-document-balance-rendering-hotfix.ts`
- `NODE_OPTIONS='--conditions=react-server' pnpm tsx scripts/verify-document-workflow-executor.ts`
- `NODE_OPTIONS='--conditions=react-server' pnpm tsx scripts/verify-certificate-of-residency.ts`
- `NODE_OPTIONS='--conditions=react-server' pnpm tsx scripts/verify-document-generation-engine.ts`
- `NODE_OPTIONS='--conditions=react-server' pnpm tsx scripts/verify-professional-template-editor.ts`
- `NODE_OPTIONS='--conditions=react-server' pnpm tsx scripts/verify-visual-document-designer.ts`
- `NODE_OPTIONS='--conditions=react-server' pnpm tsx scripts/verify-designer-preview-print-assets.ts`

## Coverage

The focused hotfix harness verifies:

- three setup-visible balance policies;
- business labels for balance policies;
- legacy `BLOCK_REQUEST` is not offered for setup;
- block-with-balance download behavior;
- allow-with-balance download behavior;
- admin-override before and after override;
- document-specific unpaid fee still blocks access;
- admin request page shows effective rules;
- misleading no-policy message is corrected;
- override action is gated to issued requests and authorized roles;
- definition page shows persisted effective configuration;
- workflow preset displays resolved effective rules;
- official document page renders generated HTML in a viewer;
- official document page no longer shows raw HTML source block;
- preview banner and watermark are present;
- preview wording avoids official-number language;
- preview QR remains non-verifiable and has label spacing;
- PDF and print fallbacks avoid raw HTML source.

## Manual UAT

### A. Free + Instant with Allow Download With Balance

1. Configure a Free + Instant definition.
2. Set balance policy to Allow Download With Balance.
3. Use a homeowner with an unrelated positive HOA balance.
4. Submit request.
5. Confirm request auto-issues.
6. Confirm download/print are enabled.
7. Confirm no override is required.

### B. Free + Instant with Allow Admin Override

1. Configure Free + Instant.
2. Set balance policy to Allow Admin Override.
3. Use a homeowner with an unrelated positive HOA balance.
4. Submit request.
5. Confirm request auto-issues but download/print are locked.
6. Log in as authorized tenant admin.
7. Confirm Allow Release Despite Balance is visible.
8. Submit required reason.
9. Confirm download/print become enabled for that request only.

### C. Free + Instant with Block When Balance Exists

1. Configure Free + Instant.
2. Set balance policy to Block When Balance Exists.
3. Use a homeowner with an unrelated positive HOA balance.
4. Submit request.
5. Confirm request auto-issues but download/print are locked.
6. Confirm no override action appears.

### D. Issued Document Rendering

1. Open an issued document as homeowner.
2. Confirm formatted certificate layout is visible.
3. Confirm raw HTML source is not visible.
4. Download PDF/print.
5. Confirm official document number and valid QR are present.

### E. Admin Preview

1. Open admin preview.
2. Confirm preview banner is visible.
3. Confirm document number is `PREVIEW`.
4. Confirm QR is marked non-valid.
5. Confirm wording is preview/non-official.
6. Confirm no issued record, number counter, receipt, payment, or workflow status changes occur.
