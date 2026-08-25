import "server-only";

import { PaymentRequestStatus, PaymentRequestType } from "@prisma/client";
import { platformPrisma as prisma } from "@/lib/db";
import {
  PAYMONGO_HOMEOWNER_PARENT_ACCOUNT_ENV,
  parseCheckoutFeeMetadata,
} from "@/lib/homeowner-convenience-fee";
import {
  paymongoBatchDescription,
  paymongoBatchId,
  paymongoCheckoutSessionId,
} from "@/lib/homeowner-paymongo-batch";
import { PAYMONGO_PAYMENT_REQUEST_MARKER } from "@/lib/homeowner-payment-flow";

const PAYMONGO_API = "https://api.paymongo.com/v1";
const SECRET_KEY_ENV = "PAYMONGO_HOMEOWNER_SECRET_KEY";

type JsonRecord = Record<string, unknown>;

type CheckoutResource = {
  id?: string;
  attributes?: {
    status?: string;
    livemode?: boolean;
    reference_number?: string;
    metadata?: unknown;
    split_payment?: {
      transfer_to?: string;
      recipients?: Array<{
        merchant_id?: string;
        split_type?: string;
        value?: number | string;
      }>;
    } | null;
    payments?: Array<{
      id?: string;
      attributes?: {
        status?: string;
        amount?: number | string;
        currency?: string;
        paid_at?: number | string;
      };
    }>;
  };
};

type PayoutResource = {
  id?: string;
  attributes?: {
    amount?: number | string;
    net_amount?: number | string;
    status?: string;
    provider?: string;
    created_at?: number | string;
    status_updated_at?: number | string;
    organization?: { id?: string; trade_name?: string } | null;
  };
};

type PayoutTransaction = {
  id?: string;
  type?: string;
  attributes?: {
    amount?: number | string;
    net_amount?: number | string;
    currency?: string;
    organization_id?: string;
    payment_id?: string;
    payout_id?: string;
    transaction_at?: number | string;
  };
};

type UpcomingScheduleResource = {
  data?: {
    id?: string;
    attributes?: {
      type?: string;
      days?: string | null;
      lineup?: Array<{
        amount?: number | string;
        currency?: string;
        generation_at?: number | string;
        receive_at?: number | string;
        transactions?: {
          payments?: { amount?: number | string; count?: number | string; currency?: string };
        };
      }>;
    };
  };
};

export type SettlementPayoutTrace = {
  status: "NOT_APPLICABLE" | "AWAITING_PAYOUT" | "PENDING" | "ON_HOLD" | "IN_TRANSIT" | "DEPOSITED" | "RETURNED" | "CANCELLED" | "UNAVAILABLE";
  payoutId: string | null;
  transactionId: string | null;
  grossAmount: number | null;
  netAmount: number | null;
  expectedAt: string | null;
  provider: string | null;
  scheduleAmount: number | null;
  scheduleTransactionCount: number | null;
  scheduleType: string | null;
  exactMatch: boolean;
  note: string;
};

export type PayMongoSettlementTrace = {
  requestId: string;
  homeownerName: string;
  property: string;
  referenceNumber: string;
  checkoutId: string | null;
  gatewayPaymentId: string | null;
  gatewayStatus: string;
  financeStatus: "RECONCILED" | "NOT_POSTED";
  liveMode: boolean | null;
  createdAt: string;
  paidAt: string | null;
  amounts: {
    hoaPrincipal: number;
    platformConvenienceFee: number;
    processingFee: number;
    totalCustomerPaid: number;
  };
  routing: {
    status: "NOT_APPLICABLE" | "VERIFIED" | "RECORDED" | "NOT_CONFIGURED" | "MISMATCH" | "UNAVAILABLE";
    childAccount: string;
    parentAccount: string | null;
    note: string;
  };
  parentPayout: SettlementPayoutTrace;
  childPayout: SettlementPayoutTrace;
  providerAvailable: boolean;
};

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function positiveNumber(...values: unknown[]) {
  for (const value of values) {
    const parsed = numberValue(value);
    if (parsed > 0) return parsed;
  }
  return 0;
}

function timestampIso(value: unknown) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

function maskOrganizationId(value: string) {
  const clean = value.trim();
  if (!clean.startsWith("org_") || clean.length < 12) return "Not configured";
  return `${clean.slice(0, 8)}…${clean.slice(-4)}`;
}

function requiredSecret() {
  return process.env[SECRET_KEY_ENV]?.trim() || "";
}

function basicHeaders(secret: string, accountId?: string) {
  return {
    Authorization: `Basic ${Buffer.from(`${secret}:`).toString("base64")}`,
    Accept: "application/json",
    ...(accountId ? { "Account-ID": accountId } : {}),
  };
}

async function paymongoGet<T>(path: string, secret: string, accountId?: string): Promise<T | null> {
  const response = await fetch(`${PAYMONGO_API}${path}`, {
    headers: basicHeaders(secret, accountId),
    cache: "no-store",
  });
  if (!response.ok) return null;
  return await response.json().catch(() => null) as T | null;
}

function unavailablePayout(note: string): SettlementPayoutTrace {
  return {
    status: "UNAVAILABLE",
    payoutId: null,
    transactionId: null,
    grossAmount: null,
    netAmount: null,
    expectedAt: null,
    provider: null,
    scheduleAmount: null,
    scheduleTransactionCount: null,
    scheduleType: null,
    exactMatch: false,
    note,
  };
}

function payoutStatus(value: unknown): SettlementPayoutTrace["status"] {
  switch (String(value || "").toLowerCase()) {
    case "pending": return "PENDING";
    case "on_hold": return "ON_HOLD";
    case "in_transit": return "IN_TRANSIT";
    case "deposited": return "DEPOSITED";
    case "returned": return "RETURNED";
    case "cancelled": return "CANCELLED";
    default: return "UNAVAILABLE";
  }
}

async function upcomingSchedule(secret: string, organizationId: string) {
  const resource = await paymongoGet<UpcomingScheduleResource>(
    `/merchants/${encodeURIComponent(organizationId)}/schedules`,
    secret,
  );
  const attributes = resource?.data?.attributes;
  const next = attributes?.lineup?.[0];
  if (!next) return null;
  return {
    amount: numberValue(next.amount) / 100,
    transactionCount: Math.max(0, Math.trunc(numberValue(next.transactions?.payments?.count))),
    expectedAt: timestampIso(next.receive_at),
    scheduleType: attributes?.type || null,
  };
}

async function findPayoutForPayment(input: {
  secret: string;
  organizationId: string;
  paymentId: string;
  transactionTypes: string[];
  role: "parent" | "child";
}): Promise<SettlementPayoutTrace> {
  const query = new URLSearchParams({
    search: input.organizationId,
    limit: "20",
    sort_by: "created_at",
    order: "desc",
  });
  const list = await paymongoGet<{ data?: PayoutResource[] }>(`/payouts?${query.toString()}`, input.secret);
  const payouts = Array.isArray(list?.data)
    ? list.data.filter((item) => item.attributes?.organization?.id === input.organizationId).slice(0, 20)
    : [];

  const transactionGroups = await Promise.all(payouts.map(async (payout) => {
    if (!payout.id?.startsWith("po_")) return { payout, transactions: [] as PayoutTransaction[] };
    const response = await paymongoGet<{ data?: PayoutTransaction[] }>(
      `/payouts/${encodeURIComponent(payout.id)}/transactions?limit=100`,
      input.secret,
    );
    return { payout, transactions: Array.isArray(response?.data) ? response.data : [] };
  }));

  for (const group of transactionGroups) {
    const transaction = group.transactions.find((item) => {
      const attributes = item.attributes || {};
      const paymentMatches = item.id === input.paymentId || attributes.payment_id === input.paymentId;
      return paymentMatches
        && attributes.organization_id === input.organizationId
        && input.transactionTypes.includes(String(item.type || "").toLowerCase());
    });
    if (!transaction) continue;
    const attributes = group.payout.attributes || {};
    const transactionAttributes = transaction.attributes || {};
    return {
      status: payoutStatus(attributes.status),
      payoutId: group.payout.id || null,
      transactionId: transaction.id || null,
      grossAmount: numberValue(transactionAttributes.amount) / 100,
      netAmount: numberValue(transactionAttributes.net_amount) / 100,
      expectedAt: timestampIso(attributes.status_updated_at || attributes.created_at),
      provider: attributes.provider || null,
      scheduleAmount: null,
      scheduleTransactionCount: null,
      scheduleType: null,
      exactMatch: true,
      note: input.role === "parent"
        ? "Matched the original PayMongo Payment ID to this platform-fee payout transaction."
        : "Matched the original PayMongo Payment ID to this tenant payout transaction.",
    };
  }

  const schedule = await upcomingSchedule(input.secret, input.organizationId);
  if (schedule) {
    return {
      status: "AWAITING_PAYOUT",
      payoutId: null,
      transactionId: null,
      grossAmount: null,
      netAmount: null,
      expectedAt: schedule.expectedAt,
      provider: null,
      scheduleAmount: schedule.amount,
      scheduleTransactionCount: schedule.transactionCount,
      scheduleType: schedule.scheduleType,
      exactMatch: false,
      note: "No generated payout contains this Payment ID yet. The date and amount shown are the account's next aggregate payout estimate, not proof that this individual payment is included.",
    };
  }

  return unavailablePayout("No generated payout or upcoming schedule could be retrieved for this account.");
}

async function loadLeader(requestId: string, tenantId: string) {
  const initial = await prisma.paymentRequest.findFirst({
    where: { id: requestId, tenantId, proofContentType: PAYMONGO_PAYMENT_REQUEST_MARKER },
    include: { homeowner: { include: { user: true } } },
  });
  if (!initial) return null;
  const leaderId = paymongoBatchId(initial.description, initial.id);
  if (leaderId === initial.id) return initial;
  return await prisma.paymentRequest.findFirst({
    where: {
      id: leaderId,
      tenantId,
      homeownerId: initial.homeownerId,
      proofContentType: PAYMONGO_PAYMENT_REQUEST_MARKER,
    },
    include: { homeowner: { include: { user: true } } },
  });
}

async function loadBatch(leader: NonNullable<Awaited<ReturnType<typeof loadLeader>>>) {
  const isBatch = leader.type === PaymentRequestType.MONTHLY_DUES && leader.description === paymongoBatchDescription(leader.id);
  if (!isBatch) return [leader];
  const rows = await prisma.paymentRequest.findMany({
    where: {
      tenantId: leader.tenantId,
      homeownerId: leader.homeownerId,
      type: PaymentRequestType.MONTHLY_DUES,
      description: paymongoBatchDescription(leader.id),
      proofContentType: PAYMONGO_PAYMENT_REQUEST_MARKER,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return rows.length ? rows : [leader];
}

export async function getTenantPayMongoSettlementTrace(input: {
  tenantId: string;
  requestId: string;
}): Promise<PayMongoSettlementTrace | null> {
  const leader = await loadLeader(input.requestId, input.tenantId);
  if (!leader) return null;
  const batch = await loadBatch(leader);
  if (batch.some((item) => item.tenantId !== input.tenantId || item.homeownerId !== leader.homeownerId)) return null;

  const audits = await prisma.auditLog.findMany({
    where: {
      tenantId: input.tenantId,
      entityType: "PaymentRequest",
      entityId: leader.id,
      action: {
        in: [
          "CREATE_PAYMONGO_HOMEOWNER_CHECKOUT",
          "PAYMONGO_HOMEOWNER_PAYMENT_CONFIRMED",
          "PAYMONGO_HOMEOWNER_PAYMENT_RECONCILED",
          "PAYMONGO_HOMEOWNER_PAYMENT_POST_FAILED",
        ],
      },
    },
    orderBy: { createdAt: "desc" },
    select: { action: true, correlationId: true, metadata: true },
  });
  const createAudit = audits.find((item) => item.action === "CREATE_PAYMONGO_HOMEOWNER_CHECKOUT");
  const confirmationAudit = audits.find((item) => ["PAYMONGO_HOMEOWNER_PAYMENT_CONFIRMED", "PAYMONGO_HOMEOWNER_PAYMENT_RECONCILED", "PAYMONGO_HOMEOWNER_PAYMENT_POST_FAILED"].includes(item.action));
  const createMetadata = record(createAudit?.metadata);
  const confirmationMetadata = record(confirmationAudit?.metadata);
  const checkoutId = paymongoCheckoutSessionId(leader.reviewRemarks)
    || String(createMetadata.checkoutId || createAudit?.correlationId || confirmationMetadata.checkoutId || "").trim();
  const linkedAccountId = leader.proofFileName?.trim() || String(createMetadata.linkedAccountId || confirmationMetadata.linkedAccountId || "").trim();
  const parentAccountId = process.env[PAYMONGO_HOMEOWNER_PARENT_ACCOUNT_ENV]?.trim() || "";
  const secret = requiredSecret();

  let checkout: CheckoutResource | null = null;
  if (secret && checkoutId.startsWith("cs_") && linkedAccountId.startsWith("org_")) {
    const response = await paymongoGet<{ data?: CheckoutResource }>(
      `/checkout_sessions/${encodeURIComponent(checkoutId)}`,
      secret,
      linkedAccountId,
    );
    if (response?.data?.id === checkoutId) checkout = response.data;
  }

  const checkoutAttributes = checkout?.attributes || {};
  const checkoutMetadata = record(checkoutAttributes.metadata);
  const paidPayment = checkoutAttributes.payments?.find((item) => String(item.attributes?.status || "").toLowerCase() === "paid")
    || checkoutAttributes.payments?.[0];
  const gatewayPaymentId = String(paidPayment?.id || confirmationMetadata.gatewayPaymentId || "").trim();
  const checkoutFeeSnapshot = parseCheckoutFeeMetadata(checkoutMetadata);
  const hoaPrincipal = positiveNumber(
    confirmationMetadata.hoaPrincipalAmount,
    createMetadata.hoaPrincipalAmount,
    checkoutFeeSnapshot.principalCentavos / 100,
    batch.reduce((sum, item) => sum + Number(item.amount), 0),
  );
  const platformConvenienceFee = positiveNumber(
    confirmationMetadata.platformConvenienceFeeAmount,
    createMetadata.platformConvenienceFeeAmount,
    checkoutFeeSnapshot.platformFeeCentavos / 100,
  );
  const processingFee = positiveNumber(
    confirmationMetadata.paymongoProcessingFeeAmount,
    confirmationMetadata.processingFeeAmount,
    checkoutFeeSnapshot.passOnFees
      ? positiveNumber(paidPayment?.attributes?.amount) / 100 - checkoutFeeSnapshot.baseChargeCentavos / 100
      : 0,
  );
  const totalCustomerPaid = positiveNumber(
    confirmationMetadata.totalCustomerPaid,
    positiveNumber(paidPayment?.attributes?.amount) / 100,
    hoaPrincipal + platformConvenienceFee + Math.max(0, processingFee),
  );

  const splitPayment = checkoutAttributes.split_payment;
  const expectedFeeCentavos = Math.round(platformConvenienceFee * 100);
  const providerRecipientMatches = Boolean(
    splitPayment
    && splitPayment.transfer_to === linkedAccountId
    && splitPayment.recipients?.some((recipient) => recipient.merchant_id === parentAccountId
      && String(recipient.split_type || "").toLowerCase() === "fixed"
      && numberValue(recipient.value) === expectedFeeCentavos),
  );
  const recordedRecipient = String(createMetadata.platformFeeRecipientAccountId || checkoutMetadata.platformFeeRecipientAccountId || "").trim();
  const recordedRoutingMatches = Boolean(parentAccountId && recordedRecipient === parentAccountId && linkedAccountId.startsWith("org_"));
  const routing = platformConvenienceFee <= 0
    ? {
      status: "NOT_APPLICABLE" as const,
      note: "This checkout has no HOAHub platform convenience fee, so no parent split was requested.",
    }
    : !parentAccountId.startsWith("org_")
      ? {
        status: "NOT_CONFIGURED" as const,
        note: "The platform parent organization ID is not configured in the deployment.",
      }
      : providerRecipientMatches
        ? {
          status: "VERIFIED" as const,
          note: "PayMongo returned the expected child transfer and fixed parent-fee recipient.",
        }
        : splitPayment
          ? {
            status: "MISMATCH" as const,
            note: "PayMongo returned split routing that does not match HOAHub's expected child and parent accounts.",
          }
          : recordedRoutingMatches
            ? {
              status: "RECORDED" as const,
              note: "HOAHub recorded the expected split request, but the retrieved Checkout resource did not echo split details.",
            }
            : {
              status: "UNAVAILABLE" as const,
              note: "No provider split response or matching HOAHub routing snapshot is available for this checkout.",
            };

  let parentPayout = platformConvenienceFee <= 0
    ? { ...unavailablePayout("No platform fee exists for this checkout."), status: "NOT_APPLICABLE" as const }
    : unavailablePayout("A paid gateway Payment ID is required before the parent payout can be traced.");
  let childPayout = unavailablePayout("A paid gateway Payment ID is required before the child payout can be traced.");
  if (secret && gatewayPaymentId.startsWith("pay_")) {
    const lookups: Array<Promise<SettlementPayoutTrace>> = [];
    if (platformConvenienceFee > 0 && parentAccountId.startsWith("org_")) {
      lookups.push(findPayoutForPayment({
        secret,
        organizationId: parentAccountId,
        paymentId: gatewayPaymentId,
        transactionTypes: ["split_payment"],
        role: "parent",
      }));
    }
    if (linkedAccountId.startsWith("org_")) {
      lookups.push(findPayoutForPayment({
        secret,
        organizationId: linkedAccountId,
        paymentId: gatewayPaymentId,
        transactionTypes: ["payment", "split_payment"],
        role: "child",
      }));
    }
    const resolved = await Promise.all(lookups);
    let index = 0;
    if (platformConvenienceFee > 0 && parentAccountId.startsWith("org_")) parentPayout = resolved[index++];
    if (linkedAccountId.startsWith("org_")) childPayout = resolved[index];
  }

  const paidAt = timestampIso(paidPayment?.attributes?.paid_at) || String(confirmationMetadata.paidAt || "").trim() || null;
  const gatewayStatus = String(paidPayment?.attributes?.status || checkoutAttributes.status || "Unavailable").toUpperCase();
  return {
    requestId: leader.id,
    homeownerName: leader.homeowner.user.name,
    property: `Block ${leader.homeowner.block} · Lot ${leader.homeowner.lot}`,
    referenceNumber: leader.referenceNumber || `HOP-${leader.id}`,
    checkoutId: checkoutId.startsWith("cs_") ? checkoutId : null,
    gatewayPaymentId: gatewayPaymentId.startsWith("pay_") ? gatewayPaymentId : null,
    gatewayStatus,
    financeStatus: batch.every((item) => item.status === PaymentRequestStatus.APPROVED) ? "RECONCILED" : "NOT_POSTED",
    liveMode: typeof checkoutAttributes.livemode === "boolean" ? checkoutAttributes.livemode : null,
    createdAt: leader.createdAt.toISOString(),
    paidAt,
    amounts: {
      hoaPrincipal,
      platformConvenienceFee,
      processingFee: Math.max(0, processingFee),
      totalCustomerPaid,
    },
    routing: {
      ...routing,
      childAccount: maskOrganizationId(linkedAccountId),
      parentAccount: parentAccountId.startsWith("org_") ? maskOrganizationId(parentAccountId) : null,
    },
    parentPayout,
    childPayout,
    providerAvailable: Boolean(checkout),
  };
}
