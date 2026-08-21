import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { releaseExpiredHomeownerPayMongoCheckout } from "@/lib/services/homeowner-paymongo-expiry";
import { reconcilePendingHomeownerPayMongoPayments } from "@/lib/services/homeowner-paymongo-reconciliation";

export async function GET(request: Request) {
  const user = await requireUser(Role.HOMEOWNER);
  const url = new URL(request.url);
  const destination = new URL("/portal/pay", url.origin);
  if (!user.homeownerProfile) {
    destination.searchParams.set("error", "Homeowner profile was not found.");
    destination.hash = "qr-payment";
    return Response.redirect(destination, 303);
  }

  const results = await reconcilePendingHomeownerPayMongoPayments({
    tenantId: user.tenantId,
    homeownerId: user.homeownerProfile.id,
  });
  if (results.some((result) => result.state === "PAID")) {
    destination.searchParams.set("online", "paid");
    destination.searchParams.set("message", "Online payment confirmed. Your HOA records and receipt were updated automatically.");
  } else {
    let releasedExpired = false;
    for (const result of results.filter((item) => item.state === "AWAITING_PAYMENT")) {
      try {
        const expiry = await releaseExpiredHomeownerPayMongoCheckout({
          requestId: result.requestId,
          tenantId: user.tenantId,
          homeownerId: user.homeownerProfile.id,
        });
        if (expiry.state === "expired") releasedExpired = true;
      } catch {
        // Reconciliation already verified this request safely. Keep it awaiting rather than failing the customer return path on a transient second retrieval error.
      }
    }

    if (releasedExpired) {
      destination.searchParams.set("online", "expired");
      destination.searchParams.set("message", "The previous PayMongo checkout expired. Its billing items were released and can be selected for a new payment.");
    } else if (results.some((result) => result.state === "AWAITING_PAYMENT")) {
      destination.searchParams.set("online", "awaiting");
      destination.searchParams.set("message", "Payment confirmation is still being verified. No manual approval is required for online payment.");
    } else if (results.some((result) => result.state === "UNAVAILABLE")) {
      destination.searchParams.set("error", "PayMongo status is temporarily unavailable. No payment was posted unless the gateway confirms it as paid.");
    } else {
      destination.searchParams.set("online", "awaiting");
      destination.searchParams.set("message", "Payment confirmation is still being verified. No manual approval is required for online payment.");
    }
  }
  destination.hash = destination.searchParams.get("online") === "expired" ? "qr-payment" : "payment-status";
  return Response.redirect(destination, 303);
}
