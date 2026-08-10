import { Prisma } from "@prisma/client";
import {
  REPOSITORY_AUDIT_MODULE,
  type RepositoryAuditAction,
} from "@/lib/document-repository/constants";
import { prisma } from "@/lib/db";
import { currentTenantContext } from "@/lib/tenant-context";

export type RepositoryAuditInput = {
  action: RepositoryAuditAction;
  actorId?: string | null;
  documentId?: string | null;
  entityType?: string;
  metadata?: Prisma.InputJsonValue;
  reason?: string | null;
  correlationId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export async function writeRepositoryAudit(input: RepositoryAuditInput) {
  const context = currentTenantContext();
  if (!context) throw new Error("Tenant context is required before writing a Document Management audit event.");

  return prisma.auditLog.create({
    data: {
      tenantId: context.tenantId,
      actorId: input.actorId ?? null,
      module: REPOSITORY_AUDIT_MODULE,
      action: input.action,
      entityType: input.entityType ?? "RepositoryDocument",
      entityId: input.documentId ?? null,
      metadata: input.metadata,
      reason: input.reason ?? null,
      correlationId: input.correlationId ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      aiAction: false,
    },
  });
}
