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

const bondRefundRevalidationPaths = [
  "/admin/collections",
  "/admin/dashboard",
  "/admin/reports",
  "/portal/collections",
  "/portal/dashboard",
] as const;

export async function recordBondRefundAndPreviewAction(formData: FormData) {
  const admin = await requirePermission(Permission.COLLECTIONS_REFUND);
  const parsed = bondRefundSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || "Invalid refund details.";
    redirect(`/admin/collections?refundError=${encodeURIComponent(message)}`);
  }
  const data = parsed.data;

  let refundResult: Awaited<ReturnType<typeof recordBondRefund>> | null = null;
  let refundError: string | null = null;
  try {
    refundResult = await withTenantContext(admin.tenantId, () => recordBondRefund({
      collectionId: data.collectionId,
      amount: data.amount,
      refundDate: new Date(`${data.refundDate}T00:00:00.000Z`),
      method: data.method,
      referenceNumber: data.referenceNumber,
      remarks: data.remarks,
      actor: { id: admin.id, tenantId: admin.tenantId },
    }));
  } catch (error) {
    refundError = bondRefundUserMessage(error);
    if (!refundError) {
      const supportReference = `BR-${randomUUID().split("-")[0].toUpperCase()}`;
      console.error("[HOAHub] bond_refund_failed", {
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

  if (refundError) {
    redirect(`/admin/collections?refundError=${encodeURIComponent(refundError)}`);
  }
  if (!refundResult) {
    redirect(`/admin/collections?refundError=${encodeURIComponent("Bond refund could not be processed.")}`);
  }

  safeRevalidateBondRefundPages({ tenantId: admin.tenantId, actorId: admin.id, refundId: refundResult.id });
  redirect(`/admin/collections/refunds/${refundResult.id}?success=refunded`);
}

function safeRevalidateBondRefundPages(context: { tenantId: string; actorId: string; refundId: string }) {
  for (const path of bondRefundRevalidationPaths) {
    try {
      revalidatePath(path);
    } catch (error) {
      console.error("[HOAHub] bond_refund_post_commit_revalidation_failed", {
        ...context,
        path,
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
