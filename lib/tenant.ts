import "server-only";

import { TenantModule, TenantStatus, TenantSubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";

export const DEFAULT_TENANT_ID = "tenant_pagsibol4b_default";
export const DEFAULT_TENANT_SLUG = "pagsibol4b";

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

export async function requireTenantModule(tenantId: string, module: TenantModule) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { status: true, subscriptionStatus: true } });
  if (!tenant || tenant.status !== TenantStatus.ACTIVE || tenant.subscriptionStatus === TenantSubscriptionStatus.CANCELLED) {
    throw new Error("This HOA account is not currently active.");
  }
  const entitlement = await prisma.tenantModuleEntitlement.findUnique({ where: { tenantId_module: { tenantId, module } } });
  if (!entitlement && module === TenantModule.COMPLAINTS) throw new Error("This module is not included in your subscription plan.");
  if (entitlement && !entitlement.enabled) throw new Error("This module is not included in your subscription plan.");
}

export async function getEnabledTenantModules(tenantId: string) {
  const configured = await prisma.tenantModuleEntitlement.findMany({ where: { tenantId }, select: { module: true, enabled: true } });
  const state = new Map(configured.map((item) => [item.module, item.enabled]));
  return new Set(Object.values(TenantModule).filter((module) => module === TenantModule.COMPLAINTS ? state.get(module) === true : state.get(module) !== false));
}

export function tenantUploadRoot(slug: string) {
  return `storage/uploads/tenants/${slug.replace(/[^a-z0-9-]/g, "")}`;
}
