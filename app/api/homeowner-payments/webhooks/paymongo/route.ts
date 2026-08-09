import { platformPrisma as prisma } from "@/lib/db";
import { extractPayMongoReceiptDetails, PAYMONGO_RECEIPT_DETAILS_ACTION } from "@/lib/paymongo-receipt-details";
import { processHomeownerPayMongoWebhook } from "@/lib/services/homeowner-paymongo";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const result = await processHomeownerPayMongoWebhook(rawBody, request.headers.get("paymongo-signature"));

  if (result.ok && "paymentRequestId" in result && result.paymentRequestId) {
    const details = extractPayMongoReceiptDetails(rawBody);
    if (details && (details.paymentChannel || details.paidAt)) {
      const paymentRequest = await prisma.paymentRequest.findUnique({
        where: { id: result.paymentRequestId },
        select: { tenantId: true },
      });
      if (paymentRequest) {
        const existing = await prisma.auditLog.findFirst({
          where: {
            tenantId: paymentRequest.tenantId,
            entityType: "PaymentRequest",
            entityId: result.paymentRequestId,
            action: PAYMONGO_RECEIPT_DETAILS_ACTION,
          },
          select: { id: true },
        });
        if (!existing) {
          await prisma.auditLog.create({
            data: {
              tenantId: paymentRequest.tenantId,
              actorId: null,
              module: "PAYMENTS",
              action: PAYMONGO_RECEIPT_DETAILS_ACTION,
              entityType: "PaymentRequest",
              entityId: result.paymentRequestId,
              correlationId: details.gatewayPaymentId,
              metadata: {
                provider: "PAYMONGO",
                gatewayPaymentId: details.gatewayPaymentId,
                sourceType: details.sourceType,
                paymentChannel: details.paymentChannel,
                paidAt: details.paidAt?.toISOString() ?? null,
              },
            },
          });
        }
      }
    }
  }

  return Response.json(result, { status: "status" in result ? result.status : 200 });
}
