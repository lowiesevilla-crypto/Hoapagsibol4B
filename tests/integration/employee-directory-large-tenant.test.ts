import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { EmployeeStatus, Prisma, SalaryType } from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import { employeeDirectoryPageSize, employeeDirectoryWhere } from "@/lib/employee-directory";

const runId = `employee-scale-it-${process.pid}`;
const tenantAId = `${runId}-tenant-a`;
const tenantBId = `${runId}-tenant-b`;
const fixtureCount = 5_001;

function employeeId(index: number) { return `${runId}-employee-${String(index).padStart(4, "0")}`; }

async function cleanFixtures() {
  await platformPrisma.employeeProfile.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await platformPrisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
}

before(async () => {
  await cleanFixtures();
  await platformPrisma.tenant.createMany({ data: [
    { id: tenantAId, name: "Employee Scale HOA A", shortName: "ES-A", slug: `${runId}-a` },
    { id: tenantBId, name: "Employee Scale HOA B", shortName: "ES-B", slug: `${runId}-b` },
  ] });
  const employees: Prisma.EmployeeProfileCreateManyInput[] = Array.from({ length: fixtureCount }, (_, offset) => {
    const index = offset + 1;
    const value = String(index).padStart(4, "0");
    return {
      id: employeeId(index), tenantId: tenantAId, employeeNumber: `EMP-${value}`,
      name: `Scale Employee ${value}`, position: index === fixtureCount ? "Beyond First N Specialist" : "Scale Specialist",
      email: `${runId}-${value}@example.invalid`, phone: `09${String(index).padStart(9, "0")}`,
      address: `${value} Employee Scale Street`, hireDate: new Date("2026-01-01T00:00:00.000Z"),
      salaryType: SalaryType.MONTHLY, baseRate: new Prisma.Decimal("20000.00"), status: EmployeeStatus.ACTIVE,
    };
  });
  for (let offset = 0; offset < fixtureCount; offset += 500) await platformPrisma.employeeProfile.createMany({ data: employees.slice(offset, offset + 500) });
});

after(async () => { await cleanFixtures(); await platformPrisma.$disconnect(); });

test("5,001-employee directory keeps pages bounded beyond the first 5,000", async () => {
  const startedAt = performance.now();
  const rows = await platformPrisma.employeeProfile.findMany({
    where: employeeDirectoryWhere(tenantAId, ""), orderBy: [{ name: "asc" }, { employeeNumber: "asc" }],
    skip: 5_000, take: employeeDirectoryPageSize, select: { id: true, tenantId: true },
  });
  assert.deepEqual(rows, [{ id: employeeId(5_001), tenantId: tenantAId }]);
  assert.ok(performance.now() - startedAt < 15_000, "Bounded employee last-page query exceeded 15 seconds in CI.");
});

test("server-side employee search finds record 5,001 and denies a forged tenant scope", async () => {
  const [allowed, denied] = await Promise.all([
    platformPrisma.employeeProfile.findMany({ where: employeeDirectoryWhere(tenantAId, "Beyond First N Specialist"), take: employeeDirectoryPageSize, select: { id: true } }),
    platformPrisma.employeeProfile.findMany({ where: employeeDirectoryWhere(tenantBId, "Beyond First N Specialist"), take: employeeDirectoryPageSize, select: { id: true } }),
  ]);
  assert.deepEqual(allowed, [{ id: employeeId(5_001) }]);
  assert.deepEqual(denied, []);
});
