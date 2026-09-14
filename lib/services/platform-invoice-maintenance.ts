import "server-only";

import {
  PlatformInvoiceStatus,
  PlatformPaymentGateway,
  PlatformPaymentStatus,
} from "@prisma/client";
import { platformPrisma as prisma } from "@/lib/db";

const CANCELLABLE_STATUSES = [
  PlatformInvoiceStatus.DRAFT,
  PlatformInvoiceStatus.OPEN,
  PlatformInvoiceStatus.OVERDUE,
] as const;

function metadataInvoiceId(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>).invoiceId;
  return typeof value === "string" ? value : null;
}

export async function cancelPlatformInvoice(input: {
  tenantId: string;
  invoiceId: string;
  actorId?: string;
}) {
  const invoice = await prisma.platformInvoice.findFirst({
    where: { id: input.invoiceId, tenantId: input.tenantId },
    include: { _count: { select: { allocations: true } } },
  });
  if (!invoice) throw new Error("Platform invoice not found for this tenant.");

  if ([PlatformInvoiceStatus.CANCELLED, PlatformInvoiceStatus.VOID].includes(invoice.status)) {
    return invoice;
  }

  if (!CANCELLABLE_STATUSES.some((status) => status === invoice.status)) {
    throw new Error("Only an unpaid draft, open, or overdue invoice can be deleted from active billing.");
  }
  if (Number(invoice.amountPaid) > 0.009 || invoice._count.allocations > 0) {
    throw new Error("This invoice has payment history and cannot be deleted.");
  }

  const pendingPayments = await prisma.platformPayment.findMany({
    where: {
      tenantId: input.tenantId,
      gateway: PlatformPaymentGateway.PAYMONGO,
      status: PlatformPaymentStatus.PENDING,
      gatewayCheckoutId: { not: null },
    },
    select: { id: true, metadata: true },
    take: 500,
  });
  if (pendingPayments.some((payment) => metadataInvoiceId(payment.metadata) === invoice.id)) {
    throw new Error("This invoice has an active online payment checkout and cannot be deleted safely.");
  }

  const now = new Date();
  const previousOutstanding = Number(invoice.outstandingBalance);
  return prisma.$transaction(async (tx) => {
    const changed = await tx.platformInvoice.updateMany({
      where: {
        id: invoice.id,
        tenantId: input.tenantId,
        status: { in: [...CANCELLABLE_STATUSES] },
        amountPaid: 0,
      },
      data: {
        status: PlatformInvoiceStatus.CANCELLED,
        outstandingBalance: 0,
        voidedAt: now,
      },
    });
    if (changed.count !== 1) {
      throw new Error("Invoice changed while deletion was being processed. Refresh and try again.");
    }

    await tx.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorId: input.actorId || null,
        module: "PLATFORM_BILLING",
        action: "PLATFORM_INVOICE_CANCELLED",
        entityType: "PlatformInvoice",
        entityId: invoice.id,
        metadata: {
          invoiceNumber: invoice.invoiceNumber,
          subscriptionId: invoice.subscriptionId,
          billingPeriodStart: invoice.billingPeriodStart,
          billingPeriodEnd: invoice.billingPeriodEnd,
          previousStatus: invoice.status,
          previousOutstanding,
          scheduleRewound: false,
          removedFromActiveBilling: true,
        },
      },
    });

    return tx.platformInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
  });
}
