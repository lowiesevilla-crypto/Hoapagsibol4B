import { PaymentRequestStatus, Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PAYMONGO_PAYMENT_REQUEST_MARKER } from "@/lib/homeowner-payment-flow";
import { resumeHomeownerPayMongoCheckout } from "@/lib/services/homeowner-paymongo";

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
    const checkout = await resumeHomeownerPayMongoCheckout(ownedRequest.id, user.tenantId);
    return Response.redirect(checkout.checkoutUrl, 303);
  } catch (error) {
    destination.searchParams.set("error", error instanceof Error ? error.message : "Online payment could not be continued.");
    destination.hash = "qr-payment";
    return Response.redirect(destination, 303);
  }
}
