import { HomeownerStatus, NotificationType, TenantModule } from "@prisma/client";
import { NextResponse } from "next/server";
import { getAppUrl } from "@/lib/app-url";
import { authorizeCron } from "@/lib/cron-auth";
import { platformPrisma, prisma } from "@/lib/db";
import { sendEmailNotification } from "@/lib/services/notifications";
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
  const billingMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const configuredDueDay = Number(process.env.MONTHLY_DUES_DUE_DAY || 15);
  const dueDay = Number.isInteger(configuredDueDay) && configuredDueDay >= 1 && configuredDueDay <= 28 ? configuredDueDay : 15;
  const dueDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), dueDay));
  const [homeowners, exemptions, existing] = await Promise.all([
    prisma.homeownerProfile.findMany({ where: { status: HomeownerStatus.ACTIVE }, include: { user: true } }),
    prisma.duesExemption.findMany({ where: { billingMonth }, select: { homeownerId: true } }),
    prisma.bill.findMany({ where: { billingMonth }, select: { homeownerId: true } }),
  ]);
  const exemptIds = new Set(exemptions.map((item) => item.homeownerId));
  const existingIds = new Set(existing.map((item) => item.homeownerId));
  const billable = homeowners.filter((homeowner) => !exemptIds.has(homeowner.id) && !existingIds.has(homeowner.id));
  const created = await prisma.bill.createMany({
    data: billable.map((homeowner) => ({ tenantId, homeownerId: homeowner.id, billingMonth, dueDate, amount: homeowner.monthlyDuesAmount, totalAmount: homeowner.monthlyDuesAmount, balance: homeowner.monthlyDuesAmount, notes: "Automatically generated monthly HOA dues." })),
    skipDuplicates: true,
  });
  for (let index = 0; index < billable.length; index += 10) {
    await Promise.allSettled(billable.slice(index, index + 10).map((homeowner) => sendEmailNotification({
      recipientId: homeowner.userId,
      email: homeowner.user.email,
      subject: `HOA billing notice - ${billingMonth.toLocaleDateString("en-PH", { month: "long", year: "numeric", timeZone: "UTC" })}`,
      heading: "Monthly dues billing",
      message: `Hello ${homeowner.user.name},\nYour monthly HOA dues of PHP ${Number(homeowner.monthlyDuesAmount).toFixed(2)} has been posted. Payment is due ${dueDate.toLocaleDateString("en-PH", { timeZone: "UTC" })}.`,
      type: NotificationType.BILLING_NOTIFICATION,
      actionLabel: "Open HOA portal",
      actionUrl: `${getAppUrl()}/${tenantSlug}/login`,
    })));
  }
  await prisma.auditLog.create({ data: { tenantId, module: "CRON", action: "GENERATE_MONTHLY_DUES", entityType: "Bill", metadata: { billingMonth: billingMonth.toISOString(), dueDate: dueDate.toISOString(), created: created.count, exempt: exemptions.length, alreadyExisting: existing.length } } });
  return { billingMonth: billingMonth.toISOString().slice(0, 7), created: created.count, exempt: exemptions.length, alreadyExisting: existing.length };
}
