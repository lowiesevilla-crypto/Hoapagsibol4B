"use server";

import { CollectionType, DocumentDefinitionStatus, DocumentRequestStatus, NotificationType, PaymentMethod, PaymentRequestStatus, PaymentRequestType, Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { requirePermission, requirePermissions } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import { getAppUrl } from "@/lib/app-url";
import { prisma } from "@/lib/db";
import { savePaymentProof } from "@/lib/payment-proofs";
import { documentFeePaymentPurpose, documentRequestPublicReference } from "@/lib/services/document-fee-payments";
import { getHomeownerPaymentConfig } from "@/lib/services/homeowner-payment-config";
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
  const rawDocumentRequestId = String(formData.get("documentRequestId") || "").trim();
  const rawTransactionType = String(formData.get("transactionType") || "").trim();
  try {
    if (!user.homeownerProfile) throw new Error("Homeowner profile not found.");
    const paymentConfig = await getHomeownerPaymentConfig(user.tenantId);
    if (paymentConfig.flow !== "MANUAL_QR") {
      throw new Error("This HOA currently accepts new homeowner payments through PayMongo. Manual QR submissions are disabled.");
    }
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
    } else if (data.transactionType === PaymentRequestType.DOCUMENT_FEE) {
      const documentRequestId = data.documentRequestId?.trim();
      if (!documentRequestId) throw new Error("Select a document request to pay.");
      const request = await prisma.documentRequest.findFirst({
        where: { tenantId: user.tenantId, id: documentRequestId, homeownerId: user.homeownerProfile.id, archivedAt: null },
        include: { definition: true, paymentRequest: true },
      });
      if (!request) throw new Error("Document request was not found for your homeowner account.");
      if (!request.paymentRequiredSnapshot) throw new Error("This document request does not require a document fee.");
      if (!request.definition || request.definition.tenantId !== user.tenantId || !request.definition.active || request.definition.status !== DocumentDefinitionStatus.ACTIVE || request.definition.archivedAt) {
        throw new Error("This document configuration is no longer active. Please contact the HOA office.");
      }
      const terminalDocumentStatuses: DocumentRequestStatus[] = [DocumentRequestStatus.CANCELLED, DocumentRequestStatus.REJECTED, DocumentRequestStatus.REVOKED, DocumentRequestStatus.ISSUED, DocumentRequestStatus.READY_FOR_DOWNLOAD, DocumentRequestStatus.GENERATED, DocumentRequestStatus.DOWNLOADED];
      if (terminalDocumentStatuses.includes(request.status)) {
        throw new Error("This document request can no longer accept a fee payment.");
      }
      const feeAmount = Number(request.feeAmountSnapshot);
      if (!Number.isFinite(feeAmount) || feeAmount <= 0) throw new Error("The saved document fee is invalid. Please contact the HOA office.");
      if (data.amount != null && Math.abs(Number(data.amount) - feeAmount) > 0.009) throw new Error("Document fee amount is controlled by the saved document definition.");
      if (request.paymentRequest?.status === PaymentRequestStatus.APPROVED) throw new Error("This document fee has already been confirmed.");
      if (request.paymentRequest?.status === PaymentRequestStatus.PENDING_REVIEW && (request.paymentRequest.referenceNumber || request.paymentRequest.proofImageUrl)) {
        throw new Error("This document fee payment has already been submitted for verification.");
      }
      const currentRequestId = request.paymentRequest?.id;
      const activeDuplicate = await prisma.paymentRequest.findFirst({ where: { tenantId: user.tenantId, referenceNumber, status: { not: "REJECTED" }, ...(currentRequestId ? { id: { not: currentRequestId } } : {}) } });
      if (activeDuplicate) throw new Error("This payment reference number has already been submitted for verification.");
      const proof = await savePaymentProof(formData, user.tenant.slug);
      const requestReference = documentRequestPublicReference(request);
      const description = documentFeePaymentPurpose({ documentType: request.definition.displayName, requestReference });
      await prisma.$transaction(async (tx) => {
        const existing = await tx.paymentRequest.findFirst({ where: { tenantId: user.tenantId, documentRequestId: request.id } });
        if (existing?.status === PaymentRequestStatus.APPROVED) throw new Error("This document fee has already been confirmed.");
        if (existing && existing.status === PaymentRequestStatus.PENDING_REVIEW && (existing.referenceNumber || existing.proofImageUrl)) {
          throw new Error("This document fee payment has already been submitted for verification.");
        }
        const paymentRequest = existing
          ? await tx.paymentRequest.update({
              where: { id: existing.id },
              data: {
                status: PaymentRequestStatus.PENDING_REVIEW,
                collectionType: CollectionType.OTHER,
                description,
                amount: request.feeAmountSnapshot,
                paymentDate,
                referenceNumber,
                proofImageUrl: proof?.url || data.proofImageUrl || null,
                proofFileName: proof?.fileName || null,
                proofContentType: proof?.contentType || null,
                proofFileSize: proof?.size || null,
                payerNotes: data.payerNotes || null,
                reviewRemarks: null,
                reviewedAt: null,
                reviewedById: null,
              },
            })
          : await tx.paymentRequest.create({
              data: {
                tenantId: user.tenantId,
                type: PaymentRequestType.DOCUMENT_FEE,
                homeownerId: user.homeownerProfile!.id,
                documentRequestId: request.id,
                collectionType: CollectionType.OTHER,
                description,
                amount: request.feeAmountSnapshot,
                paymentDate,
                referenceNumber,
                proofImageUrl: proof?.url || data.proofImageUrl || null,
                proofFileName: proof?.fileName || null,
                proofContentType: proof?.contentType || null,
                proofFileSize: proof?.size || null,
                payerNotes: data.payerNotes || null,
              },
            });
        await tx.documentRequestHistory.create({ data: { tenantId: user.tenantId, requestId: request.id, status: DocumentRequestStatus.PENDING_PAYMENT, actorId: user.id, note: `Document fee payment submitted for HOA verification. Reference: ${referenceNumber}.` } });
        await tx.auditLog.create({ data: { tenantId: user.tenantId, actorId: user.id, module: "PAYMENTS", action: "SUBMIT_DOCUMENT_FEE_PAYMENT", entityType: "PaymentRequest", entityId: paymentRequest.id, metadata: { documentRequestId: request.id, definitionId: request.definitionId, amount: feeAmount, requestReference, referenceNumber } } });
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
    const params = new URLSearchParams({ error: error instanceof Error ? error.message : "Payment request could not be submitted." });
    if (rawDocumentRequestId) params.set("documentRequestId", rawDocumentRequestId);
    redirect(`/portal/pay?${params.toString()}`);
  }

  revalidatePath("/portal/pay");
  revalidatePath("/portal/documents");
  revalidatePath("/admin/payments");
  revalidatePath("/admin/payments/requests");
  redirect(rawTransactionType === PaymentRequestType.DOCUMENT_FEE ? "/portal/documents?success=payment&message=Document%20fee%20payment%20submitted%20for%20admin%20verification." : "/portal/pay?success=submitted&message=Payment%20submitted%20for%20admin%20verification.");
}

export async function approvePaymentRequestAction(formData: FormData) {
  const admin = await requirePermissions([
    Permission.PAYMENTS_RECORD,
    Permission.RECEIPTS_ISSUE,
  ]);
  const parsed = paymentReviewSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Invalid review details.");
  const pending = await prisma.paymentRequest.findFirst({
    where: { id: parsed.data.id, tenantId: admin.tenantId },
    include: { documentRequest: { select: { id: true, origin: true } } },
  });
  if (!pending) throw new Error("Payment request not found.");
  if (pending.type === PaymentRequestType.DOCUMENT_FEE && pending.documentRequest?.origin === "ADMIN") {
    const methodText = String(formData.get("paymentMethod") || pending.method).trim();
    const method = Object.values(PaymentMethod).includes(methodText as PaymentMethod) ? methodText as PaymentMethod : pending.method;
    const referenceNumber = String(formData.get("referenceNumber") || "").trim() || null;
    const paymentDateText = String(formData.get("paymentDate") || "").trim();
    const paymentDate = /^\d{4}-\d{2}-\d{2}$/.test(paymentDateText) ? new Date(`${paymentDateText}T00:00:00.000Z`) : pending.paymentDate;
    if (referenceNumber) {
      const duplicatePayment = await prisma.payment.findFirst({ where: { tenantId: admin.tenantId, referenceNumber, status: "ACTIVE" }, select: { id: true } });
      const duplicateCollection = await prisma.collection.findFirst({ where: { tenantId: admin.tenantId, referenceNumber }, select: { id: true } });
      if (duplicatePayment || duplicateCollection) throw new Error("This payment reference number has already been recorded.");
    }
    await prisma.paymentRequest.update({
      where: { id: pending.id },
      data: { method, referenceNumber, paymentDate },
    });
  }
  await approvePaymentRequest(parsed.data.id, admin.id, parsed.data.reviewRemarks, admin.tenantId);
  const approved = await prisma.paymentRequest.findFirst({
    where: { id: parsed.data.id, tenantId: admin.tenantId },
    include: { homeowner: { include: { user: true } }, payment: true, collection: true },
  });
  if (approved) await sendEmailNotification({ tenantId: admin.tenantId, recipientId: approved.homeowner.userId, email: approved.homeowner.user.email, subject: "HOA payment confirmed", heading: "Payment confirmation", message: `Hello ${approved.homeowner.user.name},\nYour payment of PHP ${Number(approved.amount).toFixed(2)} has been verified and approved.\nReference: ${approved.referenceNumber || "Not provided"}\nReceipt: ${approved.payment?.receiptNumber || approved.collection?.receiptNumber || "Available from the HOA office"}`, type: NotificationType.PAYMENT_CONFIRMATION, actionLabel: "View payment history", actionUrl: `${getAppUrl()}/portal/payments` }).catch(() => undefined);
  revalidatePaymentPages();
  if (approved?.documentRequestId) {
    revalidatePath(`/admin/documents/${approved.documentRequestId}`);
    revalidatePath(`/documents/${approved.documentRequestId}`);
    revalidatePath(`/documents/${approved.documentRequestId}/print`);
  }
  redirect("/admin/payments/requests?success=approved&message=Payment%20approved%20and%20officially%20recorded.");
}

export async function rejectPaymentRequestAction(formData: FormData) {
  const admin = await requirePermission(Permission.PAYMENTS_RECORD);
  const parsed = paymentReviewSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Invalid review details.");
  await rejectPaymentRequest(parsed.data.id, admin.id, parsed.data.reviewRemarks, admin.tenantId);
  const rejected = await prisma.paymentRequest.findFirst({ where: { id: parsed.data.id, tenantId: admin.tenantId }, select: { documentRequestId: true } });
  revalidatePaymentPages();
  if (rejected?.documentRequestId) {
    revalidatePath(`/admin/documents/${rejected.documentRequestId}`);
    revalidatePath("/portal/documents");
  }
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
  revalidatePath("/admin/documents");
  revalidatePath("/portal/pay");
  revalidatePath("/portal/documents");
  revalidatePath("/portal/payments");
  revalidatePath("/portal/billing");
  revalidatePath("/portal/collections");
  revalidatePath("/portal/dashboard");
}
