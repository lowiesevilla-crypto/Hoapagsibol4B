import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  PaymentMethod,
  RecurringChargeType,
  Role,
  TenantModule,
} from "@prisma/client";
import { platformPrisma, prisma } from "@/lib/db";
import { generateBillingFromRules } from "@/lib/services/billing-rules";
import { voidPaymentLedger } from "@/lib/services/payment-ledger";
import { recordMonthlyDuesPayment } from "@/lib/services/payment-recording";
import {
  buildStatementLedger,
  summarizeStatementAccount,
} from "@/lib/services/statement-calculations";
import { runWithTenant } from "@/lib/tenant-context";

const runId = `finance-it-${process.pid}`;
const tenantAId = `${runId}-tenant-a`;
const tenantBId = `${runId}-tenant-b`;
const actorAId = `${runId}-actor-a`;
const actorBId = `${runId}-actor-b`;
const homeownerAUserId = `${runId}-homeowner-user-a`;
const homeownerBUserId = `${runId}-homeowner-user-b`;
const homeownerAId = `${runId}-homeowner-a`;
const homeownerBId = `${runId}-homeowner-b`;
const billingRuleAId = `${runId}-rule-a`;
const billingRuleBId = `${runId}-rule-b`;
const tenantIds = [tenantAId, tenantBId];

const actorA = {
  id: actorAId,
  tenantId: tenantAId,
  name: "Integration Billing Manager A",
  email: `${runId}-actor-a@example.invalid`,
};

const actorB = {
  id: actorBId,
  tenantId: tenantBId,
  name: "Integration Billing Manager B",
  email: `${runId}-actor-b@example.invalid`,
};

function inBillingTenant<T>(tenantId: string, callback: () => T) {
  return runWithTenant(tenantId, callback, {
    role: Role.BILLING_MANAGER,
    enabledModules: [TenantModule.BILLING],
  });
}

async function statementSnapshot(asOf: Date) {
  return inBillingTenant(tenantAId, async () => {
    const [bills, payments, collections] = await Promise.all([
      prisma.bill.findMany({
        where: { tenantId: tenantAId, homeownerId: homeownerAId, archivedAt: null },
        orderBy: [{ billingMonth: "asc" }, { createdAt: "asc" }],
      }),
      prisma.payment.findMany({
        where: { tenantId: tenantAId, homeownerId: homeownerAId },
        include: { bill: true, allocations: { include: { bill: true }, orderBy: { bill: { billingMonth: "asc" } } } },
        orderBy: [{ paymentDate: "asc" }, { createdAt: "asc" }],
      }),
      prisma.collection.findMany({
        where: { tenantId: tenantAId, homeownerId: homeownerAId },
        include: { refunds: { orderBy: { refundDate: "asc" } } },
        orderBy: [{ collectionDate: "asc" }, { createdAt: "asc" }],
      }),
    ]);
    const ledger = buildStatementLedger({ bills, payments, collections });
    return { ledger, ...summarizeStatementAccount({ bills, payments, ledger, asOf }) };
  });
}

async function cleanFixtures() {
  await platformPrisma.notificationLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.paymentArchive.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.paymentAllocation.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.paymentRequest.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.payment.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.receiptCounter.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.duesExemption.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.bill.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.billingRule.deleteMany({ where: { tenantId: { in: tenantIds } } });
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
      { id: tenantAId, name: "Finance Integration Tenant A", shortName: "FIT-A", slug: `${runId}-a` },
      { id: tenantBId, name: "Finance Integration Tenant B", shortName: "FIT-B", slug: `${runId}-b` },
    ],
  });

  await platformPrisma.tenantModuleEntitlement.createMany({
    data: tenantIds.map((tenantId) => ({ tenantId, module: TenantModule.BILLING, enabled: true })),
  });

  await platformPrisma.user.createMany({
    data: [
      { ...actorA, passwordHash: "integration-test-only", role: Role.BILLING_MANAGER },
      { ...actorB, passwordHash: "integration-test-only", role: Role.BILLING_MANAGER },
      {
        id: homeownerAUserId,
        tenantId: tenantAId,
        name: "Integration Homeowner A",
        email: `${runId}-homeowner-a@example.invalid`,
        passwordHash: "integration-test-only",
        role: Role.HOMEOWNER,
      },
      {
        id: homeownerBUserId,
        tenantId: tenantBId,
        name: "Integration Homeowner B",
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
        address: "Integration Address A",
        block: "IT-A",
        lot: "001",
        phone: "09000000001",
        monthlyDuesAmount: 1000,
      },
      {
        id: homeownerBId,
        tenantId: tenantBId,
        userId: homeownerBUserId,
        address: "Integration Address B",
        block: "IT-B",
        lot: "001",
        phone: "09000000002",
        monthlyDuesAmount: 2000,
      },
    ],
  });

  await platformPrisma.billingRule.createMany({
    data: [
      {
        id: billingRuleAId,
        tenantId: tenantAId,
        recurringChargeType: RecurringChargeType.MONTHLY_DUES,
        amount: 1000,
        effectiveStartYear: 2026,
        effectiveStartMonth: 8,
        resolutionReference: "FIT-A-RES-2026-001",
        createdById: actorAId,
        updatedById: actorAId,
      },
      {
        id: billingRuleBId,
        tenantId: tenantBId,
        recurringChargeType: RecurringChargeType.MONTHLY_DUES,
        amount: 2000,
        effectiveStartYear: 2026,
        effectiveStartMonth: 8,
        resolutionReference: "FIT-B-RES-2026-001",
        createdById: actorBId,
        updatedById: actorBId,
      },
    ],
  });
});

after(async () => {
  await cleanFixtures();
  await platformPrisma.$disconnect();
});

test("billing generation is tenant-scoped and repeated submissions are idempotent", async () => {
  const first = await inBillingTenant(tenantAId, () => generateBillingFromRules({
    actor: actorA,
    coverageYear: 2026,
    coverageMonth: 8,
    scope: "ALL",
  }));

  assert.equal(first.createdCount, 1);
  assert.equal(first.totalBilledAmount, 1000);

  const repeated = await inBillingTenant(tenantAId, () => generateBillingFromRules({
    actor: actorA,
    coverageYear: 2026,
    coverageMonth: 8,
    scope: "ALL",
  }));

  assert.equal(repeated.createdCount, 0);
  assert.equal(repeated.duplicateCount, 1);

  const [tenantABills, tenantBBills, duplicateAudits] = await Promise.all([
    platformPrisma.bill.count({ where: { tenantId: tenantAId, coverageYear: 2026, coverageMonth: 8 } }),
    platformPrisma.bill.count({ where: { tenantId: tenantBId, coverageYear: 2026, coverageMonth: 8 } }),
    platformPrisma.auditLog.count({ where: { tenantId: tenantAId, action: "DUPLICATE_BILLING_PREVENTED" } }),
  ]);

  assert.equal(tenantABills, 1);
  assert.equal(tenantBBills, 0);
  assert.ok(duplicateAudits >= 1);

  await assert.rejects(
    () => inBillingTenant(tenantAId, () => prisma.bill.findMany({ where: { tenantId: tenantBId } })),
    /Cross-tenant query blocked/,
  );
});

test("concurrent billing submissions preserve the one-bill database invariant", async () => {
  const [left, right] = await inBillingTenant(tenantAId, () => Promise.all([
    generateBillingFromRules({ actor: actorA, coverageYear: 2026, coverageMonth: 9, scope: "ALL" }),
    generateBillingFromRules({ actor: actorA, coverageYear: 2026, coverageMonth: 9, scope: "ALL" }),
  ]));

  const count = await platformPrisma.bill.count({
    where: { tenantId: tenantAId, homeownerId: homeownerAId, coverageYear: 2026, coverageMonth: 9 },
  });

  assert.equal(count, 1);
  assert.ok(left.createdCount + right.createdCount <= 1);
  assert.ok(
    [...left.rows, ...right.rows].some((row) => row.action === "SKIP_DUPLICATE" || row.action === "ERROR"),
    "one concurrent attempt must be rejected or classified as a duplicate",
  );
});

test("cross-tenant bill identifiers cannot be used to record a payment", async () => {
  await inBillingTenant(tenantBId, () => generateBillingFromRules({
    actor: actorB,
    coverageYear: 2026,
    coverageMonth: 8,
    scope: "ALL",
  }));

  const tenantBBill = await platformPrisma.bill.findFirstOrThrow({
    where: { tenantId: tenantBId, homeownerId: homeownerBId, coverageYear: 2026, coverageMonth: 8 },
  });

  await assert.rejects(
    () => inBillingTenant(tenantAId, () => prisma.$transaction((tx) => recordMonthlyDuesPayment(tx, {
      actor: actorA,
      billIds: [tenantBBill.id],
      amount: 500,
      paymentDate: new Date("2026-08-10T00:00:00.000Z"),
      method: PaymentMethod.CASH,
      idempotencyKey: `${runId}-cross-tenant-payment`,
      coverageFromMonth: 8,
      coverageFromYear: 2026,
      coverageToMonth: 8,
      coverageToYear: 2026,
    }))),
    /no longer open|authenticated tenant/,
  );

  assert.equal(await platformPrisma.payment.count({ where: { tenantId: tenantBId } }), 0);
});

test("payment allocation, receipt, statement, idempotency, and void recovery remain consistent", async () => {
  const bills = await platformPrisma.bill.findMany({
    where: { tenantId: tenantAId, homeownerId: homeownerAId, coverageYear: 2026, coverageMonth: { in: [8, 9] } },
    orderBy: { coverageMonth: "asc" },
  });
  assert.equal(bills.length, 2);

  const idempotencyKey = `${runId}-monthly-dues-payment`;
  const confirmation = await inBillingTenant(tenantAId, () => prisma.$transaction((tx) => recordMonthlyDuesPayment(tx, {
    actor: actorA,
    billIds: bills.map((bill) => bill.id),
    amount: 1500,
    paymentDate: new Date("2026-09-10T00:00:00.000Z"),
    method: PaymentMethod.CASH,
    idempotencyKey,
    remarks: "Disposable integration payment",
    coverageFromMonth: 8,
    coverageFromYear: 2026,
    coverageToMonth: 9,
    coverageToYear: 2026,
  })));

  assert.equal(confirmation.reused, false);
  assert.equal(confirmation.appliedAmount, 1500);
  assert.equal(confirmation.unappliedCredit, 0);

  const repeated = await inBillingTenant(tenantAId, () => prisma.$transaction((tx) => recordMonthlyDuesPayment(tx, {
    actor: actorA,
    billIds: bills.map((bill) => bill.id),
    amount: 1500,
    paymentDate: new Date("2026-09-10T00:00:00.000Z"),
    method: PaymentMethod.CASH,
    idempotencyKey,
    coverageFromMonth: 8,
    coverageFromYear: 2026,
    coverageToMonth: 9,
    coverageToYear: 2026,
  })));

  assert.equal(repeated.reused, true);
  assert.equal(repeated.paymentId, confirmation.paymentId);

  const payment = await platformPrisma.payment.findFirstOrThrow({
    where: { tenantId: tenantAId, id: confirmation.paymentId },
    include: { allocations: { orderBy: { coverageMonth: "asc" } } },
  });
  const recalculatedBills = await platformPrisma.bill.findMany({
    where: { tenantId: tenantAId, id: { in: bills.map((bill) => bill.id) } },
    orderBy: { coverageMonth: "asc" },
  });

  assert.match(payment.receiptNumber ?? "", /^AR-MD-2026-0000001$/);
  assert.deepEqual(payment.allocations.map((allocation) => Number(allocation.amount)), [1000, 500]);
  assert.deepEqual(recalculatedBills.map((bill) => Number(bill.amountPaid)), [1000, 500]);
  assert.deepEqual(recalculatedBills.map((bill) => Number(bill.balance)), [0, 500]);
  assert.deepEqual(recalculatedBills.map((bill) => bill.status), ["PAID", "PARTIAL"]);
  assert.equal(await platformPrisma.payment.count({ where: { tenantId: tenantAId, idempotencyKey } }), 1);
  assert.equal(await platformPrisma.auditLog.count({ where: { tenantId: tenantAId, action: "RECORD_PAYMENT_TRANSACTION" } }), 1);

  const statementBeforeVoid = await statementSnapshot(new Date("2026-09-20T00:00:00.000Z"));
  assert.equal(statementBeforeVoid.summary.totalAmountBilled, 2000);
  assert.equal(statementBeforeVoid.summary.totalPayments, 1500);
  assert.equal(statementBeforeVoid.summary.currentOutstandingBalance, 500);
  assert.equal(statementBeforeVoid.summary.netAccountBalance, 500);
  assert.equal(statementBeforeVoid.ledger.at(-1)?.runningBalance, 500);

  await inBillingTenant(tenantAId, () => voidPaymentLedger({
    paymentId: payment.id,
    actor: actorA,
    reason: "Integration void validation",
  }));

  const [voidedPayment, restoredBills, archiveCount, voidAuditCount] = await Promise.all([
    platformPrisma.payment.findFirstOrThrow({ where: { tenantId: tenantAId, id: payment.id } }),
    platformPrisma.bill.findMany({ where: { tenantId: tenantAId, id: { in: bills.map((bill) => bill.id) } }, orderBy: { coverageMonth: "asc" } }),
    platformPrisma.paymentArchive.count({ where: { tenantId: tenantAId, originalPaymentId: payment.id } }),
    platformPrisma.auditLog.count({ where: { tenantId: tenantAId, action: "VOID_PAYMENT_TRANSACTION" } }),
  ]);

  assert.equal(voidedPayment.status, "VOIDED");
  assert.deepEqual(restoredBills.map((bill) => Number(bill.amountPaid)), [0, 0]);
  assert.deepEqual(restoredBills.map((bill) => Number(bill.balance)), [1000, 1000]);
  assert.equal(archiveCount, 1);
  assert.equal(voidAuditCount, 1);

  const statementAfterVoid = await statementSnapshot(new Date("2026-09-20T00:00:00.000Z"));
  assert.equal(statementAfterVoid.summary.totalPayments, 0);
  assert.equal(statementAfterVoid.summary.currentOutstandingBalance, 2000);
  assert.equal(statementAfterVoid.ledger.at(-1)?.runningBalance, 2000);
});
