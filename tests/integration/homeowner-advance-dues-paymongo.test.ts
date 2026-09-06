import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  BillingGenerationMode,
  BillStatus,
  HomeownerStatus,
  PaymentMethod,
  PaymentRequestStatus,
  PaymentRequestType,
  Prisma,
  RecurringChargeType,
  Role,
  TenantModule,
} from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import { buildHomeownerAdvanceDuesDescription } from "@/lib/homeowner-advance-dues";
import { PAYMONGO_PAYMENT_REQUEST_MARKER } from "@/lib/homeowner-payment-flow";
import { applyHomeownerAdvanceCreditToOpenBills } from "@/lib/services/homeowner-credit";
import { quoteHomeownerAdvanceDues } from "@/lib/services/homeowner-advance-dues";
import { approvePaymentRequest } from "@/lib/services/payment-requests";
import { runWithTenant } from "@/lib/tenant-context";

const runId = `homeowner-advance-dues-${process.pid}`;
const tenantA = `${runId}-tenant-a`;
const tenantB = `${runId}-tenant-b`;
const adminA = `${runId}-admin-a`;
const adminB = `${runId}-admin-b`;
const userA = `${runId}-user-a`;
const userB = `${runId}-user-b`;
const homeownerA = `${runId}-homeowner-a`;
const homeownerB = `${runId}-homeowner-b`;
const ruleSep = `${runId}-rule-sep`;
const ruleOct = `${runId}-rule-oct`;
const ruleB = `${runId}-rule-b`;
const requestId = `${runId}-request`;
const octoberBillId = `${runId}-october-bill`;
const tenantBBillId = `${runId}-tenant-b-bill`;

function asTenant<T>(tenantId: string, callback: () => T) {
  return runWithTenant(tenantId, callback, { role: Role.BILLING_MANAGER, enabledModules: [TenantModule.BILLING] });
}

async function cleanFixtures() {
  const tenantIds = [tenantA, tenantB];
  await platformPrisma.paymentAllocation.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.paymentRequest.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.payment.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.bill.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.duesExemption.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.billingRule.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.receiptCounter.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.homeownerProfile.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await platformPrisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
}

before(async () => {
  await cleanFixtures();
  await platformPrisma.tenant.createMany({
    data: [
      { id: tenantA, name: "Advance Dues Tenant A", shortName: "ADVA", slug: `${runId}-a` },
      { id: tenantB, name: "Advance Dues Tenant B", shortName: "ADVB", slug: `${runId}-b` },
    ],
  });
  await platformPrisma.user.createMany({
    data: [
      { id: adminA, tenantId: tenantA, name: "Advance Admin A", email: `${runId}-admin-a@example.invalid`, passwordHash: "integration-test-only", role: Role.BILLING_MANAGER },
      { id: adminB, tenantId: tenantB, name: "Advance Admin B", email: `${runId}-admin-b@example.invalid`, passwordHash: "integration-test-only", role: Role.BILLING_MANAGER },
      { id: userA, tenantId: tenantA, name: "Advance Homeowner A", email: `${runId}-owner-a@example.invalid`, passwordHash: "integration-test-only", role: Role.HOMEOWNER },
      { id: userB, tenantId: tenantB, name: "Advance Homeowner B", email: `${runId}-owner-b@example.invalid`, passwordHash: "integration-test-only", role: Role.HOMEOWNER },
    ],
  });
  await platformPrisma.homeownerProfile.createMany({
    data: [
      { id: homeownerA, tenantId: tenantA, userId: userA, address: "1 Advance Street", block: "A", lot: "1", phone: "09170000001", monthlyDuesAmount: new Prisma.Decimal("100.00"), status: HomeownerStatus.ACTIVE },
      { id: homeownerB, tenantId: tenantB, userId: userB, address: "2 Isolation Street", block: "B", lot: "2", phone: "09170000002", monthlyDuesAmount: new Prisma.Decimal("999.00"), status: HomeownerStatus.ACTIVE },
    ],
  });
  await platformPrisma.billingRule.createMany({
    data: [
      {
        id: ruleSep,
        tenantId: tenantA,
        recurringChargeType: RecurringChargeType.MONTHLY_DUES,
        amount: new Prisma.Decimal("100.00"),
        generationMode: BillingGenerationMode.AUTOMATIC,
        billingDay: 1,
        dueDay: 15,
        effectiveStartYear: 2026,
        effectiveStartMonth: 9,
        effectiveEndYear: 2026,
        effectiveEndMonth: 9,
        resolutionReference: "ADV-A-SEP",
        createdById: adminA,
        updatedById: adminA,
      },
      {
        id: ruleOct,
        tenantId: tenantA,
        recurringChargeType: RecurringChargeType.MONTHLY_DUES,
        amount: new Prisma.Decimal("150.00"),
        generationMode: BillingGenerationMode.AUTOMATIC,
        billingDay: 1,
        dueDay: 15,
        effectiveStartYear: 2026,
        effectiveStartMonth: 10,
        resolutionReference: "ADV-A-OCT",
        createdById: adminA,
        updatedById: adminA,
      },
      {
        id: ruleB,
        tenantId: tenantB,
        recurringChargeType: RecurringChargeType.MONTHLY_DUES,
        amount: new Prisma.Decimal("999.00"),
        generationMode: BillingGenerationMode.AUTOMATIC,
        billingDay: 1,
        dueDay: 15,
        effectiveStartYear: 2026,
        effectiveStartMonth: 9,
        resolutionReference: "ADV-B-RULE",
        createdById: adminB,
        updatedById: adminB,
      },
    ],
  });
  await platformPrisma.duesExemption.create({
    data: {
      id: `${runId}-nov-exemption`,
      tenantId: tenantA,
      homeownerId: homeownerA,
      recurringChargeType: RecurringChargeType.MONTHLY_DUES,
      billingMonth: new Date(Date.UTC(2026, 10, 1)),
      startYear: 2026,
      startMonth: 11,
      endYear: 2026,
      endMonth: 11,
      reason: "Approved November exemption",
      resolutionReference: "ADV-A-EX-NOV",
      createdById: adminA,
    },
  });
});

after(async () => {
  await cleanFixtures();
  await platformPrisma.$disconnect();
});

test("server quote honors effective rules, exemptions and tenant boundaries", async () => {
  const quote = await asTenant(tenantA, () => quoteHomeownerAdvanceDues({
    tenantId: tenantA,
    homeownerId: homeownerA,
    from: "2026-09",
    to: "2026-11",
    now: new Date("2026-09-06T00:00:00.000Z"),
  }));
  assert.equal(quote.total, 250);
  assert.deepEqual(quote.lines.map((line) => ({ key: line.key, amount: line.amount, exempt: line.exempt })), [
    { key: "2026-09", amount: 100, exempt: false },
    { key: "2026-10", amount: 150, exempt: false },
    { key: "2026-11", amount: 0, exempt: true },
  ]);
  await assert.rejects(
    () => asTenant(tenantA, () => quoteHomeownerAdvanceDues({ tenantId: tenantA, homeownerId: homeownerB, from: "2026-09", to: "2026-09", now: new Date("2026-09-06T00:00:00.000Z") })),
    /homeowner account was not found/i,
  );
});

test("verified PayMongo advance request posts unapplied credit and future bill consumes it without touching another tenant", async () => {
  await platformPrisma.paymentRequest.create({
    data: {
      id: requestId,
      tenantId: tenantA,
      homeownerId: homeownerA,
      type: PaymentRequestType.MONTHLY_DUES,
      billId: null,
      description: buildHomeownerAdvanceDuesDescription("2026-09", "2026-11"),
      amount: new Prisma.Decimal("250.00"),
      paymentDate: new Date(Date.UTC(2026, 8, 6)),
      method: PaymentMethod.OTHER,
      referenceNumber: `${runId}-paymongo-reference`,
      proofFileName: "acct_test_advance",
      proofContentType: PAYMONGO_PAYMENT_REQUEST_MARKER,
      payerNotes: "PayMongo Online advance Monthly Dues",
    },
  });

  const approved = await approvePaymentRequest(requestId, undefined, "Automatically confirmed by PayMongo.", tenantA, { allowGatewayConfirmation: true });
  assert.equal(approved.status, PaymentRequestStatus.APPROVED);
  const payment = await platformPrisma.payment.findFirstOrThrow({
    where: { tenantId: tenantA, id: approved.paymentId! },
    include: { allocations: true },
  });
  assert.equal(Number(payment.amount), 250);
  assert.equal(payment.billId, null);
  assert.equal(payment.allocations.length, 0);
  assert.equal(payment.coverageFromMonth, 9);
  assert.equal(payment.coverageFromYear, 2026);
  assert.equal(payment.coverageToMonth, 11);
  assert.equal(payment.coverageToYear, 2026);

  await platformPrisma.bill.createMany({
    data: [
      {
        id: octoberBillId,
        tenantId: tenantA,
        homeownerId: homeownerA,
        billingMonth: new Date(Date.UTC(2026, 9, 1)),
        recurringChargeType: RecurringChargeType.MONTHLY_DUES,
        coverageYear: 2026,
        coverageMonth: 10,
        billingRuleId: ruleOct,
        resolutionReference: "ADV-A-OCT",
        amount: new Prisma.Decimal("150.00"),
        totalAmount: new Prisma.Decimal("150.00"),
        balance: new Prisma.Decimal("150.00"),
        dueDate: new Date(Date.UTC(2026, 9, 15)),
        status: BillStatus.UNPAID,
      },
      {
        id: tenantBBillId,
        tenantId: tenantB,
        homeownerId: homeownerB,
        billingMonth: new Date(Date.UTC(2026, 9, 1)),
        recurringChargeType: RecurringChargeType.MONTHLY_DUES,
        coverageYear: 2026,
        coverageMonth: 10,
        billingRuleId: ruleB,
        resolutionReference: "ADV-B-RULE",
        amount: new Prisma.Decimal("999.00"),
        totalAmount: new Prisma.Decimal("999.00"),
        balance: new Prisma.Decimal("999.00"),
        dueDate: new Date(Date.UTC(2026, 9, 15)),
        status: BillStatus.UNPAID,
      },
    ],
  });

  const applied = await asTenant(tenantA, () => applyHomeownerAdvanceCreditToOpenBills({ tenantId: tenantA, homeownerIds: [homeownerA] }));
  assert.equal(applied.appliedAmount, 150);
  assert.equal(applied.billsUpdated, 1);

  const [billA, billB, refreshedPayment] = await Promise.all([
    platformPrisma.bill.findFirstOrThrow({ where: { tenantId: tenantA, id: octoberBillId } }),
    platformPrisma.bill.findFirstOrThrow({ where: { tenantId: tenantB, id: tenantBBillId } }),
    platformPrisma.payment.findFirstOrThrow({ where: { tenantId: tenantA, id: payment.id }, include: { allocations: true } }),
  ]);
  assert.equal(Number(billA.balance), 0);
  assert.equal(billA.status, BillStatus.PAID);
  assert.equal(Number(billB.balance), 999, "Tenant B billing must not be touched by Tenant A credit reconciliation.");
  assert.equal(refreshedPayment.allocations.length, 1);
  assert.equal(Number(refreshedPayment.allocations[0]!.amount), 150);
  assert.equal(Number(refreshedPayment.amount) - Number(refreshedPayment.allocations[0]!.amount), 100);

  await assert.rejects(
    () => asTenant(tenantA, () => quoteHomeownerAdvanceDues({ tenantId: tenantA, homeownerId: homeownerA, from: "2026-10", to: "2026-10", now: new Date("2026-09-06T00:00:00.000Z") })),
    /already has a billing record/i,
  );
});
