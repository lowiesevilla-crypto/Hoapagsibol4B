import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { PAYMONGO_PAYMENT_REQUEST_MARKER } from "@/lib/homeowner-payment-flow";
import { money, monthLabel } from "@/lib/utils";

export type PaymentQuery = {
  q?: string;
  homeownerId?: string;
  status?: string;
  paymentType?: string;
  collectionType?: string;
  method?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: string;
  billPage?: string;
  requestPage?: string;
  paymentPage?: string;
  historyPage?: string;
  error?: string;
  success?: string;
  message?: string;
};

export const paymentPageSize = 15;
export const recordBillPageSize = 25;

type AdminActor = { tenantId: string };

export async function getRecordPaymentData(admin: AdminActor, query: PaymentQuery) {
  const q = query.q?.trim() || "";
  const billPage = Math.max(1, Number(query.billPage) || 1);
  const openBillWhere = buildOpenBillWhere(admin.tenantId, q);
  const [openBills, openBillCount] = await Promise.all([
    prisma.bill.findMany({
      where: openBillWhere,
      include: { homeowner: { include: { user: true } } },
      orderBy: [{ dueDate: "asc" }, { billingMonth: "asc" }, { homeowner: { user: { name: "asc" } } }],
      skip: (billPage - 1) * recordBillPageSize,
      take: recordBillPageSize,
    }),
    prisma.bill.count({ where: openBillWhere }),
  ]);
  return {
    q,
    billPage,
    openBillCount,
    billChoices: openBills.map((bill) => ({
      id: bill.id,
      homeownerId: bill.homeownerId,
      homeowner: bill.homeowner.user.name,
      property: `Block ${bill.homeowner.block}, Lot ${bill.homeowner.lot}`,
      month: monthLabel(bill.billingMonth),
      billingMonth: bill.billingMonth.toISOString().slice(0, 10),
      balance: Number(bill.balance),
      balanceLabel: money(bill.balance),
      search: `${bill.homeowner.user.name} ${bill.homeowner.user.email} block ${bill.homeowner.block} lot ${bill.homeowner.lot} account ${bill.homeowner.id} ${bill.id} ${bill.resolutionReference ?? ""} ${monthLabel(bill.billingMonth)}`.toLowerCase(),
    })),
  };
}

export async function getPaymentRequestsData(admin: AdminActor, query: PaymentQuery) {
  const q = query.q?.trim() || "";
  const requestPage = Math.max(1, Number(query.requestPage) || 1);
  const where = buildPaymentRequestWhere(admin.tenantId, query, q);
  const [paymentRequests, requestCount, homeowners] = await Promise.all([
    prisma.paymentRequest.findMany({
      where,
      include: { homeowner: { include: { user: true } }, bill: true, payment: true, collection: true, documentRequest: { include: { definition: true, configuration: true } } },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      skip: (requestPage - 1) * paymentPageSize,
      take: paymentPageSize,
    }),
    prisma.paymentRequest.count({ where }),
    homeownerFilterOptions(admin.tenantId),
  ]);
  return { q, requestPage, requestCount, paymentRequests, homeowners };
}

export async function getActivePaymentsData(admin: AdminActor, query: PaymentQuery) {
  const q = query.q?.trim() || "";
  const paymentPage = Math.max(1, Number(query.paymentPage) || 1);
  const where = buildPaymentWhere(admin.tenantId, query, q);
  const paymentOrder: Prisma.PaymentOrderByWithRelationInput[] = query.sort === "oldest"
    ? [{ paymentDate: "asc" }, { createdAt: "asc" }]
    : query.sort === "amount_high"
      ? [{ amount: "desc" }]
      : [{ paymentDate: "desc" }, { createdAt: "desc" }];
  const [payments, paymentCount, homeowners] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: { homeowner: { include: { user: true } }, bill: true, allocations: { include: { bill: true }, orderBy: { bill: { billingMonth: "asc" } } } },
      orderBy: paymentOrder,
      skip: (paymentPage - 1) * paymentPageSize,
      take: paymentPageSize,
    }),
    prisma.payment.count({ where }),
    homeownerFilterOptions(admin.tenantId),
  ]);
  return { q, paymentPage, paymentCount, payments, homeowners };
}

export async function getPaymentHistoryData(admin: AdminActor, query: PaymentQuery) {
  const q = query.q?.trim() || "";
  const historyPage = Math.max(1, Number(query.historyPage) || 1);
  const where = buildPaymentHistoryWhere(admin.tenantId, query, q);
  const paymentOrder: Prisma.PaymentOrderByWithRelationInput[] = query.sort === "oldest"
    ? [{ paymentDate: "asc" }, { createdAt: "asc" }]
    : query.sort === "amount_high"
      ? [{ amount: "desc" }]
      : [{ paymentDate: "desc" }, { createdAt: "desc" }];
  const [payments, paymentCount, homeowners] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: {
        homeowner: { include: { user: true } },
        processedBy: { include: { employeeProfile: true } },
        voidedBy: true,
        allocations: { include: { bill: true }, orderBy: { bill: { billingMonth: "asc" } } },
      },
      orderBy: paymentOrder,
      skip: (historyPage - 1) * paymentPageSize,
      take: paymentPageSize,
    }),
    prisma.payment.count({ where }),
    homeownerFilterOptions(admin.tenantId),
  ]);
  return { q, historyPage, paymentCount, payments, homeowners };
}

export function preservedEntries(query: PaymentQuery, omit: string[] = []) {
  const omitted = new Set(["error", "success", "message", ...omit]);
  return Object.entries(query).filter(([key, value]) => value && !omitted.has(key)) as string[][];
}

function dateRange(query: PaymentQuery) {
  return {
    ...(query.dateFrom ? { gte: new Date(`${query.dateFrom}T00:00:00.000Z`) } : {}),
    ...(query.dateTo ? { lte: new Date(`${query.dateTo}T23:59:59.999Z`) } : {}),
  };
}

function buildOpenBillWhere(tenantId: string, q: string): Prisma.BillWhereInput {
  const blockLot = parseBlockLotSearch(q);
  return {
    tenantId,
    balance: { gt: 0 },
    archivedAt: null,
    ...(q ? {
      OR: [
        { id: { contains: q } },
        { resolutionReference: { contains: q } },
        { homeownerId: { contains: q } },
        { homeowner: { block: { contains: q } } },
        { homeowner: { lot: { contains: q } } },
        { homeowner: { user: { name: { contains: q } } } },
        { homeowner: { user: { email: { contains: q } } } },
        ...(blockLot ? [{ homeowner: blockLot }] : []),
      ],
    } : {}),
  };
}

function buildPaymentRequestWhere(tenantId: string, query: PaymentQuery, q: string): Prisma.PaymentRequestWhereInput {
  const range = dateRange(query);
  const searchFilter: Prisma.PaymentRequestWhereInput | null = q ? {
    OR: [
      { id: { contains: q } },
      { referenceNumber: { contains: q } },
      { documentRequestId: { contains: q } },
      { documentRequest: { documentNumber: { contains: q } } },
      { documentRequest: { definition: { displayName: { contains: q } } } },
      { bill: { resolutionReference: { contains: q } } },
      ...homeownerSearch(q),
    ],
  } : null;
  return {
    tenantId,
    AND: [
      {
        OR: [
          { proofContentType: null },
          { proofContentType: { not: PAYMONGO_PAYMENT_REQUEST_MARKER } },
        ],
      },
      ...(searchFilter ? [searchFilter] : []),
    ],
    ...(query.homeownerId ? { homeownerId: query.homeownerId } : {}),
    ...(query.status ? { status: query.status as never } : {}),
    ...(query.paymentType ? { type: query.paymentType as never } : {}),
    ...(query.collectionType ? { collectionType: query.collectionType as never } : {}),
    ...(Object.keys(range).length ? { createdAt: range } : {}),
  };
}

function buildPaymentWhere(tenantId: string, query: PaymentQuery, q: string): Prisma.PaymentWhereInput {
  const range = dateRange(query);
  return {
    tenantId,
    status: "ACTIVE",
    ...(query.homeownerId ? { homeownerId: query.homeownerId } : {}),
    ...(query.method ? { method: query.method as never } : {}),
    ...(Object.keys(range).length ? { paymentDate: range } : {}),
    ...(q ? { OR: [{ id: { contains: q } }, { referenceNumber: { contains: q } }, { receiptNumber: { contains: q } }, { paymentCoverageDisplay: { contains: q } }, { bill: { resolutionReference: { contains: q } } }, { allocations: { some: { bill: { resolutionReference: { contains: q } } } } }, ...homeownerSearch(q)] } : {}),
  };
}

function buildPaymentHistoryWhere(tenantId: string, query: PaymentQuery, q: string): Prisma.PaymentWhereInput {
  const range = dateRange(query);
  return {
    tenantId,
    ...(query.homeownerId ? { homeownerId: query.homeownerId } : {}),
    ...(query.method ? { method: query.method as never } : {}),
    ...(Object.keys(range).length ? { paymentDate: range } : {}),
    ...(query.status ? { status: query.status as never } : {}),
    ...(q ? { OR: [{ referenceNumber: { contains: q } }, { receiptNumber: { contains: q } }, { paymentCoverageDisplay: { contains: q } }, { allocations: { some: { bill: { resolutionReference: { contains: q } } } } }, ...homeownerSearch(q)] } : {}),
  };
}

function homeownerSearch(q: string) {
  const blockLot = parseBlockLotSearch(q);
  return [
    { homeowner: { id: { contains: q } } },
    { homeowner: { block: { contains: q } } },
    { homeowner: { lot: { contains: q } } },
    { homeowner: { user: { name: { contains: q } } } },
    { homeowner: { user: { email: { contains: q } } } },
    ...(blockLot ? [{ homeowner: blockLot }] : []),
  ];
}

function parseBlockLotSearch(q: string): Prisma.HomeownerProfileWhereInput | null {
  const block = q.match(/\b(?:block|blk)\s*[:#-]?\s*([a-z0-9-]+)/i)?.[1]?.trim();
  const lot = q.match(/\blot\s*[:#-]?\s*([a-z0-9-]+)/i)?.[1]?.trim();
  if (!block && !lot) return null;
  return {
    ...(block ? { block: { contains: block } } : {}),
    ...(lot ? { lot: { contains: lot } } : {}),
  };
}

function homeownerFilterOptions(tenantId: string) {
  return prisma.homeownerProfile.findMany({
    where: { tenantId, status: "ACTIVE" },
    include: { user: true },
    orderBy: { user: { name: "asc" } },
  });
}
