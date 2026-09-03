import "server-only";

import { randomBytes } from "node:crypto";
import {
  PlatformInvoiceStatus,
  PlatformPaymentGateway,
  PlatformPaymentMethod,
  PlatformPaymentStatus,
  TenantStatus,
  TenantSubscriptionStatus,
  TenantSuspensionReason,
} from "@prisma/client";
import { platformPrisma as prisma } from "@/lib/db";

function internalPaymentReference(now = new Date()) {
  return `HP-${now.getUTCFullYear()}-${randomBytes(8).toString("hex").toUpperCase()}`;
}

export async function recordPlatformManualPaymentSafe(input: {
  tenantId: string;
  invoiceId: string;
  amount: number;
  method: PlatformPaymentMethod;
  referenceNumber?: string;
  actorId: string;
}) {
  if (!input.tenantId || !input.invoiceId) throw new Error("Select an open tenant invoice.");
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Payment amount must be greater than zero.");

  const paidAt = new Date();
  const externalReference = input.referenceNumber?.trim() || null;

  return prisma.$transaction(async (tx) => {
    const invoice = await tx.platformInvoice.findFirst({
      where: { id: input.invoiceId, tenantId: input.tenantId },
      include: { subscription: true },
    });
    if (!invoice || [PlatformInvoiceStatus.PAID, PlatformInvoiceStatus.VOID, PlatformInvoiceStatus.CANCELLED].includes(invoice.status)) {
      throw new Error("This invoice cannot receive a payment.");
    }

    const balance = Number(invoice.outstandingBalance);
    if (input.amount - balance > 0.009) throw new Error("Payment cannot exceed the invoice balance.");

    const newPaid = Number(invoice.amountPaid) + input.amount;
    const newBalance = Math.max(0, Number(invoice.total) - newPaid);
    const fullyPaid = newBalance < 0.01;

    // Optimistic balance guard prevents two manual submissions from silently
    // overwriting the same invoice balance if they arrive concurrently.
    const claimedInvoice = await tx.platformInvoice.updateMany({
      where: {
        id: invoice.id,
        tenantId: input.tenantId,
        status: invoice.status,
        amountPaid: invoice.amountPaid,
        outstandingBalance: invoice.outstandingBalance,
      },
      data: {
        amountPaid: newPaid,
        outstandingBalance: newBalance,
        status: fullyPaid ? PlatformInvoiceStatus.PAID : PlatformInvoiceStatus.PARTIALLY_PAID,
        paidAt: fullyPaid ? paidAt : null,
      },
    });
    if (claimedInvoice.count !== 1) throw new Error("The invoice balance changed while the payment was being recorded. Refresh and try again.");

    const payment = await tx.platformPayment.create({
      data: {
        tenantId: input.tenantId,
        paymentReference: internalPaymentReference(paidAt),
        gateway: PlatformPaymentGateway.MANUAL,
        amount: input.amount,
        netAmount: input.amount,
        method: input.method,
        status: PlatformPaymentStatus.SUCCEEDED,
        paidAt,
        metadata: {
          recordedBy: input.actorId,
          externalReference,
        },
      },
    });

    await tx.platformPaymentAllocation.create({
      data: { tenantId: input.tenantId, paymentId: payment.id, invoiceId: invoice.id, amount: input.amount },
    });

    if (fullyPaid) {
      const otherOutstanding = await tx.platformInvoice.findFirst({
        where: {
          tenantId: input.tenantId,
          id: { not: invoice.id },
          outstandingBalance: { gt: 0 },
          status: { in: [PlatformInvoiceStatus.OPEN, PlatformInvoiceStatus.PARTIALLY_PAID, PlatformInvoiceStatus.OVERDUE] },
        },
        select: { id: true },
      });
      if (!otherOutstanding) {
        await tx.tenantSubscription.update({
          where: { id: invoice.subscriptionId },
          data: { status: TenantSubscriptionStatus.ACTIVE },
        });
        const nonPaymentHold = await tx.tenantSuspensionRecord.findFirst({
          where: {
            tenantId: input.tenantId,
            reinstatedAt: null,
            reason: { not: TenantSuspensionReason.NON_PAYMENT },
          },
        });
        const autoSuspension = await tx.tenantSuspensionRecord.findFirst({
          where: {
            tenantId: input.tenantId,
            reinstatedAt: null,
            reason: TenantSuspensionReason.NON_PAYMENT,
            autoReinstate: true,
          },
        });
        if (!nonPaymentHold && autoSuspension) {
          await tx.tenant.update({
            where: { id: input.tenantId },
            data: { status: TenantStatus.ACTIVE, subscriptionStatus: TenantSubscriptionStatus.ACTIVE },
          });
          await tx.tenantSuspensionRecord.updateMany({
            where: {
              tenantId: input.tenantId,
              reinstatedAt: null,
              reason: TenantSuspensionReason.NON_PAYMENT,
              autoReinstate: true,
            },
            data: { reinstatedAt: paidAt },
          });
        } else if (!nonPaymentHold) {
          await tx.tenant.update({
            where: { id: input.tenantId },
            data: { subscriptionStatus: TenantSubscriptionStatus.ACTIVE },
          });
        }
      }
    }

    await tx.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorId: input.actorId,
        module: "PLATFORM_BILLING",
        action: "PLATFORM_PAYMENT_RECORDED",
        entityType: "PlatformPayment",
        entityId: payment.id,
        metadata: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          amount: input.amount,
          method: input.method,
          externalReference,
          internalPaymentReference: payment.paymentReference,
          fullyPaid,
        },
      },
    });

    return payment;
  });
}
