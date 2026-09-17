import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourcePath = new URL("../../lib/actions/collections.ts", import.meta.url);

async function actionSource(name: string) {
  const source = await readFile(sourcePath, "utf8");
  const start = source.indexOf(`export async function ${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const next = source.indexOf("\nexport async function ", start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

test("collection creation remains tenant scoped and transaction atomic", async () => {
  const source = await actionSource("recordCollectionAction");
  assert.match(source, /withTenantContext\(admin\.tenantId/);
  assert.match(source, /tenantId:\s*admin\.tenantId/);
  assert.match(source, /TransactionIsolationLevel\.Serializable/);
  assert.match(source, /collection_record_failed/);
  assert.match(source, /No changes were saved/);
});

test("bond forfeiture is tenant scoped, atomic, audited, and never leaks an unhandled domain error", async () => {
  const source = await actionSource("forfeitBondAction");
  assert.match(source, /withTenantContext\(admin\.tenantId/);
  assert.match(source, /where:\s*\{\s*id:\s*collectionId,\s*tenantId:\s*admin\.tenantId\s*\}/s);
  assert.match(source, /TransactionIsolationLevel\.Serializable/);
  assert.match(source, /action:\s*"BOND_FORFEITED"/);
  assert.match(source, /bond_forfeit_failed/);
  assert.match(source, /redirectCollectionError\(collectionError\)/);
});

test("collection deletion cannot cross tenants or erase bond history", async () => {
  const source = await actionSource("deleteCollectionAction");
  assert.match(source, /withTenantContext\(admin\.tenantId/);
  assert.match(source, /where:\s*\{\s*id,\s*tenantId:\s*admin\.tenantId\s*\}/s);
  assert.match(source, /collection\._count\.refunds\s*\|\|\s*Number\(collection\.amountForfeited\)\s*>\s*0/);
  assert.match(source, /financial history must be retained/);
  assert.match(source, /action:\s*"COLLECTION_DELETED"/);
  assert.match(source, /collection_delete_failed/);
  assert.match(source, /redirectCollectionError\(collectionError\)/);
});
