import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  BillStatus,
  CollectionType,
  PaymentMethod,
  PayerType,
  Prisma,
  Role,
} from "@prisma/client";
import { platformPrisma } from "@/lib/db";

const runId = `finance-scale-it-${process.pid}`;
const tenantAId = `${runId}-tenant-a`;
const tenantBId = `${runId}-tenant-b`;
const actorAId = `${runId}-actor-a`;
const actorBId = `${runId}-actor-b`;
const fixtureCount = 2_001;
const pageSize = 25;

function userId(index: number) {
  return `${runId}-user-${String(index).padStart(4, "0")}`;
}

function homeownerId(index: number) {
  return `${runId}-homeowner-${String(index).padStart(4, "0")}`;
}

function ordinal(index: number) {
  return String(index).padStart(4, "0");
}

async function cleanFixtures() {
  await platformPrisma.collection.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await platformPrisma.payment.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await platformPrisma.bill.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await platformPrisma.homeownerProfile.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await platformPrisma.user.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  await platformPrisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
}

before(async () => {
  await cleanFixtures();
  await platformPrisma.tenant.createMany({
    data: [
      { id: tenantAId, name: "Finance Scale HOA A", shortName: "FS-A", slug: `${runId}-a` },
      { id: tenantBId, name: "Finance Scale HOA B", shortName: "FS-B", slug: `${runId}-b` },
    ],
  });
  await platformPrisma.user.createMany({
    data: [
      { id: actorAId, tenantId: tenantAId, name: "Finance Scale Actor A", email: `${runId}-actor-a@example.invalid`, passwordHash: "integration-test-only", role: Role.BILLING_MANAGER },
      { id: actorBId, tenantId: tenantBId, name: "Finance Scale Actor B", email: `${runId}-actor-b@example.invalid`, passwordHash: "integration-test-only", role: Role.BILLING_MANAGER },
    ],
  });

  const users: Prisma.UserCreateManyInput[] = Array.from({ length: fixtureCount }, (_, offset) => {
    const index = offset + 1;
    return {
      id: userId(index),
      tenantId: tenantAId,
      name: `Finance Scale Homeowner ${ordinal(index)}`,
      email: `${runId}-${ordinal(index)}@example.invalid`,
      passwordHash: "integration-test-only",
      role: Role.HOMEOWNER,
    };
  });
  const homeowners: Prisma.HomeownerProfileCreateManyInput[] = Array.from({ length: fixtureCount }, (_, offset) => {
    const index = offset + 1;
    return {
      id: homeownerId(index),
      tenantId: tenantAId,
      userId: userId(index),
      address: `${ordinal(index)} Finance Scale Street`,
      block: `B${ordinal(index)}`,
      lot: `L${ordinal(index)}`,
      phone: `09${String(index).padStart(9, "0")}`,
      accountNumber: `8${String(index).padStart(10, "0")}`,
      monthlyDuesAmount: new Prisma.Decimal("500.00"),
    };
  });

  for (let offset = 0; offset < fixtureCount; offset += 500) {
    await platformPrisma.user.createMany({ data: users.slice(offset, offset + 500) });
    await platformPrisma.homeownerProfile.createMany({ data: homeowners.slice(offset, offset + 500) });
  }

  const bills: Prisma.BillCreateManyInput[] = [];
  const payments: Prisma.PaymentCreateManyInput[] = [];
  const collections: Prisma.CollectionCreateManyInput[] = [];
  for (let index = 1; index <= fixtureCount; index += 1) {
    const createdAt = new Date(Date.UTC(2026, 0, 1, 0, 0, index));
    bills.push({
      id: `${runId}-bill-${ordinal(index)}`,
      tenantId: tenantAId,
      homeownerId: homeownerId(index),
      billingMonth: new Date("2026-01-01T00:00:00.000Z"),
      coverageYear: 2026,
      coverageMonth: 1,
      amount: new Prisma.Decimal("500.00"),
      totalAmount: new Prisma.Decimal("500.00"),
      balance: new Prisma.Decimal("500.00"),
      dueDate: new Date("2026-01-15T00:00:00.000Z"),
      status: BillStatus.UNPAID,
      createdAt,
    });
    payments.push({
      id: `${runId}-payment-${ordinal(index)}`,
      tenantId: tenantAId,
      homeownerId: homeownerId(index),
      amount: new Prisma.Decimal("100.00"),
      paymentDate: new Date("2026-01-20T00:00:00.000Z"),
      method: PaymentMethod.CASH,
      receiptNumber: `${runId}-OR-${ordinal(index)}`,
      createdAt,
    });
    collections.push({
      id: `${runId}-collection-${ordinal(index)}`,
      tenantId: tenantAId,
      type: CollectionType.MEMBERSHIP,
      payerType: PayerType.HOMEOWNER,
      homeownerId: homeownerId(index),
      amount: new Prisma.Decimal("50.00"),
      collectionDate: new Date("2026-01-21T00:00:00.000Z"),
      method: PaymentMethod.CASH,
      receiptNumber: `${runId}-COL-${ordinal(index)}`,
      createdById: actorAId,
      createdAt,
    });
  }

  for (let offset = 0; offset < fixtureCount; offset += 500) {
    await platformPrisma.bill.createMany({ data: bills.slice(offset, offset + 500) });
    await platformPrisma.payment.createMany({ data: payments.slice(offset, offset + 500) });
    await platformPrisma.collection.createMany({ data: collections.slice(offset, offset + 500) });
  }
});

after(async () => {
  await cleanFixtures();
  await platformPrisma.$disconnect();
});

test("2,001-row bill, payment, and collection histories keep last-page queries bounded", async () => {
  const skip = 2_000;
  const startedAt = performance.now();
  const [bills, payments, collections] = await Promise.all([
    platformPrisma.bill.findMany({ where: { tenantId: tenantAId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip, take: pageSize, select: { id: true } }),
    platformPrisma.payment.findMany({ where: { tenantId: tenantAId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip, take: pageSize, select: { id: true } }),
    platformPrisma.collection.findMany({ where: { tenantId: tenantAId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip, take: pageSize, select: { id: true } }),
  ]);

  assert.deepEqual(bills, [{ id: `${runId}-bill-2001` }]);
  assert.deepEqual(payments, [{ id: `${runId}-payment-2001` }]);
  assert.deepEqual(collections, [{ id: `${runId}-collection-2001` }]);
  assert.ok(performance.now() - startedAt < 15_000, "Bounded finance last-page queries exceeded 15 seconds in CI.");
});

test("high-volume finance counts and exact-reference searches remain tenant scoped", async () => {
  const [billCount, paymentCount, collectionCount, paymentMatch, collectionMatch] = await Promise.all([
    platformPrisma.bill.count({ where: { tenantId: tenantAId } }),
    platformPrisma.payment.count({ where: { tenantId: tenantAId } }),
    platformPrisma.collection.count({ where: { tenantId: tenantAId } }),
    platformPrisma.payment.findMany({ where: { tenantId: tenantBId, receiptNumber: `${runId}-OR-2001` }, take: pageSize, select: { id: true } }),
    platformPrisma.collection.findMany({ where: { tenantId: tenantBId, receiptNumber: `${runId}-COL-2001` }, take: pageSize, select: { id: true } }),
  ]);

  assert.deepEqual([billCount, paymentCount, collectionCount], [fixtureCount, fixtureCount, fixtureCount]);
  assert.deepEqual(paymentMatch, []);
  assert.deepEqual(collectionMatch, []);
});
