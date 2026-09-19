import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  BillingFrequency,
  PlatformInvoiceStatus,
  PlatformPaymentGateway,
  PlatformPaymentMethod,
  PlatformPaymentStatus,
  Role,
  TenantSubscriptionStatus,
} from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import { generatePlatformInvoice } from "@/lib/services/platform-billing";
import {
  getPlatformManualPaymentReceipt,
  getTenantPlatformManualPaymentReceipt,
  recordPlatformManualPaymentSafe,
} from "@/lib/services/platform-manual-payment";

const runId = "platform-manual-payment-it-" + process.pid;
const tenantId = runId + "-tenant";
const otherTenantId = runId + "-other";
const planId = runId + "-plan";
const subscriptionId = runId + "-subscription";
const planCode = runId + "-PLAN";
const actorId = runId + "-actor";
const issueDate = new Date("2026-09-19T00:00:00.000Z");

async function cleanup() {
  await platformPrisma.platformPaymentAllocation.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  await platformPrisma.platformPayment.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  await platformPrisma.platformInvoice.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  await platformPrisma.auditLog.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  await platformPrisma.user.deleteMany({ where: { id: actorId } });
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
      name: "Manual Payment Integration Plan",
      active: true,
      currency: "PHP",
      monthlyPrice: 6000,
    },
  });
  await platformPrisma.tenant.createMany({
    data: [
      {
        id: tenantId,
        name: "Manual Payment Tenant",
        shortName: "MPT",
        slug: runId + "-tenant",
        subscriptionPlan: planCode,
        subscriptionStatus: TenantSubscriptionStatus.ACTIVE,
      },
      {
        id: otherTenantId,
        name: "Other Manual Payment Tenant",
        shortName: "OMT",
        slug: runId + "-other",
        subscriptionPlan: planCode,
        subscriptionStatus: TenantSubscriptionStatus.ACTIVE,
      },
    ],
  });
  await platformPrisma.user.create({
    data: {
      id: actorId,
      tenantId,
      name: "Platform Billing Test Admin",
      email: runId + "@example.invalid",
      passwordHash: "integration-test-only",
      role: Role.PLATFORM_ADMIN,
      active: true,
    },
  });
  await platformPrisma.tenantSubscription.create({
    data: {
      id: subscriptionId,
      tenantId,
      planId,
      status: TenantSubscriptionStatus.ACTIVE,
      billingFrequency: BillingFrequency.MONTHLY,
      nextBillingDate: issueDate,
      agreedPrice: 6000,
      currency: "PHP",
    },
  });
});

after(cleanup);

test("platform admin manual payment supports a 4000 partial payment on a 6000 invoice and generates receipt data", async () => {
  const invoice = await generatePlatformInvoice({ tenantId, actorId, issueDate });
  assert.equal(Number(invoice.total), 6000);
  assert.equal(Number(invoice.outstandingBalance), 6000);
  assert.equal(invoice.status, PlatformInvoiceStatus.OPEN);

  const payment = await recordPlatformManualPaymentSafe({
    tenantId,
    invoiceId: invoice.id,
    amount: 4000,
    method: PlatformPaymentMethod.BANK_TRANSFER,
    referenceNumber: "BANK-4000-PARTIAL",
    actorId,
  });

  assert.equal(payment.gateway, PlatformPaymentGateway.MANUAL);
  assert.equal(payment.status, PlatformPaymentStatus.SUCCEEDED);
  assert.equal(Number(payment.amount), 4000);

  const updatedInvoice = await platformPrisma.platformInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
  assert.equal(updatedInvoice.status, PlatformInvoiceStatus.PARTIALLY_PAID);
  assert.equal(Number(updatedInvoice.amountPaid), 4000);
  assert.equal(Number(updatedInvoice.outstandingBalance), 2000);
  assert.equal(updatedInvoice.paidAt, null);

  const allocations = await platformPrisma.platformPaymentAllocation.findMany({
    where: { tenantId, paymentId: payment.id, invoiceId: invoice.id },
  });
  assert.equal(allocations.length, 1);
  assert.equal(Number(allocations[0].amount), 4000);

  const receipt = await getPlatformManualPaymentReceipt(payment.id);
  assert.equal(receipt.tenantId, tenantId);
  assert.equal(receipt.tenant.name, "Manual Payment Tenant");
  assert.equal(receipt.allocations.length, 1);
  assert.equal(receipt.allocations[0].invoice.invoiceNumber, invoice.invoiceNumber);
  assert.equal(Number(receipt.allocations[0].invoice.outstandingBalance), 2000);
  assert.equal((receipt.metadata as { externalReference?: string } | null)?.externalReference, "BANK-4000-PARTIAL");

  const tenantReceipt = await getTenantPlatformManualPaymentReceipt(payment.id, tenantId);
  assert.equal(tenantReceipt.id, payment.id);
  assert.equal(tenantReceipt.tenantId, tenantId);
  await assert.rejects(
    getTenantPlatformManualPaymentReceipt(payment.id, otherTenantId),
    /receipt not found/i,
  );
});

test("manual payment remains tenant scoped and rejects overpayment", async () => {
  const invoice = await platformPrisma.platformInvoice.findFirstOrThrow({
    where: { tenantId, status: PlatformInvoiceStatus.PARTIALLY_PAID },
  });

  await assert.rejects(
    recordPlatformManualPaymentSafe({
      tenantId: otherTenantId,
      invoiceId: invoice.id,
      amount: 1000,
      method: PlatformPaymentMethod.CASH,
      actorId,
    }),
    /cannot receive a payment|select an open tenant invoice/i,
  );

  await assert.rejects(
    recordPlatformManualPaymentSafe({
      tenantId,
      invoiceId: invoice.id,
      amount: 2000.01,
      method: PlatformPaymentMethod.CASH,
      actorId,
    }),
    /cannot exceed the invoice balance/i,
  );
});
