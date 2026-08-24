import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
const migration = readFileSync(resolve(process.cwd(), "prisma/migrations/20260824150000_payroll_lifecycle_revisions/migration.sql"), "utf8");
const actions = readFileSync(resolve(process.cwd(), "lib/actions/payroll.ts"), "utf8");
const page = readFileSync(resolve(process.cwd(), "app/admin/payroll/page.tsx"), "utf8");

test("PAY-RUN-001: persisted lifecycle includes calculated and finance posting states", () => {
  const payrollStatus = schema.slice(schema.indexOf("enum PayrollStatus"), schema.indexOf("enum PayrollAccessRole"));
  for (const status of ["DRAFT", "CALCULATED", "FINALIZED", "POSTING", "POSTED", "POST_FAILED", "PAID"]) {
    assert.match(payrollStatus, new RegExp(`\\b${status}\\b`));
  }
  assert.match(migration, /MODIFY `status` ENUM\('DRAFT', 'CALCULATED', 'FINALIZED', 'POSTING', 'POSTED', 'POST_FAILED', 'PAID'\)/);
  assert.match(migration, /UPDATE `PayrollPeriod` AS `period`/);
});

test("PAY-RUN-003: revision schema preserves parent, reversal, actor, totals, deltas, and payslip snapshots", () => {
  assert.match(schema, /model PayrollCalculationRevision \{/);
  assert.match(schema, /parentRevisionId\s+String\?/);
  assert.match(schema, /reversedRevisionId\s+String\?\s+@unique/);
  assert.match(schema, /createdBy\s+User\s+@relation\("PayrollRevisionCreator"/);
  assert.match(schema, /deltaSnapshot\s+Json\?/);
  assert.match(schema, /model PayrollCalculationRevisionPayslip \{/);
  assert.match(schema, /grossPayDelta\s+Decimal/);
  assert.match(schema, /netPayDelta\s+Decimal/);
});

test("PAY-RUN-003: migration backfills revision-1 headers and employee snapshots before adding foreign keys", () => {
  const revisionInsert = migration.indexOf("INSERT INTO `PayrollCalculationRevision`");
  const payslipInsert = migration.indexOf("INSERT INTO `PayrollCalculationRevisionPayslip`");
  const foreignKeys = migration.indexOf("ALTER TABLE `PayrollCalculationRevision`", revisionInsert);
  assert.ok(revisionInsert >= 0 && payslipInsert > revisionInsert && foreignKeys > payslipInsert);
  assert.match(migration, /'LEGACY_BACKFILL'/);
  assert.match(migration, /`period`\.`createdById`/);
});

test("PAY-SEC-001: payroll revision reads and writes are authenticated-tenant scoped", () => {
  assert.match(actions, /where: \{ id: input\.payrollId, tenantId: input\.tenantId \}/);
  assert.match(actions, /where: \{ tenantId: input\.tenantId, payrollId: period\.id \}/);
  assert.match(actions, /where: \{ tenantId: user\.tenantId, payrollId: id, reversedRevisionId: sourceRevision\.id \}/);
  assert.match(page, /where: \{ tenantId \}/);
  assert.match(page, /revisions: \{ where: \{ tenantId \}/);
});

test("PAY-RUN-003: correction and reversal UI require bounded reasons and expose immutable history", () => {
  assert.match(page, /name="reason" minLength=\{10\} maxLength=\{500\} required/);
  assert.match(page, /Begin correction/);
  assert.match(page, /Record reversal evidence/);
  assert.match(page, /Immutable revision history/);
});
