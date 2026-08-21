import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const formPath = new URL("../../components/collection-form.tsx", import.meta.url);
const actionPath = new URL("../../lib/actions/collections.ts", import.meta.url);
const helperPath = new URL("../../lib/collection-payer.ts", import.meta.url);
const pagePath = new URL("../../app/admin/collections/page.tsx", import.meta.url);
const receiptPath = new URL("../../app/receipts/[kind]/[id]/page.tsx", import.meta.url);
const pdfPath = new URL("../../app/receipts/[kind]/[id]/pdf/route.ts", import.meta.url);
const exportPath = new URL("../../app/admin/reports/export/route.ts", import.meta.url);
const migrationPath = new URL("../../prisma/migrations/20260821234500_flexible_collection_payers/migration.sql", import.meta.url);

test("Other income accepts renter and other free-text payers while bonds remain profile-bound", async () => {
  const [form, action] = await Promise.all([readFile(formPath, "utf8"), readFile(actionPath, "utf8")]);

  assert.match(form, /<option value="RENTER">Renter<\/option>/);
  assert.match(form, /<option value="OTHER">Others<\/option>/);
  assert.match(form, /name="payerName"/);
  assert.match(form, /type === "OTHER"/);
  assert.match(action, /externalPayer && data\.type !== CollectionType\.OTHER/);
  assert.match(action, /CONSTRUCTION_BOND[\s\S]*requestedPayerType !== "HOMEOWNER"/);
  assert.match(action, /CONTRACTOR_BOND[\s\S]*requestedPayerType !== "CONTRACTOR"/);
  assert.match(action, /if \(externalPayer && !payerName\)/);
});

test("Flexible payer metadata is tenant-scoped and preserved in receipt, search, export, and audit surfaces", async () => {
  const [helper, action, page, receipt, pdf, report] = await Promise.all([
    readFile(helperPath, "utf8"), readFile(actionPath, "utf8"), readFile(pagePath, "utf8"),
    readFile(receiptPath, "utf8"), readFile(pdfPath, "utf8"), readFile(exportPath, "utf8"),
  ]);

  assert.match(helper, /WHERE tenantId = \$\{tenantId\}/);
  assert.match(action, /WHERE id = \$\{collection\.id\} AND tenantId = \$\{admin\.tenantId\}/);
  assert.match(action, /payerType: requestedPayerType, payerName:/);
  assert.match(page, /getCollectionPayerMetadata\(user\.tenantId/);
  assert.match(page, /payer\.name[\s\S]*payer\.category/);
  assert.match(receipt, /getSingleCollectionPayerMetadata\(user\.tenantId, item\.id\)/);
  assert.match(pdf, /getSingleCollectionPayerMetadata\(user\.tenantId, item\.id\)/);
  assert.match(report, /collectionPayerName/);
});

test("Migration does not break legacy collection writers", async () => {
  const migration = await readFile(migrationPath, "utf8");

  assert.match(migration, /ADD COLUMN `payerCategory` VARCHAR\(20\) NULL/);
  assert.match(migration, /ADD COLUMN `payerName` VARCHAR\(191\) NULL/);
  assert.match(migration, /UPDATE `Collection`/);
  assert.doesNotMatch(migration, /payerCategory` VARCHAR\(20\) NOT NULL/);
});
