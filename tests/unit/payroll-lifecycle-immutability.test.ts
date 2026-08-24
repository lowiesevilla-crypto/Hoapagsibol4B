import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const payrollActions = readFileSync(resolve(process.cwd(), "lib/actions/payroll.ts"), "utf8");

function functionSource(name: string, nextName?: string) {
  const start = payrollActions.indexOf(`export async function ${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const end = nextName ? payrollActions.indexOf(`export async function ${nextName}`, start) : payrollActions.length;
  return payrollActions.slice(start, end === -1 ? payrollActions.length : end);
}

test("PAY-RUN-003: finalized payroll is snapshotted before controlled return to draft", () => {
  const source = functionSource("returnPayrollToDraftAction", "markPayrollPaidAction");
  assert.match(source, /PayrollStatus\.PAID/);
  assert.match(source, /payrollArchive\.create/);
  assert.match(source, /\[PRE_REOPEN_SNAPSHOT\]/);
  assert.match(source, /SNAPSHOT_AND_RETURN_PAYROLL_TO_DRAFT/);
  assert.match(source, /Prisma\.TransactionIsolationLevel\.Serializable/);

  const archiveIndex = source.indexOf("payrollArchive.create");
  const reopenIndex = source.indexOf("status: PayrollStatus.DRAFT");
  assert.ok(archiveIndex >= 0 && reopenIndex > archiveIndex, "immutable snapshot must be created before the period returns to draft");
});

test("PAY-RUN-003: destructive payroll deletion is draft-only", () => {
  const source = functionSource("deletePayrollAction", "saveOvertimeRecordAction");
  assert.match(source, /period\.status !== PayrollStatus\.DRAFT/);
  assert.match(source, /Finalized and paid payroll periods cannot be deleted/);
  assert.match(source, /ARCHIVE_AND_DELETE_DRAFT_PAYROLL_PERIOD/);
  assert.doesNotMatch(source, /ARCHIVE_AND_DELETE_PAYROLL_PERIOD/);
});
