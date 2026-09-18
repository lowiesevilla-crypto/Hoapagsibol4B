import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

async function source(path: string) {
  return readFile(path, "utf8");
}

function section(text: string, start: string, end: string) {
  const startIndex = text.indexOf(start);
  const endIndex = text.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, `Missing section start: ${start}`);
  assert.ok(endIndex > startIndex, `Missing section end: ${end}`);
  return text.slice(startIndex, endIndex);
}

test("collection creation treats cache invalidation as post-commit best effort", async () => {
  const actions = await source("lib/actions/collections.ts");
  const record = section(actions, "export async function recordCollectionAction", "export async function recordBondRefundAction");

  assert.match(record, /withTenantContext\(admin\.tenantId/);
  assert.match(record, /TransactionIsolationLevel\.Serializable/);
  assert.match(record, /safeRevalidateCollectionPages\(\{ action: "record"/);
  assert.match(record, /return \{ destination: `\/receipts\/collection\/\$\{createdCollectionId\}` \}/);
  assert.match(actions, /export async function recordCollectionReceiptStateAction/);
  assert.match(actions, /collection_post_commit_revalidation_failed/);
  assert.match(actions, /for \(const path of collectionRevalidationPaths\)/);
  assert.match(actions, /try \{\s*revalidatePath\(path\);\s*\} catch/);
});

test("bond forfeiture is tenant-scoped, serializable, audited, and reports controlled failures", async () => {
  const actions = await source("lib/actions/collections.ts");
  const forfeit = section(actions, "export async function forfeitBondAction", "export async function deleteCollectionAction");

  assert.match(forfeit, /withTenantContext\(admin\.tenantId/);
  assert.match(forfeit, /where: \{ id: collectionId, tenantId: admin\.tenantId \}/);
  assert.match(forfeit, /updateMany\(\{\s*where: \{ id: collection\.id, tenantId: admin\.tenantId \}/);
  assert.match(forfeit, /TransactionIsolationLevel\.Serializable/);
  assert.match(forfeit, /action: "BOND_FORFEITED"/);
  assert.match(forfeit, /tenantId: admin\.tenantId/);
  assert.match(forfeit, /bond_forfeit_failed/);
  assert.match(forfeit, /redirectForfeitError\(forfeitError\)/);
  assert.doesNotMatch(forfeit, /throw new Error\(/);
});

test("deletion preserves refunded or forfeited bond history without crashing the page", async () => {
  const actions = await source("lib/actions/collections.ts");
  const deletion = section(actions, "export async function deleteCollectionAction", "function safeRevalidateCollectionPages");
  const page = await source("app/admin/collections/page.tsx");

  assert.match(deletion, /withTenantContext\(admin\.tenantId/);
  assert.match(deletion, /where: \{ id, tenantId: admin\.tenantId \}/);
  assert.match(deletion, /collection\._count\.refunds \|\| Number\(collection\.amountForfeited\) > 0/);
  assert.match(deletion, /must be retained for financial and audit integrity/);
  assert.match(deletion, /deleteMany\(\{ where: \{ id, tenantId: admin\.tenantId \} \}\)/);
  assert.match(deletion, /action: "COLLECTION_DELETED"/);
  assert.match(deletion, /collection_delete_failed/);
  assert.match(deletion, /redirectDeleteError\(deleteError\)/);
  assert.doesNotMatch(deletion, /throw new Error\(/);

  assert.match(page, /forfeitError\?: string \| string\[\]/);
  assert.match(page, /deleteError\?: string \| string\[\]/);
  assert.match(page, />Bond not forfeited</);
  assert.match(page, />Collection not deleted</);
  assert.match(page, /financial and audit history/);
  assert.match(page, /hasFinancialHistory = item\.refunds\.length > 0 \|\| Number\(item\.amountForfeited\) > 0/);
  assert.match(page, />Retained for audit<\/p>/);
});

test("unexpected mutation errors remain tenant-safe and support-reference traceable", async () => {
  const actions = await source("lib/actions/collections.ts");

  assert.match(actions, /`BF-\$\{randomUUID\(\)\.split\("-"\)\[0\]\.toUpperCase\(\)\}`/);
  assert.match(actions, /`CD-\$\{randomUUID\(\)\.split\("-"\)\[0\]\.toUpperCase\(\)\}`/);
  assert.match(actions, /\[HOAHub\] bond_forfeit_failed/);
  assert.match(actions, /\[HOAHub\] collection_delete_failed/);
  assert.match(actions, /No changes were saved/);
});
