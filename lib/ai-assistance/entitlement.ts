import { TenantSubscriptionStatus } from "@prisma/client";
import { AI_ASSISTANCE_FEATURE_CODE, mergeAiCommercialConfiguration } from "@/lib/ai-assistance/commercial";
import { prisma } from "@/lib/db";
import { currentTenantContext } from "@/lib/tenant-context";

const blockedSubscriptionStatuses = new Set<TenantSubscriptionStatus>([
  TenantSubscriptionStatus.SUSPENDED,
  TenantSubscriptionStatus.CANCELLED,
  TenantSubscriptionStatus.EXPIRED,
]);

export type AiAssistanceEntitlement = {
  featureCode: typeof AI_ASSISTANCE_FEATURE_CODE;
  enabled: boolean;
  enabledSource: "TENANT_OVERRIDE" | "PLAN" | "DISABLED";
  planId: string | null;
  planCode: string | null;
  subscriptionStatus: TenantSubscriptionStatus | null;
  configuration: ReturnType<typeof mergeAiCommercialConfiguration>;
};

async function resolvePlanState(tenantId: string) {
  const subscription = await prisma.tenantSubscription.findFirst({
    where: { tenantId },
    orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
    select: {
      planId: true,
      status: true,
      plan: { select: { code: true, active: true } },
    },
  });
  if (subscription) {
    return {
      planId: subscription.planId,
      planCode: subscription.plan.code,
      planActive: subscription.plan.active,
      subscriptionStatus: subscription.status,
    };
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { subscriptionPlan: true, subscriptionStatus: true },
  });
  if (!tenant) throw new Error("Tenant not found while resolving AI Assistance entitlement.");
  const plan = await prisma.subscriptionPlan.findFirst({
    where: { code: tenant.subscriptionPlan },
    orderBy: { updatedAt: "desc" },
    select: { id: true, code: true, active: true },
  });
  return {
    planId: plan?.id ?? null,
    planCode: plan?.code ?? tenant.subscriptionPlan,
    planActive: plan?.active ?? false,
    subscriptionStatus: tenant.subscriptionStatus,
  };
}

export async function resolveAiAssistanceEntitlement(tenantId?: string): Promise<AiAssistanceEntitlement> {
  const context = currentTenantContext();
  const effectiveTenantId = tenantId ?? context?.tenantId;
  if (!effectiveTenantId) throw new Error("Tenant context is required for AI Assistance entitlement resolution.");
  if (context && !context.platform && context.tenantId !== effectiveTenantId) {
    throw new Error("Cross-tenant AI entitlement lookup blocked.");
  }

  const [planState, tenantOverride] = await Promise.all([
    resolvePlanState(effectiveTenantId),
    prisma.tenantFeatureEntitlement.findFirst({
      where: { tenantId: effectiveTenantId, featureCode: AI_ASSISTANCE_FEATURE_CODE },
      select: { enabledOverride: true, configurationOverride: true },
    }),
  ]);
  const planFeature = planState.planId
    ? await prisma.subscriptionPlanFeatureEntitlement.findUnique({
        where: { planId_featureCode: { planId: planState.planId, featureCode: AI_ASSISTANCE_FEATURE_CODE } },
        select: { enabled: true, configuration: true },
      })
    : null;

  const planEnabled = planFeature?.enabled ?? false;
  const tenantDisabled = tenantOverride?.enabledOverride === false;
  // An active plan is the commercial ceiling: a tenant-level Platform Admin
  // restriction can turn AI off, but an override cannot grant AI when the plan
  // itself does not include the capability.
  const enabled = Boolean(
    planEnabled
    && !tenantDisabled
    && planState.planActive
    && !blockedSubscriptionStatuses.has(planState.subscriptionStatus),
  );

  return {
    featureCode: AI_ASSISTANCE_FEATURE_CODE,
    enabled,
    enabledSource: tenantDisabled
      ? "TENANT_OVERRIDE"
      : planEnabled
        ? "PLAN"
        : "DISABLED",
    planId: planState.planId,
    planCode: planState.planCode,
    subscriptionStatus: planState.subscriptionStatus,
    configuration: mergeAiCommercialConfiguration(planFeature?.configuration, tenantOverride?.configurationOverride),
  };
}

export async function requireAiAssistanceEntitlement(tenantId?: string) {
  const entitlement = await resolveAiAssistanceEntitlement(tenantId);
  if (!entitlement.enabled) throw new Error("AI Assistance is not included in this tenant subscription.");
  return entitlement;
}
