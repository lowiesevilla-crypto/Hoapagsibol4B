"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import { bondRefundUserMessage } from "@/lib/bond-refund-errors";
import { recordBondRefund } from "@/lib/services/bond-refund";
import { withTenantContext } from "@/lib/tenant-context";
import { bondRefundSchema } from "@/lib/validation";

export type BondRefundReceiptState = {
  status: "idle" | "success" | "error";
  message: string;
  receiptUrl: string | null;
};

export async function recordBondRefundAndOpenReceiptAction(
  _previousState: BondRefundReceiptState,
  formData: FormData,
): Promise<BondRefundReceiptState> {
  const admin = await requirePermission(Permission.COLLECTIONS_REFUND);
  const parsed = bondRefundSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message || "Invalid refund details.",
      receiptUrl: null,
    };
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

  if (refundError) return { status: "error", message: refundError, receiptUrl: null };
  if (!refundId) return { status: "error", message: "Bond refund could not be processed.", receiptUrl: null };

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

  return {
    status: "success",
    message: "Bond refund processed successfully. Opening refund receipt.",
    receiptUrl: `/receipts/refund/${refundId}`,
  };
}
