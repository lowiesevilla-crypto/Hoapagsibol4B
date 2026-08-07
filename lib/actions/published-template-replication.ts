"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { platformPrisma } from "@/lib/db";
import { requireDocumentTemplateAdmin } from "@/lib/document-template-admin";
import {
  applyPublishedTemplateReplication,
  canRunPublishedTemplateReplication,
} from "@/lib/services/published-template-replication";

const replicationPath = "/admin/documents/operations/template-replication";

function operationUrl(kind: "error" | "success", message: string) {
  const params = new URLSearchParams({ [kind]: "1", message });
  return `${replicationPath}?${params.toString()}`;
}

export async function applyPublishedTemplateReplicationAction(formData: FormData) {
  const user = await requireDocumentTemplateAdmin();

  if (!canRunPublishedTemplateReplication(user)) {
    redirect(
      operationUrl(
        "error",
        "This replication can only be run by a System Admin or Super Admin in the configured target tenant.",
      ),
    );
  }

  const planDigest = String(formData.get("planDigest") || "").trim();
  const acknowledged = String(formData.get("acknowledge") || "") === "YES";

  if (!acknowledged) {
    redirect(
      operationUrl(
        "error",
        "Confirm that you reviewed the preview before applying the replication.",
      ),
    );
  }

  try {
    const result = await applyPublishedTemplateReplication(
      platformPrisma,
      user.id,
      planDigest,
    );

    if (result.status !== "COMPLETED_AND_VERIFIED") {
      throw new Error("Replication did not complete verification.");
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Published template replication failed. Preview the plan again before retrying.";
    redirect(operationUrl("error", message));
  }

  revalidatePath("/admin/documents");
  revalidatePath("/admin/documents/operations");
  revalidatePath(replicationPath);
  redirect(
    operationUrl(
      "success",
      "COMPLETED_AND_VERIFIED: all requested published templates are assigned to the target tenant.",
    ),
  );
}
