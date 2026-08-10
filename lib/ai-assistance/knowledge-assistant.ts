import { randomUUID } from "node:crypto";
import { AiRequestOutcome, RepositoryDocumentVisibility } from "@prisma/client";
import { roleSnapshotForRoles } from "@/lib/authorization/effective-access";
import { aiKnowledgeProvider } from "@/lib/ai-assistance/provider";
import { assertKnowledgeQuestionIsMinimized, normalizeAiQuestion, redactAiContentForAudit } from "@/lib/ai-assistance/privacy";
import { estimateAiCostCentavos, recordAiDeniedRequest, requireAiRuntimeAccess, type AiExperience } from "@/lib/ai-assistance/runtime-policy";
import { getAppUrl } from "@/lib/app-url";
import { prisma } from "@/lib/db";
import { getStatementOfAccount } from "@/lib/services/statement-of-account";
import { money, monthLabel, shortDate } from "@/lib/utils";

const NO_SOURCE_RESPONSE = "I could not find enough information in this tenant's approved and currently effective AI knowledge sources. Please contact your HOA administrator for an authoritative answer.";
const ACCOUNT_SUMMARY_SOURCE = {
  documentId: "hoa-account-summary",
  title: "HOAHub Statement of Account",
  category: "Resident account",
  reference: "/portal/soa",
  effectiveAt: null,
};

type AssistantSource = {
  documentId: string;
  title: string;
  category: string;
  reference: string | null;
  revision?: number;
  effectiveAt: Date | null;
};

function effectiveFilter(now: Date) {
  return { AND: [{ OR: [{ effectiveAt: null }, { effectiveAt: { lte: now } }] }, { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }] };
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

function directQuestionKind(question: string): "GREETING" | "CURRENT_BALANCE" | null {
  const compact = question.trim().toLowerCase().replace(/[!.?]+$/g, "");
  if (/^(hi|hello|hey|good morning|good afternoon|good evening|kumusta|kamusta)(\s+(hoa|hoahub|assistant|there))?$/.test(compact)) return "GREETING";
  if (
    /\b(current|outstanding|account|hoa|dues)\s+balance\b/i.test(question)
    || /\bbalance\s+(ko|namin|ng account|on my account|due)\b/i.test(question)
    || /\bhow much\b.{0,50}\b(owe|due|pay)\b/i.test(question)
    || /\bwhat('?s| is)\b.{0,40}\b(amount due|outstanding|unpaid dues)\b/i.test(question)
  ) return "CURRENT_BALANCE";
  return null;
}

async function answerDirectResidentQuestion(input: { kind: "GREETING" | "CURRENT_BALANCE"; tenantId: string; actorId: string; homeownerProfileId?: string | null }) {
  if (input.kind === "GREETING") {
    return {
      answer: "Hi! I can help with your HOA account basics, like your current balance, and answer questions from approved association documents. What would you like to check?",
      sources: [] as AssistantSource[],
    };
  }

  if (!input.homeownerProfileId) {
    return {
      answer: "I could not find an active homeowner profile for your signed-in account. Please contact your HOA administrator to check your account setup.",
      sources: [] as AssistantSource[],
    };
  }

  const [soa, nextDue] = await Promise.all([
    getStatementOfAccount(input.homeownerProfileId, input.tenantId, getAppUrl()),
    prisma.bill.findFirst({
      where: { tenantId: input.tenantId, homeownerId: input.homeownerProfileId, balance: { gt: 0 }, archivedAt: null },
      orderBy: [{ dueDate: "asc" }, { billingMonth: "asc" }],
      select: { balance: true, billingMonth: true, dueDate: true, status: true },
    }),
  ]);
  const balance = soa.summary.currentOutstandingBalance;
  if (balance <= 0) {
    return {
      answer: `Your current outstanding balance is ${money(0)}. Your account is marked ${soa.summary.collectionStatus.toLowerCase()}. You can open Statement of Account for the full ledger.`,
      sources: [ACCOUNT_SUMMARY_SOURCE],
    };
  }
  const dueDetails = nextDue
    ? ` The next open item is ${monthLabel(nextDue.billingMonth)} with ${money(nextDue.balance)} due on ${shortDate(nextDue.dueDate)}.`
    : "";
  return {
    answer: `Your current outstanding balance is ${money(balance)}. Status: ${soa.summary.collectionStatus}.${dueDetails} You can use Pay Now or open Statement of Account for the full ledger.`,
    sources: [ACCOUNT_SUMMARY_SOURCE],
  };
}

async function recordAssistantAnswer(input: {
  tenantId: string;
  actorId: string;
  conversationId: string;
  requestId: string;
  answer: string;
  sources: AssistantSource[];
  started: number;
  action: string;
  providerRequestId?: string | null;
  provider?: string;
  model?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostCentavos?: number;
  outcome?: AiRequestOutcome;
  denialReason?: string | null;
}) {
  const sourceDocumentIds = input.sources
    .map((source) => source.documentId)
    .filter((documentId) => !documentId.startsWith("hoa-"));
  await prisma.$transaction([
    prisma.aiMessage.create({ data: { tenantId: input.tenantId, conversationId: input.conversationId, role: "ASSISTANT", contentRedacted: redactAiContentForAudit(input.answer), privacyClassification: "INTERNAL", sourceDocumentIds, providerRequestId: input.providerRequestId || undefined } }),
    prisma.aiUsageLedger.create({ data: { tenantId: input.tenantId, actorId: input.actorId, requestId: input.requestId, provider: input.provider || "HOAHUB", model: input.model || null, inputTokens: input.inputTokens ?? 0, outputTokens: input.outputTokens ?? 0, estimatedCostCentavos: input.estimatedCostCentavos ?? 0, latencyMs: Date.now() - input.started, outcome: input.outcome ?? AiRequestOutcome.SUCCEEDED, denialReason: input.denialReason || null } }),
    prisma.auditLog.create({ data: { tenantId: input.tenantId, actorId: input.actorId, module: "AI_ASSISTANCE", action: input.action, entityType: "AiConversation", entityId: input.conversationId, metadata: { requestId: input.requestId, providerRequestId: input.providerRequestId, sourceDocumentIds } } }),
  ]);
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

  const conversation = await conversationFor({
    tenantId,
    actorId,
    actorRoleSnapshot: roleSnapshotForRoles(access.user.roles),
    retentionDays: access.governance.retentionDays,
    conversationId: input.conversationId,
  });
  await prisma.aiMessage.create({ data: { tenantId, conversationId: conversation.id, role: "USER", contentRedacted: redactAiContentForAudit(question), privacyClassification: "INTERNAL" } });

  const started = Date.now();
  const directKind = input.experience === "RESIDENT" ? directQuestionKind(question) : null;
  if (directKind) {
    const direct = await answerDirectResidentQuestion({ kind: directKind, tenantId, actorId, homeownerProfileId: access.user.homeownerProfile?.id });
    await recordAssistantAnswer({ tenantId, actorId, conversationId: conversation.id, requestId, answer: direct.answer, sources: direct.sources, started, action: directKind === "GREETING" ? "AI_DIRECT_GREETING" : "AI_DIRECT_ACCOUNT_BALANCE" });
    return { conversationId: conversation.id, answer: direct.answer, sources: direct.sources, requestId };
  }

  const providerIndex = await prisma.tenantAiProviderIndex.findUnique({ where: { tenantId } });
  if (!providerIndex || providerIndex.status !== "ACTIVE") {
    await recordAssistantAnswer({ tenantId, actorId, conversationId: conversation.id, requestId, answer: NO_SOURCE_RESPONSE, sources: [], started, action: "AI_NO_SOURCE_FALLBACK", outcome: AiRequestOutcome.REFUSED, denialReason: "NO_TENANT_AI_INDEX" });
    return { conversationId: conversation.id, answer: NO_SOURCE_RESPONSE, sources: [], requestId };
  }

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
