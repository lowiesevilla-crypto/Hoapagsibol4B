import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const service = readFileSync(resolve(process.cwd(), "lib/services/payroll-report.ts"), "utf8");
const page = readFileSync(resolve(process.cwd(), "app/admin/payroll/reports/page.tsx"), "utf8");
const exportRoute = readFileSync(resolve(process.cwd(), "app/admin/payroll/reports/export/route.ts"), "utf8");

test("PAY-RPT-001/PAY-SEC-001: payroll report requires tenant scope at period and payslip query boundaries", () => {
  assert.match(service, /if \(!input\.tenantId\) throw new Error/);
  assert.match(service, /tenantId: input\.tenantId,[\s\S]*payDate:/);
  assert.match(service, /payslips:\s*\{[\s\S]*where:\s*\{ tenantId: input\.tenantId \}/);
});

test("PAY-RPT-001: HTML and CSV outputs use the same report service and authenticated tenant", () => {
  for (const source of [page, exportRoute]) {
    assert.match(source, /requirePayrollAccess\(\)/);
    assert.match(source, /getPayrollReport\(\{ tenantId: user\.tenantId, from, to, status \}\)/);
  }
});
