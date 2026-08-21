import { PaymentRequestStatus, Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PAYMONGO_CANCELLED_REMARK, PAYMONGO_PAYMENT_REQUEST_MARKER } from "@/lib/homeowner-payment-flow";
import { expireHomeownerPayMongoCheckout } from "@/lib/services/homeowner-paymongo";
import { reconcileHomeownerPayMongoCheckout } from "@/lib/services/homeowner-paymongo-reconciliation";

export async function GET(request: Request) {
  const user = await requireUser(Role.HOMEOWNER);
  const url = new URL(request.url);
  const requestId = url.searchParams.get("requestId")?.trim() || "";
  const destination = new URL("/portal/pay", url.origin);

  if (!requestId || !user.homeownerProfile) {
    destination.searchParams.set("error", "Online payment request was not found.");
    destination.hash = "qr-payment";
    return Response.redirect(destination, 303);
  }

  const ownedRequest = await prisma.paymentRequest.findFirst({
    where: {
      id: requestId,
      tenantId: user.tenantId,
      homeownerId: user.homeownerProfile.id,
      status: PaymentRequestStatus.PENDING_REVIEW,
      proofContentType: PAYMONGO_PAYMENT_REQUEST_MARKER,
    },
    select: { id: true },
  });
  if (!ownedRequest) {
    destination.searchParams.set("error", "This online payment is no longer awaiting payment.");
    destination.hash = "qr-payment";
    return Response.redirect(destination, 303);
  }

  try {
    const current = await reconcileHomeownerPayMongoCheckout({
      requestId: ownedRequest.id,
      tenantId: user.tenantId,
      homeownerId: user.homeownerProfile.id,
    });
    if (current.state === "PAID") {
      destination.searchParams.set("online", "confirmed");
      destination.hash = "qr-payment";
      return Response.redirect(destination, 303);
    }
    if (current.state === "EXPIRED" || current.state === "CANCELLED") {
      destination.searchParams.set("online", "cancelled");
      destination.hash = "qr-payment";
      return Response.redirect(destination, 303);
    }

    const expired = await expireHomeownerPayMongoCheckout(ownedRequest.id, user.tenantId);
    await prisma.paymentRequest.updateMany({
      where: {
        tenantId: user.tenantId,
        homeownerId: user.homeownerProfile.id,
        status: PaymentRequestStatus.PENDING_REVIEW,
        proofContentType: PAYMONGO_PAYMENT_REQUEST_MARKER,
        OR: [
          { id: expired.leaderRequestId },
          ...(expired.batchDescription ? [{ description: expired.batchDescription }] : []),
        ],
      },
      data: {
        status: PaymentRequestStatus.REJECTED,
        reviewRemarks: PAYMONGO_CANCELLED_REMARK,
        reviewedAt: new Date(),
      },
    });
    destination.searchParams.set("online", "cancelled");
  } catch (error) {
    destination.searchParams.set("error", error instanceof Error ? error.message : "The active online checkout could not be cancelled safely. You can continue the existing payment instead.");
    destination.searchParams.set("online", "resume");
  }
  destination.hash = "qr-payment";
  return Response.redirect(destination, 303);
}
