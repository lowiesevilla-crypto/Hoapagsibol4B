import { PaymentRequestStatus, Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PAYMONGO_PAYMENT_REQUEST_MARKER } from "@/lib/homeowner-payment-flow";

export const PAYMONGO_CANCELLED_REMARK = "PayMongo checkout cancelled by homeowner.";

export async function GET(request: Request) {
  const user = await requireUser(Role.HOMEOWNER);
  const url = new URL(request.url);
  const requestId = url.searchParams.get("requestId")?.trim() || "";
  if (requestId && user.homeownerProfile) {
    await prisma.paymentRequest.updateMany({
      where: {
        id: requestId,
        tenantId: user.tenantId,
        homeownerId: user.homeownerProfile.id,
        status: PaymentRequestStatus.PENDING_REVIEW,
        proofContentType: PAYMONGO_PAYMENT_REQUEST_MARKER,
      },
      data: {
        status: PaymentRequestStatus.REJECTED,
        reviewRemarks: PAYMONGO_CANCELLED_REMARK,
        reviewedAt: new Date(),
      },
    });
  }
  const destination = new URL("/portal/pay", url.origin);
  destination.searchParams.set("online", "cancelled");
  return Response.redirect(destination, 303);
}
