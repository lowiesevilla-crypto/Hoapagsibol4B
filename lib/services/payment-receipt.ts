import "server-only";

import type { PaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { homeownerAccountNumber, homeownerPropertyLabel } from "@/lib/homeowner-account";
import { PAYMONGO_PAYMENT_REQUEST_MARKER } from "@/lib/homeowner-payment-flow";
import { paymentCoverageDisplay } from "@/lib/payment-coverage";
import { paymentAppliedAmount, paymentUnappliedCredit, totalUnappliedCredit } from "@/lib/payment-credit";
import { paymentProcessorIdentity } from "@/lib/payment-processor";
import { getAssociationSettings } from "@/lib/system-settings";
import { monthLabel } from "@/lib/utils";

const PAYMONGO_CHECKOUT_ENDPOINT = "https://api.paymongo.com/v1/checkout_sessions";

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
  processedAt: Date;
  processorTimestampLabel: string;
  payerAcknowledgedAt: Date;
  payerAcknowledgementLabel: string;
  onlinePayment: boolean;
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

  const [outstanding, activePayments, association, audit, linkedRequest] = await Promise.all([
    prisma.bill.aggregate({
      where: { tenantId: payment.tenantId, homeownerId: payment.homeownerId, archivedAt: null, balance: { gt: 0 } },
      _sum: { balance: true },
    }),
    prisma.payment.findMany({
      where: { tenantId: payment.tenantId, homeownerId: payment.homeownerId, status: "ACTIVE" },
      select: { amount: true, billId: true, allocations: { select: { amount: true } } },
    }),
    getAssociationSettings(payment.tenantId),
    prisma.auditLog.findFirst({
      where: { tenantId: payment.tenantId, entityId: payment.id, action: { in: ["RECORD_PAYMENT_TRANSACTION", "RECORD_ADVANCE_MONTHLY_DUES_PAYMENT"] } },
      orderBy: { createdAt: "asc" },
      select: { metadata: true, createdAt: true },
    }),
    prisma.paymentRequest.findFirst({
      where: { tenantId: payment.tenantId, paymentId: payment.id },
      select: { id: true, proofContentType: true, proofFileName: true },
    }),
  ]);

  const auditMetadata = objectValue(audit?.metadata);
  const auditSource = stringValue(auditMetadata?.source);
  const onlinePayment = auditSource === "PAYMONGO_HOMEOWNER" || linkedRequest?.proofContentType === PAYMONGO_PAYMENT_REQUEST_MARKER;
  const gateway = onlinePayment && linkedRequest ? await resolvePayMongoReceiptDetails(payment.tenantId, linkedRequest).catch(() => null) : null;
  const recordedAt = audit?.createdAt ?? payment.createdAt;
  const processor = paymentProcessorIdentity(payment.processedBy, audit?.metadata);
  const method = gateway?.methodLabel || (onlinePayment ? payMongoFallbackMethod(payment.method) : payment.method.replaceAll("_", " "));
  const processedAt = gateway?.paidAt ?? recordedAt;

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
    method,
    reference: payment.referenceNumber,
    remarks: payment.remarks,
    processorName: onlinePayment ? (gateway?.methodLabel || "PayMongo") : processor.name,
    processorRole: onlinePayment ? "PayMongo online payment processor" : processor.role,
    processedAt,
    processorTimestampLabel: onlinePayment ? "Payment verified on" : "Recorded on",
    payerAcknowledgedAt: processedAt,
    payerAcknowledgementLabel: onlinePayment ? "Online payment acknowledged on" : "Payment acknowledged on",
    onlinePayment,
    status: payment.status,
    allocations: allocationRows.map(({ homeowner: _homeowner, ...allocation }) => allocation),
    appliedAmount: paymentAppliedAmount(payment),
    unappliedCredit: paymentUnappliedCredit(payment),
    homeownerCreditBalance: totalUnappliedCredit(activePayments),
    remainingBalance: Number(outstanding._sum.balance ?? 0),
  };
}

async function resolvePayMongoReceiptDetails(
  tenantId: string,
  request: { id: string; proofContentType: string | null; proofFileName: string | null },
) {
  if (request.proofContentType !== PAYMONGO_PAYMENT_REQUEST_MARKER) return null;
  const accountId = request.proofFileName?.trim() || "";
  const secret = process.env.PAYMONGO_HOMEOWNER_SECRET_KEY?.trim() || "";
  if (!accountId.startsWith("org_") || !secret) return null;

  const checkoutAudit = await prisma.auditLog.findFirst({
    where: {
      tenantId,
      entityType: "PaymentRequest",
      entityId: request.id,
      action: "CREATE_PAYMONGO_HOMEOWNER_CHECKOUT",
      correlationId: { not: null },
    },
    orderBy: { createdAt: "desc" },
    select: { correlationId: true },
  });
  const checkoutId = checkoutAudit?.correlationId?.trim() || "";
  if (!checkoutId.startsWith("cs_")) return null;

  const response = await fetch(`${PAYMONGO_CHECKOUT_ENDPOINT}/${encodeURIComponent(checkoutId)}`, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${secret}:`).toString("base64")}`,
      Accept: "application/json",
      "Account-ID": accountId,
    },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null) as {
    data?: { attributes?: { payments?: Array<{ attributes?: { status?: string; paid_at?: number | string; source?: { type?: string } | null } }> } };
  } | null;
  const payments = Array.isArray(payload?.data?.attributes?.payments) ? payload.data.attributes.payments : [];
  const paid = payments.find((item) => String(item.attributes?.status || "").toLowerCase() === "paid");
  if (!paid?.attributes) return null;
  return {
    methodLabel: payMongoSourceLabel(paid.attributes.source?.type),
    paidAt: payMongoPaidAt(paid.attributes.paid_at),
  };
}

function payMongoFallbackMethod(method: string) {
  return method === "GCASH" ? "GCash" : "PayMongo";
}

function payMongoSourceLabel(sourceType: unknown) {
  const type = String(sourceType || "").trim().toLowerCase();
  const labels: Record<string, string> = {
    gcash: "GCash",
    qrph: "QR PH",
    qr_ph: "QR PH",
    card: "Card",
    paymaya: "Maya",
    maya: "Maya",
    grab_pay: "GrabPay",
    grabpay: "GrabPay",
    billease: "BillEase",
  };
  return labels[type] || (type ? type.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "PayMongo");
}

function payMongoPaidAt(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return new Date(value * 1000);
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return new Date(numeric * 1000);
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.valueOf())) return parsed;
  }
  return null;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
