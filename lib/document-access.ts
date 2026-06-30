import "server-only";

import { Role } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function getAccessibleGeneratedDocument(id: string, options?: { requireDownload?: boolean }) {
  const user = await requireUser();
  const request = await prisma.documentRequest.findUnique({ where: { id }, include: { homeowner: { include: { user: true } }, processedBy: true, approvedBy: true, processedByOfficer: true, approvedByOfficer: true, histories: { include: { actor: true }, orderBy: { createdAt: "asc" } } } });
  if (!request?.generatedContent || !request.documentNumber || !request.verificationCode) notFound();
  if (user.role === Role.HOMEOWNER && request.homeownerId !== user.homeownerProfile?.id) redirect("/portal/documents");
  if (user.role === Role.HOMEOWNER && request.archivedAt) redirect("/portal/documents?error=This%20document%20has%20been%20archived%20by%20the%20HOA%20office.");
  if (user.role !== Role.HOMEOWNER && user.role !== Role.ADMIN && user.role !== Role.SYSTEM_ADMIN) redirect("/login");
  const unpaid = user.role === Role.HOMEOWNER ? await prisma.bill.aggregate({ where: { homeownerId: request.homeownerId, archivedAt: null, balance: { gt: 0 } }, _sum: { balance: true } }) : null;
  const currentOutstandingBalance = Number(unpaid?._sum.balance ?? 0);
  const downloadAllowed = user.role !== Role.HOMEOWNER || currentOutstandingBalance <= 0 || request.allowDownloadDespiteBalance;
  if (options?.requireDownload && !downloadAllowed) {
    await prisma.auditLog.create({ data: { actorId: user.id, module: "DOCUMENTS", action: "BLOCKED_DOWNLOAD_BALANCE", entityType: "DocumentRequest", entityId: request.id, metadata: { documentNumber: request.documentNumber, currentOutstandingBalance } } });
    redirect(`/documents/${id}?error=${encodeURIComponent(`Download is locked while your outstanding balance of ${currentOutstandingBalance.toFixed(2)} remains unpaid.`)}`);
  }
  return { user, request, currentOutstandingBalance, downloadAllowed };
}
