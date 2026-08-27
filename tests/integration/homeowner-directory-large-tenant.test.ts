import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Prisma, Role } from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import { homeownerSearchWhere } from "@/lib/homeowner-admin-search";

const runId = `homeowner-scale-it-${process.pid}`;
const tenantId = `${runId}-tenant`;
const fixtureCount = 5_001;
const pageSize = 100;

function userId(index: number) {
  return `${runId}-user-${String(index).padStart(4, "0")}`;
}

function homeownerId(index: number) {
  return `${runId}-homeowner-${String(index).padStart(4, "0")}`;
}

async function cleanFixtures() {
  await platformPrisma.homeownerProfile.deleteMany({ where: { tenantId } });
  await platformPrisma.user.deleteMany({ where: { tenantId } });
  await platformPrisma.tenant.deleteMany({ where: { id: tenantId } });
}

before(async () => {
  await cleanFixtures();
  await platformPrisma.tenant.create({
    data: { id: tenantId, name: "5,001 Homeowner Scale HOA", shortName: "SCALE", slug: `${runId}-hoa` },
  });

  const users: Prisma.UserCreateManyInput[] = Array.from({ length: fixtureCount }, (_, offset) => {
    const index = offset + 1;
    const ordinal = String(index).padStart(4, "0");
    return {
      id: userId(index),
      tenantId,
      name: `Scale Homeowner ${ordinal}`,
      email: `${runId}-${ordinal}@example.invalid`,
      passwordHash: "integration-test-only",
      role: Role.HOMEOWNER,
    };
  });
  const profiles: Prisma.HomeownerProfileCreateManyInput[] = Array.from({ length: fixtureCount }, (_, offset) => {
    const index = offset + 1;
    const ordinal = String(index).padStart(4, "0");
    return {
      id: homeownerId(index),
      tenantId,
      userId: userId(index),
      address: `${ordinal} Scale Test Street`,
      block: `B${ordinal}`,
      lot: `L${ordinal}`,
      phone: `09${String(index).padStart(9, "0")}`,
      accountNumber: `9${String(index).padStart(10, "0")}`,
      monthlyDuesAmount: new Prisma.Decimal("500.00"),
    };
  });

  for (let offset = 0; offset < fixtureCount; offset += 500) {
    await platformPrisma.user.createMany({ data: users.slice(offset, offset + 500) });
    await platformPrisma.homeownerProfile.createMany({ data: profiles.slice(offset, offset + 500) });
  }
});

after(async () => {
  await cleanFixtures();
  await platformPrisma.$disconnect();
});

test("5,001-homeowner directory keeps pagination bounded and retrieves records beyond the first 5,000", async () => {
  const startedAt = performance.now();
  const [total, lastPage] = await Promise.all([
    platformPrisma.homeownerProfile.count({ where: { tenantId } }),
    platformPrisma.homeownerProfile.findMany({
      where: { tenantId },
      orderBy: [{ user: { name: "asc" } }, { block: "asc" }, { lot: "asc" }],
      skip: 5_000,
      take: pageSize,
      select: { id: true, user: { select: { name: true } } },
    }),
  ]);

  assert.equal(total, fixtureCount);
  assert.equal(lastPage.length, 1);
  assert.equal(lastPage[0]?.id, homeownerId(5_001));
  assert.equal(lastPage[0]?.user.name, "Scale Homeowner 5001");
  assert.ok(performance.now() - startedAt < 15_000, "Bounded directory page query exceeded 15 seconds in CI.");
});

test("tenant-scoped directory search finds an exact homeowner beyond first-page and first-N boundaries", async () => {
  const matches = await platformPrisma.homeownerProfile.findMany({
    where: { AND: [{ tenantId }, homeownerSearchWhere("Scale Homeowner 5001")] },
    orderBy: [{ user: { name: "asc" } }],
    take: pageSize,
    select: { id: true, tenantId: true, user: { select: { email: true } } },
  });

  assert.deepEqual(matches, [{
    id: homeownerId(5_001),
    tenantId,
    user: { email: `${runId}-5001@example.invalid` },
  }]);
});
