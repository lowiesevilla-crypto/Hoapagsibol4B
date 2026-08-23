"use server";

import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  assignFreeDocumentTemplateLibraryToTenant,
  assignFreeDocumentTemplateToTenant,
} from "@/lib/services/platform-document-template-library";

const libraryPath = "/platform/document-management/templates";

export async function assignFreeDocumentTemplateAction(formData: FormData) {
  const actor = await requireUser(Role.PLATFORM_ADMIN);
  const tenantId = clean(formData.get("tenantId"));
  const templateKey = clean(formData.get("templateKey"));
  const applyRecommendedWorkflow = formData.get("applyRecommendedWorkflow") === "on";
  if (!tenantId || !templateKey) redirect(`${libraryPath}?error=${encodeURIComponent("Select a tenant and document template.")}`);

  let result;
  try {
    result = await assignFreeDocumentTemplateToTenant({ tenantId, templateKey, actorUserId: actor.id, applyRecommendedWorkflow });
  } catch (error) {
    redirect(`${libraryPath}?tenantId=${encodeURIComponent(tenantId)}&error=${encodeURIComponent(safeMessage(error))}`);
  }
  revalidateDocumentSurfaces(tenantId);
  redirect(`${libraryPath}?tenantId=${encodeURIComponent(tenantId)}&success=assigned&message=${encodeURIComponent(`Template assigned successfully as v${result.templateVersion}. Tenant administrators can continue configuring the document definition and workflow.`)}`);
}

export async function assignFreeDocumentTemplateLibraryAction(formData: FormData) {
  const actor = await requireUser(Role.PLATFORM_ADMIN);
  const tenantId = clean(formData.get("tenantId"));
  const applyRecommendedWorkflow = formData.get("applyRecommendedWorkflow") === "on";
  if (!tenantId) redirect(`${libraryPath}?error=${encodeURIComponent("Select a tenant first.")}`);

  let results;
  try {
    results = await assignFreeDocumentTemplateLibraryToTenant({ tenantId, actorUserId: actor.id, applyRecommendedWorkflow });
  } catch (error) {
    redirect(`${libraryPath}?tenantId=${encodeURIComponent(tenantId)}&error=${encodeURIComponent(safeMessage(error))}`);
  }
  revalidateDocumentSurfaces(tenantId);
  redirect(`${libraryPath}?tenantId=${encodeURIComponent(tenantId)}&success=library-assigned&message=${encodeURIComponent(`${results.length} professional document templates were assigned. Existing issued documents remain unchanged.`)}`);
}

function revalidateDocumentSurfaces(_tenantId: string) {
  revalidatePath(libraryPath);
  revalidatePath("/platform/document-management");
  revalidatePath("/admin/documents");
  revalidatePath("/admin/documents/new");
  revalidatePath("/admin/settings/document-definitions");
  revalidatePath("/portal/documents");
}

function clean(value: FormDataEntryValue | null) {
  return String(value || "").trim();
}

function safeMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Document template assignment failed.";
  return message.length > 300 ? "Document template assignment failed. Review the tenant document configuration and try again." : message;
}
