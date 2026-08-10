"use server";

import { AiPrivacyClassification } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAiAssistanceEntitlement } from "@/lib/ai-assistance/entitlement";
import { indexRepositoryDocumentForAi, purgeRepositoryDocumentFromAi } from "@/lib/ai-assistance/provider-index";
import { requireUser } from "@/lib/auth";
import { Permission } from "@/lib/authorization/permissions";
import { prisma } from "@/lib/db";

function clean(value: FormDataEntryValue | null) {
  return String(value || "").trim();
}

async function requireAiKnowledgeManager() {
  const user = await requireUser();
  if (!new Set(user.permissions).has(Permission.AI_KNOWLEDGE_MANAGE)) throw new Error("AI knowledge-management permission is required.");
  await requireAiAssistanceEntitlement(user.tenantId);
  return user;
}

export async function updateDocumentAiEligibilityAction(formData: FormData) {
  const user = await requireAiKnowledgeManager();
  const documentId = clean(formData.get("documentId"));
  let errorMessage = "";
  try {
    const classification = clean(formData.get("privacyClassification")) as AiPrivacyClassification;
    if (!Object.values(AiPrivacyClassification).includes(classification)) throw new Error("Select a valid document privacy classification.");
    const aiEnabled = formData.get("aiEnabled") === "on";
    if (aiEnabled && [AiPrivacyClassification.PERSONAL, AiPrivacyClassification.SENSITIVE, AiPrivacyClassification.RESTRICTED].includes(classification)) {
      throw new Error("Personal, sensitive, and restricted documents cannot be enabled for the general HOAHub AI knowledge index.");
    }
    const document = await prisma.repositoryDocument.findFirst({ where: { tenantId: user.tenantId, id: documentId }, select: { id: true, aiEnabled: true, privacyClassification: true } });
    if (!document) throw new Error("Repository document not found in the active tenant.");
    const retrievalPolicyChanged = document.aiEnabled !== aiEnabled || document.privacyClassification !== classification;
    if (retrievalPolicyChanged) await purgeRepositoryDocumentFromAi(document.id);

    await prisma.$transaction([
      prisma.repositoryDocument.update({ where: { tenantId_id: { tenantId: user.tenantId, id: document.id } }, data: { aiEnabled, privacyClassification: classification, updatedById: user.id } }),
      prisma.auditLog.create({ data: { tenantId: user.tenantId, actorId: user.id, module: "AI_ASSISTANCE", action: "AI_DOCUMENT_ELIGIBILITY_UPDATED", entityType: "RepositoryDocument", entityId: document.id, metadata: { previous: { aiEnabled: document.aiEnabled, privacyClassification: document.privacyClassification }, updated: { aiEnabled, privacyClassification: classification }, providerKnowledgePurged: retrievalPolicyChanged }, aiAction: false } }),
    ]);
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Document AI eligibility could not be updated.";
  }
  revalidatePath("/admin/ai-assistance");
  revalidatePath("/admin/ai-assistance/knowledge");
  if (errorMessage) redirect(`/admin/ai-assistance/knowledge?error=${encodeURIComponent(errorMessage)}`);
  redirect(`/admin/ai-assistance/knowledge?success=${encodeURIComponent("Document AI eligibility updated. Re-index is required after policy changes.")}`);
}

export async function indexDocumentForAiAction(formData: FormData) {
  const documentId = clean(formData.get("documentId"));
  let errorMessage = "";
  try {
    await indexRepositoryDocumentForAi(documentId);
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Document could not be indexed for AI.";
  }
  revalidatePath("/admin/ai-assistance/knowledge");
  if (errorMessage) redirect(`/admin/ai-assistance/knowledge?error=${encodeURIComponent(errorMessage)}`);
  redirect(`/admin/ai-assistance/knowledge?success=${encodeURIComponent("Approved document indexed into this tenant's isolated AI knowledge store.")}`);
}

export async function purgeDocumentFromAiAction(formData: FormData) {
  const documentId = clean(formData.get("documentId"));
  let errorMessage = "";
  try {
    await purgeRepositoryDocumentFromAi(documentId);
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Document could not be purged from AI knowledge.";
  }
  revalidatePath("/admin/ai-assistance/knowledge");
  if (errorMessage) redirect(`/admin/ai-assistance/knowledge?error=${encodeURIComponent(errorMessage)}`);
  redirect(`/admin/ai-assistance/knowledge?success=${encodeURIComponent("Document purged from the tenant AI knowledge index.")}`);
}
