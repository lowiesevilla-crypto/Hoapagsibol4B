import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const migrationPath = path.join(
  process.cwd(),
  "prisma/migrations/20260915164500_employee_compensation_schema_repair/migration.sql",
);

const migration = readFileSync(migrationPath, "utf8");

test("employee compensation production repair is additive and tenant-preserving", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS `EmployeeCompensation`/);
  assert.match(migration, /FOREIGN KEY \(`employeeId`\) REFERENCES `EmployeeProfile`\(`id`\)/);
  assert.match(migration, /compensation\.`tenantId` = employee\.`tenantId`/);
  assert.match(migration, /compensation\.`employeeId` = employee\.`id`/);
  assert.match(migration, /WHERE NOT EXISTS/);

  assert.doesNotMatch(migration, /DROP\s+(TABLE|COLUMN)/i);
  assert.doesNotMatch(migration, /DELETE\s+FROM\s+`?EmployeeCompensation`?/i);
  assert.doesNotMatch(migration, /UPDATE\s+`?EmployeeCompensation`?/i);
});
