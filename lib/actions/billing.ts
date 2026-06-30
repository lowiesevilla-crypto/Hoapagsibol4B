"use server";

import { BillStatus, HomeownerStatus, NotificationType, PaymentRequestStatus, Prisma, Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { billSchema } from "@/lib/validation";
import { sendEmailNotification } from "@/lib/services/notifications";

function normalizedMonth(value: string) {
  return new Date(`${value.slice(0, 7)}-01T00:00:00.000Z`);
}

export async function refreshOverdueBills() {
  await requireUser();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  await prisma.bill.updateMany({
    where: { archivedAt: null, dueDate: { lt: today }, balance: { gt: 0 }, status: { in: [BillStatus.UNPAID, BillStatus.PARTIAL] } },
    data: { status: BillStatus.OVERDUE },
  });
}

export async function saveBillAction(formData: FormData) {
  await requireUser(Role.ADMIN);
  const parsed = billSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Invalid bill details.");
  const data = parsed.data;
  const billingMonth = normalizedMonth(data.billingMonth);
  const dueDate = new Date(`${data.dueDate}T00:00:00.000Z`);
  const totalAmount = data.amount + data.penalty;

  if (data.id) {
    const existing = await prisma.bill.findUnique({ where: { id: data.id } });
    if (!existing) throw new Error("Bill not found.");
    if (existing.archivedAt) throw new Error("Archived bills cannot be edited.");
    if (Number(existing.amountPaid) > totalAmount) throw new Error("Bill total cannot be below payments already received.");
    const amountPaid = Number(existing.amountPaid);
    const balance = totalAmount - amountPaid;
    const status = balance === 0 ? BillStatus.PAID : data.status === BillStatus.OVERDUE ? BillStatus.OVERDUE : amountPaid > 0 ? BillStatus.PARTIAL : data.status ?? BillStatus.UNPAID;
    await prisma.bill.update({
      where: { id: data.id },
      data: { homeownerId: data.homeownerId, billingMonth, dueDate, amount: data.amount, penalty: data.penalty, totalAmount, balance, status, notes: data.notes || null },
    });
  } else {
    await prisma.bill.create({
      data: { homeownerId: data.homeownerId, billingMonth, dueDate, amount: data.amount, penalty: data.penalty, totalAmount, balance: totalAmount, notes: data.notes || null },
    });
  }

  const savedBill = await prisma.bill.findUnique({ where: { homeownerId_billingMonth: { homeownerId: data.homeownerId, billingMonth } }, include: { homeowner: { include: { user: true } } } });
  if (savedBill) await sendEmailNotification({ recipientId: savedBill.homeowner.userId, email: savedBill.homeowner.user.email, subject: `HOA billing notice - ${savedBill.billingMonth.toLocaleDateString("en-PH", { month: "long", year: "numeric" })}`, heading: "Billing notification", message: `Hello ${savedBill.homeowner.user.name},\nA billing record of PHP ${Number(savedBill.totalAmount).toFixed(2)} is available in your homeowner portal. The due date is ${savedBill.dueDate.toLocaleDateString("en-PH")}.`, type: NotificationType.BILLING_NOTIFICATION, actionLabel: "View my billing", actionUrl: `${process.env.APP_URL?.replace(/\/$/, "") || "https://pagsibol-hoa.tail2abf68.ts.net"}/portal/billing` }).catch(() => undefined);

  revalidatePath("/admin/billing");
  redirect("/admin/billing?success=saved");
}

export async function generateMonthlyBillsAction(formData: FormData) {
  await requireUser(Role.ADMIN);
  const month = String(formData.get("billingMonth") || "");
  const due = String(formData.get("dueDate") || "");
  if (!/^\d{4}-\d{2}$/.test(month) || !/^\d{4}-\d{2}-\d{2}$/.test(due)) throw new Error("Choose a valid billing month and due date.");
  const billingMonth = new Date(`${month}-01T00:00:00.000Z`);
  const dueDate = new Date(`${due}T00:00:00.000Z`);
  const homeowners = await prisma.homeownerProfile.findMany({ where: { status: HomeownerStatus.ACTIVE }, include: { user: true } });
  const exemptions = await prisma.duesExemption.findMany({ where: { billingMonth }, select: { homeownerId: true } });
  const exemptIds = new Set(exemptions.map((item) => item.homeownerId));
  const billableHomeowners = homeowners.filter((homeowner) => !exemptIds.has(homeowner.id));
  await prisma.$transaction(
    billableHomeowners.map((homeowner) =>
      prisma.bill.upsert({
        where: { homeownerId_billingMonth: { homeownerId: homeowner.id, billingMonth } },
        update: {},
        create: {
          homeownerId: homeowner.id,
          billingMonth,
          dueDate,
          amount: homeowner.monthlyDuesAmount,
          totalAmount: homeowner.monthlyDuesAmount,
          balance: homeowner.monthlyDuesAmount,
        },
      }),
    ),
  );
  await Promise.allSettled(billableHomeowners.map((homeowner) => sendEmailNotification({ recipientId: homeowner.userId, email: homeowner.user.email, subject: `HOA billing notice - ${billingMonth.toLocaleDateString("en-PH", { month: "long", year: "numeric" })}`, heading: "Monthly dues billing", message: `Hello ${homeowner.user.name},\nYour monthly HOA dues of PHP ${Number(homeowner.monthlyDuesAmount).toFixed(2)} has been posted. Payment is due ${dueDate.toLocaleDateString("en-PH")}.`, type: NotificationType.BILLING_NOTIFICATION, actionLabel: "View my billing", actionUrl: `${process.env.APP_URL?.replace(/\/$/, "") || "https://pagsibol-hoa.tail2abf68.ts.net"}/portal/billing` })));
  revalidatePath("/admin/billing");
  revalidatePath("/admin/dashboard");
  redirect(`/admin/billing?success=generated&count=${billableHomeowners.length}&skipped=${exemptions.length}&message=${encodeURIComponent(`${billableHomeowners.length} bills generated. ${exemptions.length} exempt homeowner(s) skipped.`)}`);
}

export async function archiveBillAction(formData: FormData) {
  const admin = await requireUser(Role.ADMIN);
  const id = String(formData.get("id") || "");
  const confirmed = String(formData.get("confirmed") || "") === "yes";
  const reason = String(formData.get("reason") || "").trim();
  if (!id) redirect("/admin/billing?error=Billing%20record%20was%20not%20specified.");
  if (!confirmed) redirect("/admin/billing?error=Please%20confirm%20that%20you%20want%20to%20archive%20this%20billing%20record.");

  try {
    await prisma.$transaction(async (tx) => {
      const bill = await tx.bill.findUnique({
        where: { id },
        include: {
          homeowner: { include: { user: true } },
          _count: { select: { payments: true, paymentRequests: true } },
        },
      });
      if (!bill) throw new Error("Billing record not found.");
      if (bill.archivedAt) throw new Error("This billing record is already archived.");
      const archivedAt = new Date();
      await tx.bill.update({
        where: { id },
        data: {
          archivedAt,
          archivedById: admin.id,
          archiveReason: reason || "Archived from Billing Management by an administrator.",
        },
      });
      const rejectedRequests = await tx.paymentRequest.updateMany({
        where: { billId: id, status: PaymentRequestStatus.PENDING_REVIEW },
        data: {
          status: PaymentRequestStatus.REJECTED,
          reviewedById: admin.id,
          reviewedAt: archivedAt,
          reviewRemarks: "Billing record was archived before this request was reviewed.",
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: admin.id,
          module: "BILLING",
          action: "ARCHIVE_BILL",
          entityType: "Bill",
          entityId: bill.id,
          metadata: {
            homeowner: { id: bill.homeownerId, name: bill.homeowner.user.name },
            billingMonth: bill.billingMonth.toISOString(),
            totalAmount: Number(bill.totalAmount),
            paidAmount: Number(bill.amountPaid),
            balance: Number(bill.balance),
            paymentCount: bill._count.payments,
            paymentRequestCount: bill._count.paymentRequests,
            pendingRequestsRejected: rejectedRequests.count,
            archiveReason: reason || null,
            archivedBy: { id: admin.id, name: admin.name, email: admin.email },
            archivedAt: archivedAt.toISOString(),
          },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    redirect(`/admin/billing?error=${encodeURIComponent(error instanceof Error ? error.message : "Billing record could not be archived.")}`);
  }

  revalidatePath("/admin/billing");
  revalidatePath("/admin/payments");
  revalidatePath("/admin/dashboard");
  revalidatePath("/portal/billing");
  revalidatePath("/portal/pay");
  revalidatePath("/portal/dashboard");
  redirect("/admin/billing?success=archived&message=Billing%20record%20archived.%20Payments%2C%20receipts%2C%20and%20audit%20history%20were%20preserved.");
}
