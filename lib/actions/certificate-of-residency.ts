"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  approveCertificateRequest,
  issueCertificate,
  reissueCertificate,
  releaseCertificate,
  rejectCertificateRequest,
  resubmitCertificateRequest,
  returnCertificateRequestForCorrection,
  revokeCertificate,
} from "@/lib/services/document-certificate-lifecycle";
import { documentContextFromUser } from "@/lib/services/document-runtime-context";
import { cloneCertifiedDocumentTemplate, restoreCertifiedDocumentTemplate } from "@/lib/services/document-template-runtime";
import { platformPrisma } from "@/lib/db";
import { CERTIFICATE_OF_RESIDENCY_CODE } from "@/lib/services/certificate-of-residency";
import { createCertificateOfResidencyReferenceDraft } from "@/lib/services/certificate-of-residency";

export async function returnCertificateForCorrectionAction(formData: FormData) {
  const user = await requireUser();
  const id = field(formData, "id");
  await run(id, async () => returnCertificateRequestForCorrection(documentContextFromUser(user), id, field(formData, "remarks")));
}

export async function approveCertificateAction(formData: FormData) {
  const user = await requireUser();
  const id = field(formData, "id");
  await run(id, async () => approveCertificateRequest(documentContextFromUser(user), id, optionalField(formData, "remarks")));
}

export async function rejectCertificateAction(formData: FormData) {
  const user = await requireUser();
  const id = field(formData, "id");
  const remarks = field(formData, "remarks");
  if (remarks.length < 10) redirect(`/admin/documents/${encodeURIComponent(id)}?error=${encodeURIComponent("Enter rejection remarks with at least 10 characters.")}`);
  await run(id, async () => rejectCertificateRequest(documentContextFromUser(user), id, remarks));
}

export async function issueCertificateAction(formData: FormData) {
  const user = await requireUser();
  const id = field(formData, "id");
  await run(id, async () => issueCertificate(documentContextFromUser(user), id, field(formData, "idempotencyKey") || `issue:${id}:${randomUUID()}`));
}

export async function releaseCertificateAction(formData: FormData) {
  const user = await requireUser();
  const id = field(formData, "requestId");
  await run(id, async () => releaseCertificate(documentContextFromUser(user), field(formData, "documentVersionId")));
}

export async function reissueCertificateAction(formData: FormData) {
  const user = await requireUser();
  const id = field(formData, "requestId");
  const sourceVersionId = field(formData, "documentVersionId");
  await run(id, async () => reissueCertificate(documentContextFromUser(user), { requestId: id, sourceVersionId, reason: field(formData, "reason"), idempotencyKey: `reissue:${sourceVersionId}:${randomUUID()}` }));
}

export async function revokeCertificateAction(formData: FormData) {
  const user = await requireUser();
  const id = field(formData, "requestId");
  await run(id, async () => revokeCertificate(documentContextFromUser(user), field(formData, "documentVersionId"), field(formData, "reason")));
}

export async function resubmitCertificateAction(formData: FormData) {
  const user = await requireUser();
  const id = field(formData, "id");
  try {
    await resubmitCertificateRequest(documentContextFromUser(user), { requestId: id, purpose: field(formData, "purpose"), remarks: optionalField(formData, "remarks") });
  } catch (error) {
    redirect(`/portal/documents?error=${encodeURIComponent(message(error))}`);
  }
  revalidatePath("/portal/documents");
  redirect("/portal/documents?success=resubmitted&message=Corrected%20request%20resubmitted%20for%20review.");
}

export async function cloneCertifiedCertificateTemplateAction(formData: FormData) {
  const user = await requireUser();
  const definitionId = field(formData, "definitionId");
  await assertCertificateDefinition(user.tenantId, definitionId);
  try {
    await cloneCertifiedDocumentTemplate(documentContextFromUser(user), { definitionId, certifiedVersionId: field(formData, "certifiedVersionId") });
  } catch (error) {
    redirect(`/admin/settings/document-definitions/${definitionId}/templates?error=${encodeURIComponent(message(error))}`);
  }
  revalidatePath(`/admin/settings/document-definitions/${definitionId}/templates`);
  redirect(`/admin/settings/document-definitions/${definitionId}/templates?success=cloned&message=Certified%20template%20cloned%20as%20a%20tenant%20draft.`);
}

export async function createCertificateReferenceDraftAction(formData: FormData) {
  const user = await requireUser();
  const definitionId = field(formData, "definitionId");
  await assertCertificateDefinition(user.tenantId, definitionId);
  try {
    await createCertificateOfResidencyReferenceDraft(documentContextFromUser(user), field(formData, "certifiedVersionId"));
  } catch (error) {
    redirect(`/admin/settings/document-definitions/${definitionId}/templates?error=${encodeURIComponent(message(error))}`);
  }
  revalidatePath(`/admin/settings/document-definitions/${definitionId}/templates`);
  redirect(`/admin/settings/document-definitions/${definitionId}/templates?success=reference&message=Visual%20Certificate%20of%20Residency%20draft%20created.%20Published%20versions%20were%20not%20changed.`);
}

export async function restoreCertifiedCertificateTemplateAction(formData: FormData) {
  const user = await requireUser();
  const definitionId = field(formData, "definitionId");
  await assertCertificateDefinition(user.tenantId, definitionId);
  try {
    await restoreCertifiedDocumentTemplate(documentContextFromUser(user), { templateSetId: field(formData, "templateSetId"), certifiedVersionId: field(formData, "certifiedVersionId") });
  } catch (error) {
    redirect(`/admin/settings/document-definitions/${definitionId}/templates?error=${encodeURIComponent(message(error))}`);
  }
  revalidatePath(`/admin/settings/document-definitions/${definitionId}/templates`);
  redirect(`/admin/settings/document-definitions/${definitionId}/templates?success=restored&message=Certified%20default%20restored%20as%20a%20new%20tenant%20draft.`);
}

async function run(id: string, operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch (error) {
    redirect(`/admin/documents/${encodeURIComponent(id)}?error=${encodeURIComponent(message(error))}`);
  }
  revalidatePath(`/admin/documents/${id}`);
  revalidatePath("/admin/documents");
  revalidatePath("/portal/documents");
  redirect(`/admin/documents/${encodeURIComponent(id)}?success=updated&message=Certificate%20workflow%20updated.`);
}

function field(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function optionalField(formData: FormData, key: string) {
  return field(formData, key) || undefined;
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "The Certificate of Residency action failed.";
}

async function assertCertificateDefinition(tenantId: string, definitionId: string) {
  const definition = await platformPrisma.documentDefinition.findFirst({ where: { id: definitionId, tenantId, code: CERTIFICATE_OF_RESIDENCY_CODE }, select: { id: true } });
  if (!definition) throw new Error("Certificate of Residency definition was not found for the authenticated tenant.");
}
