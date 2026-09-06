"use server";

import { randomUUID } from "node:crypto";
import { CollectionType, PaymentMethod, PaymentRequestStatus, PaymentRequestType, Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { HOMEOWNER_ADVANCE_DUES_TRANSACTION_TYPE } from "@/lib/homeowner-advance-dues";
import { paymongoBatchDescription } from "@/lib/homeowner-paymongo-batch";
import { PAYMONGO_PAYMENT_REQUEST_MARKER } from "@/lib/homeowner-payment-flow";
import { canSubmitDocumentFeePayment, documentFeePaymentPurpose, documentRequestPublicReference } from "@/lib/services/document-fee-payments";
import { quoteHomeownerAdvanceDues } from "@/lib/services/homeowner-advance-dues";
import { getHomeownerPaymentConfig } from "@/lib/services/homeowner-payment-config";
import { createHomeownerPayMongoCheckout } from "@/lib/services/homeowner-paymongo";

const homeownerCollectionTypes = new Set<CollectionType>([
  CollectionType.GATE_PASS,
  CollectionType.STICKER,
  CollectionType.MEMBERSHIP,
  CollectionType.CONSTRUCTION_BOND,
  CollectionType.OTHER,
]);

function checkoutReference(id: string) {
  return `HOP-${id}`;
}

export async function createHomeownerPayMongoCheckoutAction(formData: FormData) {
  const user = await requireUser(Role.HOMEOWNER);
  let requestId = "";
  const rawDocumentRequestId = String(formData.get("documentRequestId") || "").trim();
  try {
    if (!user.homeownerProfile) throw new Error("Homeowner profile not found.");
    const config = await getHomeownerPaymentConfig(user.tenantId);
    if (config.flow !== "PAYMONGO") throw new Error("This HOA is currently using manual QR payment verification. Online checkout is disabled.");
    if (!config.paymongoServerConfigured) throw new Error("Online payment is temporarily unavailable. Please contact the HOA administrator.");
    if (!config.paymongoLinkedAccountId) throw new Error("This HOA does not have a linked online payment merchant account configured.");

    const transactionType = String(formData.get("transactionType") || "").trim();
    const paymentDate = new Date();
    paymentDate.setUTCHours(0, 0, 0, 0);
    const gatewayFields = (id: string) => ({
      id,
      tenantId: user.tenantId,
      homeownerId: user.homeownerProfile!.id,
      paymentDate,
      method: PaymentMethod.OTHER,
      referenceNumber: checkoutReference(id),
      proofImageUrl: null,
      proofFileName: config.paymongoLinkedAccountId,
      proofContentType: PAYMONGO_PAYMENT_REQUEST_MARKER,
      proofFileSize: null,
    } as const);

    if (transactionType === HOMEOWNER_ADVANCE_DUES_TRANSACTION_TYPE) {
      const quote = await quoteHomeownerAdvanceDues({
        tenantId: user.tenantId,
        homeownerId: user.homeownerProfile.id,
        from: String(formData.get("advanceFromMonth") || ""),
        to: String(formData.get("advanceToMonth") || ""),
      });
      const existing = await prisma.paymentRequest.findFirst({
        where: {
          tenantId: user.tenantId,
          homeownerId: user.homeownerProfile.id,
          type: PaymentRequestType.MONTHLY_DUES,
          billId: null,
          status: PaymentRequestStatus.PENDING_REVIEW,
          proofContentType: PAYMONGO_PAYMENT_REQUEST_MARKER,
          description: quote.description,
        },
        select: { id: true, amount: true },
      });
      if (existing && Math.abs(Number(existing.amount) - quote.total) > 0.009) {
        throw new Error("An Advance Monthly Dues checkout for this coverage is already in progress using an earlier rule amount. Finish or cancel that checkout before requesting a new quote.");
      }
      if (existing) {
        requestId = existing.id;
      } else {
        requestId = randomUUID();
        await prisma.paymentRequest.create({
          data: {
            ...gatewayFields(requestId),
            type: PaymentRequestType.MONTHLY_DUES,
            billId: null,
            description: quote.description,
            amount: quote.total,
            payerNotes: `PayMongo Online advance Monthly Dues · ${quote.coverageLabel}`,
          },
        });
        await prisma.auditLog.create({
          data: {
            tenantId: user.tenantId,
            actorId: user.id,
            module: "PAYMENTS",
            action: "CREATE_HOMEOWNER_ADVANCE_DUES_CHECKOUT",
            entityType: "PaymentRequest",
            entityId: requestId,
            metadata: {
              homeownerId: user.homeownerProfile.id,
              coverageFrom: quote.from,
              coverageTo: quote.to,
              coverageLabel: quote.coverageLabel,
              monthCount: quote.monthCount,
              amount: quote.total,
              source: "PAYMONGO_HOMEOWNER",
            },
          },
        });
      }
    } else if (transactionType === PaymentRequestType.MONTHLY_DUES) {
      const billIds = formData.getAll("billIds").map(String).map((value) => value.trim()).filter(Boolean);
      if (!billIds.length) throw new Error("Select at least one unpaid monthly dues record.");
      const uniqueBillIds = [...new Set(billIds)];
      const bills = await prisma.bill.findMany({
        where: {
          tenantId: user.tenantId,
          id: { in: uniqueBillIds },
          homeownerId: user.homeownerProfile.id,
          balance: { gt: 0 },
          archivedAt: null,
        },
        include: { paymentRequests: { where: { status: PaymentRequestStatus.PENDING_REVIEW }, select: { id: true } } },
        orderBy: [{ dueDate: "asc" }, { billingMonth: "asc" }],
      });
      if (bills.length !== uniqueBillIds.length) throw new Error("One or more selected billing records are no longer available.");
      const pending = bills.find((bill) => bill.paymentRequests.length > 0);
      if (pending) throw new Error("One selected billing record already has a payment in progress. Continue that payment from Payment Status or choose another bill.");

      const batchId = randomUUID();
      requestId = batchId;
      const batchDescription = paymongoBatchDescription(batchId);
      await prisma.paymentRequest.createMany({
        data: bills.map((bill, index) => {
          const id = index === 0 ? batchId : randomUUID();
          return {
            ...gatewayFields(id),
            type: PaymentRequestType.MONTHLY_DUES,
            billId: bill.id,
            description: batchDescription,
            amount: bill.balance,
            payerNotes: "PayMongo Online checkout",
          };
        }),
      });
    } else if (transactionType === PaymentRequestType.DOCUMENT_FEE) {
      if (!rawDocumentRequestId) throw new Error("Select a document request to pay.");
      const documentRequest = await prisma.documentRequest.findFirst({
        where: { tenantId: user.tenantId, id: rawDocumentRequestId, homeownerId: user.homeownerProfile.id, archivedAt: null },
        include: { definition: true, paymentRequest: true },
      });
      if (!documentRequest || !documentRequest.definition) throw new Error("Document request was not found for your homeowner account.");
      if (!canSubmitDocumentFeePayment(documentRequest)) throw new Error("This document fee is not currently available for payment.");
      const feeAmount = Number(documentRequest.feeAmountSnapshot);
      if (!Number.isFinite(feeAmount) || feeAmount <= 0) throw new Error("The saved document fee is invalid. Please contact the HOA office.");
      const description = documentFeePaymentPurpose({
        documentType: documentRequest.definition.displayName,
        requestReference: documentRequestPublicReference(documentRequest),
      });
      const existing = documentRequest.paymentRequest;
      if (existing) {
        requestId = existing.id;
        await prisma.paymentRequest.update({
          where: { id: existing.id },
          data: {
            status: PaymentRequestStatus.PENDING_REVIEW,
            type: PaymentRequestType.DOCUMENT_FEE,
            collectionType: CollectionType.OTHER,
            description,
            amount: documentRequest.feeAmountSnapshot,
            paymentDate,
            method: PaymentMethod.OTHER,
            referenceNumber: checkoutReference(existing.id),
            proofImageUrl: null,
            proofFileName: config.paymongoLinkedAccountId,
            proofContentType: PAYMONGO_PAYMENT_REQUEST_MARKER,
            proofFileSize: null,
            payerNotes: "PayMongo Online checkout",
            reviewRemarks: null,
            reviewedAt: null,
            reviewedById: null,
          },
        });
      } else {
        requestId = randomUUID();
        await prisma.paymentRequest.create({
          data: {
            ...gatewayFields(requestId),
            type: PaymentRequestType.DOCUMENT_FEE,
            documentRequestId: documentRequest.id,
            collectionType: CollectionType.OTHER,
            description,
            amount: documentRequest.feeAmountSnapshot,
            payerNotes: "PayMongo Online checkout",
          },
        });
      }
    } else {
      const collectionType = transactionType as CollectionType;
      if (!homeownerCollectionTypes.has(collectionType)) throw new Error("That collection type cannot be paid from the homeowner portal.");
      const amount = Number(formData.get("amount") || 0);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid payment amount.");
      const description = String(formData.get("description") || "").trim();
      if (collectionType === CollectionType.OTHER && !description) throw new Error("Describe the payment purpose.");
      requestId = randomUUID();
      await prisma.paymentRequest.create({
        data: {
          ...gatewayFields(requestId),
          type: PaymentRequestType.OTHER_COLLECTION,
          collectionType,
          description: description || null,
          amount,
          payerNotes: "PayMongo Online checkout",
        },
      });
    }

    const checkout = await createHomeownerPayMongoCheckout(requestId, user.tenantId);
    redirect(checkout.checkoutUrl);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error && String((error as { digest?: unknown }).digest || "").startsWith("NEXT_REDIRECT")) throw error;
    if (requestId) {
      const batchDescription = paymongoBatchDescription(requestId);
      await prisma.paymentRequest.updateMany({
        where: {
          tenantId: user.tenantId,
          status: PaymentRequestStatus.PENDING_REVIEW,
          proofContentType: PAYMONGO_PAYMENT_REQUEST_MARKER,
          OR: [{ id: requestId }, { description: batchDescription }],
        },
        data: {
          status: PaymentRequestStatus.REJECTED,
          reviewRemarks: "Online checkout could not be created. No payment was recorded.",
          reviewedAt: new Date(),
        },
      }).catch(() => undefined);
    }
    const params = new URLSearchParams({ error: error instanceof Error ? error.message : "Online checkout could not be created." });
    if (rawDocumentRequestId) params.set("documentRequestId", rawDocumentRequestId);
    redirect(`/portal/pay?${params.toString()}`);
  }
}
