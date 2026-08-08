import "server-only";

import { randomBytes } from "node:crypto";
import {
  BillingFrequency,
  PlatformInvoiceStatus,
  PlatformPaymentGateway,
  PlatformPaymentMethod,
  PlatformPaymentStatus,
  TenantStatus,
  TenantSubscriptionStatus,
  TenantSuspensionReason,
} from "@prisma/client";
import { prisma } from "@/lib/db";

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addMonths(value: Date, months: number) {
  const result = new Date(value);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

function addDays(value: Date, days: number) {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function periodMonths(frequency: BillingFrequency) {
  if (frequency === BillingFrequency.QUARTERLY) return 3;
  if (frequency === BillingFrequency.ANNUAL) return 12;
  return 1;
}

function invoiceNumber(now = new Date()) {
  return `HH-${now.getUTCFullYear()}-${randomBytes(5).toString("hex").toUpperCase()}`;
}

function paymentReference(now = new Date()) {
  return `HP-${now.getUTCFullYear()}-${randomBytes(5).toString("hex").toUpperCase()}`;
}

export async function listPlatformPlans() {
  return prisma.subscriptionPlan.findMany({
    include: { modules: { where: { enabled: true }, orderBy: { module: "asc" } }, _count: { select: { subscriptions: true } } },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
}

export async function getTenantCommercialSnapshot(tenantId: string) {
  const [tenant, subscription, billingProfile, invoices, payments, activeSuspension] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, include: { _count: { select: { users: true } } } }),
    prisma.tenantSubscription.findFirst({
      where: { tenantId, status: { notIn: [TenantSubscriptionStatus.CANCELLED, TenantSubscriptionStatus.EXPIRED] } },
      include: { plan: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.tenantBillingProfile.findUnique({ where: { tenantId } }),
    prisma.platformInvoice.findMany({ where: { tenantId }, include: { lines: true }, orderBy: { issueDate: "desc" }, take: 24 }),
    prisma.platformPayment.findMany({ where: { tenantId }, include: { allocations: true }, orderBy: { receivedAt: "desc" }, take: 24 }),
    prisma.tenantSuspensionRecord.findFirst({ where: { tenantId, reinstatedAt: null }, orderBy: { effectiveAt: "desc" } }),
  ]);
  if (!tenant) return null;
  const outstanding = invoices
    .filter((invoice) => ![PlatformInvoiceStatus.PAID, PlatformInvoiceStatus.VOID, PlatformInvoiceStatus.CANCELLED].includes(invoice.status))
    .reduce((sum, invoice) => sum + Number(invoice.outstandingBalance), 0);
  return { tenant, subscription, billingProfile, invoices, payments, activeSuspension, outstanding };
}

export async function assignTenantSubscription(input: {
  tenantId: string;
  planId: string;
  billingFrequency: BillingFrequency;
  agreedPrice?: number | null;
  discount?: number;
  trialDays?: number | null;
  actorId: string;
}) {
  const plan = await prisma.subscriptionPlan.findUnique({ where: { id: input.planId } });
  if (!plan || !plan.active) throw new Error("Select an active subscription plan.");
  const tenant = await prisma.tenant.findUnique({ where: { id: input.tenantId } });
  if (!tenant) throw new Error("Tenant not found.");
  const now = new Date();
  const trialDays = input.trialDays ?? plan.trialDays;
  const trialEndsAt = trialDays > 0 ? addDays(now, trialDays) : null;
  const status = trialDays > 0 ? TenantSubscriptionStatus.TRIAL : TenantSubscriptionStatus.ACTIVE;
  const basePrice = input.billingFrequency === BillingFrequency.ANNUAL ? plan.annualPrice : plan.monthlyPrice;
  const agreedPrice = input.agreedPrice ?? (basePrice == null ? null : Number(basePrice));
  const currentStart = startOfUtcDay(now);
  const nextBillingDate = trialEndsAt ? startOfUtcDay(trialEndsAt) : currentStart;

  return prisma.$transaction(async (tx) => {
    await tx.tenantSubscription.updateMany({
      where: { tenantId: input.tenantId, status: { notIn: [TenantSubscriptionStatus.CANCELLED, TenantSubscriptionStatus.EXPIRED] } },
      data: { status: TenantSubscriptionStatus.CANCELLED, cancelledAt: now, cancellationReason: "Superseded by a new subscription assignment." },
    });
    const subscription = await tx.tenantSubscription.create({
      data: {
        tenantId: input.tenantId,
        planId: input.planId,
        status,
        billingFrequency: input.billingFrequency,
        trialEndsAt,
        currentPeriodStart: currentStart,
        nextBillingDate,
        agreedPrice,
        discount: input.discount || 0,
        currency: plan.currency,
      },
    });
    await tx.tenant.update({
      where: { id: input.tenantId },
      data: { subscriptionPlan: plan.code, subscriptionStatus: status },
    });
    await tx.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorId: input.actorId,
        module: "PLATFORM_BILLING",
        action: "SUBSCRIPTION_ASSIGNED",
        entityType: "TenantSubscription",
        entityId: subscription.id,
        metadata: { planId: plan.id, planCode: plan.code, billingFrequency: input.billingFrequency, agreedPrice, trialDays },
      },
    });
    return subscription;
  });
}

export async function saveTenantBillingProfile(input: {
  tenantId: string;
  legalBusinessName?: string;
  billingAddress?: string;
  billingEmail?: string;
  secondaryBillingEmail?: string;
  contactPerson?: string;
  contactNumber?: string;
  tinNumber?: string;
  vatStatus?: string;
  invoiceNotes?: string;
  paymentTermsDays: number;
  purchaseOrderRequired: boolean;
  paymentMethodPreference?: string;
  actorId: string;
}) {
  const profile = await prisma.tenantBillingProfile.upsert({
    where: { tenantId: input.tenantId },
    create: { ...input, actorId: undefined } as never,
    update: { ...input, actorId: undefined } as never,
  });
  await prisma.auditLog.create({ data: { tenantId: input.tenantId, actorId: input.actorId, module: "PLATFORM_BILLING", action: "BILLING_PROFILE_UPDATED", entityType: "TenantBillingProfile", entityId: input.tenantId } });
  return profile;
}

export async function generatePlatformInvoice(input: { tenantId: string; actorId: string; issueDate?: Date }) {
  const subscription = await prisma.tenantSubscription.findFirst({
    where: { tenantId: input.tenantId, status: { notIn: [TenantSubscriptionStatus.CANCELLED, TenantSubscriptionStatus.EXPIRED] } },
    include: { plan: true, tenant: { include: { billingProfile: true } } },
    orderBy: { createdAt: "desc" },
  });
  if (!subscription) throw new Error("Assign a subscription before generating an invoice.");
  const issueDate = startOfUtcDay(input.issueDate || new Date());
  const periodStart = startOfUtcDay(subscription.nextBillingDate || issueDate);
  const nextPeriodStart = addMonths(periodStart, periodMonths(subscription.billingFrequency));
  const periodEnd = addDays(nextPeriodStart, -1);
  const price = subscription.agreedPrice ?? (subscription.billingFrequency === BillingFrequency.ANNUAL ? subscription.plan.annualPrice : subscription.plan.monthlyPrice);
  if (price == null || Number(price) <= 0) throw new Error("The subscription has no billable price.");
  const subtotal = Number(price);
  const discount = Math.max(0, Math.min(Number(subscription.discount), subtotal));
  const total = subtotal - discount;
  const terms = Math.max(0, Math.min(subscription.tenant.billingProfile?.paymentTermsDays ?? 15, 365));
  const dueDate = addDays(issueDate, terms);

  const existing = await prisma.platformInvoice.findFirst({ where: { subscriptionId: subscription.id, billingPeriodStart: periodStart, billingPeriodEnd: periodEnd } });
  if (existing) return existing;

  return prisma.$transaction(async (tx) => {
    const invoice = await tx.platformInvoice.create({
      data: {
        tenantId: input.tenantId,
        subscriptionId: subscription.id,
        invoiceNumber: invoiceNumber(),
        status: PlatformInvoiceStatus.OPEN,
        billingPeriodStart: periodStart,
        billingPeriodEnd: periodEnd,
        issueDate,
        dueDate,
        currency: subscription.currency,
        subtotal,
        discount,
        total,
        outstandingBalance: total,
        finalizedAt: new Date(),
        notes: subscription.tenant.billingProfile?.invoiceNotes || null,
        lines: { create: [{ description: `${subscription.plan.name} subscription`, quantity: 1, unitAmount: subtotal, lineTotal: subtotal }] },
      },
    });
    await tx.tenantSubscription.update({ where: { id: subscription.id }, data: { currentPeriodStart: periodStart, currentPeriodEnd: periodEnd, nextBillingDate: nextPeriodStart } });
    await tx.auditLog.create({
      data: { tenantId: input.tenantId, actorId: input.actorId, module: "PLATFORM_BILLING", action: "PLATFORM_INVOICE_GENERATED", entityType: "PlatformInvoice", entityId: invoice.id, metadata: { invoiceNumber: invoice.invoiceNumber, total, periodStart, periodEnd, dueDate } },
    });
    return invoice;
  });
}

export async function recordPlatformManualPayment(input: { tenantId: string; invoiceId: string; amount: number; method: PlatformPaymentMethod; referenceNumber?: string; actorId: string }) {
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Payment amount must be greater than zero.");
  const invoice = await prisma.platformInvoice.findFirst({ where: { id: input.invoiceId, tenantId: input.tenantId }, include: { subscription: true } });
  if (!invoice || [PlatformInvoiceStatus.PAID, PlatformInvoiceStatus.VOID, PlatformInvoiceStatus.CANCELLED].includes(invoice.status)) throw new Error("This invoice cannot receive a payment.");
  const balance = Number(invoice.outstandingBalance);
  if (input.amount - balance > 0.009) throw new Error("Payment cannot exceed the invoice balance.");
  const paidAt = new Date();
  const newPaid = Number(invoice.amountPaid) + input.amount;
  const newBalance = Math.max(0, Number(invoice.total) - newPaid);
  const fullyPaid = newBalance < 0.01;

  return prisma.$transaction(async (tx) => {
    const payment = await tx.platformPayment.create({
      data: {
        tenantId: input.tenantId,
        paymentReference: input.referenceNumber?.trim() || paymentReference(),
        gateway: PlatformPaymentGateway.MANUAL,
        amount: input.amount,
        netAmount: input.amount,
        method: input.method,
        status: PlatformPaymentStatus.SUCCEEDED,
        paidAt,
        metadata: { recordedBy: input.actorId },
      },
    });
    await tx.platformPaymentAllocation.create({ data: { tenantId: input.tenantId, paymentId: payment.id, invoiceId: invoice.id, amount: input.amount } });
    await tx.platformInvoice.update({ where: { id: invoice.id }, data: { amountPaid: newPaid, outstandingBalance: newBalance, status: fullyPaid ? PlatformInvoiceStatus.PAID : PlatformInvoiceStatus.PARTIALLY_PAID, paidAt: fullyPaid ? paidAt : null } });
    if (fullyPaid) {
      await tx.tenantSubscription.update({ where: { id: invoice.subscriptionId }, data: { status: TenantSubscriptionStatus.ACTIVE } });
      const nonPaymentHold = await tx.tenantSuspensionRecord.findFirst({ where: { tenantId: input.tenantId, reinstatedAt: null, reason: { not: TenantSuspensionReason.NON_PAYMENT } } });
      if (!nonPaymentHold) {
        await tx.tenant.update({ where: { id: input.tenantId }, data: { status: TenantStatus.ACTIVE, subscriptionStatus: TenantSubscriptionStatus.ACTIVE } });
        await tx.tenantSuspensionRecord.updateMany({ where: { tenantId: input.tenantId, reinstatedAt: null, reason: TenantSuspensionReason.NON_PAYMENT, autoReinstate: true }, data: { reinstatedAt: paidAt } });
      }
    }
    await tx.auditLog.create({ data: { tenantId: input.tenantId, actorId: input.actorId, module: "PLATFORM_BILLING", action: "PLATFORM_PAYMENT_RECORDED", entityType: "PlatformPayment", entityId: payment.id, metadata: { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, amount: input.amount, method: input.method, fullyPaid } } });
    return payment;
  });
}

export async function suspendTenantCommercially(input: { tenantId: string; reason: TenantSuspensionReason; notes?: string; autoReinstate: boolean; actorId: string }) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const record = await tx.tenantSuspensionRecord.create({ data: { tenantId: input.tenantId, reason: input.reason, notes: input.notes || null, effectiveAt: now, suspendedAt: now, suspendedById: input.actorId, autoReinstate: input.autoReinstate } });
    await tx.tenant.update({ where: { id: input.tenantId }, data: { status: TenantStatus.SUSPENDED, subscriptionStatus: TenantSubscriptionStatus.SUSPENDED } });
    await tx.tenantSubscription.updateMany({ where: { tenantId: input.tenantId, status: { notIn: [TenantSubscriptionStatus.CANCELLED, TenantSubscriptionStatus.EXPIRED] } }, data: { status: TenantSubscriptionStatus.SUSPENDED } });
    await tx.userSession.updateMany({ where: { tenantId: input.tenantId, revokedAt: null }, data: { revokedAt: now } });
    await tx.auditLog.create({ data: { tenantId: input.tenantId, actorId: input.actorId, module: "PLATFORM_BILLING", action: "TENANT_SUSPENDED", entityType: "TenantSuspensionRecord", entityId: record.id, reason: input.notes || null, metadata: { reason: input.reason, autoReinstate: input.autoReinstate } } });
    return record;
  });
}

export async function reinstateTenantCommercially(input: { tenantId: string; notes?: string; actorId: string }) {
  const outstanding = await prisma.platformInvoice.aggregate({ where: { tenantId: input.tenantId, status: { in: [PlatformInvoiceStatus.OPEN, PlatformInvoiceStatus.PARTIALLY_PAID, PlatformInvoiceStatus.OVERDUE] } }, _sum: { outstandingBalance: true } });
  const activeHold = await prisma.tenantSuspensionRecord.findFirst({ where: { tenantId: input.tenantId, reinstatedAt: null, reason: { not: TenantSuspensionReason.NON_PAYMENT } } });
  if (activeHold && Number(outstanding._sum.outstandingBalance || 0) > 0) throw new Error("Resolve the outstanding balance and administrative hold before reinstatement.");
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    await tx.tenantSuspensionRecord.updateMany({ where: { tenantId: input.tenantId, reinstatedAt: null }, data: { reinstatedAt: now, reinstatedById: input.actorId } });
    await tx.tenant.update({ where: { id: input.tenantId }, data: { status: TenantStatus.ACTIVE, subscriptionStatus: TenantSubscriptionStatus.ACTIVE } });
    await tx.tenantSubscription.updateMany({ where: { tenantId: input.tenantId, status: TenantSubscriptionStatus.SUSPENDED }, data: { status: TenantSubscriptionStatus.ACTIVE } });
    await tx.auditLog.create({ data: { tenantId: input.tenantId, actorId: input.actorId, module: "PLATFORM_BILLING", action: "TENANT_REINSTATED", entityType: "Tenant", entityId: input.tenantId, reason: input.notes || null } });
    return tx.tenant.findUniqueOrThrow({ where: { id: input.tenantId } });
  });
}
