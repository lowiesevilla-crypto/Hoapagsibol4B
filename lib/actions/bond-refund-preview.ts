"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import { bondRefundUserMessage } from "@/lib/bond-refund-errors";
import { recordBondRefund } from "@/lib/services/bond-refund";
import { withTenantContext } from "@/lib/tenant-context";
import { bondRefundSchema } from "@/lib/validation";

export async function recordBondRefundAndOpenReceiptAction(formData: FormData) {
  const admin = await requirePermission(Permission.COLLECTIONS_REFUND);
  const parsed = bondRefundSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || "Invalid refund details.";
    redirect(`/admin/collections?refundError=${encodeURIComponent(message)}`);
  }

  const data = parsed.data;
  let refundId: string | null = null;
  let refundError: string | null = null;

  try {
    const result = await withTenantContext(admin.tenantId, () => recordBondRefund({
      collectionId: data.collectionId,
      amount: data.amount,
      refundDate: new Date(`${data.refundDate}T00:00:00.000Z`),
      method: data.method,
      referenceNumber: data.referenceNumber,
      remarks: data.remarks,
      actor: { id: admin.id, tenantId: admin.tenantId },
    }));
    refundId = result.id;
  } catch (error) {
    refundError = bondRefundUserMessage(error);
    if (!refundError) {
      const supportReference = `BR-${randomUUID().split("-")[0].toUpperCase()}`;
      console.error("[HOAHub] bond_refund_preview_failed", {
        supportReference,
        tenantId: admin.tenantId,
        actorId: admin.id,
        collectionId: data.collectionId,
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      refundError = `We couldn't process this bond refund. No changes were saved. Support reference: ${supportReference}.`;
    }
  }

  if (refundError) redirect(`/admin/collections?refundError=${encodeURIComponent(refundError)}`);
  if (!refundId) redirect(`/admin/collections?refundError=${encodeURIComponent("Bond refund could not be processed.")}`);

  for (const path of ["/admin/collections", "/admin/dashboard", "/admin/reports", "/portal/collections", "/portal/dashboard"]) {
    try {
      revalidatePath(path);
    } catch (error) {
      console.error("[HOAHub] bond_refund_post_commit_revalidation_failed", {
        tenantId: admin.tenantId,
        actorId: admin.id,
        refundId,
        path,
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  redirect(`/receipts/refund/${refundId}`);
}
