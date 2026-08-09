"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  repositoryDocumentStatus,
  repositoryDocumentVisibility,
  type RepositoryDocumentStatus,
  type RepositoryDocumentVisibility,
} from "@/lib/document-repository/constants";
import { permanentlyDeleteRepositoryDocument } from "@/lib/document-repository/delete";
import { updateRepositoryDocument } from "@/lib/document-repository/update";

function clean(value: FormDataEntryValue | null) {
  return String(value || "").trim();
}

function optionalDate(value: FormDataEntryValue | null) {
  const raw = clean(value);
  if (!raw) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error("A document date is invalid.");
  return date;
}

function detailUrl(documentId: string, type: "success" | "error", message: string) {
  return `/admin/document-management/${encodeURIComponent(documentId)}?${type}=${encodeURIComponent(message)}`;
}

export async function updateRepositoryDocumentAction(formData: FormData) {
  const documentId = clean(formData.get("documentId"));
  try {
    const visibilityValue = clean(formData.get("visibility"));
    const statusValue = clean(formData.get("status"));
    if (!repositoryDocumentVisibility.includes(visibilityValue as RepositoryDocumentVisibility)) {
      throw new Error("Select a valid document visibility.");
    }
    if (!repositoryDocumentStatus.includes(statusValue as RepositoryDocumentStatus)) {
      throw new Error("Select a valid document status.");
    }

    await updateRepositoryDocument({
      documentId,
      title: clean(formData.get("title")),
      description: clean(formData.get("description")) || null,
      categoryId: clean(formData.get("categoryId")),
      documentReference: clean(formData.get("documentReference")) || null,
      visibility: visibilityValue as RepositoryDocumentVisibility,
      status: statusValue as RepositoryDocumentStatus,
      issuingBody: clean(formData.get("issuingBody")) || null,
      effectiveAt: optionalDate(formData.get("effectiveAt")),
      expiresAt: optionalDate(formData.get("expiresAt")),
      resolutionNumber: clean(formData.get("resolutionNumber")) || null,
      memoNumber: clean(formData.get("memoNumber")) || null,
      policyOwner: clean(formData.get("policyOwner")) || null,
      remarks: clean(formData.get("remarks")) || null,
      searchableKeywords: clean(formData.get("searchableKeywords")) || null,
      reason: clean(formData.get("reason")) || null,
    });
  } catch (error) {
    redirect(detailUrl(documentId, "error", error instanceof Error ? error.message : "Document update failed."));
  }

  revalidatePath("/admin/document-management");
  revalidatePath(`/admin/document-management/${documentId}`);
  redirect(detailUrl(documentId, "success", "Document details updated."));
}

export async function permanentlyDeleteRepositoryDocumentAction(formData: FormData) {
  const documentId = clean(formData.get("documentId"));
  const confirmation = clean(formData.get("confirmation"));
  const reason = clean(formData.get("reason"));
  if (confirmation !== "DELETE") redirect(detailUrl(documentId, "error", "Type DELETE to confirm permanent deletion."));

  try {
    await permanentlyDeleteRepositoryDocument({ documentId, reason: reason || null });
  } catch (error) {
    redirect(detailUrl(documentId, "error", error instanceof Error ? error.message : "Permanent deletion failed."));
  }

  revalidatePath("/admin/document-management");
  redirect(`/admin/document-management?success=${encodeURIComponent("Document permanently deleted and repository storage released.")}`);
}
