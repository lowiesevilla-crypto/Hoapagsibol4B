import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  repositoryDocumentStatus,
  repositoryDocumentVisibility,
  type RepositoryDocumentStatus,
  type RepositoryDocumentVisibility,
} from "@/lib/document-repository/constants";
import { createRepositoryDocument } from "@/lib/document-repository/upload";

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

function redirectWithMessage(request: Request, path: string, type: "success" | "error", message: string) {
  const url = new URL(path, request.url);
  url.searchParams.set(type, message);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request) {
  try {
    await requireUser(Role.ADMIN);
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

    const document = await createRepositoryDocument({
      file: {
        originalFileName: file.name,
        contentType: file.type || "application/octet-stream",
        data: new Uint8Array(await file.arrayBuffer()),
      },
      title: text(formData, "title"),
      description: text(formData, "description") || null,
      categoryId: text(formData, "categoryId"),
      documentReference: text(formData, "documentReference") || null,
      visibility: requestedVisibility as RepositoryDocumentVisibility,
      status: requestedStatus as RepositoryDocumentStatus,
      revisionLabel: text(formData, "revisionLabel") || null,
      issuingBody: text(formData, "issuingBody") || null,
      approvalDate: optionalDate(text(formData, "approvalDate")),
      effectiveAt: optionalDate(text(formData, "effectiveAt")),
      expiresAt: optionalDate(text(formData, "expiresAt")),
      resolutionNumber: text(formData, "resolutionNumber") || null,
      memoNumber: text(formData, "memoNumber") || null,
      policyOwner: text(formData, "policyOwner") || null,
      searchableKeywords: text(formData, "searchableKeywords") || null,
    });

    return redirectWithMessage(request, "/admin/document-management", "success", `Document “${document.title}” uploaded successfully.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The document could not be uploaded.";
    return redirectWithMessage(request, "/admin/document-management/upload", "error", message);
  }
}
