import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  BillStatus,
  CollectionType,
  PayerType,
  PaymentMethod,
  RefundStatus,
  Role,
  TenantModule,
} from "@prisma/client";
import { isBondDuesCreditPayment } from "@/lib/bond-dues-credit";
import { platformPrisma } from "@/lib/db";
import { applyConstructionBondToMonthlyDues } from "@/lib/services/bond-dues-credit";
import { recordBondRefund } from "@/lib/services/bond-refund";
import { getFinancialReport } from "@/lib/services/financial-report";
import { updatePaymentAmountLedger, voidPaymentLedger } from "@/lib/services/payment-ledger";
import { getTransactionHistoryReport } from "@/lib/services/transaction-history-report";
import { runWithTenant } from "@/lib/tenant-context";

const runId = `bond-dues-credit-it-${process.pid}`;
const tenantAId = `${runId}-tenant-a`;
const tenantBId = `${runId}-tenant-b`;
const adminAId = `${runId}-admin-a`;
const adminBId = `${runId}-admin-b`;
const homeownerAUserId = `${runId}-homeowner-user-a`;
const homeownerBUserId = `${runId}-homeowner-user-b`;
const homeownerAId = `${runId}-homeowner-a`;
const homeownerBId = `${runId}-homeowner-b`;
const collectionAId = `${runId}-construction-bond-a`;
const collectionBId = `${runId}-construction-bond-b`;
const contractorBondId = `${runId}-contractor-bond-a`;
const contractorId = `${runId}-contractor-a`;
const billA1Id = `${runId}-bill-a-1`;
const billA2Id = `${runId}-bill-a-2`;
const tenantIds = [tenantAId, tenantBId];

const adminA = {
  id: adminAId,
  tenantId: tenantAId,
  name: "Bond Credit Administrator A",
  email: `${runId}-admin-a@example.invalid`,
};

async function inTenant<T>(tenantId: string, callback: () => T | Promise<T>) {
  return runWithTenant(tenantId, async () => await callback(), {
    role: Role.ADMIN,
    enabledModules: [TenantModule.BILLING],
  });
}

async function cleanFixtures() {
  await platformPrisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.paymentAllocation.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.paymentArchive.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.bondRefund.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.payment.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.bill.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.collection.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.contractorProfile.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.homeownerProfile.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.receiptCounter.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.userRoleAssignment.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.tenantModuleEntitlement.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
}

before(async () => {
  await cleanFixtures();
  await platformPrisma.tenant.createMany({
    data: [
      { id: tenantAId, name: "Bond Credit Tenant A", shortName: "BC-A", slug: `${runId}-a` },
      { id: tenantBId, name: "Bond Credit Tenant B", shortName: "BC-B", slug: `${runId}-b` },
    ],
  });
  await platformPrisma.tenantModuleEntitlement.createMany({
    data: tenantIds.map((tenantId) => ({ tenantId, module: TenantModule.BILLING, enabled: true })),
  });
  await platformPrisma.user.createMany({
    data: [
      { id: adminAId, tenantId: tenantAId, name: adminA.name, email: adminA.email, passwordHash: "integration-test-only", role: Role.ADMIN },
      { id: adminBId, tenantId: tenantBId, name: "Bond Credit Administrator B", email: `${runId}-admin-b@example.invalid`, passwordHash: "integration-test-only", role: Role.ADMIN },
      { id: homeownerAUserId, tenantId: tenantAId, name: "Bond Credit Homeowner A", email: `${runId}-homeowner-a@example.invalid`, passwordHash: "integration-test-only", role: Role.HOMEOWNER },
      { id: homeownerBUserId, tenantId: tenantBId, name: "Bond Credit Homeowner B", email: `${runId}-homeowner-b@example.invalid`, passwordHash: "integration-test-only", role: Role.HOMEOWNER },
    ],
  });
  await platformPrisma.homeownerProfile.createMany({
    data: [
      { id: homeownerAId, tenantId: tenantAId, userId: homeownerAUserId, address: "1 Credit Street", block: "1", lot: "1", phone: "09000000011", monthlyDuesAmount: 600 },
      { id: homeownerBId, tenantId: tenantBId, userId: homeownerBUserId, address: "1 Credit Street", block: "1", lot: "1", phone: "09000000012", monthlyDuesAmount: 600 },
    ],
  });
  await platformPrisma.contractorProfile.create({
    data: { id: contractorId, tenantId: tenantAId, companyName: "Bond Contractor A", contactPerson: "Contractor A", phone: "09000000013", address: "Contractor Road" },
  });
  await platformPrisma.collection.createMany({
    data: [
      {
        id: collectionAId,
        tenantId: tenantAId,
        type: CollectionType.CONSTRUCTION_BOND,
        payerType: PayerType.HOMEOWNER,
        homeownerId: homeownerAId,
        amount: 1000,
        collectionDate: new Date("2026-08-01T00:00:00.000Z"),
        method: PaymentMethod.BANK_TRANSFER,
        receiptNumber: "AR-CB-2026-9000001",
        refundable: true,
        refundStatus: RefundStatus.HELD,
        createdById: adminAId,
      },
      {
        id: contractorBondId,
        tenantId: tenantAId,
        type: CollectionType.CONTRACTOR_BOND,
        payerType: PayerType.CONTRACTOR,
        contractorId,
        amount: 500,
        collectionDate: new Date("2026-07-01T00:00:00.000Z"),
        method: PaymentMethod.CASH,
        receiptNumber: "AR-CTB-2026-9000001",
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
        amount: 1000,
        collectionDate: new Date("2026-08-01T00:00:00.000Z"),
        method: PaymentMethod.BANK_TRANSFER,
        receiptNumber: "AR-CB-2026-9000002",
        refundable: true,
        refundStatus: RefundStatus.HELD,
        createdById: adminBId,
      },
    ],
  });
  await platformPrisma.bill.createMany({
    data: [
      { id: billA1Id, tenantId: tenantAId, homeownerId: homeownerAId, billingMonth: new Date("2026-08-01T00:00:00.000Z"), coverageYear: 2026, coverageMonth: 8, amount: 600, totalAmount: 600, amountPaid: 0, balance: 600, dueDate: new Date("2026-08-15T00:00:00.000Z"), status: BillStatus.UNPAID },
      { id: billA2Id, tenantId: tenantAId, homeownerId: homeownerAId, billingMonth: new Date("2026-09-01T00:00:00.000Z"), coverageYear: 2026, coverageMonth: 9, amount: 600, totalAmount: 600, amountPaid: 0, balance: 600, dueDate: new Date("2026-09-15T00:00:00.000Z"), status: BillStatus.UNPAID },
    ],
  });
});

after(async () => {
  await cleanFixtures();
  await platformPrisma.$disconnect();
});

test("Construction Bond credit settles oldest monthly dues without creating cash inflow", async () => {
  const result = await inTenant(tenantAId, () => applyConstructionBondToMonthlyDues({
    collectionId: collectionAId,
    amount: 700,
    applicationDate: new Date("2026-09-05T00:00:00.000Z"),
    idempotencyKey: `${runId}-apply-1`,
    authorizationReference: "HOMEOWNER-REQUEST-001",
    remarks: "Homeowner requested bond application to monthly dues.",
    actor: adminA,
  }));
  assert.equal(result.appliedAmount, 700);
  assert.equal(result.remainingBond, 300);
  assert.match(result.receiptNumber ?? "", /^AR-BC-2026-/);

  const payment = await platformPrisma.payment.findUniqueOrThrow({ where: { id: result.paymentId }, include: { allocations: { orderBy: { createdAt: "asc" } } } });
  assert.equal(isBondDuesCreditPayment(payment), true);
  assert.equal(payment.method, PaymentMethod.OTHER);
  assert.equal(payment.referenceNumber, "HOMEOWNER-REQUEST-001");
  assert.deepEqual(payment.allocations.map((item) => Number(item.amount)), [600, 100]);

  const [bill1, bill2] = await Promise.all([
    platformPrisma.bill.findUniqueOrThrow({ where: { id: billA1Id } }),
    platformPrisma.bill.findUniqueOrThrow({ where: { id: billA2Id } }),
  ]);
  assert.equal(Number(bill1.balance), 0);
  assert.equal(bill1.status, BillStatus.PAID);
  assert.equal(Number(bill2.amountPaid), 100);
  assert.equal(Number(bill2.balance), 500);

  const retry = await inTenant(tenantAId, () => applyConstructionBondToMonthlyDues({
    collectionId: collectionAId,
    amount: 700,
    applicationDate: new Date("2026-09-05T00:00:00.000Z"),
    idempotencyKey: `${runId}-apply-1`,
    authorizationReference: "HOMEOWNER-REQUEST-001",
    actor: adminA,
  }));
  assert.equal(retry.reused, true);
  assert.equal(retry.paymentId, result.paymentId);
  assert.equal(await platformPrisma.payment.count({ where: { tenantId: tenantAId, idempotencyKey: `${runId}-apply-1` } }), 1);

  const report = await getFinancialReport(tenantAId, "2026-09-01", "2026-09-30");
  assert.equal(report.duesIncome, 700);
  assert.equal(report.bondCreditsAppliedToDues, 700);
  assert.equal(report.paymentCashReceived, 0);
  assert.equal(report.bondsHeld, 800, "Construction Bond 300 remaining plus Contractor Bond 500 must remain as liabilities.");

  const history = await getTransactionHistoryReport(tenantAId, "2026-09-01", "2026-09-30");
  const creditRow = history.rows.find((row) => row.transactionId === result.paymentId);
  assert.equal(creditRow?.transactionType, "Bond Applied to Monthly Dues");
  assert.equal(creditRow?.paymentType, "Construction Bond Credit");
  assert.equal(creditRow?.paymentMode, "NON-CASH / BOND CREDIT");

  await assert.rejects(
    inTenant(tenantAId, () => updatePaymentAmountLedger({ paymentId: result.paymentId, amount: 650, actor: adminA, reason: "Attempt direct edit" })),
    /cannot be edited as ordinary payments/i,
  );

  await assert.rejects(
    inTenant(tenantAId, () => recordBondRefund({ collectionId: collectionAId, amount: 300.01, refundDate: new Date("2026-09-06T00:00:00.000Z"), method: PaymentMethod.CASH, actor: adminA })),
    /cannot exceed the remaining bond balance/i,
  );
});

test("Construction Bond credit rejects contractor bonds, cross-tenant bonds, and excess dues applications", async () => {
  await assert.rejects(
    inTenant(tenantAId, () => applyConstructionBondToMonthlyDues({ collectionId: contractorBondId, amount: 100, applicationDate: new Date("2026-09-07T00:00:00.000Z"), idempotencyKey: `${runId}-contractor-reject`, authorizationReference: "REQ-2", actor: adminA })),
    /Eligible homeowner Construction Bond not found/i,
  );
  await assert.rejects(
    inTenant(tenantAId, () => applyConstructionBondToMonthlyDues({ collectionId: collectionBId, amount: 100, applicationDate: new Date("2026-09-07T00:00:00.000Z"), idempotencyKey: `${runId}-tenant-reject`, authorizationReference: "REQ-3", actor: adminA })),
    /Eligible homeowner Construction Bond not found/i,
  );
  await assert.rejects(
    inTenant(tenantAId, () => applyConstructionBondToMonthlyDues({ collectionId: collectionAId, amount: 501, applicationDate: new Date("2026-09-07T00:00:00.000Z"), idempotencyKey: `${runId}-dues-reject`, authorizationReference: "REQ-4", actor: adminA })),
    /remaining Construction Bond balance|current open Monthly Dues balance/i,
  );
});

test("cash refund uses only the bond remainder and voiding a bond credit restores dues and reopens the liability", async () => {
  const credit = await platformPrisma.payment.findFirstOrThrow({ where: { tenantId: tenantAId, idempotencyKey: `${runId}-apply-1` } });
  const refund = await inTenant(tenantAId, () => recordBondRefund({
    collectionId: collectionAId,
    amount: 300,
    refundDate: new Date("2026-09-08T00:00:00.000Z"),
    method: PaymentMethod.BANK_TRANSFER,
    referenceNumber: `${runId}-refund-final`,
    actor: adminA,
  }));
  assert.equal(refund.remaining, 0);
  assert.equal(refund.refundStatus, RefundStatus.REFUNDED);

  const voided = await inTenant(tenantAId, () => voidPaymentLedger({ paymentId: credit.id, actor: adminA, reason: "Correct homeowner bond-credit instruction" }));
  assert.equal(voided.reopenedBondBalance, 700);

  const [collection, bill1, bill2, voidedPayment] = await Promise.all([
    platformPrisma.collection.findUniqueOrThrow({ where: { id: collectionAId } }),
    platformPrisma.bill.findUniqueOrThrow({ where: { id: billA1Id } }),
    platformPrisma.bill.findUniqueOrThrow({ where: { id: billA2Id } }),
    platformPrisma.payment.findUniqueOrThrow({ where: { id: credit.id } }),
  ]);
  assert.equal(voidedPayment.status, "VOIDED");
  assert.equal(collection.refundStatus, RefundStatus.PARTIALLY_REFUNDED);
  assert.equal(Number(collection.amountRefunded), 300);
  assert.equal(Number(bill1.amountPaid), 0);
  assert.equal(Number(bill1.balance), 600);
  assert.equal(Number(bill2.amountPaid), 0);
  assert.equal(Number(bill2.balance), 600);

  const report = await getFinancialReport(tenantAId, "2026-09-01", "2026-09-30");
  assert.equal(report.bondCreditsAppliedToDues, 0);
  assert.equal(report.paymentCashReceived, 0);
  assert.equal(report.bondsHeld, 1200, "Construction Bond 700 reopened plus Contractor Bond 500 must be held.");
  assert.equal(await platformPrisma.auditLog.count({ where: { tenantId: tenantAId, action: "VOID_CONSTRUCTION_BOND_DUES_CREDIT" } }), 1);
});
