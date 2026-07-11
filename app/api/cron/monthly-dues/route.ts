import { BillingGenerationMode, RecurringChargeType, TenantModule } from "@prisma/client";
import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { platformPrisma, prisma } from "@/lib/db";
import { findEffectiveBillingRule } from "@/lib/services/billing-rules";
import { runWithTenant } from "@/lib/tenant-context";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!authorizeCron(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const tenants = await platformPrisma.tenant.findMany({
    where: { status: "ACTIVE", subscriptionStatus: { not: "CANCELLED" }, moduleEntitlements: { some: { module: TenantModule.BILLING, enabled: true } } },
    select: { id: true, slug: true, moduleEntitlements: { where: { enabled: true }, select: { module: true } } },
  });
  const results = [];
  for (const tenant of tenants) {
    try {
      const result = await runWithTenant(tenant.id, () => generateTenantDues(tenant.id, tenant.slug), { enabledModules: tenant.moduleEntitlements.map((item) => item.module) });
      results.push({ tenantId: tenant.id, slug: tenant.slug, ...result });
    } catch (error) {
      results.push({ tenantId: tenant.id, slug: tenant.slug, error: error instanceof Error ? error.message : "Tenant billing failed." });
    }
  }
  return NextResponse.json({ ok: results.every((item) => !("error" in item)), tenantsProcessed: results.length, results });
}

async function generateTenantDues(tenantId: string, tenantSlug: string) {
  const now = new Date();
  const rule = await findEffectiveBillingRule(tenantId, RecurringChargeType.MONTHLY_DUES, now.getUTCFullYear(), now.getUTCMonth() + 1);
  await prisma.auditLog.create({
    data: {
      tenantId,
      module: "CRON",
      action: "MONTHLY_DUES_CRON_DEFERRED",
      entityType: "BillingRule",
      entityId: rule?.id,
      metadata: {
        tenantSlug,
        billingMonth: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`,
        ruleResolution: rule?.resolutionReference ?? null,
        generationMode: rule?.generationMode ?? null,
        reason: "Automatic execution is deferred to Sprint 2.2B. Phase 2.2A stores the preference only.",
      },
    },
  });
  return {
    billingMonth: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`,
    created: 0,
    deferred: true,
    automaticConfigured: rule?.generationMode === BillingGenerationMode.AUTOMATIC,
    rule: rule ? { id: rule.id, resolutionReference: rule.resolutionReference, generationMode: rule.generationMode } : null,
  };
}
