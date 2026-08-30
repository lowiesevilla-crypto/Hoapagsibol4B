import "server-only";

import { Prisma } from "@prisma/client";
import { platformPrisma as prisma } from "@/lib/db";
import { paymongoBatchId } from "@/lib/homeowner-paymongo-batch";
import { PAYMONGO_PAYMENT_REQUEST_MARKER } from "@/lib/homeowner-payment-flow";
import { classifyPayMongoGatewayState, paymongoGatewayPresentation } from "@/lib/paymongo-gateway-status";
import {
  getPayMongoCanonicalEvidenceBatch,
  type PayMongoCanonicalReceipt,
} from "@/lib/services/paymongo-canonical-evidence";
import {
  reconcileHomeownerPayMongoCheckout,
  type TenantPayMongoPaymentActivity,
} from "@/lib/services/homeowner-paymongo-reconciliation";

export type PayMongoOnlineReportQuery = {
  q?: string;
  finance?: "ALL" | "RECONCILED" | "NOT_POSTED" | string;
  from?: string;
  to?: string;
  page?: string;
  pageSize?: string;
};

export type PayMongoOnlineReportItem = TenantPayMongoPaymentActivity & {
  receipts: PayMongoCanonicalReceipt[];
};

export type PayMongoOnlineReportPage = {
  items: PayMongoOnlineReportItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  summary: {
    tracked: number;
    reconciled: number;
    open: number;
  };
};

const pageSizes = new Set([25, 50, 100]);
const reconciliationBatchSize = 8;

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseStartDate(value: string | undefined) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00+08:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseEndDate(value: string | undefined) {
  if (!value) return null;
  const parsed = new Date(`${value}T23:59:59.999+08:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function uniqueLeaderIds(rows: Array<{ id: string; description: string | null }>) {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const leaderId = paymongoBatchId(row.description, row.id);
    if (seen.has(leaderId)) continue;
    seen.add(leaderId);
    ids.push(leaderId);
  }
  return ids;
}

export async function getTenantPayMongoOnlineReport(input: {
  tenantId: string;
  query: PayMongoOnlineReportQuery;
}): Promise<PayMongoOnlineReportPage> {
  const q = String(input.query.q || "").trim().slice(0, 120);
  const requestedPageSize = positiveInt(input.query.pageSize, 25);
  const pageSize = pageSizes.has(requestedPageSize) ? requestedPageSize : 25;
  const requestedPage = positiveInt(input.query.page, 1);
  const finance = input.query.finance === "RECONCILED" || input.query.finance === "NOT_POSTED" ? input.query.finance : "ALL";
  const from = parseStartDate(input.query.from);
  const to = parseEndDate(input.query.to);

  const where: Prisma.PaymentRequestWhereInput = {
    tenantId: input.tenantId,
    proofContentType: PAYMONGO_PAYMENT_REQUEST_MARKER,
    ...(from || to ? {
      createdAt: {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      },
    } : {}),
    ...(q ? {
      OR: [
        { id: { contains: q } },
        { referenceNumber: { contains: q } },
        { homeowner: { tenantId: input.tenantId, block: { contains: q } } },
        { homeowner: { tenantId: input.tenantId, lot: { contains: q } } },
        { homeowner: { tenantId: input.tenantId, user: { name: { contains: q } } } },
      ],
    } : {}),
  };

  const candidateRows = await prisma.paymentRequest.findMany({
    where,
    select: { id: true, description: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  const candidateLeaderIds = uniqueLeaderIds(candidateRows);
  if (!candidateLeaderIds.length) {
    return {
      items: [],
      page: 1,
      pageSize,
      total: 0,
      totalPages: 1,
      summary: { tracked: 0, reconciled: 0, open: 0 },
    };
  }

  const [leaders, initialEvidence] = await Promise.all([
    prisma.paymentRequest.findMany({
      where: { tenantId: input.tenantId, id: { in: candidateLeaderIds } },
      select: {
        id: true,
        homeownerId: true,
        referenceNumber: true,
        amount: true,
        status: true,
        reviewRemarks: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    getPayMongoCanonicalEvidenceBatch({ requestIds: candidateLeaderIds, tenantId: input.tenantId }),
  ]);
  const leadersById = new Map(leaders.map((row) => [row.id, row]));
  type LeaderRow = (typeof leaders)[number];

  const orderedLeaders = candidateLeaderIds
    .map((id) => leadersById.get(id))
    .filter((row): row is LeaderRow => Boolean(row));
  const tracked = orderedLeaders.length;
  const initialReconciled = (leader: LeaderRow) => initialEvidence.get(leader.id)?.reconciled === true;
  const filteredLeaders = orderedLeaders.filter((leader) => {
    if (finance === "RECONCILED") return initialReconciled(leader);
    if (finance === "NOT_POSTED") return !initialReconciled(leader);
    return true;
  });

  const total = filteredLeaders.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const pageLeaders = filteredLeaders.slice((page - 1) * pageSize, page * pageSize);

  async function reconcileLeader(leader: LeaderRow) {
    try {
      return await reconcileHomeownerPayMongoCheckout({ requestId: leader.id, tenantId: input.tenantId });
    } catch {
      const state = classifyPayMongoGatewayState({ localStatus: leader.status, reviewRemarks: leader.reviewRemarks });
      const presentation = paymongoGatewayPresentation(state);
      return {
        requestId: leader.id,
        homeownerId: leader.homeownerId,
        referenceNumber: leader.referenceNumber || `HOP-${leader.id}`,
        amount: Number(leader.amount),
        state,
        label: presentation.label,
        tone: presentation.tone,
        localStatus: leader.status,
        financeStatus: "NOT_POSTED" as const,
        canResume: presentation.canResume,
        terminal: presentation.terminal,
        createdAt: leader.createdAt.toISOString(),
        updatedAt: leader.updatedAt.toISOString(),
      };
    }
  }

  const activities: Awaited<ReturnType<typeof reconcileHomeownerPayMongoCheckout>>[] = [];
  for (let index = 0; index < pageLeaders.length; index += reconciliationBatchSize) {
    const batch = pageLeaders.slice(index, index + reconciliationBatchSize);
    activities.push(...await Promise.all(batch.map(reconcileLeader)));
  }

  const pageEvidence = await getPayMongoCanonicalEvidenceBatch({
    requestIds: pageLeaders.map((leader) => leader.id),
    tenantId: input.tenantId,
  });
  const effectiveEvidence = new Map(initialEvidence);
  for (const [requestId, evidence] of pageEvidence) effectiveEvidence.set(requestId, evidence);
  const reconciled = orderedLeaders.filter((leader) => effectiveEvidence.get(leader.id)?.reconciled === true).length;

  const currentHomeownerIds = [...new Set(activities.map((row) => row.homeownerId))];
  const homeowners = currentHomeownerIds.length ? await prisma.homeownerProfile.findMany({
    where: { tenantId: input.tenantId, id: { in: currentHomeownerIds } },
    include: { user: true },
  }) : [];
  const homeownersById = new Map(homeowners.map((homeowner) => [homeowner.id, homeowner]));

  const items: PayMongoOnlineReportItem[] = activities.map((row) => {
    const homeowner = homeownersById.get(row.homeownerId);
    const evidence = pageEvidence.get(row.requestId);
    return {
      ...row,
      financeStatus: evidence?.reconciled ? "RECONCILED" : "NOT_POSTED",
      receipts: evidence?.receipts || [],
      homeownerName: homeowner?.user.name || "Homeowner",
      property: homeowner ? `Block ${homeowner.block} · Lot ${homeowner.lot}` : "Property unavailable",
    };
  });

  return {
    items,
    page,
    pageSize,
    total,
    totalPages,
    summary: { tracked, reconciled, open: tracked - reconciled },
  };
}
