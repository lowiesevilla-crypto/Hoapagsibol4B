import { Role, TenantSubscriptionStatus } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { DOCUMENT_MANAGEMENT_FEATURE_CODE } from "@/lib/document-repository/constants";
import { evaluateRepositoryQuota } from "@/lib/document-repository/quota";
import { prisma } from "@/lib/db";

const blockedSubscriptionStatuses = new Set<TenantSubscriptionStatus>([
  TenantSubscriptionStatus.SUSPENDED,
  TenantSubscriptionStatus.CANCELLED,
  TenantSubscriptionStatus.EXPIRED,
]);

async function requirePlatformOperator() {
  const user = await requireUser();
  if (!user.roles.includes(Role.SUPER_ADMIN) && !user.roles.includes(Role.PLATFORM_ADMIN)) {
    throw new Error("Platform administrator access is required.");
  }
  return user;
}

export type PlatformRepositoryUsageRow = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  subscriptionStatus: TenantSubscriptionStatus;
  planCode: string;
  entitled: boolean;
  enabledSource: "TENANT_OVERRIDE" | "PLAN" | "DISABLED";
  documentCount: number;
  currentDocumentBytes: bigint;
  retainedRevisionBytes: bigint;
  totalBytes: bigint;
  storageLimitMb: number | null;
  quota: ReturnType<typeof evaluateRepositoryQuota>;
};

export async function listPlatformRepositoryUsage(): Promise<PlatformRepositoryUsageRow[]> {
  await requirePlatformOperator();

  const [tenants, plans, planFeatures, tenantOverrides, documentGroups, revisionGroups] = await Promise.all([
    prisma.tenant.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        subscriptionPlan: true,
        subscriptionStatus: true,
        subscriptions: {
          orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
          take: 1,
          select: { planId: true, status: true },
        },
      },
    }),
    prisma.subscriptionPlan.findMany({
      select: { id: true, code: true, active: true, maximumStorageMb: true },
    }),
    prisma.subscriptionPlanFeatureEntitlement.findMany({
      where: { featureCode: DOCUMENT_MANAGEMENT_FEATURE_CODE },
      select: { planId: true, enabled: true, storageLimitMb: true },
    }),
    prisma.tenantFeatureEntitlement.findMany({
      where: { featureCode: DOCUMENT_MANAGEMENT_FEATURE_CODE },
      select: { tenantId: true, enabledOverride: true, storageLimitMbOverride: true },
    }),
    prisma.repositoryDocument.groupBy({
      by: ["tenantId"],
      _sum: { fileSizeBytes: true },
      _count: { _all: true },
    }),
    prisma.repositoryDocumentRevision.groupBy({
      by: ["tenantId"],
      where: { storageKey: { not: null } },
      _sum: { fileSizeBytes: true },
    }),
  ]);

  const plansById = new Map(plans.map((plan) => [plan.id, plan]));
  const plansByCode = new Map(plans.map((plan) => [plan.code, plan]));
  const featuresByPlan = new Map(planFeatures.map((feature) => [feature.planId, feature]));
  const overridesByTenant = new Map(tenantOverrides.map((override) => [override.tenantId, override]));
  const documentsByTenant = new Map(documentGroups.map((group) => [group.tenantId, group]));
  const revisionsByTenant = new Map(revisionGroups.map((group) => [group.tenantId, group]));

  return tenants.map((tenant) => {
    const latestSubscription = tenant.subscriptions[0];
    const plan = latestSubscription ? plansById.get(latestSubscription.planId) : plansByCode.get(tenant.subscriptionPlan);
    const feature = plan ? featuresByPlan.get(plan.id) : undefined;
    const override = overridesByTenant.get(tenant.id);
    const subscriptionStatus = latestSubscription?.status ?? tenant.subscriptionStatus;
    const planEnabled = feature?.enabled ?? false;
    const entitled = Boolean(
      (override?.enabledOverride ?? planEnabled)
      && plan?.active
      && !blockedSubscriptionStatuses.has(subscriptionStatus),
    );
    const storageLimitMb = override?.storageLimitMbOverride ?? feature?.storageLimitMb ?? plan?.maximumStorageMb ?? null;
    const documentUsage = documentsByTenant.get(tenant.id);
    const revisionUsage = revisionsByTenant.get(tenant.id);
    const currentDocumentBytes = documentUsage?._sum.fileSizeBytes ?? BigInt(0);
    const retainedRevisionBytes = revisionUsage?._sum.fileSizeBytes ?? BigInt(0);
    const totalBytes = currentDocumentBytes + retainedRevisionBytes;

    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      tenantSlug: tenant.slug,
      subscriptionStatus,
      planCode: plan?.code ?? tenant.subscriptionPlan,
      entitled,
      enabledSource: override?.enabledOverride != null ? "TENANT_OVERRIDE" : planEnabled ? "PLAN" : "DISABLED",
      documentCount: documentUsage?._count._all ?? 0,
      currentDocumentBytes,
      retainedRevisionBytes,
      totalBytes,
      storageLimitMb,
      quota: evaluateRepositoryQuota({ usedBytes: totalBytes, maximumStorageMb: storageLimitMb }),
    };
  });
}
