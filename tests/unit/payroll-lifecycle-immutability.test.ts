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

test("PAY-RUN-003: finalized payroll starts a tenant-scoped correction from immutable revision evidence", () => {
  const source = functionSource("returnPayrollToDraftAction", "markPayrollPaidAction");
  assert.match(source, /period\.status !== PayrollStatus\.FINALIZED/);
  assert.match(source, /payrollCalculationRevision\.findFirst/);
  assert.match(source, /tenantId: user\.tenantId/);
  assert.match(source, /payrollArchive\.create/);
  assert.match(source, /\[PRE_REOPEN_SNAPSHOT\]/);
  assert.match(source, /BEGIN_PAYROLL_CORRECTION/);
  assert.match(source, /pendingRevisionType: PayrollRevisionType\.CORRECTION/);
  assert.match(source, /Prisma\.TransactionIsolationLevel\.Serializable/);

  const archiveIndex = source.indexOf("payrollArchive.create");
  const correctionIndex = source.indexOf("status: PayrollStatus.CALCULATED");
  assert.ok(archiveIndex >= 0 && correctionIndex > archiveIndex, "compatibility snapshot must be created before correction work begins");
});

test("PAY-RUN-003: finalization creates immutable revision and per-employee snapshots before status transition", () => {
  const source = functionSource("finalizePayrollAction", "returnPayrollToDraftAction");
  assert.match(source, /createImmutablePayrollRevision/);
  assert.match(source, /tenantId: user\.tenantId/);
  assert.match(source, /status: PayrollStatus\.FINALIZED/);
  assert.match(source, /FINALIZE_PAYROLL_REVISION/);
  assert.match(source, /Prisma\.TransactionIsolationLevel\.Serializable/);
});

test("PAY-RUN-003: reversal records immutable negative delta evidence without changing payroll status", () => {
  const source = functionSource("recordPayrollReversalAction", "deletePayrollAction");
  assert.match(source, /revisionType: PayrollRevisionType\.REVERSAL/);
  assert.match(source, /reversedRevisionId: sourceRevision\.id/);
  assert.match(source, /tenantId: user\.tenantId/);
  assert.match(source, /RECORD_PAYROLL_REVERSAL/);
  assert.doesNotMatch(source, /payrollPeriod\.update/);
});

test("PAY-RUN-003: destructive payroll deletion is draft-only", () => {
  const source = functionSource("deletePayrollAction", "saveOvertimeRecordAction");
  assert.match(source, /period\.status !== PayrollStatus\.DRAFT/);
  assert.match(source, /Finalized and paid payroll periods cannot be deleted/);
  assert.match(source, /ARCHIVE_AND_DELETE_DRAFT_PAYROLL_PERIOD/);
  assert.doesNotMatch(source, /ARCHIVE_AND_DELETE_PAYROLL_PERIOD/);
});
