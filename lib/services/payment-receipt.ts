import "server-only";

import type { PaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { homeownerAccountNumber, homeownerPropertyLabel } from "@/lib/homeowner-account";
import { paymentCoverageDisplay } from "@/lib/payment-coverage";
import { paymentAppliedAmount, paymentUnappliedCredit, totalUnappliedCredit } from "@/lib/payment-credit";
import { paymentProcessorIdentity } from "@/lib/payment-processor";
import { getAssociationSettings } from "@/lib/system-settings";
import { monthLabel } from "@/lib/utils";

export type PaymentReceiptViewModel = {
  association: Awaited<ReturnType<typeof getAssociationSettings>>;
  tenantId: string;
  homeownerId: string;
  number: string;
  date: Date;
  payer: string;
  address: string;
  property: string;
  account: string;
  purpose: string;
  amount: number;
  method: string;
  reference: string | null;
  remarks: string | null;
  processorName: string;
  processorRole: string;
  status: PaymentStatus;
  allocations: Array<{ key: string; coverage: string; billType: string; amount: number; remainingBalance: number }>;
  appliedAmount: number;
  unappliedCredit: number;
  homeownerCreditBalance: number;
  remainingBalance: number;
};

export async function getPaymentReceiptData(id: string, authorizedTenantId: string): Promise<PaymentReceiptViewModel | null> {
  const payment = await prisma.payment.findFirst({
    where: { id, tenantId: authorizedTenantId },
    include: {
      homeowner: { include: { user: true } },
      bill: { include: { homeowner: true } },
      allocations: { include: { bill: { include: { homeowner: true } } }, orderBy: { bill: { billingMonth: "asc" } } },
      processedBy: { include: { employeeProfile: true } },
    },
  });
  if (!payment) return null;
  if (payment.homeowner.tenantId !== payment.tenantId) throw new Error("Receipt homeowner tenant mismatch.");
  if (payment.allocations.some((allocation) => allocation.tenantId !== payment.tenantId || allocation.bill.tenantId !== payment.tenantId || allocation.bill.homeownerId !== payment.homeownerId)) {
    throw new Error("Receipt allocation tenant or homeowner mismatch.");
  }
  if (payment.bill && (payment.bill.tenantId !== payment.tenantId || payment.bill.homeownerId !== payment.homeownerId)) {
    throw new Error("Receipt legacy bill tenant or homeowner mismatch.");
  }

  const allocationRows = payment.allocations.length
    ? payment.allocations.map((allocation) => ({
        key: allocation.id,
        coverage: allocation.coverageLabel || monthLabel(allocation.bill.billingMonth),
        billType: allocation.bill.recurringChargeType.replaceAll("_", " "),
        amount: Number(allocation.amount),
        remainingBalance: Number(allocation.bill.balance),
        homeowner: allocation.bill.homeowner,
      }))
    : payment.bill
      ? [{
          key: `legacy-${payment.id}`,
          coverage: monthLabel(payment.bill.billingMonth),
          billType: payment.bill.recurringChargeType.replaceAll("_", " "),
          amount: Number(payment.amount),
          remainingBalance: Number(payment.bill.balance),
          homeowner: payment.bill.homeowner,
        }]
      : [];
  const coveredProperties = [...new Map(allocationRows.map((allocation) => {
    const property = allocation.homeowner;
    return [`${property.block}\u0000${property.lot}\u0000${property.address}`, property] as const;
  })).values()];
  const properties = coveredProperties.length ? coveredProperties : [payment.homeowner];

  const [outstanding, activePayments, association, audit] = await Promise.all([
    prisma.bill.aggregate({
      where: { tenantId: payment.tenantId, homeownerId: payment.homeownerId, archivedAt: null, balance: { gt: 0 } },
      _sum: { balance: true },
    }),
    prisma.payment.findMany({
      where: { tenantId: payment.tenantId, homeownerId: payment.homeownerId, status: "ACTIVE" },
      select: { amount: true, allocations: { select: { amount: true } } },
    }),
    getAssociationSettings(payment.tenantId),
    prisma.auditLog.findFirst({
      where: { tenantId: payment.tenantId, entityId: payment.id, action: "RECORD_PAYMENT_TRANSACTION" },
      orderBy: { createdAt: "asc" },
      select: { metadata: true },
    }),
  ]);
  const processor = paymentProcessorIdentity(payment.processedBy, audit?.metadata);

  return {
    association,
    tenantId: payment.tenantId,
    homeownerId: payment.homeownerId,
    number: payment.receiptNumber || "Legacy receipt",
    date: payment.paymentDate,
    payer: payment.homeowner.user.name,
    address: properties.map((property) => property.address).filter((value, index, values) => values.indexOf(value) === index).join("; "),
    property: properties.length === 1
      ? homeownerPropertyLabel(properties[0])
      : `Multiple properties: ${properties.map(homeownerPropertyLabel).join("; ")}`,
    account: homeownerAccountNumber(payment.homeowner),
    purpose: paymentCoverageDisplay(payment),
    amount: Number(payment.amount),
    method: payment.method,
    reference: payment.referenceNumber,
    remarks: payment.remarks,
    processorName: processor.name,
    processorRole: processor.role,
    status: payment.status,
    allocations: allocationRows.map(({ homeowner: _homeowner, ...allocation }) => allocation),
    appliedAmount: paymentAppliedAmount(payment),
    unappliedCredit: paymentUnappliedCredit(payment),
    homeownerCreditBalance: totalUnappliedCredit(activePayments),
    remainingBalance: Number(outstanding._sum.balance ?? 0),
  };
}
