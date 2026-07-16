import "server-only";

import { Role } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function getAccessibleGeneratedDocument(id: string, options?: { requireDownload?: boolean }) {
  const user = await requireUser();
  const request = await prisma.documentRequest.findFirst({ where: { id, tenantId: user.tenantId }, include: { homeowner: { include: { user: true } }, definition: true, configuration: true, processedBy: true, approvedBy: true, processedByOfficer: true, approvedByOfficer: true, histories: { include: { actor: true }, orderBy: { createdAt: "asc" } } } });
  if (!request?.generatedContent || !request.documentNumber || !request.verificationCode) notFound();
  if (user.role === Role.HOMEOWNER && request.homeownerId !== user.homeownerProfile?.id) redirect("/portal/documents");
  if (user.role === Role.HOMEOWNER && request.archivedAt) redirect("/portal/documents?error=This%20document%20has%20been%20archived%20by%20the%20HOA%20office.");
  const adminRoles: Role[] = [Role.ADMIN, Role.SYSTEM_ADMIN, Role.HOA_ADMIN, Role.BILLING_MANAGER, Role.PAYROLL_MANAGER, Role.STAFF, Role.SUPER_ADMIN, Role.PLATFORM_ADMIN];
  if (user.role !== Role.HOMEOWNER && !adminRoles.includes(user.role)) redirect("/login");
  const unpaid = user.role === Role.HOMEOWNER ? await prisma.bill.aggregate({ where: { tenantId: user.tenantId, homeownerId: request.homeownerId, archivedAt: null, balance: { gt: 0 } }, _sum: { balance: true } }) : null;
  const currentOutstandingBalance = Number(unpaid?._sum.balance ?? 0);
  const paymentLocked = user.role === Role.HOMEOWNER && request.paymentRequiredSnapshot;
  const downloadAllowed = !paymentLocked && (user.role !== Role.HOMEOWNER || currentOutstandingBalance <= 0 || request.allowDownloadDespiteBalance);
  if (options?.requireDownload && !downloadAllowed) {
    await prisma.auditLog.create({ data: { actorId: user.id, module: "DOCUMENTS", action: paymentLocked ? "BLOCKED_DOWNLOAD_DOCUMENT_FEE" : "BLOCKED_DOWNLOAD_BALANCE", entityType: "DocumentRequest", entityId: request.id, metadata: { documentNumber: request.documentNumber, currentOutstandingBalance, paymentRequired: request.paymentRequiredSnapshot } } });
    redirect(`/documents/${id}?error=${encodeURIComponent(paymentLocked ? "Download is locked until document fee payment is confirmed." : `Download is locked while your outstanding balance of ${currentOutstandingBalance.toFixed(2)} remains unpaid.`)}`);
  }
  return { user, request, currentOutstandingBalance, downloadAllowed };
}
