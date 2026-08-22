import { BillStatus, NotificationType, TenantModule } from "@prisma/client";
import { NextResponse } from "next/server";
import { getAppUrl } from "@/lib/app-url";
import { authorizeCron } from "@/lib/cron-auth";
import { platformPrisma, prisma } from "@/lib/db";
import { runAutomaticBillingForTenant } from "@/lib/services/automatic-billing";
import { runPlatformBillingCycle } from "@/lib/services/platform-billing";
import { sendPlatformInvoiceEmail } from "@/lib/services/platform-invoice-email";
import { sendEmailNotification } from "@/lib/services/notifications";
import { runWithTenant } from "@/lib/tenant-context";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!authorizeCron(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let platformBilling: Awaited<ReturnType<typeof runPlatformBillingCycle>> | { error: string };
  const platformInvoiceEmails: Array<{ invoiceId: string; status: string; recipients?: string[]; message?: string }> = [];
  try {
    platformBilling = await runPlatformBillingCycle();
    for (const invoiceId of platformBilling.invoiceIds) {
      try {
        const delivery = await sendPlatformInvoiceEmail({ invoiceId });
        platformInvoiceEmails.push({ invoiceId, status: delivery.status, recipients: delivery.recipients, message: delivery.message });
      } catch (error) {
        platformInvoiceEmails.push({ invoiceId, status: "FAILED", message: error instanceof Error ? error.message : "Platform invoice email failed." });
      }
    }
  } catch (error) {
    platformBilling = { error: error instanceof Error ? error.message : "Platform billing cycle failed." };
  }

  // Privacy retention is independent of subscription status. Expired AI
  // conversations are removed even for suspended, inactive, or cancelled tenants;
  // AiMessage rows cascade with their parent conversation.
  const expiredAiConversations = await platformPrisma.aiConversation.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });

  const tenants = await platformPrisma.tenant.findMany({
    where: { status: "ACTIVE", subscriptionStatus: { not: "CANCELLED" } },
    select: { id: true, slug: true, moduleEntitlements: { where: { enabled: true }, select: { module: true } } },
  });
  const results = [];
  for (const tenant of tenants) {
    const modules = tenant.moduleEntitlements.map((item) => item.module);
    try {
      const result = await runWithTenant(
        tenant.id,
        () => maintainTenant(tenant.id, tenant.slug, modules.includes(TenantModule.BILLING)),
        { enabledModules: modules },
      );
      results.push({ tenantId: tenant.id, slug: tenant.slug, ...result });
    } catch (error) {
      results.push({ tenantId: tenant.id, slug: tenant.slug, error: error instanceof Error ? error.message : "Tenant maintenance failed." });
    }
  }
  const cleanupBefore = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rateLimits = await platformPrisma.rateLimitEvent.deleteMany({ where: { createdAt: { lt: cleanupBefore } } });
  const ok = !("error" in platformBilling) && results.every((item) => !("error" in item));
  return NextResponse.json({
    ok,
    platformBilling,
    platformInvoiceEmails,
    tenantsProcessed: results.length,
    globalRateLimitsDeleted: rateLimits.count,
    expiredAiConversationsDeleted: expiredAiConversations.count,
    results,
  }, { status: ok ? 200 : 500 });
}

async function maintainTenant(tenantId: string, tenantSlug: string, billingEnabled: boolean) {
  const now = new Date();
  const cleanupBefore = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const [attempts, tokens] = await prisma.$transaction([
    prisma.passwordResetAttempt.deleteMany({ where: { createdAt: { lt: cleanupBefore } } }),
    prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: cleanupBefore } } }),
  ]);
  if (!billingEnabled) {
    await prisma.auditLog.create({ data: { tenantId, module: "CRON", action: "DAILY_MAINTENANCE", entityType: "System", metadata: { billingSkipped: true, resetAttemptsDeleted: attempts.count, resetTokensDeleted: tokens.count } } });
    return { billingSkipped: true, resetAttemptsDeleted: attempts.count, resetTokensDeleted: tokens.count };
  }

  let automaticBilling: Awaited<ReturnType<typeof runAutomaticBillingForTenant>> | { error: string };
  try {
    automaticBilling = await runAutomaticBillingForTenant(tenantId, now);
  } catch (error) {
    automaticBilling = { error: error instanceof Error ? error.message : "Automatic tenant billing failed." };
  }

  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const reminderWindow = new Date(today);
  reminderWindow.setUTCDate(reminderWindow.getUTCDate() + 3);
  const logWindow = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const overdue = await prisma.bill.updateMany({ where: { archivedAt: null, dueDate: { lt: today }, balance: { gt: 0 }, status: { in: [BillStatus.UNPAID, BillStatus.PARTIAL] } }, data: { status: BillStatus.OVERDUE } });
  const bills = await prisma.bill.findMany({ where: { archivedAt: null, balance: { gt: 0 }, dueDate: { lte: reminderWindow }, status: { in: [BillStatus.UNPAID, BillStatus.PARTIAL, BillStatus.OVERDUE] } }, include: { homeowner: { include: { user: true } } }, orderBy: { dueDate: "asc" }, take: 50 });
  const recipients = [...new Set(bills.map((bill) => bill.homeowner.userId))];
  const recentLogs = recipients.length ? await prisma.notificationLog.findMany({ where: { recipientId: { in: recipients }, type: NotificationType.BILL_REMINDER, createdAt: { gte: logWindow } }, select: { recipientId: true } }) : [];
  const alreadyNotified = new Set(recentLogs.map((log) => log.recipientId));
  const sent = new Set<string>();
  for (const bill of bills) {
    const homeowner = bill.homeowner.user;
    if (alreadyNotified.has(homeowner.id) || sent.has(homeowner.id)) continue;
    await sendEmailNotification({ tenantId, recipientId: homeowner.id, email: homeowner.email, subject: "HOA monthly dues reminder", heading: bill.status === BillStatus.OVERDUE ? "Overdue account reminder" : "Upcoming due date", message: `Hello ${homeowner.name},\nYour outstanding HOA balance is PHP ${Number(bill.balance).toFixed(2)}. The due date is ${bill.dueDate.toLocaleDateString("en-PH", { timeZone: "UTC" })}.`, type: NotificationType.BILL_REMINDER, actionLabel: "Open HOA portal", actionUrl: `${getAppUrl()}/${tenantSlug}/login` });
    sent.add(homeowner.id);
  }
  await prisma.auditLog.create({ data: { tenantId, module: "CRON", action: "DAILY_MAINTENANCE", entityType: "System", metadata: { automaticBilling, overdueUpdated: overdue.count, remindersAttempted: sent.size, resetAttemptsDeleted: attempts.count, resetTokensDeleted: tokens.count } } });
  return { automaticBilling, overdueUpdated: overdue.count, remindersAttempted: sent.size, resetAttemptsDeleted: attempts.count, resetTokensDeleted: tokens.count };
}
