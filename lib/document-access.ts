import "server-only";

import { Role } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getQualifyingHomeownerBalance, resolveDocumentDownloadAccess } from "@/lib/services/document-balance-policy";

export async function getAccessibleGeneratedDocument(id: string, options?: { requireDownload?: boolean }) {
  const user = await requireUser();
  const request = await prisma.documentRequest.findFirst({ where: { id, tenantId: user.tenantId }, include: { homeowner: { include: { user: true } }, definition: true, configuration: true, processedBy: true, approvedBy: true, processedByOfficer: true, approvedByOfficer: true, histories: { include: { actor: true }, orderBy: { createdAt: "asc" } } } });
  if (!request?.generatedContent || !request.documentNumber || !request.verificationCode) notFound();
  if (user.role === Role.HOMEOWNER && request.homeownerId !== user.homeownerProfile?.id) redirect("/portal/documents");
  if (user.role === Role.HOMEOWNER && request.archivedAt) redirect("/portal/documents?error=This%20document%20has%20been%20archived%20by%20the%20HOA%20office.");
  const adminRoles: Role[] = [Role.ADMIN, Role.SYSTEM_ADMIN, Role.HOA_ADMIN, Role.BILLING_MANAGER, Role.PAYROLL_MANAGER, Role.STAFF, Role.SUPER_ADMIN, Role.PLATFORM_ADMIN];
  if (user.role !== Role.HOMEOWNER && !adminRoles.includes(user.role)) redirect("/login");
  const currentOutstandingBalance = await getQualifyingHomeownerBalance(user.tenantId, request.homeownerId);
  const access = resolveDocumentDownloadAccess({ request, currentOutstandingBalance });
  const { downloadAllowed } = access;
  if (options?.requireDownload && !downloadAllowed) {
    await prisma.auditLog.create({ data: { tenantId: user.tenantId, actorId: user.id, module: "DOCUMENTS", action: access.paymentLocked ? "BLOCKED_DOWNLOAD_DOCUMENT_FEE" : "BLOCKED_DOWNLOAD_BALANCE", entityType: "DocumentRequest", entityId: request.id, metadata: { documentNumber: request.documentNumber, currentOutstandingBalance, paymentRequired: request.paymentRequiredSnapshot, outstandingBalancePolicy: access.policy } } });
    redirect(`/documents/${id}?error=${encodeURIComponent(access.message || "Download and printing are not available for this document yet.")}`);
  }
  return { user, request, currentOutstandingBalance, downloadAllowed, access };
}
