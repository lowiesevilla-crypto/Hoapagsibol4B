import { BillStatus, NotificationType } from "@prisma/client";
import { NextResponse } from "next/server";
import { getAppUrl } from "@/lib/app-url";
import { authorizeCron } from "@/lib/cron-auth";
import { prisma } from "@/lib/db";
import { sendEmailNotification } from "@/lib/services/notifications";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!authorizeCron(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const reminderWindow = new Date(today);
  reminderWindow.setUTCDate(reminderWindow.getUTCDate() + 3);
  const logWindow = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const overdue = await prisma.bill.updateMany({
    where: { archivedAt: null, dueDate: { lt: today }, balance: { gt: 0 }, status: { in: [BillStatus.UNPAID, BillStatus.PARTIAL] } },
    data: { status: BillStatus.OVERDUE },
  });
  const bills = await prisma.bill.findMany({
    where: { archivedAt: null, balance: { gt: 0 }, dueDate: { lte: reminderWindow }, status: { in: [BillStatus.UNPAID, BillStatus.PARTIAL, BillStatus.OVERDUE] } },
    include: { homeowner: { include: { user: true } } },
    orderBy: { dueDate: "asc" },
    take: 50,
  });
  const recipients = [...new Set(bills.map((bill) => bill.homeowner.userId))];
  const recentLogs = recipients.length ? await prisma.notificationLog.findMany({
    where: { recipientId: { in: recipients }, type: NotificationType.BILL_REMINDER, createdAt: { gte: logWindow } },
    select: { recipientId: true },
  }) : [];
  const alreadyNotified = new Set(recentLogs.map((log) => log.recipientId));
  const sent = new Set<string>();
  for (const bill of bills) {
    const homeowner = bill.homeowner.user;
    if (alreadyNotified.has(homeowner.id) || sent.has(homeowner.id)) continue;
    await sendEmailNotification({
      recipientId: homeowner.id,
      email: homeowner.email,
      subject: "HOA monthly dues reminder",
      heading: bill.status === BillStatus.OVERDUE ? "Overdue account reminder" : "Upcoming due date",
      message: `Hello ${homeowner.name},\nYour outstanding HOA balance is PHP ${Number(bill.balance).toFixed(2)}. The due date is ${bill.dueDate.toLocaleDateString("en-PH", { timeZone: "UTC" })}. Please follow the official payment instructions or contact the HOA office if this has already been settled.`,
      type: NotificationType.BILL_REMINDER,
      actionLabel: "View my billing",
      actionUrl: `${getAppUrl()}/portal/billing`,
    });
    sent.add(homeowner.id);
  }
  const cleanupBefore = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [attempts, tokens, rateLimits] = await prisma.$transaction([
    prisma.passwordResetAttempt.deleteMany({ where: { createdAt: { lt: cleanupBefore } } }),
    prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: cleanupBefore } } }),
    prisma.rateLimitEvent.deleteMany({ where: { createdAt: { lt: cleanupBefore } } }),
  ]);
  await prisma.auditLog.create({ data: { module: "CRON", action: "DAILY_MAINTENANCE", entityType: "System", metadata: { overdueUpdated: overdue.count, remindersAttempted: sent.size, resetAttemptsDeleted: attempts.count, resetTokensDeleted: tokens.count, rateLimitsDeleted: rateLimits.count } } });
  return NextResponse.json({ ok: true, overdueUpdated: overdue.count, remindersAttempted: sent.size, cleanup: { resetAttempts: attempts.count, resetTokens: tokens.count, rateLimits: rateLimits.count } });
}
