# Document Workflow Test Plan v1.0

## Objective

Verify configurable document workflow execution without changing the accepted template editor, visual designer, placeholder system, preview rendering, or official renderer contracts.

## Automated Coverage

Primary harness:

`NODE_OPTIONS='--conditions=react-server' pnpm tsx scripts/verify-document-workflow-executor.ts`

Required scenarios:

1. Free + Instant generates an issued document immediately.
2. Free + Approval enters `PENDING_APPROVAL`, then approval generates official issue.
3. Paid + Instant creates one document-fee PaymentRequest and waits for approval.
4. Paid + Approval creates one payment request, then waits for approval after payment confirmation.
5. Payment request approval creates an official Collection receipt.
6. Duplicate executor runs do not create duplicate payment requests or document numbers.
7. Unauthorized homeowner approval is rejected.
8. Cross-tenant approval is rejected.
9. Validated household-member requests can issue.
10. Unvalidated or inactive household members are rejected.
11. Preview remains side-effect free.
12. QR verification returns valid, expired, superseded, revoked, and not-found outcomes correctly.
13. A4 pass output contains only HOA office and homeowner copies.
14. Finance collection receipt linkage exists for paid document fees.

Regression harnesses:

- `NODE_OPTIONS='--conditions=react-server' pnpm tsx scripts/verify-certificate-of-residency.ts`
- `NODE_OPTIONS='--conditions=react-server' pnpm tsx scripts/verify-document-generation-engine.ts`
- `NODE_OPTIONS='--conditions=react-server' pnpm tsx scripts/verify-professional-template-editor.ts`
- `NODE_OPTIONS='--conditions=react-server' pnpm tsx scripts/verify-visual-document-designer.ts`
- `NODE_OPTIONS='--conditions=react-server' pnpm tsx scripts/verify-designer-preview-print-assets.ts`

## Manual UAT

Use authorized local tenant accounts only.

1. Configure a Free + Instant document with a published template.
2. Submit as homeowner and confirm the request becomes issued without payment or approval.
3. Confirm preview still uses document number `PREVIEW` and creates no issued document.
4. Configure Free + Approval and confirm homeowner submission enters approval queue.
5. Approve as the configured approver and confirm official issue is generated once.
6. Configure Paid + Instant with a fee greater than zero.
7. Submit and confirm payment request is created and official download remains locked.
8. Approve the payment request and confirm collection receipt and official issue.
9. Configure Paid + Approval and confirm payment must be approved before approval can issue.
10. Submit a validated household-member request and confirm it issues.
11. Submit an unvalidated household-member request and confirm it is blocked.
12. Confirm Test HOA cannot access Pagsibol requests or definitions.
13. Confirm pass print/PDF output has exactly HOA office and homeowner copies.
14. Confirm verification page shows not found for invalid public codes.

## Quality Gates

- `pnpm exec prisma format`
- `pnpm exec prisma validate`
- `pnpm exec prisma generate`
- `pnpm exec prisma migrate status`
- `pnpm typecheck`
- document workflow executor harness
- certificate of residency harness
- document generation engine harness
- template editor regression harnesses
- `Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue`
- `pnpm build`

Do not claim PASS for any skipped or blocked command.
