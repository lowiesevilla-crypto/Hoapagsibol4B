import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  CollectionType,
  PayerType,
  PaymentMethod,
  RefundStatus,
  Role,
  TenantModule,
} from "@prisma/client";
import { platformPrisma, prisma } from "@/lib/db";
import { recordBondRefund } from "@/lib/services/bond-refund";
import { runWithTenant } from "@/lib/tenant-context";

const runId = `homeowner-refund-it-${process.pid}`;
const tenantAId = `${runId}-tenant-a`;
const tenantBId = `${runId}-tenant-b`;
const adminAId = `${runId}-admin-a`;
const adminBId = `${runId}-admin-b`;
const homeownerAUserId = `${runId}-homeowner-user-a`;
const homeownerBUserId = `${runId}-homeowner-user-b`;
const homeownerAId = `${runId}-homeowner-a`;
const homeownerBId = `${runId}-homeowner-b`;
const collectionAId = `${runId}-collection-a`;
const collectionBId = `${runId}-collection-b`;
const tenantIds = [tenantAId, tenantBId];
const collectionReceiptNumber = "AR-CB-2026-0000001";

const adminA = {
  id: adminAId,
  tenantId: tenantAId,
};

async function inTenant<T>(tenantId: string, callback: () => T | Promise<T>) {
  return runWithTenant(tenantId, async () => await callback(), {
    role: Role.ADMIN,
    enabledModules: [TenantModule.BILLING],
  });
}

async function cleanFixtures() {
  await platformPrisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.bondRefund.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.collection.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.homeownerProfile.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.userRoleAssignment.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.tenantModuleEntitlement.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
}

before(async () => {
  await cleanFixtures();
  await platformPrisma.tenant.createMany({
    data: [
      { id: tenantAId, name: "Homeowner Refund Tenant A", shortName: "HR-A", slug: `${runId}-a` },
      { id: tenantBId, name: "Homeowner Refund Tenant B", shortName: "HR-B", slug: `${runId}-b` },
    ],
  });
  await platformPrisma.tenantModuleEntitlement.createMany({
    data: tenantIds.map((tenantId) => ({ tenantId, module: TenantModule.BILLING, enabled: true })),
  });
  await platformPrisma.user.createMany({
    data: [
      {
        id: adminAId,
        tenantId: tenantAId,
        name: "Refund Administrator A",
        email: `${runId}-admin-a@example.invalid`,
        passwordHash: "integration-test-only",
        role: Role.ADMIN,
      },
      {
        id: adminBId,
        tenantId: tenantBId,
        name: "Refund Administrator B",
        email: `${runId}-admin-b@example.invalid`,
        passwordHash: "integration-test-only",
        role: Role.ADMIN,
      },
      {
        id: homeownerAUserId,
        tenantId: tenantAId,
        name: "Overlapping Property Owner A",
        email: `${runId}-homeowner-a@example.invalid`,
        passwordHash: "integration-test-only",
        role: Role.HOMEOWNER,
      },
      {
        id: homeownerBUserId,
        tenantId: tenantBId,
        name: "Overlapping Property Owner B",
        email: `${runId}-homeowner-b@example.invalid`,
        passwordHash: "integration-test-only",
        role: Role.HOMEOWNER,
      },
    ],
  });
  await platformPrisma.homeownerProfile.createMany({
    data: [
      {
        id: homeownerAId,
        tenantId: tenantAId,
        userId: homeownerAUserId,
        address: "7 Shared Street",
        block: "7",
        lot: "9",
        phone: "09000000001",
        monthlyDuesAmount: 1000,
      },
      {
        id: homeownerBId,
        tenantId: tenantBId,
        userId: homeownerBUserId,
        address: "7 Shared Street",
        block: "7",
        lot: "9",
        phone: "09000000002",
        monthlyDuesAmount: 1000,
      },
    ],
  });
  await platformPrisma.collection.createMany({
    data: [
      {
        id: collectionAId,
        tenantId: tenantAId,
        type: CollectionType.CONSTRUCTION_BOND,
        payerType: PayerType.HOMEOWNER,
        homeownerId: homeownerAId,
        amount: 1000.55,
        collectionDate: new Date("2026-08-01T00:00:00.000Z"),
        method: PaymentMethod.BANK_TRANSFER,
        referenceNumber: `${runId}-collection-a`,
        receiptNumber: collectionReceiptNumber,
        refundable: true,
        refundStatus: RefundStatus.HELD,
        createdById: adminAId,
      },
      {
        id: collectionBId,
        tenantId: tenantBId,
        type: CollectionType.CONSTRUCTION_BOND,
        payerType: PayerType.HOMEOWNER,
        homeownerId: homeownerBId,
        amount: 800,
        collectionDate: new Date("2026-08-01T00:00:00.000Z"),
        method: PaymentMethod.BANK_TRANSFER,
        referenceNumber: `${runId}-collection-b`,
        receiptNumber: collectionReceiptNumber,
        refundable: true,
        refundStatus: RefundStatus.HELD,
        createdById: adminBId,
      },
    ],
  });
});

after(async () => {
  await cleanFixtures();
  await platformPrisma.$disconnect();
});

test("homeowner property relationships are resolved by tenant and profile identity", async () => {
  const visibleProfiles = await inTenant(tenantAId, () =>
    prisma.homeownerProfile.findMany({
      where: { block: "7", lot: "9" },
      select: { id: true, tenantId: true, userId: true },
    }),
  );
  assert.deepEqual(visibleProfiles, [
    { id: homeownerAId, tenantId: tenantAId, userId: homeownerAUserId },
  ]);

  const foreignProfile = await inTenant(tenantAId, () =>
    prisma.homeownerProfile.findFirst({ where: { id: homeownerBId } }),
  );
  assert.equal(foreignProfile, null);

  await assert.rejects(
    inTenant(tenantAId, () =>
      prisma.collection.create({
        data: {
          id: `${runId}-cross-tenant-collection`,
          type: CollectionType.CONSTRUCTION_BOND,
          payerType: PayerType.HOMEOWNER,
          homeownerId: homeownerBId,
          amount: 500,
          collectionDate: new Date("2026-08-02T00:00:00.000Z"),
          method: PaymentMethod.CASH,
          receiptNumber: "AR-CB-2026-0000002",
          refundable: true,
          refundStatus: RefundStatus.HELD,
          createdById: adminAId,
        },
      }),
    ),
    /Cross-tenant relation blocked|foreign key constraint|Homeowner not found/i,
  );
  assert.equal(
    await platformPrisma.collection.count({
      where: { id: `${runId}-cross-tenant-collection` },
    }),
    0,
  );
});

test("bond refunds preserve receipt, liability, audit, replay, and tenant-isolation invariants", async () => {
  const firstRefund = await inTenant(tenantAId, () =>
    recordBondRefund({
      collectionId: collectionAId,
      amount: 400.25,
      refundDate: new Date("2026-08-05T00:00:00.000Z"),
      method: PaymentMethod.BANK_TRANSFER,
      referenceNumber: `${runId}-refund-a-1`,
      remarks: "Partial clearance refund",
      actor: adminA,
    }),
  );
  assert.equal(firstRefund.amountRefunded, 400.25);
  assert.equal(firstRefund.remaining, 600.3);
  assert.equal(firstRefund.refundStatus, RefundStatus.PARTIALLY_REFUNDED);
  assert.match(firstRefund.refundReference, /^RF-BR-2026-[A-Z0-9]{8}$/);

  const afterPartial = await platformPrisma.collection.findUniqueOrThrow({
    where: { id: collectionAId },
    include: { refunds: true },
  });
  assert.equal(Number(afterPartial.amountRefunded), 400.25);
  assert.equal(Number(afterPartial.amountForfeited), 0);
  assert.equal(afterPartial.refundStatus, RefundStatus.PARTIALLY_REFUNDED);
  assert.equal(afterPartial.receiptNumber, collectionReceiptNumber);
  assert.equal(afterPartial.refunds.length, 1);

  await assert.rejects(
    inTenant(tenantAId, () =>
      recordBondRefund({
        collectionId: collectionAId,
        amount: 600.31,
        refundDate: new Date("2026-08-06T00:00:00.000Z"),
        method: PaymentMethod.CASH,
        actor: adminA,
      }),
    ),
    /cannot exceed the remaining bond balance/i,
  );

  await assert.rejects(
    inTenant(tenantAId, () =>
      recordBondRefund({
        collectionId: collectionBId,
        amount: 100,
        refundDate: new Date("2026-08-06T00:00:00.000Z"),
        method: PaymentMethod.CASH,
        actor: adminA,
      }),
    ),
    /Refundable bond not found/i,
  );

  const tenantBAfterAttack = await platformPrisma.collection.findUniqueOrThrow({
    where: { id: collectionBId },
    include: { refunds: true },
  });
  assert.equal(Number(tenantBAfterAttack.amountRefunded), 0);
  assert.equal(tenantBAfterAttack.refundStatus, RefundStatus.HELD);
  assert.equal(tenantBAfterAttack.refunds.length, 0);
  assert.equal(
    await platformPrisma.auditLog.count({
      where: { tenantId: tenantBId, action: "BOND_REFUND_PROCESSED" },
    }),
    0,
  );

  const finalRefund = await inTenant(tenantAId, () =>
    recordBondRefund({
      collectionId: collectionAId,
      amount: 600.3,
      refundDate: new Date("2026-08-07T00:00:00.000Z"),
      method: PaymentMethod.CHECK,
      referenceNumber: `${runId}-refund-a-2`,
      remarks: "Final clearance refund",
      actor: adminA,
    }),
  );
  assert.equal(finalRefund.amountRefunded, 1000.55);
  assert.equal(finalRefund.remaining, 0);
  assert.equal(finalRefund.refundStatus, RefundStatus.REFUNDED);
  assert.notEqual(finalRefund.refundReference, firstRefund.refundReference);

  await assert.rejects(
    inTenant(tenantAId, () =>
      recordBondRefund({
        collectionId: collectionAId,
        amount: 1,
        refundDate: new Date("2026-08-08T00:00:00.000Z"),
        method: PaymentMethod.CASH,
        actor: adminA,
      }),
    ),
    /already closed/i,
  );

  const [closedCollection, refunds, audits] = await Promise.all([
    platformPrisma.collection.findUniqueOrThrow({ where: { id: collectionAId } }),
    platformPrisma.bondRefund.findMany({
      where: { tenantId: tenantAId, collectionId: collectionAId },
      orderBy: { refundDate: "asc" },
    }),
    platformPrisma.auditLog.findMany({
      where: {
        tenantId: tenantAId,
        action: "BOND_REFUND_PROCESSED",
        entityType: "BondRefund",
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  assert.equal(Number(closedCollection.amount), 1000.55);
  assert.equal(Number(closedCollection.amountRefunded), 1000.55);
  assert.equal(Number(closedCollection.amountForfeited), 0);
  assert.equal(closedCollection.refundStatus, RefundStatus.REFUNDED);
  assert.equal(closedCollection.receiptNumber, collectionReceiptNumber);
  assert.deepEqual(refunds.map((refund) => Number(refund.amount)), [400.25, 600.3]);
  assert.equal(refunds.reduce((sum, refund) => sum + Number(refund.amount), 0), 1000.55);
  assert.equal(audits.length, 2);

  const firstMetadata = audits[0]?.metadata as Record<string, unknown>;
  const finalMetadata = audits[1]?.metadata as Record<string, unknown>;
  assert.equal(firstMetadata.collectionReceiptNumber, collectionReceiptNumber);
  assert.equal(firstMetadata.refundReference, firstRefund.refundReference);
  assert.equal(firstMetadata.remaining, 600.3);
  assert.equal(firstMetadata.refundStatus, RefundStatus.PARTIALLY_REFUNDED);
  assert.equal(finalMetadata.collectionReceiptNumber, collectionReceiptNumber);
  assert.equal(finalMetadata.refundReference, finalRefund.refundReference);
  assert.equal(finalMetadata.amountRefunded, 1000.55);
  assert.equal(finalMetadata.remaining, 0);
  assert.equal(finalMetadata.refundStatus, RefundStatus.REFUNDED);

  assert.equal(
    await platformPrisma.bondRefund.count({ where: { tenantId: tenantAId } }),
    2,
    "Rejected over-refund and replay attempts must not create refund rows.",
  );
  assert.equal(
    await platformPrisma.auditLog.count({
      where: { tenantId: tenantAId, action: "BOND_REFUND_PROCESSED" },
    }),
    2,
    "Rejected over-refund and replay attempts must not create success audits.",
  );
});
