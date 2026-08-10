import { randomUUID } from "node:crypto";
import { AiRequestOutcome, RepositoryDocumentVisibility } from "@prisma/client";
import { aiKnowledgeProvider } from "@/lib/ai-assistance/provider";
import { assertKnowledgeQuestionIsMinimized, normalizeAiQuestion, redactAiContentForAudit } from "@/lib/ai-assistance/privacy";
import { estimateAiCostCentavos, recordAiDeniedRequest, requireAiRuntimeAccess, type AiExperience } from "@/lib/ai-assistance/runtime-policy";
import { prisma } from "@/lib/db";

const NO_SOURCE_RESPONSE = "I could not find enough information in this tenant's approved and currently effective AI knowledge sources. Please contact your HOA administrator for an authoritative answer.";

function effectiveFilter(now: Date) {
  return { AND: [{ OR: [{ effectiveAt: null }, { effectiveAt: { lte: now } }] }, { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }] };
}

function effectiveRoleSnapshot(roles: readonly string[]) {
  return [...new Set(roles)].sort().join(",");
}

async function authorizedSources(input: { tenantId: string; experience: AiExperience; vectorStoreId: string; providerFileIds: string[]; now: Date }) {
  if (!input.providerFileIds.length) return [];
  const bindings = await prisma.aiKnowledgeBinding.findMany({
    where: { tenantId: input.tenantId, vectorStoreId: input.vectorStoreId, providerFileId: { in: input.providerFileIds }, indexStatus: "INDEXED" },
    select: { documentId: true, providerFileId: true, indexedChecksumSha256: true },
  });
  if (!bindings.length) return [];
  const bindingByDocument = new Map(bindings.map((binding) => [binding.documentId, binding]));
  const visibility = input.experience === "RESIDENT" ? RepositoryDocumentVisibility.TENANT_PUBLIC : undefined;
  const documents = await prisma.repositoryDocument.findMany({
    where: {
      tenantId: input.tenantId,
      id: { in: [...bindingByDocument.keys()] },
      aiEnabled: true,
      status: "PUBLISHED",
      ...(visibility ? { visibility } : {}),
      privacyClassification: input.experience === "RESIDENT" ? "PUBLIC" : { in: ["PUBLIC", "INTERNAL"] },
      malwareScanStatus: { notIn: ["PENDING", "FAILED", "BLOCKED"] },
      ...effectiveFilter(input.now),
    },
    select: { id: true, title: true, documentReference: true, currentRevision: true, checksumSha256: true, effectiveAt: true, category: { select: { name: true } } },
  });
  return documents.filter((document) => {
    const binding = bindingByDocument.get(document.id);
    return binding?.providerFileId && binding.indexedChecksumSha256 === document.checksumSha256;
  }).map((document) => ({ documentId: document.id, title: document.title, category: document.category.name, reference: document.documentReference, revision: document.currentRevision, effectiveAt: document.effectiveAt }));
}

async function conversationFor(input: { tenantId: string; actorId: string; actorRoleSnapshot: string; retentionDays: number; conversationId?: string | null }) {
  if (input.conversationId) {
    const existing = await prisma.aiConversation.findFirst({
      where: {
        tenantId: input.tenantId,
        id: input.conversationId,
        actorId: input.actorId,
        actorRole: input.actorRoleSnapshot,
        status: "ACTIVE",
        expiresAt: { gt: new Date() },
      },
    });
    if (!existing) throw new Error("AI conversation is unavailable in the active tenant, user, or role session.");
    return existing;
  }
  return prisma.aiConversation.create({
    data: {
      tenantId: input.tenantId,
      actorId: input.actorId,
      actorRole: input.actorRoleSnapshot,
      expiresAt: new Date(Date.now() + input.retentionDays * 86_400_000),
    },
  });
}

export async function answerTenantKnowledgeQuestion(input: { experience: AiExperience; question: unknown; conversationId?: string | null }) {
  const requestId = randomUUID();
  const access = await requireAiRuntimeAccess(input.experience, requestId);
  const tenantId = access.user.tenantId;
  const actorId = access.user.id;
  let question: string;
  try {
    question = assertKnowledgeQuestionIsMinimized(normalizeAiQuestion(input.question));
  } catch (error) {
    await recordAiDeniedRequest({ tenantId, actorId, requestId, reason: error instanceof Error ? error.message : "PRIVACY_INPUT_BLOCKED", outcome: AiRequestOutcome.REFUSED });
    throw error;
  }

  const providerIndex = await prisma.tenantAiProviderIndex.findUnique({ where: { tenantId } });
  if (!providerIndex || providerIndex.status !== "ACTIVE") {
    await recordAiDeniedRequest({ tenantId, actorId, requestId, reason: "NO_TENANT_AI_INDEX", outcome: AiRequestOutcome.REFUSED });
    return { conversationId: null, answer: NO_SOURCE_RESPONSE, sources: [], requestId };
  }

  const conversation = await conversationFor({
    tenantId,
    actorId,
    actorRoleSnapshot: effectiveRoleSnapshot(access.user.roles),
    retentionDays: access.governance.retentionDays,
    conversationId: input.conversationId,
  });
  await prisma.aiMessage.create({ data: { tenantId, conversationId: conversation.id, role: "USER", contentRedacted: redactAiContentForAudit(question), privacyClassification: "INTERNAL" } });

  const started = Date.now();
  try {
    const providerResponse = await aiKnowledgeProvider().answer({
      question,
      vectorStoreId: providerIndex.vectorStoreId,
      modelTier: access.entitlement.configuration.modelTier,
      allowedAudiences: input.experience === "RESIDENT" ? ["RESIDENT"] : ["RESIDENT", "STAFF"],
    });
    const sources = await authorizedSources({ tenantId, experience: input.experience, vectorStoreId: providerIndex.vectorStoreId, providerFileIds: providerResponse.citations.map((citation) => citation.fileId), now: new Date() });
    const answer = sources.length && providerResponse.text ? providerResponse.text : NO_SOURCE_RESPONSE;
    const outcome = sources.length ? AiRequestOutcome.SUCCEEDED : AiRequestOutcome.REFUSED;
    const estimatedCostCentavos = estimateAiCostCentavos(providerResponse.inputTokens, providerResponse.outputTokens) ?? 0;
    await prisma.$transaction([
      prisma.aiMessage.create({ data: { tenantId, conversationId: conversation.id, role: "ASSISTANT", contentRedacted: redactAiContentForAudit(answer), privacyClassification: "INTERNAL", sourceDocumentIds: sources.map((source) => source.documentId), providerRequestId: providerResponse.requestId } }),
      prisma.aiUsageLedger.create({ data: { tenantId, actorId, requestId, provider: "OPENAI", model: providerResponse.model, inputTokens: providerResponse.inputTokens, outputTokens: providerResponse.outputTokens, estimatedCostCentavos, latencyMs: Date.now() - started, outcome, denialReason: sources.length ? null : "NO_AUTHORIZED_SOURCE_CITATION" } }),
      prisma.auditLog.create({ data: { tenantId, actorId, module: "AI_ASSISTANCE", action: sources.length ? "AI_RESPONSE_GENERATED" : "AI_NO_SOURCE_FALLBACK", entityType: "AiConversation", entityId: conversation.id, metadata: { requestId, providerRequestId: providerResponse.requestId, model: providerResponse.model, sourceDocumentIds: sources.map((source) => source.documentId), inputTokens: providerResponse.inputTokens, outputTokens: providerResponse.outputTokens } } }),
    ]);
    return { conversationId: conversation.id, answer, sources, requestId };
  } catch {
    await prisma.aiUsageLedger.create({ data: { tenantId, actorId, requestId, outcome: AiRequestOutcome.PROVIDER_ERROR, latencyMs: Date.now() - started, denialReason: "PROVIDER_ERROR" } }).catch(() => undefined);
    await prisma.auditLog.create({ data: { tenantId, actorId, module: "AI_ASSISTANCE", action: "AI_PROVIDER_ERROR", entityType: "AiConversation", entityId: conversation.id, metadata: { requestId } } }).catch(() => undefined);
    throw new Error("HOAHub AI is temporarily unavailable. Core HOAHub services remain available.");
  }
}

export const AI_NO_SOURCE_RESPONSE = NO_SOURCE_RESPONSE;
