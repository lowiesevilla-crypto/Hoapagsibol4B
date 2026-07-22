import "server-only";

import { DocumentRequestStatus, PaymentRequestStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

const directTenantActionStatuses = [
  DocumentRequestStatus.SUBMITTED,
  DocumentRequestStatus.PAYMENT_CONFIRMED,
  DocumentRequestStatus.PENDING_APPROVAL,
  DocumentRequestStatus.UNDER_REVIEW,
] as const;

export function documentRequestNeedsActionWhere(tenantId: string, now = new Date()): Prisma.DocumentRequestWhereInput {
  return {
    tenantId,
    archivedAt: null,
    OR: [
      { status: { in: [...directTenantActionStatuses] } },
      { status: DocumentRequestStatus.PENDING_PAYMENT, paymentRequest: { status: PaymentRequestStatus.PENDING_REVIEW } },
      {
        status: DocumentRequestStatus.APPROVED,
        OR: [{ currentVersion: 0 }, { generatedContent: null }, { documentNumber: null }],
      },
      {
        status: DocumentRequestStatus.GENERATING,
        updatedAt: { lt: new Date(now.getTime() - 15 * 60 * 1000) },
      },
    ],
  };
}

export async function getActionableDocumentRequestCount(tenantId: string) {
  return prisma.documentRequest.count({ where: documentRequestNeedsActionWhere(tenantId) });
}

