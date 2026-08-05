import {
  DocumentOrigin,
  DocumentRequestStatus,
  DocumentType,
  type Prisma,
} from "@prisma/client";
import { requireDocumentTemplateAdmin } from "@/lib/document-template-admin";
import { prisma } from "@/lib/db";
import {
  documentFeePaymentStatusLabel,
  documentRequestPublicReference,
} from "@/lib/services/document-fee-payments";
import { safeCsvCell } from "@/lib/services/document-operations";
import { documentTypeLabel } from "@/lib/services/documents";

const maxExportRows = 10_000;

function validDate(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function endOfDay(value: string) {
  return new Date(`${value}T23:59:59.999Z`);
}

export async function GET(request: Request) {
  const user = await requireDocumentTemplateAdmin();
  const url = new URL(request.url);
  const statusValue = url.searchParams.get("status");
  const typeValue = url.searchParams.get("type");
  const originValue = url.searchParams.get("origin");
  const from = validDate(url.searchParams.get("from"));
  const to = validDate(url.searchParams.get("to"));
  const q = url.searchParams.get("q")?.trim().slice(0, 100) || "";
  const status = Object.values(DocumentRequestStatus).includes(statusValue as DocumentRequestStatus)
    ? statusValue as DocumentRequestStatus
    : undefined;
  const type = Object.values(DocumentType).includes(typeValue as DocumentType)
    ? typeValue as DocumentType
    : undefined;
  const origin = Object.values(DocumentOrigin).includes(originValue as DocumentOrigin)
    ? originValue as DocumentOrigin
    : undefined;

  const where: Prisma.DocumentRequestWhereInput = {
    tenantId: user.tenantId,
    ...(status ? { status } : {}),
    ...(type ? { type } : {}),
    ...(origin ? { origin } : {}),
    ...(from || to ? {
      requestedAt: {
        ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
        ...(to ? { lte: endOfDay(to) } : {}),
      },
    } : {}),
    ...(q ? {
      OR: [
        { documentNumber: { contains: q } },
        { purpose: { contains: q } },
        { homeowner: { user: { name: { contains: q } } } },
        { homeowner: { accountNumber: { contains: q } } },
        { homeowner: { block: { contains: q } } },
        { homeowner: { lot: { contains: q } } },
        { definition: { displayName: { contains: q } } },
        { configuration: { displayName: { contains: q } } },
      ],
    } : {}),
  };

  const rows = await prisma.documentRequest.findMany({
    where,
    include: {
      homeowner: { include: { user: true } },
      definition: true,
      configuration: true,
      paymentRequest: { include: { collection: true } },
      versions: { orderBy: { version: "desc" }, take: 1 },
      generationAttempts: { orderBy: { updatedAt: "desc" }, take: 1 },
    },
    orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
    take: maxExportRows,
  });

  const headers = [
    "Request Reference",
    "Document Number",
    "Document Type",
    "Status",
    "Origin",
    "Homeowner",
    "Account Number",
    "Block",
    "Lot",
    "Purpose",
    "Copies",
    "Fee Amount PHP",
    "Payment Status",
    "Receipt Number",
    "Requested At",
    "Reviewed At",
    "Approved At",
    "Generated At",
    "Issued At",
    "Downloaded At",
    "Archived At",
    "Turnaround Days",
    "Current Version",
    "Issued Version Status",
    "Latest Generation State",
    "Latest Generation Failure",
  ];

  const csvRows = rows.map((row) => {
    const completedAt = row.issuedAt ?? row.generatedAt;
    const turnaroundDays = completedAt
      ? Math.round(Math.max(0, (completedAt.getTime() - row.requestedAt.getTime()) / 86_400_000) * 10) / 10
      : "";
    const currentVersion = row.versions[0];
    const attempt = row.generationAttempts[0];
    return [
      documentRequestPublicReference(row),
      row.documentNumber || currentVersion?.documentNumber || "",
      row.definition?.displayName || row.configuration?.displayName || documentTypeLabel(row.type),
      row.status,
      row.origin,
      row.homeowner.user.name,
      row.homeowner.accountNumber || "",
      row.homeowner.block,
      row.homeowner.lot,
      row.purpose || "",
      row.numberOfCopies,
      Number(row.feeAmountSnapshot).toFixed(2),
      documentFeePaymentStatusLabel(row),
      row.paymentRequest?.collection?.receiptNumber || "",
      row.requestedAt,
      row.reviewedAt,
      row.approvedAt,
      row.generatedAt,
      row.issuedAt,
      row.downloadedAt,
      row.archivedAt,
      turnaroundDays,
      currentVersion?.version ?? row.currentVersion,
      currentVersion?.issuedStatus || "",
      attempt?.state || "",
      attempt?.failureCode
        ? `${attempt.failureCode}${attempt.failureMessage ? `: ${attempt.failureMessage}` : ""}`
        : "",
    ].map(safeCsvCell).join(",");
  });

  const csv = [headers.map(safeCsvCell).join(","), ...csvRows].join("\r\n");
  const date = new Date().toISOString().slice(0, 10);
  return new Response(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="hoahub-document-operations-${date}.csv"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "X-HOA-Export-Rows": String(rows.length),
      "X-HOA-Export-Limit": String(maxExportRows),
    },
  });
}
