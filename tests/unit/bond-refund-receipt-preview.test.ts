import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("bond refund preview action preserves the tenant-scoped financial service and redirects only after commit", () => {
  const action = readFileSync("lib/actions/bond-refund.ts", "utf8");
  assert.match(action, /requirePermission\(Permission\.COLLECTIONS_REFUND\)/);
  assert.match(action, /withTenantContext\(admin\.tenantId/);
  assert.match(action, /recordBondRefund\(/);
  assert.match(action, /refundResult = await withTenantContext/);
  assert.match(action, /safeRevalidateBondRefundPages/);
  assert.match(action, /try \{\s*revalidatePath\(path\);\s*\} catch/s);
  assert.match(action, /redirect\(`\/admin\/collections\/refunds\/\$\{refundResult\.id\}\?success=refunded`\)/);
  assert.doesNotMatch(action, /prisma\.(bondRefund|collection)\.(create|update|delete)/, "The preview action must delegate all financial mutation to the existing audited refund service.");
});

test("bond refund receipt preview is tenant scoped, read only, printable, and recoverable", () => {
  const page = readFileSync("app/admin/collections/refunds/[id]/page.tsx", "utf8");
  const errorBoundary = readFileSync("app/admin/collections/refunds/[id]/error.tsx", "utf8");
  assert.match(page, /where: \{ id, tenantId: admin\.tenantId \}/);
  assert.match(page, /Official Bond Refund Receipt/);
  assert.match(page, /bondRefundReference\(refund\.id, refund\.refundDate\)/);
  assert.match(page, /PrintButton label="Print Refund Receipt"/);
  assert.doesNotMatch(page, /<form|recordBondRefund|create\(|update\(|delete\(/, "Receipt rendering must not resubmit or mutate the financial transaction.");
  assert.match(errorBoundary, /ReceiptPreviewError/);
  assert.match(errorBoundary, /historyHref="\/admin\/collections"/);
});

test("refund form uses the previewing action", () => {
  const form = readFileSync("components/bond-refund-form.tsx", "utf8");
  assert.match(form, /recordBondRefundAndPreviewAction/);
  assert.match(form, /action=\{recordBondRefundAndPreviewAction\}/);
});
