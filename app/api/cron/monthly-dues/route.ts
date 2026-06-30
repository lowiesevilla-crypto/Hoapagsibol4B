import { HomeownerStatus, NotificationType } from "@prisma/client";
import { NextResponse } from "next/server";
import { getAppUrl } from "@/lib/app-url";
import { authorizeCron } from "@/lib/cron-auth";
import { prisma } from "@/lib/db";
import { sendEmailNotification } from "@/lib/services/notifications";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!authorizeCron(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
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
    data: billable.map((homeowner) => ({ homeownerId: homeowner.id, billingMonth, dueDate, amount: homeowner.monthlyDuesAmount, totalAmount: homeowner.monthlyDuesAmount, balance: homeowner.monthlyDuesAmount, notes: "Automatically generated monthly HOA dues." })),
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
      actionLabel: "View my billing",
      actionUrl: `${getAppUrl()}/portal/billing`,
    })));
  }
  await prisma.auditLog.create({ data: { module: "CRON", action: "GENERATE_MONTHLY_DUES", entityType: "Bill", metadata: { billingMonth: billingMonth.toISOString(), dueDate: dueDate.toISOString(), created: created.count, exempt: exemptions.length, alreadyExisting: existing.length } } });
  return NextResponse.json({ ok: true, billingMonth: billingMonth.toISOString().slice(0, 7), created: created.count, exempt: exemptions.length, alreadyExisting: existing.length });
}
