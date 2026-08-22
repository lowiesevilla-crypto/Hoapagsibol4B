import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schemaPath = new URL("../../prisma/schema.prisma", import.meta.url);
const validationPath = new URL("../../lib/validation.ts", import.meta.url);
const formPath = new URL("../../components/collection-form.tsx", import.meta.url);
const actionPath = new URL("../../lib/actions/collections.ts", import.meta.url);
const pagePath = new URL("../../app/admin/collections/page.tsx", import.meta.url);
const receiptPath = new URL("../../app/receipts/[kind]/[id]/page.tsx", import.meta.url);
const pdfPath = new URL("../../app/receipts/[kind]/[id]/pdf/route.ts", import.meta.url);
const exportPath = new URL("../../app/admin/reports/export/route.ts", import.meta.url);
const migrationPath = new URL("../../prisma/migrations/20260821234500_flexible_collection_payers/migration.sql", import.meta.url);

test("Prisma PayerType is the single flexible payer authority", async () => {
  const [schema, validation, migration] = await Promise.all([readFile(schemaPath, "utf8"), readFile(validationPath, "utf8"), readFile(migrationPath, "utf8")]);
  assert.match(schema, /enum PayerType \{[\s\S]*HOMEOWNER[\s\S]*CONTRACTOR[\s\S]*RENTER[\s\S]*OTHER[\s\S]*\}/);
  assert.match(schema, /payerName\s+String\?/);
  assert.doesNotMatch(schema, /payerCategory/);
  assert.match(validation, /payerType: z\.enum\(\["HOMEOWNER", "CONTRACTOR", "RENTER", "OTHER"\]\)/);
  assert.match(validation, /payerName: z\.string\(\)\.trim\(\)\.max\(150\)\.optional\(\)/);
  assert.match(migration, /ENUM\('HOMEOWNER','CONTRACTOR','RENTER','OTHER'\)/);
  assert.match(migration, /payerName/);
  assert.doesNotMatch(migration, /payerCategory/);
});

test("External payers are Other-income-only and bonds stay profile-bound", async () => {
  const [form, action] = await Promise.all([readFile(formPath, "utf8"), readFile(actionPath, "utf8")]);
  assert.match(form, /<option value="RENTER">Renter → Rental Management<\/option>/);
  assert.match(form, /<option value="OTHER">Others<\/option>/);
  assert.match(form, /name="payerName"/);
  assert.match(action, /PayerType\.RENTER/);
  assert.match(action, /PayerType\.OTHER/);
  assert.match(action, /requestedPayerType === PayerType\.RENTER/);
  assert.match(action, /redirect\(rentalPaymentsHref\)/);
  assert.match(action, /CONSTRUCTION_BOND[\s\S]*PayerType\.HOMEOWNER/);
  assert.match(action, /CONTRACTOR_BOND[\s\S]*PayerType\.CONTRACTOR/);
  assert.doesNotMatch(action, /payerCategory|\$executeRaw|legacyPayerType/);
});

test("External payer identity reaches history receipts audit and finance export", async () => {
  const [action, page, receipt, pdf, report] = await Promise.all([readFile(actionPath, "utf8"), readFile(pagePath, "utf8"), readFile(receiptPath, "utf8"), readFile(pdfPath, "utf8"), readFile(exportPath, "utf8")]);
  assert.match(action, /payerName: externalPayer \? payerName : null/);
  assert.match(action, /payerType: data\.payerType/);
  assert.match(page, /item\.payerName/);
  assert.match(receipt, /item\.payerName/);
  assert.match(pdf, /item\.payerName/);
  assert.match(report, /item\.payerName/);
  for (const source of [page, receipt, pdf, report]) assert.doesNotMatch(source, /payerCategory|collection-payer/);
});
