import "server-only";

import { Prisma, TenantStatus, TenantSubscriptionStatus } from "@prisma/client";
import { platformPrisma as prisma } from "@/lib/db";

type DeleteManyDelegate = {
  deleteMany(args: { where: Record<string, unknown> }): Promise<{ count: number }>;
};

type PurgeResult = {
  deletedTenantId: string;
  deletedTenantName: string;
  deletedTenantSlug: string;
  deletedByModel: Record<string, number>;
};

function delegateName(modelName: string) {
  return `${modelName.charAt(0).toLowerCase()}${modelName.slice(1)}`;
}

function tenantOwnedModels() {
  return Prisma.dmmf.datamodel.models
    .filter((model) => model.name !== "Tenant" && model.fields.some((field) => field.kind === "scalar" && field.name === "tenantId"))
    .map((model) => model.name);
}

function deleteDelegate(client: unknown, modelName: string) {
  const delegate = (client as unknown as Record<string, unknown>)[delegateName(modelName)] as DeleteManyDelegate | undefined;
  if (!delegate || typeof delegate.deleteMany !== "function") {
    throw new Error(`Tenant purge cannot resolve Prisma model ${modelName}.`);
  }
  return delegate;
}

function isForeignKeyConstraint(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";
}

export async function deactivatePlatformTenant(input: { tenantId: string; actorId: string; actorTenantId: string }) {
  const tenant = await prisma.tenant.findUnique({ where: { id: input.tenantId } });
  if (!tenant) throw new Error("Tenant not found.");
  if (tenant.id === input.actorTenantId) {
    throw new Error("The Platform Admin control tenant cannot deactivate itself. Use a separate Platform Admin control identity to manage this tenant.");
  }
  if (tenant.status === TenantStatus.INACTIVE) return tenant;

  const changedAt = new Date();
  return prisma.$transaction(async (tx) => {
    const revokedSessions = await tx.userSession.updateMany({
      where: { tenantId: tenant.id, revokedAt: null },
      data: { revokedAt: changedAt },
    });
    const updated = await tx.tenant.update({
      where: { id: tenant.id },
      data: { status: TenantStatus.INACTIVE },
    });
    await tx.auditLog.create({
      data: {
        tenantId: tenant.id,
        actorId: input.actorId,
        module: "PLATFORM",
        action: "TENANT_DEACTIVATED",
        entityType: "Tenant",
        entityId: tenant.id,
        metadata: {
          previousStatus: tenant.status,
          subscriptionStatusRetained: true,
          dataRetention: "RETAIN_ALL",
          revokedSessions: revokedSessions.count,
        },
      },
    });
    return updated;
  });
}

export async function reactivatePlatformTenant(input: { tenantId: string; actorId: string }) {
  const tenant = await prisma.tenant.findUnique({ where: { id: input.tenantId } });
  if (!tenant) throw new Error("Tenant not found.");
  if (tenant.status !== TenantStatus.INACTIVE) return tenant;

  return prisma.$transaction(async (tx) => {
    const activeSuspension = await tx.tenantSuspensionRecord.findFirst({
      where: { tenantId: tenant.id, reinstatedAt: null },
      select: { id: true },
    });
    const restoredStatus = activeSuspension || tenant.subscriptionStatus === TenantSubscriptionStatus.SUSPENDED
      ? TenantStatus.SUSPENDED
      : TenantStatus.ACTIVE;
    const updated = await tx.tenant.update({
      where: { id: tenant.id },
      data: { status: restoredStatus },
    });
    await tx.auditLog.create({
      data: {
        tenantId: tenant.id,
        actorId: input.actorId,
        module: "PLATFORM",
        action: "TENANT_REACTIVATED",
        entityType: "Tenant",
        entityId: tenant.id,
        metadata: {
          previousStatus: tenant.status,
          restoredStatus,
          subscriptionStatusRetained: true,
          commercialSuspensionRetained: restoredStatus === TenantStatus.SUSPENDED,
          dataRestoredFromDeletion: false,
        },
      },
    });
    return updated;
  });
}

export async function hardDeletePlatformTenant(input: {
  tenantId: string;
  actorId: string;
  actorTenantId: string;
  confirmationSlug: string;
  confirmationWord: string;
}): Promise<PurgeResult> {
  const tenant = await prisma.tenant.findUnique({ where: { id: input.tenantId } });
  if (!tenant) throw new Error("Tenant not found.");
  if (tenant.id === input.actorTenantId) throw new Error("The Platform Admin control tenant cannot delete itself.");
  if (tenant.status !== TenantStatus.INACTIVE) throw new Error("Deactivate the tenant before permanent deletion.");
  if (input.confirmationSlug.trim() !== tenant.slug) throw new Error(`Type the exact tenant slug (${tenant.slug}) to confirm deletion.`);
  if (input.confirmationWord.trim().toUpperCase() !== "DELETE") throw new Error("Type DELETE to confirm permanent deletion.");

  const models = tenantOwnedModels();
  const result = await prisma.$transaction(async (tx) => {
    // DocumentDefinition intentionally points back to its selected template
    // version and workflow with Restrict FKs, while template sets/versions point
    // to the definition. That creates a valid runtime cycle which must be
    // detached before the tenant-scoped purge can delete the whole graph.
    // This update is strictly scoped to the target tenant and remains inside the
    // same transaction, so another tenant's document configuration is untouched
    // and any later purge failure rolls the detachment back automatically.
    const detachedDocumentDefinitions = await tx.documentDefinition.updateMany({
      where: { tenantId: tenant.id },
      data: {
        assignedTemplateVersionId: null,
        workflowDefinitionId: null,
      },
    });

    const pending = new Set(models);
    const deletedByModel: Record<string, number> = {};

    // Normal HOAHub relationships deliberately use Restrict in important ledgers.
    // A privileged offboarding purge therefore deletes tenant-scoped tables in
    // dependency-safe passes instead of weakening those foreign keys globally.
    while (pending.size > 0) {
      let progress = 0;
      for (const modelName of [...pending]) {
        try {
          const deletion = await deleteDelegate(tx, modelName).deleteMany({ where: { tenantId: tenant.id } });
          deletedByModel[modelName] = deletion.count;
          pending.delete(modelName);
          progress += 1;
        } catch (error) {
          if (!isForeignKeyConstraint(error)) throw error;
        }
      }
      if (progress === 0) {
        throw new Error(`Tenant purge is blocked by protected relations: ${[...pending].join(", ")}. No data was deleted.`);
      }
    }

    await tx.tenant.delete({ where: { id: tenant.id } });

    // Preserve only a platform-control audit event. It belongs to the Platform
    // Admin's control tenant, not to the deleted tenant, and contains no tenant
    // transaction/document payloads.
    await tx.auditLog.create({
      data: {
        tenantId: input.actorTenantId,
        actorId: input.actorId,
        module: "PLATFORM",
        action: "TENANT_HARD_DELETED",
        entityType: "Tenant",
        entityId: tenant.id,
        metadata: {
          deletedTenantId: tenant.id,
          deletedTenantName: tenant.name,
          deletedTenantSlug: tenant.slug,
          deletionMode: "PERMANENT_TENANT_PURGE",
          purgePreparation: {
            detachedDocumentDefinitions: detachedDocumentDefinitions.count,
          },
          deletedByModel,
        },
      },
    });

    return {
      deletedTenantId: tenant.id,
      deletedTenantName: tenant.name,
      deletedTenantSlug: tenant.slug,
      deletedByModel,
    };
  }, { maxWait: 20_000, timeout: 300_000 });

  return result;
}
