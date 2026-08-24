import "server-only";

import { TenantModule, TenantStatus, TenantSubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";

export const DEFAULT_TENANT_ID = "tenant_pagsibol4b_default";
export const DEFAULT_TENANT_SLUG = "pagsibol4b";

const blockedModuleSubscriptionStatuses = new Set<TenantSubscriptionStatus>([
  TenantSubscriptionStatus.SUSPENDED,
  TenantSubscriptionStatus.CANCELLED,
  TenantSubscriptionStatus.EXPIRED,
]);

export async function resolveTenant(slug?: string | null) {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: (slug || DEFAULT_TENANT_SLUG).trim().toLowerCase() },
    include: { moduleEntitlements: true, advisories: { where: { active: true }, orderBy: { createdAt: "desc" }, take: 1 } },
  });
  return tenant;
}

export function tenantCanSignIn(tenant: Awaited<ReturnType<typeof resolveTenant>>) {
  return Boolean(tenant && tenant.status === TenantStatus.ACTIVE && tenant.subscriptionStatus !== TenantSubscriptionStatus.CANCELLED);
}

async function resolvePlanModules(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { status: true, subscriptionPlan: true, subscriptionStatus: true },
  });
  if (!tenant || tenant.status !== TenantStatus.ACTIVE) return new Set<TenantModule>();

  const subscription = await prisma.tenantSubscription.findFirst({
    where: { tenantId },
    orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
    select: {
      status: true,
      plan: {
        select: {
          active: true,
          modules: { where: { enabled: true }, select: { module: true } },
        },
      },
    },
  });

  if (subscription) {
    if (!subscription.plan.active || blockedModuleSubscriptionStatuses.has(subscription.status)) return new Set<TenantModule>();
    return new Set(subscription.plan.modules.map((item) => item.module));
  }

  // Legacy/fallback tenants may pre-date TenantSubscription records. Their saved
  // plan code still resolves through the Platform Admin plan catalog so runtime
  // module access never silently defaults to every HOAHub function.
  if (blockedModuleSubscriptionStatuses.has(tenant.subscriptionStatus)) return new Set<TenantModule>();
  const plan = await prisma.subscriptionPlan.findFirst({
    where: { code: tenant.subscriptionPlan },
    orderBy: { updatedAt: "desc" },
    select: {
      active: true,
      modules: { where: { enabled: true }, select: { module: true } },
    },
  });
  if (!plan?.active) return new Set<TenantModule>();
  return new Set(plan.modules.map((item) => item.module));
}

export async function requireTenantModule(tenantId: string, module: TenantModule) {
  const enabled = await resolvePlanModules(tenantId);
  if (!enabled.has(module)) {
    throw new Error("This module is not included in your active subscription plan.");
  }
}

export async function getEnabledTenantModules(tenantId: string) {
  return resolvePlanModules(tenantId);
}

export function tenantUploadRoot(slug: string) {
  return `storage/uploads/tenants/${slug.replace(/[^a-z0-9-]/g, "")}`;
}
