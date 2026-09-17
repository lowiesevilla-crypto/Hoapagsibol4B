"use server";

import { NotificationType, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission, requirePermissions } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import { getAppUrl } from "@/lib/app-url";
import { prisma } from "@/lib/db";
import { paymentAmountUpdateSchema, paymentSchema, paymentVoidSchema } from "@/lib/validation";
import { updatePaymentAmountLedger, voidPaymentLedger } from "@/lib/services/payment-ledger";
import { buildPaymentConfirmation, recordMonthlyDuesPayment } from "@/lib/services/payment-recording";
import { sendEmailNotification } from "@/lib/services/notifications";

const paymentRevalidationPaths = [
  "/admin/payments",
  "/admin/payments/record",
  "/admin/payments/requests",
  "/admin/payments/active",
  "/admin/payments/history",
  "/admin/billing",
  "/admin/receipts",
  "/admin/reports",
  "/admin/dashboard",
  "/portal/billing",
  "/portal/payments",
  "/portal/dashboard",
] as const;

export async function recordPaymentAction(formData: FormData) {
  const admin = await requirePermissions([
    Permission.PAYMENTS_RECORD,
    Permission.RECEIPTS_ISSUE,
  ]);
  const parsed = paymentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`/admin/payments/record?error=${encodeURIComponent(parsed.error.issues[0]?.message || "Invalid payment details.")}`);
  const data = parsed.data;
  const billIds = [...new Set(formData.getAll("billIds").map(String).filter(Boolean))];
  if (!billIds.length) redirect("/admin/payments/record?error=Select%20at%20least%20one%20open%20billing%20item.");
  const idempotencyKey = String(formData.get("idempotencyKey") || "").trim();
  if (!idempotencyKey || idempotencyKey.length > 100) redirect("/admin/payments/record?error=Payment%20submission%20token%20is%20invalid.%20Refresh%20the%20form%20and%20try%20again.");

  let confirmation: Awaited<ReturnType<typeof recordMonthlyDuesPayment>> | null = null;
  try {
    confirmation = await prisma.$transaction((tx) => recordMonthlyDuesPayment(tx as unknown as Prisma.TransactionClient, {
      actor: { id: admin.id, tenantId: admin.tenantId, name: admin.name, email: admin.email },
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

  if (confirmation && !confirmation.reused) await sendEmailNotification({ tenantId: admin.tenantId, recipientId: confirmation.recipientId, email: confirmation.email, subject: "HOA payment recorded", heading: "Payment confirmation", message: `Hello ${confirmation.name},\nYour HOA payment of PHP ${confirmation.amount.toFixed(2)} has been recorded successfully.\nPayment for: ${confirmation.coverageDisplay}\nReference: ${confirmation.referenceNumber || "Not required for cash payment"}`, type: NotificationType.PAYMENT_CONFIRMATION, actionLabel: "View payment history", actionUrl: `${getAppUrl()}/portal/payments` }).catch(() => undefined);

  if (!confirmation) redirect("/admin/payments/record?error=Payment%20could%20not%20be%20recorded.");
  safeRevalidatePaymentPages({ action: "record", tenantId: admin.tenantId, actorId: admin.id, paymentId: confirmation.paymentId });
  redirect(`/receipts/payment/${confirmation.paymentId}`);
}

export async function updatePaymentAmountAction(formData: FormData) {
  const admin = await requirePermission(Permission.PAYMENTS_ALLOCATE);
  const parsed = paymentAmountUpdateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`/admin/payments/active?error=${encodeURIComponent(parsed.error.issues[0]?.message || "Enter a valid payment amount.")}`);
  const { id, amount, reason } = parsed.data;

  try {
    await updatePaymentAmountLedger({ paymentId: id, amount, actor: admin, reason });
  } catch (error) {
    redirect(`/admin/payments/active?error=${encodeURIComponent(error instanceof Error ? error.message : "Payment amount could not be updated.")}`);
  }

  safeRevalidatePaymentPages({ action: "update_amount", tenantId: admin.tenantId, actorId: admin.id, paymentId: id });
  redirect("/admin/payments/active?success=saved&message=Payment%20amount%20updated%20and%20billing%20totals%20recalculated.");
}

export async function voidPaymentAction(formData: FormData) {
  const admin = await requirePermission(Permission.PAYMENTS_VOID);
  const parsed = paymentVoidSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`/admin/payments/active?error=${encodeURIComponent(parsed.error.issues[0]?.message || "Payment could not be voided.")}`);
  const { id, reason } = parsed.data;

  let homeownerId: string | undefined;
  try {
    const result = await voidPaymentLedger({ paymentId: id, actor: admin, reason });
    homeownerId = result.homeownerId;
  } catch (error) {
    redirect(`/admin/payments/active?error=${encodeURIComponent(error instanceof Error ? error.message : "Payment could not be voided.")}`);
  }

  safeRevalidatePaymentPages({ action: "void", tenantId: admin.tenantId, actorId: admin.id, paymentId: id, homeownerId });
  redirect("/admin/payments/active?success=deleted&message=Payment%20voided%2C%20archived%2C%20and%20billing%20totals%20recalculated.");
}

function safeRevalidatePaymentPages(context: { action: string; tenantId: string; actorId: string; paymentId?: string; homeownerId?: string }) {
  const paths = [
    ...paymentRevalidationPaths,
    ...(context.paymentId ? [`/receipts/payment/${context.paymentId}`] : []),
    ...(context.homeownerId ? [
      `/admin/homeowners/${context.homeownerId}`,
      `/admin/homeowners/${context.homeownerId}/soa`,
      `/admin/homeowners/${context.homeownerId}/soa/pdf`,
    ] : []),
  ];

  for (const path of paths) {
    try {
      revalidatePath(path);
    } catch (error) {
      console.error("[HOAHub] payment_post_commit_revalidation_failed", {
        ...context,
        path,
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
