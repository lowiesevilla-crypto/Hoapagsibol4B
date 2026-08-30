"use server";

import { NotificationType, Prisma, TenantModule } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermissions } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import { getAppUrl } from "@/lib/app-url";
import { prisma } from "@/lib/db";
import { isUxActionProgressEnabled } from "@/lib/feature-flags/ux-action-progress";
import { paymentSchema } from "@/lib/validation";
import { buildPaymentConfirmation, recordMonthlyDuesPayment } from "@/lib/services/payment-recording";
import { sendEmailNotification } from "@/lib/services/notifications";

export type RecordHomeownerPaymentProgressState = {
  status: "idle" | "success" | "error";
  message: string;
  paymentId: string | null;
  receiptUrl: string | null;
  reused: boolean;
};

export async function recordHomeownerPaymentAction(formData: FormData) {
  let result: Awaited<ReturnType<typeof recordHomeownerPaymentSubmission>>;
  try {
    result = await recordHomeownerPaymentSubmission(formData);
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    redirect(`/admin/payments/record?error=${encodeURIComponent(paymentErrorMessage(error))}`);
  }

  redirect(`/receipts/payment/${result.confirmation.paymentId}`);
}

export async function recordHomeownerPaymentProgressAction(_previousState: RecordHomeownerPaymentProgressState, formData: FormData): Promise<RecordHomeownerPaymentProgressState> {
  try {
    const result = await recordHomeownerPaymentSubmission(formData, { requireActionProgressFlag: true });
    const receiptUrl = `/receipts/payment/${result.confirmation.paymentId}`;
    return {
      status: "success",
      message: result.confirmation.reused ? "Payment was already recorded. Opening the existing receipt." : "Payment recorded successfully. Opening receipt.",
      paymentId: result.confirmation.paymentId,
      receiptUrl,
      reused: result.confirmation.reused,
    };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    return {
      status: "error",
      message: paymentErrorMessage(error),
      paymentId: null,
      receiptUrl: null,
      reused: false,
    };
  }
}

async function recordHomeownerPaymentSubmission(formData: FormData, options: { requireActionProgressFlag?: boolean } = {}) {
  const admin = await requirePermissions([Permission.PAYMENTS_RECORD, Permission.RECEIPTS_ISSUE]);
  if (options.requireActionProgressFlag && !isUxActionProgressEnabled({ tenantId: admin.tenantId, module: TenantModule.BILLING, role: admin.role })) {
    throw new Error("Action progress is not enabled for this tenant.");
  }
  const parsed = paymentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Invalid payment details.");
  const data = parsed.data;
  const homeownerId = String(formData.get("homeownerId") || "").trim();
  if (!homeownerId) throw new Error("Select a homeowner.");
  const billIds = [...new Set(formData.getAll("billIds").map(String).filter(Boolean))];
  const idempotencyKey = String(formData.get("idempotencyKey") || "").trim();
  if (!idempotencyKey || idempotencyKey.length > 100) throw new Error("Payment submission token is invalid. Refresh the form and try again.");

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
    if (!confirmation) throw error;
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
  if (!confirmation) throw new Error("Payment could not be recorded.");
  revalidatePath(`/receipts/payment/${confirmation.paymentId}`);
  return { confirmation, homeownerId };
}

function paymentErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Payment could not be recorded.";
}

function isNextRedirectError(error: unknown) {
  return Boolean(error && typeof error === "object" && "digest" in error && String((error as { digest?: unknown }).digest || "").startsWith("NEXT_REDIRECT"));
}
