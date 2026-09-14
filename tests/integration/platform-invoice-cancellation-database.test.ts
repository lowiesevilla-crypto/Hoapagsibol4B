import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  BillingFrequency,
  PlatformInvoiceStatus,
  PlatformPaymentGateway,
  PlatformPaymentMethod,
  PlatformPaymentStatus,
  TenantSubscriptionStatus,
} from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import { generatePlatformInvoice } from "@/lib/services/platform-billing";
import { cancelPlatformInvoice } from "@/lib/services/platform-invoice-maintenance";

const runId = `platform-invoice-cancel-it-${process.pid}`;
const tenantId = `${runId}-tenant`;
const otherTenantId = `${runId}-other-tenant`;
const planId = `${runId}-plan`;
const subscriptionId = `${runId}-subscription`;
const planCode = `${runId}-PLAN`;
const firstPeriodStart = new Date("2026-09-14T00:00:00.000Z");

async function cleanup() {
  await platformPrisma.platformPaymentAllocation.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  await platformPrisma.platformPayment.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  await platformPrisma.platformInvoice.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  await platformPrisma.auditLog.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  await platformPrisma.tenantSubscription.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  await platformPrisma.subscriptionPlanModule.deleteMany({ where: { planId } });
  await platformPrisma.subscriptionPlan.deleteMany({ where: { id: planId } });
  await platformPrisma.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
}

before(async () => {
  await cleanup();
  await platformPrisma.subscriptionPlan.create({
    data: {
      id: planId,
      code: planCode,
      name: "Invoice Cancellation Integration Plan",
      active: true,
      currency: "PHP",
      monthlyPrice: 1000,
    },
  });
  await platformPrisma.tenant.createMany({
    data: [
      { id: tenantId, name: "Invoice Cancellation Tenant", shortName: "ICT", slug: `${runId}-tenant`, subscriptionPlan: planCode, subscriptionStatus: TenantSubscriptionStatus.ACTIVE },
      { id: otherTenantId, name: "Other Invoice Tenant", shortName: "OIT", slug: `${runId}-other`, subscriptionPlan: planCode, subscriptionStatus: TenantSubscriptionStatus.ACTIVE },
    ],
  });
  await platformPrisma.tenantSubscription.create({
    data: {
      id: subscriptionId,
      tenantId,
      planId,
      status: TenantSubscriptionStatus.ACTIVE,
      billingFrequency: BillingFrequency.MONTHLY,
      nextBillingDate: firstPeriodStart,
      agreedPrice: 1000,
      currency: "PHP",
    },
  });
});

after(cleanup);

test("platform admin can remove an older unpaid invoice after a newer cycle exists without rewinding the schedule", async () => {
  const first = await generatePlatformInvoice({ tenantId, issueDate: firstPeriodStart });
  assert.equal(first.status, PlatformInvoiceStatus.OPEN);

  const afterFirst = await platformPrisma.tenantSubscription.findUniqueOrThrow({ where: { id: subscriptionId } });
  const secondPeriodStart = afterFirst.nextBillingDate;
  assert.ok(secondPeriodStart);
  assert.equal(secondPeriodStart?.toISOString().slice(0, 10), "2026-10-14");

  const second = await generatePlatformInvoice({ tenantId, issueDate: secondPeriodStart || new Date("2026-10-14T00:00:00.000Z") });
  assert.equal(second.status, PlatformInvoiceStatus.OPEN);
  assert.notEqual(second.id, first.id);

  const afterSecond = await platformPrisma.tenantSubscription.findUniqueOrThrow({ where: { id: subscriptionId } });
  const nextBillingDate = afterSecond.nextBillingDate;
  assert.ok(nextBillingDate);
  assert.equal(nextBillingDate?.toISOString().slice(0, 10), "2026-11-14");

  const cancelled = await cancelPlatformInvoice({ tenantId, invoiceId: first.id });
  assert.equal(cancelled.status, PlatformInvoiceStatus.CANCELLED);
  assert.equal(Number(cancelled.outstandingBalance), 0);
  assert.ok(cancelled.voidedAt);

  const subscriptionAfterCancellation = await platformPrisma.tenantSubscription.findUniqueOrThrow({ where: { id: subscriptionId } });
  assert.equal(subscriptionAfterCancellation.nextBillingDate?.toISOString(), nextBillingDate?.toISOString());

  const retained = await platformPrisma.platformInvoice.findUniqueOrThrow({ where: { id: first.id } });
  assert.equal(retained.status, PlatformInvoiceStatus.CANCELLED);
  const newerStillOpen = await platformPrisma.platformInvoice.findUniqueOrThrow({ where: { id: second.id } });
  assert.equal(newerStillOpen.status, PlatformInvoiceStatus.OPEN);

  const sameCycleCount = await platformPrisma.platformInvoice.count({
    where: {
      subscriptionId,
      billingPeriodStart: first.billingPeriodStart,
      billingPeriodEnd: first.billingPeriodEnd,
    },
  });
  assert.equal(sameCycleCount, 1);

  const audit = await platformPrisma.auditLog.findFirst({
    where: { tenantId, entityId: first.id, action: "PLATFORM_INVOICE_CANCELLED" },
  });
  assert.ok(audit);
});

test("cancellation is tenant scoped and rejects an active PayMongo checkout", async () => {
  const latest = await platformPrisma.platformInvoice.findFirstOrThrow({
    where: { tenantId, status: PlatformInvoiceStatus.OPEN },
    orderBy: { billingPeriodStart: "desc" },
  });

  await assert.rejects(
    cancelPlatformInvoice({ tenantId: otherTenantId, invoiceId: latest.id }),
    /not found for this tenant/i,
  );

  const pending = await platformPrisma.platformPayment.create({
    data: {
      tenantId,
      paymentReference: `${runId}-pending`,
      gateway: PlatformPaymentGateway.PAYMONGO,
      gatewayCheckoutId: `${runId}-checkout`,
      amount: Number(latest.outstandingBalance),
      netAmount: Number(latest.outstandingBalance),
      currency: latest.currency,
      method: PlatformPaymentMethod.PAYMONGO_CHECKOUT,
      status: PlatformPaymentStatus.PENDING,
      metadata: { invoiceId: latest.id, invoiceNumber: latest.invoiceNumber },
    },
  });

  await assert.rejects(
    cancelPlatformInvoice({ tenantId, invoiceId: latest.id }),
    /active online payment checkout/i,
  );

  await platformPrisma.platformPayment.delete({ where: { id: pending.id } });
  const cancelled = await cancelPlatformInvoice({ tenantId, invoiceId: latest.id });
  assert.equal(cancelled.status, PlatformInvoiceStatus.CANCELLED);

  const again = await cancelPlatformInvoice({ tenantId, invoiceId: latest.id });
  assert.equal(again.status, PlatformInvoiceStatus.CANCELLED);
});
