"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import { prisma } from "@/lib/db";
import { isPayMongoPaymentRequest } from "@/lib/homeowner-payment-flow";
import { releaseExpiredHomeownerPayMongoCheckout } from "@/lib/services/homeowner-paymongo-expiry";
import { reconcileHomeownerPayMongoCheckout } from "@/lib/services/homeowner-paymongo-reconciliation";

export async function reconcileOnlinePaymentAction(formData: FormData) {
  const admin = await requirePermission(Permission.PAYMENTS_RECORD);
  const requestId = String(formData.get("requestId") || "").trim();
  const request = await prisma.paymentRequest.findFirst({ where: { id: requestId, tenantId: admin.tenantId } });
  if (!request || !isPayMongoPaymentRequest(request)) redirect(`/admin/payments/requests/${encodeURIComponent(requestId)}?error=Online%20payment%20request%20not%20found.`);

  try {
    const expiry = await releaseExpiredHomeownerPayMongoCheckout({ requestId: request.id, tenantId: admin.tenantId });
    revalidatePath("/admin/payments/requests");
    revalidatePath(`/admin/payments/requests/${request.id}`);
    revalidatePath("/admin/payments/active");
    revalidatePath("/admin/payments/history");
    revalidatePath("/admin/billing");
    revalidatePath("/portal/pay");
    revalidatePath("/portal/payments");
    revalidatePath("/portal/billing");
    if (expiry.state === "expired") {
      redirect(`/admin/payments/requests/${request.id}?success=PayMongo%20checkout%20expired.%20The%20billing%20items%20were%20released%20for%20a%20new%20homeowner%20payment.`);
    }

    const result = await reconcileHomeownerPayMongoCheckout({ requestId: request.id, tenantId: admin.tenantId });
    if (result.state === "paid") redirect(`/admin/payments/requests/${request.id}?success=PayMongo%20confirmed%20the%20payment.%20HOAHub%20posted%20the%20receipt%20and%20financial%20records%20automatically.`);
    redirect(`/admin/payments/requests/${request.id}?success=PayMongo%20has%20not%20reported%20a%20paid%20payment%20for%20this%20checkout%20yet.%20No%20manual%20approval%20is%20required.`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error && String((error as { digest?: unknown }).digest || "").startsWith("NEXT_REDIRECT")) throw error;
    redirect(`/admin/payments/requests/${request.id}?error=${encodeURIComponent(error instanceof Error ? error.message : "PayMongo reconciliation failed.")}`);
  }
}
