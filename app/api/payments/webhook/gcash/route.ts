import { PaymentRequestStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { approvePaymentRequest } from "@/lib/services/payment-requests";
import { getPaymentSettings } from "@/lib/system-settings";

type WebhookPayload = {
  paymentRequestId?: string;
  referenceNumber?: string;
  status?: string;
  amount?: number;
};

export async function POST(request: NextRequest) {
  const settings = await getPaymentSettings();
  if (!settings.paymentWebhookSecret) return NextResponse.json({ error: "Payment webhook is not configured." }, { status: 503 });
  const providedSecret = request.headers.get("x-hoa-payment-webhook-secret") || "";
  if (providedSecret !== settings.paymentWebhookSecret) return NextResponse.json({ error: "Invalid webhook secret." }, { status: 401 });

  const payload = await request.json().catch(() => null) as WebhookPayload | null;
  if (!payload) return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  const paid = ["PAID", "SUCCESS", "SUCCESSFUL", "COMPLETED"].includes(String(payload.status || "").toUpperCase());
  if (!paid) return NextResponse.json({ error: "Webhook status is not a paid/success state." }, { status: 400 });
  if (!payload.paymentRequestId && !payload.referenceNumber) return NextResponse.json({ error: "paymentRequestId or referenceNumber is required." }, { status: 400 });

  const identifiers = [
    payload.paymentRequestId ? { id: payload.paymentRequestId } : undefined,
    payload.referenceNumber ? { referenceNumber: payload.referenceNumber } : undefined,
  ].filter(Boolean) as { id?: string; referenceNumber?: string }[];
  const paymentRequest = await prisma.paymentRequest.findFirst({
    where: {
      status: PaymentRequestStatus.PENDING_REVIEW,
      OR: identifiers,
    },
  });
  if (!paymentRequest) return NextResponse.json({ error: "Pending payment request not found." }, { status: 404 });
  if (typeof payload.amount === "number" && Math.abs(payload.amount - Number(paymentRequest.amount)) > 0.009) {
    return NextResponse.json({ error: "Webhook amount does not match the pending payment request." }, { status: 409 });
  }

  const approved = await approvePaymentRequest(paymentRequest.id, undefined, "Auto-approved by payment webhook.");
  revalidatePath("/admin/payments");
  revalidatePath("/portal/pay");
  revalidatePath("/portal/payments");
  revalidatePath("/portal/billing");
  return NextResponse.json({ ok: true, paymentRequestId: approved.id, status: approved.status });
}
