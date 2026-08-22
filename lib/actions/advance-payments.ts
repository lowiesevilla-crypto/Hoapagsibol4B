"use server";

import { NotificationType, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermissions } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import { getAppUrl } from "@/lib/app-url";
import { prisma } from "@/lib/db";
import { paymentSchema } from "@/lib/validation";
import { buildPaymentConfirmation, recordMonthlyDuesPayment } from "@/lib/services/payment-recording";
import { sendEmailNotification } from "@/lib/services/notifications";

export async function recordHomeownerPaymentAction(formData: FormData) {
  const admin = await requirePermissions([Permission.PAYMENTS_RECORD, Permission.RECEIPTS_ISSUE]);
  const parsed = paymentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`/admin/payments/record?error=${encodeURIComponent(parsed.error.issues[0]?.message || "Invalid payment details.")}`);
  const data = parsed.data;
  const homeownerId = String(formData.get("homeownerId") || "").trim();
  if (!homeownerId) redirect("/admin/payments/record?error=Select%20a%20homeowner.");
  const billIds = [...new Set(formData.getAll("billIds").map(String).filter(Boolean))];
  const idempotencyKey = String(formData.get("idempotencyKey") || "").trim();
  if (!idempotencyKey || idempotencyKey.length > 100) redirect("/admin/payments/record?error=Payment%20submission%20token%20is%20invalid.%20Refresh%20the%20form%20and%20try%20again.");

  let confirmation: Awaited<ReturnType<typeof recordMonthlyDuesPayment>> | null = null;
  try {
    confirmation = await prisma.$transaction((tx) => recordMonthlyDuesPayment(tx as unknown as Prisma.TransactionClient, {
      actor: { id: admin.id, tenantId: admin.tenantId, name: admin.name, email: admin.email },
      homeownerId,
      billIds,
      idempotencyKey,
      amount: data.amount,
      paymentDate: new Date(`${data.paymentDate}T00:00:00.000Z`),
      method: data.method,
      coverageFromMonth: data.coverageFromMonth,
      coverageFromYear: data.coverageFromYear,
      coverageToMonth: data.coverageToMonth,
      coverageToYear: data.coverageToYear,
      referenceNumber: data.referenceNumber,
      remarks: data.remarks,
    }), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    const idempotencyCollision = error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === "P2002"
      && JSON.stringify(error.meta?.target ?? "").includes("idempotencyKey");
    if (idempotencyCollision) {
      const existing = await prisma.payment.findFirst({ where: { tenantId: admin.tenantId, idempotencyKey }, include: { homeowner: { include: { user: true } }, allocations: true } });
      if (existing) confirmation = buildPaymentConfirmation(existing, true);
    }
    if (!confirmation) redirect(`/admin/payments/record?error=${encodeURIComponent(error instanceof Error ? error.message : "Payment could not be recorded.")}`);
  }

  if (confirmation && !confirmation.reused) {
    await sendEmailNotification({
      tenantId: admin.tenantId,
      recipientId: confirmation.recipientId,
      email: confirmation.email,
      subject: "HOA payment recorded",
      heading: "Payment confirmation",
      message: `Hello ${confirmation.name},\nYour HOA payment of PHP ${confirmation.amount.toFixed(2)} has been recorded successfully.\nPayment for: ${confirmation.coverageDisplay}\nReference: ${confirmation.referenceNumber || "Not required for cash payment"}${confirmation.unappliedCredit > 0 ? `\nAdvance credit: PHP ${confirmation.unappliedCredit.toFixed(2)}` : ""}`,
      type: NotificationType.PAYMENT_CONFIRMATION,
      actionLabel: "View payment history",
      actionUrl: `${getAppUrl()}/portal/payments`,
    }).catch(() => undefined);
  }

  revalidatePath("/admin/payments");
  revalidatePath("/admin/payments/record");
  revalidatePath("/admin/payments/active");
  revalidatePath("/admin/payments/history");
  revalidatePath("/admin/billing");
  revalidatePath("/admin/dashboard");
  revalidatePath("/portal/billing");
  revalidatePath("/portal/payments");
  revalidatePath("/portal/dashboard");
  revalidatePath(`/admin/homeowners/${homeownerId}`);
  if (!confirmation) redirect("/admin/payments/record?error=Payment%20could%20not%20be%20recorded.");
  revalidatePath(`/receipts/payment/${confirmation.paymentId}`);
  redirect(`/receipts/payment/${confirmation.paymentId}`);
}
