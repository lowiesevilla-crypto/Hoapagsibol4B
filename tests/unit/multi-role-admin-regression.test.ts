import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(path, "utf8");
}

test("multi-role admin guards authorize effective assignments instead of only legacy role", async () => {
  const [documents, payroll, complaints] = await Promise.all([
    source("lib/document-template-admin.ts"),
    source("lib/payroll-access.ts"),
    source("lib/services/complaints.ts"),
  ]);

  assert.match(documents, /user\.roles\.some\(canManageDocumentTemplates\)/);
  assert.match(payroll, /user\.roles\.some\(/);
  assert.match(payroll, /user\.roles\.includes\(Role\.PAYROLL_MANAGER\)/);
  assert.match(payroll, /user\.roles\.includes\(Role\.ADMIN\)/);
  assert.match(complaints, /user\.roles\.find\(\(role\) => complaintAdminRoles\.has\(role\)\)/);
  assert.match(complaints, /return \{ \.\.\.user, role: complaintRole \}/);
});
