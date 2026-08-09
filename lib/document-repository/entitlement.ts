import { DOCUMENT_MANAGEMENT_FEATURE_CODE, REPOSITORY_DEFAULT_MAX_FILE_BYTES } from "@/lib/document-repository/constants";
import { prisma } from "@/lib/db";
import { currentTenantContext } from "@/lib/tenant-context";

export type DocumentManagementEntitlement = {
  featureCode: typeof DOCUMENT_MANAGEMENT_FEATURE_CODE;
  enabled: boolean;
  planId: string | null;
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

async function resolvePlanId(tenantId: string) {
  const subscription = await prisma.tenantSubscription.findFirst({
    where: { tenantId },
    orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
    select: { planId: true, plan: { select: { maximumStorageMb: true } } },
  });
  if (subscription) return { planId: subscription.planId, maximumStorageMb: subscription.plan.maximumStorageMb };

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { subscriptionPlan: true },
  });
  if (!tenant) throw new Error("Tenant not found while resolving Document Management entitlement.");

  const plan = await prisma.subscriptionPlan.findFirst({
    where: { code: tenant.subscriptionPlan, active: true },
    orderBy: { updatedAt: "desc" },
    select: { id: true, maximumStorageMb: true },
  });
  return { planId: plan?.id ?? null, maximumStorageMb: plan?.maximumStorageMb ?? null };
}

export async function resolveDocumentManagementEntitlement(tenantId?: string): Promise<DocumentManagementEntitlement> {
  const context = currentTenantContext();
  const effectiveTenantId = tenantId ?? context?.tenantId;
  if (!effectiveTenantId) throw new Error("Tenant context is required for Document Management entitlement resolution.");
  if (context && !context.platform && context.tenantId !== effectiveTenantId) throw new Error("Cross-tenant entitlement lookup blocked.");

  const [{ planId, maximumStorageMb }, tenantOverride] = await Promise.all([
    resolvePlanId(effectiveTenantId),
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

  const planFeature = planId
    ? await prisma.subscriptionPlanFeatureEntitlement.findFirst({
        where: { planId, featureCode: DOCUMENT_MANAGEMENT_FEATURE_CODE },
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
  const enabled = tenantOverride?.enabledOverride ?? planEnabled;
  const enabledSource = tenantOverride?.enabledOverride != null
    ? "TENANT_OVERRIDE"
    : planEnabled
      ? "PLAN"
      : "DISABLED";

  const defaultMaxFileSizeMb = Math.floor(REPOSITORY_DEFAULT_MAX_FILE_BYTES / 1024 / 1024);
  const storageLimitMb = positiveOrZeroInteger(
    tenantOverride?.storageLimitMbOverride,
    positiveOrZeroInteger(planFeature?.storageLimitMb, maximumStorageMb),
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
    planId,
    storageLimitMb,
    maxFileSizeMb,
    retainRevisionBinaries,
    maxRevisionBinaries,
    enabledSource,
  };
}

export function entitlementMaxFileBytes(entitlement: DocumentManagementEntitlement) {
  return entitlement.maxFileSizeMb * 1024 * 1024;
}
