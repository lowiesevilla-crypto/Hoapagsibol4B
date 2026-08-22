import { TenantModule } from "@prisma/client";
import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { platformPrisma } from "@/lib/db";
import { runAutomaticBillingForTenant } from "@/lib/services/automatic-billing";
import { runWithTenant } from "@/lib/tenant-context";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!authorizeCron(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const tenants = await platformPrisma.tenant.findMany({
    where: { status: "ACTIVE", subscriptionStatus: { not: "CANCELLED" }, moduleEntitlements: { some: { module: TenantModule.BILLING, enabled: true } } },
    select: { id: true, slug: true, moduleEntitlements: { where: { enabled: true }, select: { module: true } } },
  });
  const results = [];
  for (const tenant of tenants) {
    try {
      const result = await runWithTenant(tenant.id, () => runAutomaticBillingForTenant(tenant.id), { enabledModules: tenant.moduleEntitlements.map((item) => item.module) });
      results.push({ tenantId: tenant.id, slug: tenant.slug, ...result });
    } catch (error) {
      results.push({ tenantId: tenant.id, slug: tenant.slug, error: error instanceof Error ? error.message : "Tenant automatic billing failed." });
    }
  }
  const ok = results.every((item) => !("error" in item));
  return NextResponse.json({ ok, tenantsProcessed: results.length, results }, { status: ok ? 200 : 500 });
}
