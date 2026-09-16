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
import { platformPrisma } from "@/lib/db";
import { recordBondRefund } from "@/lib/services/bond-refund";
import { runWithTenant } from "@/lib/tenant-context";

const runId = `bond-refund-legacy-it-${process.pid}`;
const tenantId = `${runId}-tenant`;
const adminId = `${runId}-admin`;
const homeownerUserId = `${runId}-homeowner-user`;
const homeownerId = `${runId}-homeowner`;
const contractorId = `${runId}-contractor`;
const constructionBondId = `${runId}-construction-bond`;
const contractorBondId = `${runId}-contractor-bond`;
const nonBondId = `${runId}-non-bond`;

const actor = { id: adminId, tenantId };

async function inTenant<T>(callback: () => T | Promise<T>) {
  return runWithTenant(tenantId, async () => await callback(), {
    role: Role.ADMIN,
    enabledModules: [TenantModule.BILLING],
  });
}

async function cleanFixtures() {
  await platformPrisma.auditLog.deleteMany({ where: { tenantId } });
  await platformPrisma.bondRefund.deleteMany({ where: { tenantId } });
  await platformPrisma.collection.deleteMany({ where: { tenantId } });
  await platformPrisma.contractorProfile.deleteMany({ where: { tenantId } });
  await platformPrisma.homeownerProfile.deleteMany({ where: { tenantId } });
  await platformPrisma.userRoleAssignment.deleteMany({ where: { tenantId } });
  await platformPrisma.tenantModuleEntitlement.deleteMany({ where: { tenantId } });
  await platformPrisma.user.deleteMany({ where: { tenantId } });
  await platformPrisma.tenant.deleteMany({ where: { id: tenantId } });
}

before(async () => {
  await cleanFixtures();
  await platformPrisma.tenant.create({
    data: { id: tenantId, name: "Legacy Bond Refund Tenant", shortName: "LBR", slug: runId },
  });
  await platformPrisma.tenantModuleEntitlement.create({
    data: { tenantId, module: TenantModule.BILLING, enabled: true },
  });
  await platformPrisma.user.createMany({
    data: [
      {
        id: adminId,
        tenantId,
        name: "Legacy Bond Administrator",
        email: `${runId}-admin@example.invalid`,
        passwordHash: "integration-test-only",
        role: Role.ADMIN,
      },
      {
        id: homeownerUserId,
        tenantId,
        name: "Legacy Bond Homeowner",
        email: `${runId}-homeowner@example.invalid`,
        passwordHash: "integration-test-only",
        role: Role.HOMEOWNER,
      },
    ],
  });
  await platformPrisma.homeownerProfile.create({
    data: {
      id: homeownerId,
      tenantId,
      userId: homeownerUserId,
      address: "1 Legacy Street",
      block: "1",
      lot: "1",
      phone: "09000000011",
      monthlyDuesAmount: 1000,
    },
  });
  await platformPrisma.contractorProfile.create({
    data: {
      id: contractorId,
      tenantId,
      companyName: "Legacy Builders Inc.",
      contactPerson: "Legacy Contractor",
      phone: "09000000012",
      address: "2 Legacy Street",
    },
  });
  await platformPrisma.collection.createMany({
    data: [
      {
        id: constructionBondId,
        tenantId,
        type: CollectionType.CONSTRUCTION_BOND,
        payerType: PayerType.HOMEOWNER,
        homeownerId,
        amount: 1500,
        collectionDate: new Date("2026-07-01T00:00:00.000Z"),
        method: PaymentMethod.CASH,
        receiptNumber: "AR-CB-2026-0099901",
        refundable: false,
        refundStatus: RefundStatus.NOT_APPLICABLE,
        createdById: adminId,
      },
      {
        id: contractorBondId,
        tenantId,
        type: CollectionType.CONTRACTOR_BOND,
        payerType: PayerType.CONTRACTOR,
        contractorId,
        amount: 2000,
        collectionDate: new Date("2026-07-02T00:00:00.000Z"),
        method: PaymentMethod.BANK_TRANSFER,
        receiptNumber: "AR-KB-2026-0099902",
        refundable: false,
        refundStatus: RefundStatus.NOT_APPLICABLE,
        createdById: adminId,
      },
      {
        id: nonBondId,
        tenantId,
        type: CollectionType.OTHER,
        description: "Legacy non-bond income",
        payerType: PayerType.OTHER,
        payerName: "Legacy External Payer",
        amount: 500,
        collectionDate: new Date("2026-07-03T00:00:00.000Z"),
        method: PaymentMethod.CASH,
        receiptNumber: "AR-OT-2026-0099903",
        refundable: true,
        refundStatus: RefundStatus.HELD,
        createdById: adminId,
      },
    ],
  });
});

after(async () => {
  await cleanFixtures();
  await platformPrisma.$disconnect();
});

test("legacy construction and contractor bonds refund safely by authoritative collection type", async () => {
  const constructionRefund = await inTenant(() =>
    recordBondRefund({
      collectionId: constructionBondId,
      amount: 500,
      refundDate: new Date("2026-09-16T00:00:00.000Z"),
      method: PaymentMethod.CASH,
      referenceNumber: `${runId}-construction-refund`,
      remarks: "Legacy construction bond partial refund",
      actor,
    }),
  );
  assert.equal(constructionRefund.amountRefunded, 500);
  assert.equal(constructionRefund.remaining, 1000);
  assert.equal(constructionRefund.refundStatus, RefundStatus.PARTIALLY_REFUNDED);

  const contractorRefund = await inTenant(() =>
    recordBondRefund({
      collectionId: contractorBondId,
      amount: 2000,
      refundDate: new Date("2026-09-16T00:00:00.000Z"),
      method: PaymentMethod.BANK_TRANSFER,
      referenceNumber: `${runId}-contractor-refund`,
      remarks: "Legacy contractor bond full refund",
      actor,
    }),
  );
  assert.equal(contractorRefund.amountRefunded, 2000);
  assert.equal(contractorRefund.remaining, 0);
  assert.equal(contractorRefund.refundStatus, RefundStatus.REFUNDED);

  const [constructionBond, contractorBond, audits] = await Promise.all([
    platformPrisma.collection.findUniqueOrThrow({ where: { id: constructionBondId } }),
    platformPrisma.collection.findUniqueOrThrow({ where: { id: contractorBondId } }),
    platformPrisma.auditLog.findMany({
      where: { tenantId, action: "BOND_REFUND_PROCESSED" },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  assert.equal(constructionBond.refundable, true);
  assert.equal(constructionBond.refundStatus, RefundStatus.PARTIALLY_REFUNDED);
  assert.equal(Number(constructionBond.amount), 1500);
  assert.equal(Number(constructionBond.amountRefunded), 500);
  assert.equal(constructionBond.receiptNumber, "AR-CB-2026-0099901");

  assert.equal(contractorBond.refundable, true);
  assert.equal(contractorBond.refundStatus, RefundStatus.REFUNDED);
  assert.equal(Number(contractorBond.amount), 2000);
  assert.equal(Number(contractorBond.amountRefunded), 2000);
  assert.equal(contractorBond.receiptNumber, "AR-KB-2026-0099902");

  assert.equal(audits.length, 2);
  assert.equal(await platformPrisma.bondRefund.count({ where: { tenantId } }), 2);
});

test("a non-bond collection cannot become refundable from a stale metadata flag", async () => {
  await assert.rejects(
    inTenant(() =>
      recordBondRefund({
        collectionId: nonBondId,
        amount: 100,
        refundDate: new Date("2026-09-16T00:00:00.000Z"),
        method: PaymentMethod.CASH,
        actor,
      }),
    ),
    /Refundable bond not found/i,
  );

  const nonBond = await platformPrisma.collection.findUniqueOrThrow({ where: { id: nonBondId } });
  assert.equal(nonBond.refundable, true);
  assert.equal(Number(nonBond.amountRefunded), 0);
  assert.equal(await platformPrisma.bondRefund.count({ where: { tenantId, collectionId: nonBondId } }), 0);
});
