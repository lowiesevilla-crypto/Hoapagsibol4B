import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const migrationPath = path.join(
  process.cwd(),
  "prisma/migrations/20260916071000_employee_compensation_column_reconcile/migration.sql",
);

const migration = readFileSync(migrationPath, "utf8");

test("employee compensation column reconciliation is additive and tenant preserving", () => {
  for (const column of [
    "tenantId",
    "effectiveFrom",
    "effectiveTo",
    "compensationBasis",
    "payFrequency",
    "attendancePolicy",
    "rate",
    "standardWorkDays",
    "standardHoursPerDay",
    "fixedAllowance",
    "fixedDeduction",
    "createdById",
    "createdAt",
    "updatedAt",
  ]) {
    assert.match(migration, new RegExp(`COLUMN_NAME = '${column}'`));
  }

  assert.match(migration, /JOIN `EmployeeProfile` employee ON employee\.`id` = compensation\.`employeeId`/);
  assert.match(migration, /employee\.`tenantId`/);
  assert.match(migration, /COALESCE\(compensation\.`rate`, employee\.`baseRate`\)/);

  assert.doesNotMatch(migration, /DROP\s+(TABLE|COLUMN)/i);
  assert.doesNotMatch(migration, /DELETE\s+FROM\s+`?EmployeeCompensation`?/i);
  assert.doesNotMatch(migration, /TRUNCATE\s+/i);
});
