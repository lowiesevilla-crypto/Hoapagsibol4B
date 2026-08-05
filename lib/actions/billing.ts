"use server";

import { BillStatus, NotificationType, PaymentRequestStatus, Prisma, RecurringChargeType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import { getAppUrl } from "@/lib/app-url";
import { prisma } from "@/lib/db";
import { billSchema } from "@/lib/validation";
import { sendEmailNotification } from "@/lib/services/notifications";
import { billingGenerationScopes, generateBillingFromRules, generateMonthlyDuesFromRules, periodFromDate, type BillingGenerationScope } from "@/lib/services/billing-rules";

function normalizedMonth(value: string) {
  return new Date(`${value.slice(0, 7)}-01T00:00:00.000Z`);
}

export async function refreshOverdueBills() {
  const user = await requirePermission(Permission.BILLING_ADJUST);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  await prisma.bill.updateMany({
    where: { tenantId: user.tenantId, archivedAt: null, dueDate: { lt: today }, balance: { gt: 0 }, status: { in: [BillStatus.UNPAID, BillStatus.PARTIAL] } },
    data: { status: BillStatus.OVERDUE },
  });
  return user;
}

export async function saveBillAction(formData: FormData) {
  const admin = await requirePermission(Permission.BILLING_ADJUST);
  const parsed = billSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Invalid bill details.");
  const data = parsed.data;
  const billingMonth = normalizedMonth(data.billingMonth);
  const period = periodFromDate(billingMonth);
  const dueDate = new Date(`${data.dueDate}T00:00:00.000Z`);
  const totalAmount = data.amount + data.penalty;
  const homeowner = await prisma.homeownerProfile.findFirst({ where: { id: data.homeownerId, tenantId: admin.tenantId }, select: { id: true } });
  if (!homeowner) throw new Error("Homeowner not found or access denied.");

  if (data.id) {
    const existing = await prisma.bill.findFirst({ where: { id: data.id, tenantId: admin.tenantId } });
    if (!existing) throw new Error("Bill not found.");
    if (existing.archivedAt) throw new Error("Archived bills cannot be edited.");
    if (Number(existing.amountPaid) > totalAmount) throw new Error("Bill total cannot be below payments already received.");
    const amountPaid = Number(existing.amountPaid);
    const balance = totalAmount - amountPaid;
    const status = balance === 0 ? BillStatus.PAID : data.status === BillStatus.OVERDUE ? BillStatus.OVERDUE : amountPaid > 0 ? BillStatus.PARTIAL : data.status ?? BillStatus.UNPAID;
    await prisma.bill.update({
      where: { id: data.id },
      data: { tenantId: admin.tenantId, homeownerId: homeowner.id, billingMonth, recurringChargeType: RecurringChargeType.MONTHLY_DUES, coverageYear: period.year, coverageMonth: period.month, dueDate, amount: data.amount, penalty: data.penalty, totalAmount, balance, status, notes: data.notes || null },
    });
  } else {
    throw new Error("Use Preview individual bill so the Billing Rules engine can validate the coverage period, exemption status, duplicate status, and rule amount before generation.");
  }

  const savedBill = await prisma.bill.findFirst({ where: { tenantId: admin.tenantId, homeownerId: homeowner.id, billingMonth }, include: { homeowner: { include: { user: true } } } });
  if (savedBill) await sendEmailNotification({ tenantId: admin.tenantId, recipientId: savedBill.homeowner.userId, email: savedBill.homeowner.user.email, subject: `HOA billing notice - ${savedBill.billingMonth.toLocaleDateString("en-PH", { month: "long", year: "numeric" })}`, heading: "Billing notification", message: `Hello ${savedBill.homeowner.user.name},\nA billing record of PHP ${Number(savedBill.totalAmount).toFixed(2)} is available in your homeowner portal. The due date is ${savedBill.dueDate.toLocaleDateString("en-PH")}.`, type: NotificationType.BILLING_NOTIFICATION, actionLabel: "View my billing", actionUrl: `${getAppUrl()}/portal/billing` }).catch(() => undefined);

  revalidatePath("/admin/billing");
  revalidatePath("/admin/payments");
  revalidatePath("/admin/payments/record");
  revalidatePath(`/admin/homeowners/${homeowner.id}`);
  revalidatePath("/portal/billing");
  revalidatePath("/portal/payments");
  redirect("/admin/billing?success=saved");
}

export async function generateMonthlyBillsAction(formData: FormData) {
  const admin = await requirePermission(Permission.BILLING_GENERATE);
  const month = String(formData.get("billingMonth") || "");
  const due = String(formData.get("dueDate") || "");
  if (!/^\d{4}-\d{2}$/.test(month) || !/^\d{4}-\d{2}-\d{2}$/.test(due)) throw new Error("Choose a valid billing month and due date.");
  const billingMonth = new Date(`${month}-01T00:00:00.000Z`);
  const dueDate = new Date(`${due}T00:00:00.000Z`);
  let result: Awaited<ReturnType<typeof generateMonthlyDuesFromRules>>;
  try {
    result = await generateMonthlyDuesFromRules({ actor: admin, billingMonth, dueDate });
  } catch (error) {
    redirect(`/admin/billing?error=${encodeURIComponent(error instanceof Error ? error.message : "Monthly bills could not be generated.")}`);
  }
  revalidatePath("/admin/billing");
  revalidatePath("/admin/dashboard");
  redirect(`/admin/billing?success=generated&count=${result.generated}&skipped=${result.exemptSkipped}&message=${encodeURIComponent(`${result.generated} bills generated from ${result.rule.resolutionReference}. ${result.exemptSkipped} exempt homeowner(s) and ${result.duplicateSkipped} duplicate(s) skipped.`)}`);
}

export async function generateBillingFromPreviewAction(formData: FormData) {
  const admin = await requirePermission(Permission.BILLING_GENERATE);
  let redirectUrl = "/admin/billing?success=generated";
  try {
    const input = parseGenerationForm(admin, formData);
    const result = await generateBillingFromRules(input);
    const ruleLabel = result.rule?.resolutionReference ?? "no rule";
    const message = `${result.createdCount} bill(s) generated for ${periodLabel(input.coverageYear, input.coverageMonth)} from ${ruleLabel}. ${result.exemptCount} exempt, ${result.duplicateCount} duplicate, ${result.failedCount} failed.`;
    revalidatePath("/admin/billing");
    revalidatePath("/admin/payments");
    revalidatePath("/admin/payments/record");
    revalidatePath("/admin/payments/requests");
    revalidatePath("/admin/payments/active");
    revalidatePath("/admin/payments/history");
    revalidatePath("/admin/dashboard");
    revalidatePath("/portal/billing");
    revalidatePath("/portal/pay");
    revalidatePath("/portal/payments");
    input.homeownerIds?.forEach((id) => revalidatePath(`/admin/homeowners/${id}`));
    redirectUrl = `/admin/billing?success=generated&message=${encodeURIComponent(message)}&billingGenerated=1&coverageYear=${input.coverageYear}&coverageMonth=${input.coverageMonth}&scope=${input.scope}${input.homeownerIds?.[0] ? `&homeownerId=${encodeURIComponent(input.homeownerIds[0])}` : ""}`;
  } catch (error) {
    redirect(`/admin/billing?error=${encodeURIComponent(error instanceof Error ? error.message : "Billing generation failed.")}`);
  }
  redirect(redirectUrl);
}

function parseGenerationForm(admin: Awaited<ReturnType<typeof requirePermission>>, formData: FormData) {
  const coverageYear = Number(formData.get("coverageYear"));
  const coverageMonth = Number(formData.get("coverageMonth"));
  if (!Number.isInteger(coverageYear) || coverageYear < 1900 || coverageYear > 2200) throw new Error("Enter a valid four-digit coverage year.");
  if (!Number.isInteger(coverageMonth) || coverageMonth < 1 || coverageMonth > 12) throw new Error("Choose a coverage month from January through December.");
  const rawScope = String(formData.get("scope") || "ALL");
  const scope = billingGenerationScopes.includes(rawScope as BillingGenerationScope) ? rawScope as BillingGenerationScope : "ALL";
  const homeownerIds = formData.getAll("homeownerIds").map(String).filter(Boolean);
  const individualHomeowner = String(formData.get("homeownerId") || "");
  return {
    actor: admin,
    coverageYear,
    coverageMonth,
    scope,
    homeownerIds: scope === "HOMEOWNER" ? [individualHomeowner].filter(Boolean) : homeownerIds,
    block: String(formData.get("block") || "").trim(),
    phase: String(formData.get("phase") || "").trim(),
  };
}

function periodLabel(year: number, month: number) {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-PH", { month: "long", year: "numeric", timeZone: "UTC" });
}

export async function archiveBillAction(formData: FormData) {
  const admin = await requirePermission(Permission.BILLING_ADJUST);
  const id = String(formData.get("id") || "");
  const confirmed = String(formData.get("confirmed") || "") === "yes";
  const reason = String(formData.get("reason") || "").trim();
  if (!id) redirect("/admin/billing?error=Billing%20record%20was%20not%20specified.");
  if (!confirmed) redirect("/admin/billing?error=Please%20confirm%20that%20you%20want%20to%20archive%20this%20billing%20record.");

  try {
    await prisma.$transaction(async (tx) => {
      const bill = await tx.bill.findFirst({
        where: { id, tenantId: admin.tenantId },
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
        where: {
          tenantId: admin.tenantId,
          billId: id,
          status: PaymentRequestStatus.PENDING_REVIEW,
        },
        data: {
          status: PaymentRequestStatus.REJECTED,
          reviewedById: admin.id,
          reviewedAt: archivedAt,
          reviewRemarks: "Billing record was archived before this request was reviewed.",
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: admin.tenantId,
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
  revalidatePath("/admin/payments/record");
  revalidatePath("/admin/payments/requests");
  revalidatePath("/admin/payments/active");
  revalidatePath("/admin/payments/history");
  revalidatePath("/admin/dashboard");
  revalidatePath("/portal/billing");
  revalidatePath("/portal/pay");
  revalidatePath("/portal/dashboard");
  redirect("/admin/billing?success=archived&message=Billing%20record%20archived.%20Payments%2C%20receipts%2C%20and%20audit%20history%20were%20preserved.");
}
