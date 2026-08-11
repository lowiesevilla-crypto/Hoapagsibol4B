import "server-only";
import { randomUUID } from "node:crypto";
import { AiRequestOutcome, RepositoryDocumentVisibility } from "@prisma/client";
import { roleSnapshotForRoles } from "@/lib/authorization/effective-access";
import { answerTenantKnowledgeQuestion, AI_NO_SOURCE_RESPONSE } from "@/lib/ai-assistance/knowledge-assistant";
import { assertKnowledgeQuestionIsMinimized, normalizeAiQuestion, redactAiContentForAudit } from "@/lib/ai-assistance/privacy";
import { estimateAiCostCentavos, recordAiDeniedRequest, requireAiRuntimeAccess, type AiExperience } from "@/lib/ai-assistance/runtime-policy";
import { searchTenantReasoningEvidence, synthesizeTenantReasoningAnswer, type AiGroundedEvidence, type AiReasoningSearchCandidate } from "@/lib/ai-assistance/reasoning-provider";
import { prisma } from "@/lib/db";

const KNOWLEDGE_QUESTION_PATTERN = /\b(policy|policies|rule|rules|bylaw|bylaws|resolution|section|sec\.?|manual|guideline|procedure|ordinance|magna carta|declaration|governance)\b/i;
const DRAFT_RESOLUTION_PATTERN = /\bdraft\s+(a\s+)?(board\s+)?resolution\b/i;
const OPERATIONAL_QUESTION_PATTERNS = [
  /^\s*(hi|hello|hey|good\s+(morning|afternoon|evening)|thank(s| you)|salamat)\b/i,
  /\b(who are you|what is your name|your name|what can you do|help me|tell me a joke|joke)\b/i,
  /\b(current|outstanding)?\s*balance\b|\bstatement of account\b|\bsoa\b/i,
  /\b(payment history|recent payments?|my receipt|my payment|my collection|my bond|my refund|refund status)\b/i,
  /\b(account number|my profile|profile details|my address|my contact)\b/i,
  /\b(request status|document request status|complaint status|file (a )?complaint|create (a )?complaint)\b/i,
  /\b(announcements?|upcoming events?|current president|association president|officers?|organization)\b/i,
  /\b(total collection today|today'?s collections?|finance summary|active homeowners?|homeowner directory)\b/i,
  DRAFT_RESOLUTION_PATTERN,
  /\b(request|get|apply for|download)\b.{0,50}\b(residency certificate|certificate of residency|good standing|clearance|gate pass|move[- ]?in|move[- ]?out)\b/i,
  /\b(requirements?)\b.{0,50}\b(residency certificate|certificate of residency|good standing|clearance|gate pass|move[- ]?in|move[- ]?out)\b/i,
];

export function shouldUseGroundedDocumentReasoning(question: unknown) {
  if (typeof question !== "string") return false;
  const value = question.trim();
  if (!value) return false;
  if (/\[(NO_SOURCE|PROVIDER_ERROR)\]/.test(value)) return true;
  if (DRAFT_RESOLUTION_PATTERN.test(value)) return false;
  if (KNOWLEDGE_QUESTION_PATTERN.test(value)) return true;
  return !OPERATIONAL_QUESTION_PATTERNS.some((pattern) => pattern.test(value));
}

async function conversationForReasoning(input: { tenantId: string; actorId: string; actorRoleSnapshot: string; retentionDays: number; conversationId?: string | null }) {
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

function effectiveFilter(now: Date) {
  return { AND: [{ OR: [{ effectiveAt: null }, { effectiveAt: { lte: now } }] }, { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }] };
}

function normalizeSearchText(value: string) {
  return value.toLowerCase().replace(/\bsec(?:tion)?\b/g, "section").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function questionTerms(question: string) {
  const stop = new Set(["what", "whats", "what's", "where", "when", "who", "how", "is", "are", "the", "a", "an", "of", "in", "on", "for", "to", "from", "and", "or", "my", "our", "your", "their", "tell", "me", "about", "please", "does", "say"]);
  return [...new Set(normalizeSearchText(question).split(" ").filter((term) => term.length >= 3 && !stop.has(term)))];
}

function lexicalScore(question: string, candidate: AiReasoningSearchCandidate, title: string, category: string) {
  const terms = questionTerms(question);
  if (!terms.length) return 0;
  const haystack = normalizeSearchText(`${title} ${category} ${candidate.filename || ""} ${candidate.text}`);
  const matched = terms.filter((term) => haystack.includes(term)).length;
  return matched / terms.length;
}

function authorityPriority(title: string, category: string) {
  const text = normalizeSearchText(`${title} ${category}`);
  if (/\b(magna carta|republic act|law|ordinance)\b/.test(text)) return 60;
  if (/\b(bylaws|by laws|master deed|declaration)\b/.test(text)) return 55;
  if (/\b(board resolution|resolution)\b/.test(text)) return 45;
  if (/\b(policy|policies)\b/.test(text)) return 35;
  if (/\b(house rules|rules|regulation)\b/.test(text)) return 30;
  if (/\b(procedure|guideline|manual|memo)\b/.test(text)) return 20;
  return 10;
}

function locatorFromText(text: string) {
  const match = /\b((?:SEC\.?|SECTION)\s+[0-9]+[A-Z]?(?:\s*\.\s*[^.\n]{1,90})?)/i.exec(text);
  return match?.[1]?.replace(/\s+/g, " ").trim() || null;
}

function boundedScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

async function authorizeAndRerankEvidence(input: { tenantId: string; experience: AiExperience; vectorStoreId: string; question: string; candidates: AiReasoningSearchCandidate[]; now: Date }) {
  const fileIds = [...new Set(input.candidates.map((candidate) => candidate.fileId))];
  if (!fileIds.length) return [] as AiGroundedEvidence[];
  const bindings = await prisma.aiKnowledgeBinding.findMany({
    where: {
      tenantId: input.tenantId,
      vectorStoreId: input.vectorStoreId,
      providerFileId: { in: fileIds },
      indexStatus: "INDEXED",
    },
    select: { documentId: true, providerFileId: true, indexedChecksumSha256: true },
  });
  if (!bindings.length) return [] as AiGroundedEvidence[];
  const bindingByFile = new Map(bindings.filter((binding) => binding.providerFileId).map((binding) => [binding.providerFileId as string, binding]));
  const visibility = input.experience === "RESIDENT" ? RepositoryDocumentVisibility.TENANT_PUBLIC : undefined;
  const documents = await prisma.repositoryDocument.findMany({
    where: {
      tenantId: input.tenantId,
      id: { in: [...new Set(bindings.map((binding) => binding.documentId))] },
      aiEnabled: true,
      status: "PUBLISHED",
      ...(visibility ? { visibility } : {}),
      privacyClassification: input.experience === "RESIDENT" ? "PUBLIC" : { in: ["PUBLIC", "INTERNAL"] },
      malwareScanStatus: { notIn: ["PENDING", "FAILED", "BLOCKED"] },
      ...effectiveFilter(input.now),
    },
    select: {
      id: true,
      title: true,
      documentReference: true,
      currentRevision: true,
      checksumSha256: true,
      effectiveAt: true,
      category: { select: { name: true } },
    },
  });
  const documentById = new Map(documents.map((document) => [document.id, document]));
  const authorized = input.candidates.flatMap((candidate) => {
    const binding = bindingByFile.get(candidate.fileId);
    if (!binding) return [];
    const document = documentById.get(binding.documentId);
    if (!document || binding.indexedChecksumSha256 !== document.checksumSha256) return [];
    const authority = authorityPriority(document.title, document.category.name);
    const semantic = boundedScore(candidate.score);
    const lexical = lexicalScore(input.question, candidate, document.title, document.category.name);
    const rerankScore = semantic * 0.62 + lexical * 0.28 + boundedScore(authority / 60) * 0.1;
    return [{
      ...candidate,
      text: candidate.text.slice(0, 2400),
      documentId: document.id,
      title: document.title,
      category: document.category.name,
      reference: document.documentReference,
      revision: document.currentRevision,
      effectiveAt: document.effectiveAt,
      authorityPriority: authority,
      locator: locatorFromText(candidate.text),
      rerankScore,
    } satisfies AiGroundedEvidence];
  }).sort((a, b) => b.rerankScore - a.rerankScore || b.score - a.score);

  const selected: AiGroundedEvidence[] = [];
  const perDocument = new Map<string, number>();
  for (const evidence of authorized) {
    const count = perDocument.get(evidence.documentId) || 0;
    if (count >= 2) continue;
    selected.push(evidence);
    perDocument.set(evidence.documentId, count + 1);
    if (selected.length >= 8) break;
  }
  return selected;
}

function sourceCards(evidence: AiGroundedEvidence[]) {
  const seen = new Set<string>();
  return evidence.flatMap((item) => {
    if (seen.has(item.documentId)) return [];
    seen.add(item.documentId);
    return [{
      documentId: item.documentId,
      title: item.title,
      category: item.category,
      reference: item.reference,
      revision: item.revision,
      effectiveAt: item.effectiveAt,
      locator: item.locator,
      excerpt: item.text.slice(0, 420),
      confidence: Number(item.rerankScore.toFixed(3)),
    }];
  });
}

async function recordNoSource(input: { tenantId: string; actorId: string; conversationId: string; requestId: string; started: number; reason: string }) {
  await prisma.$transaction([
    prisma.aiMessage.create({ data: { tenantId: input.tenantId, conversationId: input.conversationId, role: "ASSISTANT", contentRedacted: redactAiContentForAudit(AI_NO_SOURCE_RESPONSE), privacyClassification: "INTERNAL", sourceDocumentIds: [] } }),
    prisma.aiUsageLedger.create({ data: { tenantId: input.tenantId, actorId: input.actorId, requestId: input.requestId, latencyMs: Date.now() - input.started, outcome: AiRequestOutcome.REFUSED, denialReason: input.reason } }),
    prisma.auditLog.create({ data: { tenantId: input.tenantId, actorId: input.actorId, module: "AI_ASSISTANCE", action: "AI_NO_SOURCE_FALLBACK", entityType: "AiConversation", entityId: input.conversationId, metadata: { requestId: input.requestId, reason: input.reason, reasoningPipeline: true } } }),
  ]);
}

export async function answerTenantKnowledgeQuestionWithReasoning(input: { experience: AiExperience; question: unknown; conversationId?: string | null }) {
  if (!shouldUseGroundedDocumentReasoning(input.question)) return answerTenantKnowledgeQuestion(input);

  const requestId = randomUUID();
  const started = Date.now();
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

  const conversation = await conversationForReasoning({
    tenantId,
    actorId,
    actorRoleSnapshot: roleSnapshotForRoles(access.user.roles),
    retentionDays: access.governance.retentionDays,
    conversationId: input.conversationId,
  });
  const previousMessages = await prisma.aiMessage.findMany({
    where: { tenantId, conversationId: conversation.id },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: { role: true, contentRedacted: true },
  });
  await prisma.aiMessage.create({ data: { tenantId, conversationId: conversation.id, role: "USER", contentRedacted: redactAiContentForAudit(question), privacyClassification: "INTERNAL" } });

  const providerIndex = await prisma.tenantAiProviderIndex.findUnique({ where: { tenantId } });
  if (!providerIndex || providerIndex.status !== "ACTIVE") {
    await recordNoSource({ tenantId, actorId, conversationId: conversation.id, requestId, started, reason: "NO_TENANT_AI_INDEX" });
    return { conversationId: conversation.id, answer: AI_NO_SOURCE_RESPONSE, sources: [], requestId };
  }

  try {
    const candidates = await searchTenantReasoningEvidence({
      question,
      vectorStoreId: providerIndex.vectorStoreId,
      allowedAudiences: input.experience === "RESIDENT" ? ["RESIDENT"] : ["RESIDENT", "STAFF"],
    });
    const evidence = await authorizeAndRerankEvidence({
      tenantId,
      experience: input.experience,
      vectorStoreId: providerIndex.vectorStoreId,
      question,
      candidates,
      now: new Date(),
    });
    if (!evidence.length) {
      await recordNoSource({ tenantId, actorId, conversationId: conversation.id, requestId, started, reason: candidates.length ? "NO_AUTHORIZED_REASONING_EVIDENCE" : "NO_REASONING_EVIDENCE" });
      return { conversationId: conversation.id, answer: AI_NO_SOURCE_RESPONSE, sources: [], requestId };
    }

    const conversationContext = previousMessages.reverse().map((message) => `${message.role}: ${message.contentRedacted.slice(0, 900)}`);
    const providerResponse = await synthesizeTenantReasoningAnswer({
      question,
      evidence,
      conversationContext,
      modelTier: access.entitlement.configuration.modelTier,
    });
    const sources = sourceCards(evidence);
    const answer = providerResponse.text.trim();
    if (!answer || !sources.length) {
      await recordNoSource({ tenantId, actorId, conversationId: conversation.id, requestId, started, reason: "EMPTY_GROUNDED_SYNTHESIS" });
      return { conversationId: conversation.id, answer: AI_NO_SOURCE_RESPONSE, sources: [], requestId };
    }
    const sourceDocumentIds = sources.map((source) => source.documentId);
    const estimatedCostCentavos = estimateAiCostCentavos(providerResponse.inputTokens, providerResponse.outputTokens) ?? 0;
    await prisma.$transaction([
      prisma.aiMessage.create({ data: { tenantId, conversationId: conversation.id, role: "ASSISTANT", contentRedacted: redactAiContentForAudit(answer), privacyClassification: "INTERNAL", sourceDocumentIds, providerRequestId: providerResponse.requestId } }),
      prisma.aiUsageLedger.create({ data: { tenantId, actorId, requestId, provider: "OPENAI", model: providerResponse.model, inputTokens: providerResponse.inputTokens, outputTokens: providerResponse.outputTokens, estimatedCostCentavos, latencyMs: Date.now() - started, outcome: AiRequestOutcome.SUCCEEDED } }),
      prisma.auditLog.create({ data: { tenantId, actorId, module: "AI_ASSISTANCE", action: "AI_REASONED_RESPONSE_GENERATED", entityType: "AiConversation", entityId: conversation.id, metadata: { requestId, providerRequestId: providerResponse.requestId, model: providerResponse.model, sourceDocumentIds, reasoningPipeline: true, evidenceCount: evidence.length, evidenceLocators: evidence.map((item) => item.locator).filter(Boolean) } } }),
    ]);
    return { conversationId: conversation.id, answer, sources, requestId };
  } catch (error) {
    console.error("[ai-assistance] Grounded reasoning provider failed.", {
      tenantId,
      actorId,
      conversationId: conversation.id,
      requestId,
      provider: "OPENAI",
      error: error instanceof Error ? error.message : String(error),
    });
    await prisma.aiUsageLedger.create({ data: { tenantId, actorId, requestId, outcome: AiRequestOutcome.PROVIDER_ERROR, latencyMs: Date.now() - started, denialReason: "PROVIDER_ERROR" } }).catch(() => undefined);
    await prisma.auditLog.create({ data: { tenantId, actorId, module: "AI_ASSISTANCE", action: "AI_PROVIDER_ERROR", entityType: "AiConversation", entityId: conversation.id, metadata: { requestId, provider: "OPENAI", reasoningPipeline: true } } }).catch(() => undefined);
    throw new Error("HOAHub AI is temporarily unavailable. Core HOAHub services remain available.");
  }
}
