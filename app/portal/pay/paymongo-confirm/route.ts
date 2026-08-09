import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
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
  if (results.some((result) => result.state === "paid")) {
    destination.searchParams.set("online", "paid");
    destination.searchParams.set("message", "Online payment confirmed. Your HOA records and receipt were updated automatically.");
  } else if (results.some((result) => result.state === "awaiting_payment")) {
    destination.searchParams.set("online", "confirming");
    destination.searchParams.set("message", "Payment confirmation is still being verified. No manual approval is required for online payment.");
  } else {
    const failure = results.find((result) => result.state === "error");
    if (failure && "message" in failure) destination.searchParams.set("error", failure.message);
    else destination.searchParams.set("online", "confirming");
  }
  destination.hash = "payment-status";
  return Response.redirect(destination, 303);
}
