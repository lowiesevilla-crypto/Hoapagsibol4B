"use server";

import { NotificationType, Prisma, Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getAppUrl } from "@/lib/app-url";
import { prisma } from "@/lib/db";
import { paymentAmountUpdateSchema, paymentSchema, paymentVoidSchema } from "@/lib/validation";
import { updatePaymentAmountLedger, voidPaymentLedger } from "@/lib/services/payment-ledger";
import { recordMonthlyDuesPayment } from "@/lib/services/payment-recording";
import { sendEmailNotification } from "@/lib/services/notifications";

export async function recordPaymentAction(formData: FormData) {
  const admin = await requireUser(Role.ADMIN);
  const parsed = paymentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Invalid payment details.");
  const data = parsed.data;
  const billIds = [...new Set(formData.getAll("billIds").map(String).filter(Boolean))];
  if (!billIds.length) throw new Error("Select at least one open billing item.");

  let confirmation: Awaited<ReturnType<typeof recordMonthlyDuesPayment>> | null = null;
  try {
    confirmation = await prisma.$transaction((tx) => recordMonthlyDuesPayment(tx, {
      actor: { id: admin.id, name: admin.name, email: admin.email },
      billIds,
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
    redirect(`/admin/payments?error=${encodeURIComponent(error instanceof Error ? error.message : "Payment could not be recorded.")}`);
  }

  if (confirmation) await sendEmailNotification({ recipientId: confirmation.recipientId, email: confirmation.email, subject: "HOA payment recorded", heading: "Payment confirmation", message: `Hello ${confirmation.name},\nYour HOA payment of PHP ${confirmation.amount.toFixed(2)} has been recorded successfully.\nPayment for: ${confirmation.coverageDisplay}\nReference: ${confirmation.referenceNumber || "Not required for cash payment"}`, type: NotificationType.PAYMENT_CONFIRMATION, actionLabel: "View payment history", actionUrl: `${getAppUrl()}/portal/payments` }).catch(() => undefined);

  revalidatePath("/admin/payments");
  revalidatePath("/admin/billing");
  revalidatePath("/admin/dashboard");
  redirect("/admin/payments?success=recorded&message=Payment%20recorded%20successfully.");
}

export async function updatePaymentAmountAction(formData: FormData) {
  const admin = await requireUser(Role.ADMIN);
  const parsed = paymentAmountUpdateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`/admin/payments?error=${encodeURIComponent(parsed.error.issues[0]?.message || "Enter a valid payment amount.")}`);
  const { id, amount, reason } = parsed.data;

  try {
    await updatePaymentAmountLedger({ paymentId: id, amount, actor: admin, reason });
  } catch (error) {
    redirect(`/admin/payments?error=${encodeURIComponent(error instanceof Error ? error.message : "Payment amount could not be updated.")}`);
  }

  revalidatePath("/admin/payments");
  revalidatePath("/admin/billing");
  revalidatePath("/admin/dashboard");
  revalidatePath("/portal/billing");
  revalidatePath("/portal/payments");
  revalidatePath("/portal/dashboard");
  revalidatePath(`/receipts/payment/${id}`);
  redirect("/admin/payments?success=saved&message=Payment%20amount%20updated%20and%20billing%20totals%20recalculated.");
}

export async function voidPaymentAction(formData: FormData) {
  const admin = await requireUser(Role.ADMIN);
  const parsed = paymentVoidSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`/admin/payments?error=${encodeURIComponent(parsed.error.issues[0]?.message || "Payment could not be voided.")}`);
  const { id, reason } = parsed.data;

  try {
    await voidPaymentLedger({ paymentId: id, actor: admin, reason });
  } catch (error) {
    redirect(`/admin/payments?error=${encodeURIComponent(error instanceof Error ? error.message : "Payment could not be voided.")}`);
  }

  revalidatePaymentPages(id);
  redirect("/admin/payments?success=deleted&message=Payment%20voided%2C%20archived%2C%20and%20billing%20totals%20recalculated.");
}

function revalidatePaymentPages(paymentId?: string) {
  revalidatePath("/admin/payments");
  revalidatePath("/admin/billing");
  revalidatePath("/admin/dashboard");
  revalidatePath("/portal/billing");
  revalidatePath("/portal/payments");
  revalidatePath("/portal/dashboard");
  if (paymentId) revalidatePath(`/receipts/payment/${paymentId}`);
}
