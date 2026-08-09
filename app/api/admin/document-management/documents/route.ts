import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { Permission } from "@/lib/authorization/permissions";
import { hasRepositoryPermission, requireRepositoryUpload } from "@/lib/document-repository/access";
import { createRepositoryDocument } from "@/lib/document-repository/commands";
import {
  repositoryDocumentStatus,
  repositoryDocumentVisibility,
  type RepositoryDocumentStatus,
  type RepositoryDocumentVisibility,
} from "@/lib/document-repository/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function text(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function optionalDate(value: string) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error("A document date is invalid.");
  return date;
}

function redirectWithMessage(request: Request, type: "success" | "error", message: string) {
  const url = new URL("/admin/document-management", request.url);
  url.searchParams.set(type, message);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(Role.ADMIN);
    await requireRepositoryUpload();

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size <= 0) throw new Error("Select a document to upload.");

    const requestedVisibility = text(formData, "visibility") || "INTERNAL";
    const requestedStatus = text(formData, "status") || "DRAFT";
    if (!repositoryDocumentVisibility.includes(requestedVisibility as RepositoryDocumentVisibility)) {
      throw new Error("Select a valid document visibility.");
    }
    if (!repositoryDocumentStatus.includes(requestedStatus as RepositoryDocumentStatus)) {
      throw new Error("Select a valid document status.");
    }

    const visibility = requestedVisibility as RepositoryDocumentVisibility;
    const status = requestedStatus as RepositoryDocumentStatus;
    if (visibility !== "INTERNAL" && !hasRepositoryPermission(Permission.DOCUMENT_REPOSITORY_MANAGE_VISIBILITY)) {
      throw new Error("You do not have permission to change document visibility.");
    }
    if (status === "PUBLISHED" && !hasRepositoryPermission(Permission.DOCUMENT_REPOSITORY_PUBLISH)) {
      throw new Error("You do not have permission to publish documents.");
    }

    const data = new Uint8Array(await file.arrayBuffer());
    const document = await createRepositoryDocument({
      tenantId: user.tenantId,
      tenantSlug: user.tenantSlug,
      actorId: user.id,
      title: text(formData, "title"),
      description: text(formData, "description") || null,
      categoryId: text(formData, "categoryId"),
      documentReference: text(formData, "documentReference") || null,
      visibility,
      status,
      issuingBody: text(formData, "issuingBody") || null,
      effectiveAt: optionalDate(text(formData, "effectiveAt")),
      expiresAt: optionalDate(text(formData, "expiresAt")),
      resolutionNumber: text(formData, "resolutionNumber") || null,
      memoNumber: text(formData, "memoNumber") || null,
      policyOwner: text(formData, "policyOwner") || null,
      searchableKeywords: text(formData, "searchableKeywords") || null,
      originalFileName: file.name,
      contentType: file.type || "application/octet-stream",
      data,
    });

    return redirectWithMessage(request, "success", `Document “${document.title}” uploaded successfully.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The document could not be uploaded.";
    return redirectWithMessage(request, "error", message);
  }
}
