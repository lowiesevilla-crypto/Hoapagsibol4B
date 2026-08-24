import { TenantSubscriptionStatus } from "@prisma/client";
import { PETTY_CASH_FEATURE_CODE } from "@/lib/petty-cash/constants";
import { prisma } from "@/lib/db";
import { currentTenantContext } from "@/lib/tenant-context";

const blockedSubscriptionStatuses = new Set<TenantSubscriptionStatus>([
  TenantSubscriptionStatus.SUSPENDED,
  TenantSubscriptionStatus.CANCELLED,
  TenantSubscriptionStatus.EXPIRED,
]);

export type PettyCashEntitlement = {
  featureCode: typeof PETTY_CASH_FEATURE_CODE;
  enabled: boolean;
  planId: string | null;
  planCode: string | null;
  subscriptionStatus: TenantSubscriptionStatus | null;
  enabledSource: "TENANT_OVERRIDE" | "PLAN" | "DISABLED";
};

async function resolvePlan(tenantId: string) {
  const subscription = await prisma.tenantSubscription.findFirst({
    where: { tenantId },
    orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
    select: { planId: true, status: true, plan: { select: { code: true, active: true } } },
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
  if (!tenant) throw new Error("Tenant not found while resolving Petty Cash entitlement.");

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

export async function resolvePettyCashEntitlement(tenantId?: string): Promise<PettyCashEntitlement> {
  const context = currentTenantContext();
  const effectiveTenantId = tenantId ?? context?.tenantId;
  if (!effectiveTenantId) throw new Error("Tenant context is required for Petty Cash entitlement resolution.");
  if (context && !context.platform && context.tenantId !== effectiveTenantId) throw new Error("Cross-tenant Petty Cash entitlement lookup blocked.");

  const [planState, tenantOverride] = await Promise.all([
    resolvePlan(effectiveTenantId),
    prisma.tenantFeatureEntitlement.findFirst({
      where: { tenantId: effectiveTenantId, featureCode: PETTY_CASH_FEATURE_CODE },
      select: { enabledOverride: true },
    }),
  ]);

  const planFeature = planState.planId
    ? await prisma.subscriptionPlanFeatureEntitlement.findFirst({
        where: { planId: planState.planId, featureCode: PETTY_CASH_FEATURE_CODE },
        select: { enabled: true },
      })
    : null;

  const planEnabled = planFeature?.enabled ?? false;
  const tenantDisabled = tenantOverride?.enabledOverride === false;
  const subscriptionBlocked = blockedSubscriptionStatuses.has(planState.subscriptionStatus);
  const enabled = Boolean(planEnabled && !tenantDisabled && planState.planActive && !subscriptionBlocked);
  const enabledSource = tenantDisabled ? "TENANT_OVERRIDE" : planEnabled ? "PLAN" : "DISABLED";

  return {
    featureCode: PETTY_CASH_FEATURE_CODE,
    enabled,
    planId: planState.planId,
    planCode: planState.planCode,
    subscriptionStatus: planState.subscriptionStatus,
    enabledSource,
  };
}

export async function requirePettyCashFeature(tenantId?: string) {
  const entitlement = await resolvePettyCashEntitlement(tenantId);
  if (!entitlement.enabled) throw new Error("Petty Cash Voucher is not included in this tenant subscription.");
  return entitlement;
}
