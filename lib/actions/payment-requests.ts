"use server";

import { CollectionType, NotificationType, PaymentRequestType, Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getAppUrl } from "@/lib/app-url";
import { prisma } from "@/lib/db";
import { savePaymentProof } from "@/lib/payment-proofs";
import { approvePaymentRequest, rejectPaymentRequest } from "@/lib/services/payment-requests";
import { paymentRequestSchema, paymentReviewSchema } from "@/lib/validation";
import { sendEmailNotification } from "@/lib/services/notifications";

const homeownerCollectionTypes = new Set<CollectionType>([
  CollectionType.GATE_PASS,
  CollectionType.STICKER,
  CollectionType.MEMBERSHIP,
  CollectionType.CONSTRUCTION_BOND,
  CollectionType.OTHER,
]);

export async function submitPaymentRequestAction(formData: FormData) {
  const user = await requireUser(Role.HOMEOWNER);
  try {
    if (!user.homeownerProfile) throw new Error("Homeowner profile not found.");
    const parsed = paymentRequestSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Invalid payment request.");
    const data = parsed.data;
    const paymentDate = new Date(`${data.paymentDate}T00:00:00.000Z`);
    const referenceNumber = data.referenceNumber.trim();
    const duplicatePayment = await prisma.payment.findFirst({ where: { tenantId: user.tenantId, referenceNumber, status: "ACTIVE" } });
    if (duplicatePayment) throw new Error("This payment reference number has already been recorded.");
    const duplicateRequest = await prisma.paymentRequest.findFirst({ where: { tenantId: user.tenantId, referenceNumber, status: { not: "REJECTED" } } });
    if (duplicateRequest) throw new Error("This payment reference number has already been submitted for verification.");

    if (data.transactionType === PaymentRequestType.MONTHLY_DUES) {
    const billIds = formData.getAll("billIds").map(String).filter(Boolean);
    if (!billIds.length) throw new Error("Select at least one unpaid monthly dues record.");
    const uniqueBillIds = [...new Set(billIds)];
    const bills = await prisma.bill.findMany({
      where: { tenantId: user.tenantId, id: { in: uniqueBillIds }, homeownerId: user.homeownerProfile.id, balance: { gt: 0 }, archivedAt: null },
      include: { paymentRequests: { where: { status: "PENDING_REVIEW" }, select: { id: true } } },
      orderBy: [{ dueDate: "asc" }, { billingMonth: "asc" }],
    });
    if (bills.length !== uniqueBillIds.length) throw new Error("One or more selected dues records are no longer available.");
    const pending = bills.find((bill) => bill.paymentRequests.length > 0);
    if (pending) throw new Error("One selected bill already has a pending QR payment verification.");
    const proof = await savePaymentProof(formData, user.tenant.slug);
    await prisma.paymentRequest.createMany({
      data: bills.map((bill) => ({
        tenantId: user.tenantId,
        type: PaymentRequestType.MONTHLY_DUES,
        homeownerId: user.homeownerProfile!.id,
        billId: bill.id,
        amount: bill.balance,
        paymentDate,
        referenceNumber,
        proofImageUrl: proof?.url || data.proofImageUrl || null,
        proofFileName: proof?.fileName || null,
        proofContentType: proof?.contentType || null,
        proofFileSize: proof?.size || null,
        payerNotes: data.payerNotes || null,
      })),
    });
    } else {
      const collectionType = data.transactionType as CollectionType;
      if (!homeownerCollectionTypes.has(collectionType)) throw new Error("That collection type cannot be paid from the homeowner portal.");
      if (!data.amount) throw new Error("Enter the payment amount.");
      if (collectionType === CollectionType.OTHER && !data.description) throw new Error("Describe the payment purpose.");
      const proof = await savePaymentProof(formData, user.tenant.slug);
      await prisma.paymentRequest.create({
        data: {
          tenantId: user.tenantId,
          type: PaymentRequestType.OTHER_COLLECTION,
          homeownerId: user.homeownerProfile.id,
          collectionType,
          description: data.description || null,
          amount: data.amount,
          paymentDate,
          referenceNumber,
          proofImageUrl: proof?.url || data.proofImageUrl || null,
          proofFileName: proof?.fileName || null,
          proofContentType: proof?.contentType || null,
          proofFileSize: proof?.size || null,
          payerNotes: data.payerNotes || null,
        },
      });
    }
  } catch (error) {
    redirect(`/portal/pay?error=${encodeURIComponent(error instanceof Error ? error.message : "Payment request could not be submitted.")}`);
  }

  revalidatePath("/portal/pay");
  revalidatePath("/admin/payments");
  revalidatePath("/admin/payments/requests");
  redirect("/portal/pay?success=submitted&message=Payment%20submitted%20for%20admin%20verification.");
}

export async function approvePaymentRequestAction(formData: FormData) {
  const admin = await requireUser(Role.ADMIN);
  const parsed = paymentReviewSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Invalid review details.");
  await approvePaymentRequest(parsed.data.id, admin.id, parsed.data.reviewRemarks, admin.tenantId);
  const approved = await prisma.paymentRequest.findUnique({ where: { id: parsed.data.id }, include: { homeowner: { include: { user: true } }, payment: true, collection: true } });
  if (approved) await sendEmailNotification({ recipientId: approved.homeowner.userId, email: approved.homeowner.user.email, subject: "HOA payment confirmed", heading: "Payment confirmation", message: `Hello ${approved.homeowner.user.name},\nYour payment of PHP ${Number(approved.amount).toFixed(2)} has been verified and approved.\nReference: ${approved.referenceNumber || "Not provided"}\nReceipt: ${approved.payment?.receiptNumber || approved.collection?.receiptNumber || "Available from the HOA office"}`, type: NotificationType.PAYMENT_CONFIRMATION, actionLabel: "View payment history", actionUrl: `${getAppUrl()}/portal/payments` }).catch(() => undefined);
  revalidatePaymentPages();
  redirect("/admin/payments/requests?success=approved&message=QR%20payment%20approved%20and%20officially%20recorded.");
}

export async function rejectPaymentRequestAction(formData: FormData) {
  const admin = await requireUser(Role.ADMIN);
  const parsed = paymentReviewSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Invalid review details.");
  await rejectPaymentRequest(parsed.data.id, admin.id, parsed.data.reviewRemarks, admin.tenantId);
  revalidatePaymentPages();
  redirect("/admin/payments/requests?success=rejected&message=QR%20payment%20request%20has%20been%20rejected.");
}

function revalidatePaymentPages() {
  revalidatePath("/admin/payments");
  revalidatePath("/admin/payments/record");
  revalidatePath("/admin/payments/requests");
  revalidatePath("/admin/payments/active");
  revalidatePath("/admin/payments/history");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/billing");
  revalidatePath("/admin/collections");
  revalidatePath("/portal/pay");
  revalidatePath("/portal/payments");
  revalidatePath("/portal/billing");
  revalidatePath("/portal/collections");
  revalidatePath("/portal/dashboard");
}
