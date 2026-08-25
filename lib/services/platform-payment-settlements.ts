import "server-only";

import { platformPrisma as prisma } from "@/lib/db";

const PAYMONGO_API_ROOT = "https://api.paymongo.com/v1";
const PAYMONGO_SECRET_ENV = "PAYMONGO_HOMEOWNER_SECRET_KEY";
const PAYMONGO_PARENT_ACCOUNT_ENV = "PAYMONGO_HOMEOWNER_PARENT_ACCOUNT_ID";
const PAYMENT_CONFIRMATION_ACTION = "PAYMONGO_HOMEOWNER_PAYMENT_CONFIRMED";
const MAX_AUDIT_ROWS = 75;
const MAX_PAYOUT_PAGES = 3;
const PAYOUT_PAGE_SIZE = 20;

type AnyRecord = Record<string, unknown>;

type PayMongoEnvelope = {
  data?: unknown;
  errors?: Array<{ detail?: string }>;
  pagination?: { next_cursor?: string | null };
};

type ParentPayout = {
  id: string;
  status: string;
  createdAt: Date | null;
  statusUpdatedAt: Date | null;
  lastTransferStatus: string;
  referenceNumber: string;
};

type ParentPayoutMatch = ParentPayout & {
  splitTransactionId: string;
  splitOrganizationId: string;
};

type ChildPaymentSnapshot = {
  status: string;
  sourceType: string;
  availableAt: Date | null;
  creditedAt: Date | null;
  error: string | null;
};

export type PlatformSettlementStage =
  | "Clearing"
  | "Available / awaiting payout"
  | "Payout pending"
  | "In transit"
  | "Deposited"
  | "Payout on hold"
  | "Payout returned"
  | "Payout cancelled"
  | "Payment confirmed"
  | "Verification unavailable";

export type PlatformSettlementRow = {
  auditId: string;
  tenantId: string;
  tenantName: string;
  confirmedAt: Date;
  gatewayPaymentId: string;
  checkoutId: string;
  linkedAccountId: string;
  feeAmountPesos: number;
  totalCustomerPaidPesos: number;
  paymentStatus: string;
  paymentSourceType: string;
  availableAt: Date | null;
  creditedAt: Date | null;
  payoutId: string;
  payoutStatus: string;
  payoutStatusUpdatedAt: Date | null;
  payoutReferenceNumber: string;
  splitTransactionId: string;
  stage: PlatformSettlementStage;
  reconciliationError: string | null;
};

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateFromUnix(value: unknown) {
  const seconds = numberValue(value);
  return seconds > 0 ? new Date(seconds * 1000) : null;
}

function paymongoError(payload: PayMongoEnvelope | null, fallback: string) {
  return payload?.errors?.[0]?.detail?.trim() || fallback;
}

function requiredPayMongoConfig() {
  const secretKey = process.env[PAYMONGO_SECRET_ENV]?.trim() || "";
  const parentAccountId = process.env[PAYMONGO_PARENT_ACCOUNT_ENV]?.trim() || "";
  if (!secretKey) return { ok: false as const, parentAccountId, error: `${PAYMONGO_SECRET_ENV} is not configured.` };
  if (!parentAccountId.startsWith("org_")) return { ok: false as const, parentAccountId, error: `${PAYMONGO_PARENT_ACCOUNT_ENV} is not configured with a valid PayMongo organization ID.` };
  return { ok: true as const, secretKey, parentAccountId };
}

function paymongoHeaders(secretKey: string, accountId?: string) {
  return {
    Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`,
    "Content-Type": "application/json",
    ...(accountId ? { "Account-ID": accountId } : {}),
  };
}

async function paymongoGet(url: string | URL, secretKey: string, accountId?: string) {
  try {
    const response = await fetch(url, {
      headers: paymongoHeaders(secretKey, accountId),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    const payload = await response.json().catch(() => null) as PayMongoEnvelope | null;
    if (!response.ok) return { ok: false as const, error: paymongoError(payload, `PayMongo request failed with HTTP ${response.status}.`), payload };
    return { ok: true as const, payload };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "PayMongo request failed.", payload: null };
  }
}

async function mapInBatches<T, R>(items: T[], batchSize: number, worker: (item: T) => Promise<R>) {
  const results: R[] = [];
  for (let index = 0; index < items.length; index += batchSize) {
    results.push(...await Promise.all(items.slice(index, index + batchSize).map(worker)));
  }
  return results;
}

async function loadTrackedFeeEvents() {
  const events = await prisma.auditLog.findMany({
    where: {
      module: "PAYMENTS",
      action: PAYMENT_CONFIRMATION_ACTION,
    },
    orderBy: { createdAt: "desc" },
    take: MAX_AUDIT_ROWS,
    select: {
      id: true,
      tenantId: true,
      createdAt: true,
      metadata: true,
    },
  });

  return events.flatMap((event) => {
    const metadata = asRecord(event.metadata);
    const gatewayPaymentId = stringValue(metadata.gatewayPaymentId);
    const linkedAccountId = stringValue(metadata.linkedAccountId);
    const feeAmountPesos = numberValue(metadata.platformConvenienceFeeAmount);
    if (!gatewayPaymentId.startsWith("pay_") || !linkedAccountId.startsWith("org_") || feeAmountPesos <= 0) return [];
    return [{
      auditId: event.id,
      tenantId: event.tenantId,
      confirmedAt: event.createdAt,
      gatewayPaymentId,
      checkoutId: stringValue(metadata.checkoutId),
      linkedAccountId,
      feeAmountPesos,
      totalCustomerPaidPesos: numberValue(metadata.totalCustomerPaid),
    }];
  });
}

function parseParentPayout(resource: unknown, parentAccountId: string): ParentPayout | null {
  const payout = asRecord(resource);
  const id = stringValue(payout.id);
  const attributes = asRecord(payout.attributes);
  const organization = asRecord(attributes.organization);
  const organizationId = stringValue(organization.id);
  if (!id.startsWith("po_") || (organizationId && organizationId !== parentAccountId)) return null;
  const transfer = asRecord(attributes.last_payout_transfer);
  return {
    id,
    status: stringValue(attributes.status).toLowerCase(),
    createdAt: dateFromUnix(attributes.created_at),
    statusUpdatedAt: dateFromUnix(attributes.status_updated_at || attributes.updated_at),
    lastTransferStatus: stringValue(transfer.status).toLowerCase(),
    referenceNumber: stringValue(transfer.provider_reference_number || transfer.reference_number),
  };
}

async function listParentPayouts(secretKey: string, parentAccountId: string, earliestTrackedAt: Date | null) {
  const payouts: ParentPayout[] = [];
  let after = "";
  for (let page = 0; page < MAX_PAYOUT_PAGES; page += 1) {
    const url = new URL(`${PAYMONGO_API_ROOT}/payouts`);
    url.searchParams.set("limit", String(PAYOUT_PAGE_SIZE));
    url.searchParams.set("sort_by", "created_at");
    url.searchParams.set("order", "desc");
    if (after) url.searchParams.set("after", after);
    const result = await paymongoGet(url, secretKey);
    if (!result.ok) return { payouts, error: result.error };
    const pageRows = Array.isArray(result.payload?.data) ? result.payload.data : [];
    payouts.push(...pageRows.map((row) => parseParentPayout(row, parentAccountId)).filter((row): row is ParentPayout => Boolean(row)));
    const nextCursor = stringValue(result.payload?.pagination?.next_cursor);
    if (!nextCursor || !pageRows.length) break;
    if (earliestTrackedAt) {
      const oldest = payouts[payouts.length - 1]?.createdAt;
      const searchFloor = new Date(earliestTrackedAt.getTime() - 7 * 24 * 60 * 60 * 1000);
      if (oldest && oldest <= searchFloor) break;
    }
    after = nextCursor;
  }
  return { payouts, error: null as string | null };
}

async function mapParentSplitTransactions(
  payouts: ParentPayout[],
  trackedPaymentIds: Set<string>,
  secretKey: string,
) {
  const matches = new Map<string, ParentPayoutMatch>();
  const errors: string[] = [];
  await mapInBatches(payouts, 4, async (payout) => {
    const url = new URL(`${PAYMONGO_API_ROOT}/payouts/${encodeURIComponent(payout.id)}/transactions`);
    url.searchParams.set("limit", "100");
    const result = await paymongoGet(url, secretKey);
    if (!result.ok) {
      errors.push(`${payout.id}: ${result.error}`);
      return;
    }
    const transactions = Array.isArray(result.payload?.data) ? result.payload.data : [];
    for (const transaction of transactions) {
      const resource = asRecord(transaction);
      if (stringValue(resource.type) !== "split_payment") continue;
      const attributes = asRecord(resource.attributes);
      const paymentId = stringValue(attributes.payment_id);
      if (!trackedPaymentIds.has(paymentId) || matches.has(paymentId)) continue;
      matches.set(paymentId, {
        ...payout,
        splitTransactionId: stringValue(resource.id),
        splitOrganizationId: stringValue(attributes.organization_id),
      });
    }
  });
  return { matches, error: errors.length ? errors.slice(0, 3).join(" | ") : null };
}

async function retrieveChildPayment(paymentId: string, linkedAccountId: string, secretKey: string): Promise<ChildPaymentSnapshot> {
  const result = await paymongoGet(`${PAYMONGO_API_ROOT}/payments/${encodeURIComponent(paymentId)}`, secretKey, linkedAccountId);
  if (!result.ok) {
    return { status: "", sourceType: "", availableAt: null, creditedAt: null, error: result.error };
  }
  const resource = asRecord(result.payload?.data);
  const attributes = asRecord(resource.attributes);
  const source = asRecord(attributes.source);
  return {
    status: stringValue(attributes.status).toLowerCase(),
    sourceType: stringValue(source.type).toLowerCase(),
    availableAt: dateFromUnix(attributes.available_at),
    creditedAt: dateFromUnix(attributes.credited_at),
    error: null,
  };
}

function settlementStage(payout: ParentPayoutMatch | undefined, payment: ChildPaymentSnapshot | undefined, now: Date): PlatformSettlementStage {
  if (payout) {
    if (payout.status === "deposited") return "Deposited";
    if (payout.status === "in_transit") return "In transit";
    if (payout.status === "pending") return "Payout pending";
    if (payout.status === "on_hold") return "Payout on hold";
    if (payout.status === "returned") return "Payout returned";
    if (payout.status === "cancelled") return "Payout cancelled";
    return "Payout pending";
  }
  if (payment?.error) return "Verification unavailable";
  if (payment?.availableAt && payment.availableAt > now) return "Clearing";
  if (payment?.availableAt || payment?.creditedAt) return "Available / awaiting payout";
  return "Payment confirmed";
}

export async function getPlatformPaymentSettlements() {
  const tracked = await loadTrackedFeeEvents();
  const tenantIds = [...new Set(tracked.map((row) => row.tenantId))];
  const tenants = tenantIds.length
    ? await prisma.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true } })
    : [];
  const tenantNames = new Map(tenants.map((tenant) => [tenant.id, tenant.name]));
  const config = requiredPayMongoConfig();
  const fetchedAt = new Date();

  if (!config.ok) {
    const rows: PlatformSettlementRow[] = tracked.map((row) => ({
      ...row,
      tenantName: tenantNames.get(row.tenantId) || "Tenant",
      paymentStatus: "",
      paymentSourceType: "",
      availableAt: null,
      creditedAt: null,
      payoutId: "",
      payoutStatus: "",
      payoutStatusUpdatedAt: null,
      payoutReferenceNumber: "",
      splitTransactionId: "",
      stage: "Verification unavailable",
      reconciliationError: config.error,
    }));
    return summarize(rows, config.parentAccountId, fetchedAt, config.error);
  }

  const trackedPaymentIds = new Set(tracked.map((row) => row.gatewayPaymentId));
  const earliestTrackedAt = tracked.length ? tracked[tracked.length - 1].confirmedAt : null;
  const payoutResult = await listParentPayouts(config.secretKey, config.parentAccountId, earliestTrackedAt);
  const splitResult = await mapParentSplitTransactions(payoutResult.payouts, trackedPaymentIds, config.secretKey);
  const unmatched = tracked.filter((row) => !splitResult.matches.has(row.gatewayPaymentId));
  const paymentSnapshots = new Map<string, ChildPaymentSnapshot>();
  const fetchedPayments = await mapInBatches(unmatched, 5, async (row) => ({
    paymentId: row.gatewayPaymentId,
    snapshot: await retrieveChildPayment(row.gatewayPaymentId, row.linkedAccountId, config.secretKey),
  }));
  for (const item of fetchedPayments) paymentSnapshots.set(item.paymentId, item.snapshot);

  const rows: PlatformSettlementRow[] = tracked.map((row) => {
    const payout = splitResult.matches.get(row.gatewayPaymentId);
    const payment = paymentSnapshots.get(row.gatewayPaymentId);
    return {
      ...row,
      tenantName: tenantNames.get(row.tenantId) || "Tenant",
      paymentStatus: payment?.status || "paid",
      paymentSourceType: payment?.sourceType || "",
      availableAt: payment?.availableAt || null,
      creditedAt: payment?.creditedAt || null,
      payoutId: payout?.id || "",
      payoutStatus: payout?.status || "",
      payoutStatusUpdatedAt: payout?.statusUpdatedAt || null,
      payoutReferenceNumber: payout?.referenceNumber || "",
      splitTransactionId: payout?.splitTransactionId || "",
      stage: settlementStage(payout, payment, fetchedAt),
      reconciliationError: payment?.error || null,
    };
  });

  const serviceError = payoutResult.error || splitResult.error;
  return summarize(rows, config.parentAccountId, fetchedAt, serviceError);
}

function summarize(rows: PlatformSettlementRow[], parentAccountId: string, fetchedAt: Date, serviceError: string | null) {
  const trackedFeePesos = rows.reduce((sum, row) => sum + row.feeAmountPesos, 0);
  const stages = (names: PlatformSettlementStage[]) => rows.filter((row) => names.includes(row.stage)).length;
  return {
    rows,
    parentAccountId,
    fetchedAt,
    serviceError,
    metrics: {
      trackedCount: rows.length,
      trackedFeePesos,
      clearingCount: stages(["Clearing"]),
      awaitingPayoutCount: stages(["Available / awaiting payout", "Payment confirmed"]),
      payoutInProgressCount: stages(["Payout pending", "In transit", "Payout on hold"]),
      depositedCount: stages(["Deposited"]),
      attentionCount: stages(["Payout returned", "Payout cancelled", "Verification unavailable"]),
    },
  };
}
