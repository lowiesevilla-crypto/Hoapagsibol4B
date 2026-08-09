import { TenantSubscriptionStatus } from "@prisma/client";
import { DOCUMENT_MANAGEMENT_FEATURE_CODE, REPOSITORY_DEFAULT_MAX_FILE_BYTES } from "@/lib/document-repository/constants";
import { prisma } from "@/lib/db";
import { currentTenantContext } from "@/lib/tenant-context";

const blockedSubscriptionStatuses = new Set<TenantSubscriptionStatus>([
  TenantSubscriptionStatus.SUSPENDED,
  TenantSubscriptionStatus.CANCELLED,
  TenantSubscriptionStatus.EXPIRED,
]);

export type DocumentManagementEntitlement = {
  featureCode: typeof DOCUMENT_MANAGEMENT_FEATURE_CODE;
  enabled: boolean;
  planId: string | null;
  planCode: string | null;
  subscriptionStatus: TenantSubscriptionStatus | null;
  storageLimitMb: number | null;
  maxFileSizeMb: number;
  retainRevisionBinaries: boolean;
  maxRevisionBinaries: number | null;
  enabledSource: "TENANT_OVERRIDE" | "PLAN" | "DISABLED";
};

function positiveOrZeroInteger(value: number | null | undefined, fallback: number | null) {
  if (value == null) return fallback;
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid Document Management entitlement limit.");
  return value;
}

async function resolvePlan(tenantId: string) {
  const subscription = await prisma.tenantSubscription.findFirst({
    where: { tenantId },
    orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
    select: {
      planId: true,
      status: true,
      plan: { select: { code: true, active: true, maximumStorageMb: true } },
    },
  });
  if (subscription) {
    return {
      planId: subscription.planId,
      planCode: subscription.plan.code,
      planActive: subscription.plan.active,
      maximumStorageMb: subscription.plan.maximumStorageMb,
      subscriptionStatus: subscription.status,
    };
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { subscriptionPlan: true, subscriptionStatus: true },
  });
  if (!tenant) throw new Error("Tenant not found while resolving Document Management entitlement.");

  const plan = await prisma.subscriptionPlan.findFirst({
    where: { code: tenant.subscriptionPlan },
    orderBy: { updatedAt: "desc" },
    select: { id: true, code: true, active: true, maximumStorageMb: true },
  });
  return {
    planId: plan?.id ?? null,
    planCode: plan?.code ?? tenant.subscriptionPlan,
    planActive: plan?.active ?? false,
    maximumStorageMb: plan?.maximumStorageMb ?? null,
    subscriptionStatus: tenant.subscriptionStatus,
  };
}

export async function resolveDocumentManagementEntitlement(tenantId?: string): Promise<DocumentManagementEntitlement> {
  const context = currentTenantContext();
  const effectiveTenantId = tenantId ?? context?.tenantId;
  if (!effectiveTenantId) throw new Error("Tenant context is required for Document Management entitlement resolution.");
  if (context && context.tenantId !== effectiveTenantId) throw new Error("Cross-tenant entitlement lookup blocked.");

  const [planState, tenantOverride] = await Promise.all([
    resolvePlan(effectiveTenantId),
    prisma.tenantFeatureEntitlement.findFirst({
      where: { tenantId: effectiveTenantId, featureCode: DOCUMENT_MANAGEMENT_FEATURE_CODE },
      select: {
        enabledOverride: true,
        storageLimitMbOverride: true,
        maxFileSizeMbOverride: true,
        retainRevisionBinariesOverride: true,
        maxRevisionBinariesOverride: true,
      },
    }),
  ]);

  const planFeature = planState.planId
    ? await prisma.subscriptionPlanFeatureEntitlement.findFirst({
        where: { planId: planState.planId, featureCode: DOCUMENT_MANAGEMENT_FEATURE_CODE },
        select: {
          enabled: true,
          storageLimitMb: true,
          maxFileSizeMb: true,
          retainRevisionBinaries: true,
          maxRevisionBinaries: true,
        },
      })
    : null;

  const planEnabled = planFeature?.enabled ?? false;
  const configuredEnabled = tenantOverride?.enabledOverride ?? planEnabled;
  const subscriptionBlocked = blockedSubscriptionStatuses.has(planState.subscriptionStatus);
  const enabled = Boolean(configuredEnabled && planState.planActive && !subscriptionBlocked);
  const enabledSource = tenantOverride?.enabledOverride != null
    ? "TENANT_OVERRIDE"
    : planEnabled
      ? "PLAN"
      : "DISABLED";

  const defaultMaxFileSizeMb = Math.floor(REPOSITORY_DEFAULT_MAX_FILE_BYTES / 1024 / 1024);
  const storageLimitMb = positiveOrZeroInteger(
    tenantOverride?.storageLimitMbOverride,
    positiveOrZeroInteger(planFeature?.storageLimitMb, planState.maximumStorageMb),
  );
  const maxFileSizeMb = positiveOrZeroInteger(
    tenantOverride?.maxFileSizeMbOverride,
    positiveOrZeroInteger(planFeature?.maxFileSizeMb, defaultMaxFileSizeMb),
  ) ?? defaultMaxFileSizeMb;
  const retainRevisionBinaries = tenantOverride?.retainRevisionBinariesOverride ?? planFeature?.retainRevisionBinaries ?? false;
  const maxRevisionBinaries = positiveOrZeroInteger(
    tenantOverride?.maxRevisionBinariesOverride,
    positiveOrZeroInteger(planFeature?.maxRevisionBinaries, null),
  );

  return {
    featureCode: DOCUMENT_MANAGEMENT_FEATURE_CODE,
    enabled,
    planId: planState.planId,
    planCode: planState.planCode,
    subscriptionStatus: planState.subscriptionStatus,
    storageLimitMb,
    maxFileSizeMb,
    retainRevisionBinaries,
    maxRevisionBinaries,
    enabledSource,
  };
}

export async function requireDocumentManagementFeature(tenantId?: string) {
  const entitlement = await resolveDocumentManagementEntitlement(tenantId);
  if (!entitlement.enabled) throw new Error("Document Management is not included in this tenant subscription.");
  return entitlement;
}

export function entitlementMaxFileBytes(entitlement: DocumentManagementEntitlement) {
  return entitlement.maxFileSizeMb * 1024 * 1024;
}
