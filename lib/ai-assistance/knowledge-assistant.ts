import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import { AiRequestOutcome, Prisma, RepositoryDocumentVisibility, RepositoryMalwareScanStatus } from "@prisma/client";
import { roleSnapshotForRoles } from "@/lib/authorization/effective-access";
import { aiKnowledgeProvider } from "@/lib/ai-assistance/provider";
import { assertKnowledgeQuestionIsMinimized, normalizeAiQuestion, redactAiContentForAudit } from "@/lib/ai-assistance/privacy";
import { estimateAiCostCentavos, recordAiDeniedRequest, requireAiRuntimeAccess, type AiExperience } from "@/lib/ai-assistance/runtime-policy";
import { getAppUrl } from "@/lib/app-url";
import { Permission } from "@/lib/authorization/permissions";
import { prisma } from "@/lib/db";
import { repositoryStorage } from "@/lib/document-repository/storage";
import { homeownerAccountNumber } from "@/lib/homeowner-account";
import { getStatementOfAccount } from "@/lib/services/statement-of-account";
import { collectionLabel, money, monthLabel, shortDate } from "@/lib/utils";

const NO_SOURCE_RESPONSE = "I could not find enough information in this tenant's approved and currently effective AI knowledge sources. Please contact your HOA administrator for an authoritative answer.";
const ASSISTANT_SCOPE_RESPONSE = "I can help with your own HOAHub account records, available resident documents, document request requirements, and questions grounded in approved association knowledge. I cannot access another homeowner's private records or invent rules without an authorized source.";
const ACCOUNT_SUMMARY_SOURCE = {
  documentId: "hoa-account-summary",
  title: "HOAHub Statement of Account",
  category: "Resident account",
  reference: "/portal/soa",
  effectiveAt: null,
};
const PROFILE_SOURCE = {
  documentId: "hoa-homeowner-profile",
  title: "HOAHub Homeowner Profile",
  category: "Resident account",
  reference: "/portal/profile",
  effectiveAt: null,
};
const DOCUMENT_LIBRARY_SOURCE = {
  documentId: "hoa-document-library",
  title: "HOAHub Document Library",
  category: "Resident knowledge",
  reference: "/portal/document-library",
  effectiveAt: null,
};
const DOCUMENT_REQUEST_SOURCE = {
  documentId: "hoa-document-requests",
  title: "HOAHub Document Requests",
  category: "Resident services",
  reference: "/portal/requests",
  effectiveAt: null,
};
const ORGANIZATION_SOURCE = {
  documentId: "hoa-organization",
  title: "HOAHub Association Organization",
  category: "Association profile",
  reference: "/portal/organization",
  effectiveAt: null,
};
const PAYMENT_HISTORY_SOURCE = {
  documentId: "hoa-payment-history",
  title: "HOAHub Payment History",
  category: "Resident account",
  reference: "/portal/payments",
  effectiveAt: null,
};
const COLLECTIONS_SOURCE = {
  documentId: "hoa-collections-bonds",
  title: "HOAHub Collections and Bonds",
  category: "Resident account",
  reference: "/portal/collections",
  effectiveAt: null,
};
const ANNOUNCEMENTS_SOURCE = {
  documentId: "hoa-announcements",
  title: "HOAHub Announcements",
  category: "Community updates",
  reference: "/portal/announcements",
  effectiveAt: null,
};
const EVENTS_SOURCE = {
  documentId: "hoa-events",
  title: "HOAHub Events",
  category: "Community updates",
  reference: "/portal/events",
  effectiveAt: null,
};
const ADMIN_COLLECTIONS_SOURCE = {
  documentId: "hoa-admin-collections",
  title: "HOAHub Admin Finance Collections",
  category: "Tenant finance",
  reference: "/admin/reports/dashboard",
  effectiveAt: null,
};
const ADMIN_HOMEOWNERS_SOURCE = {
  documentId: "hoa-admin-homeowners",
  title: "HOAHub Admin Homeowner Directory",
  category: "Tenant residents",
  reference: "/admin/homeowners",
  effectiveAt: null,
};
const STAFF_DRAFT_SOURCE = {
  documentId: "hoa-staff-copilot-draft",
  title: "HOAHub Staff Copilot Draft",
  category: "Administrative draft",
  reference: "/admin/ai-copilot",
  effectiveAt: null,
};
const COMPLAINTS_SOURCE = {
  documentId: "hoa-complaints",
  title: "HOAHub Complaints",
  category: "Resident services",
  reference: "/portal/complaints",
  effectiveAt: null,
};
const MAX_DOCUMENT_TEXT_BYTES = 12 * 1024 * 1024;
const MAX_DOCUMENT_TEXT_CHARS = 250_000;
const documentTextCache = new Map<string, string>();

type AssistantSource = {
  documentId: string;
  title: string;
  category: string;
  reference: string | null;
  revision?: number;
  effectiveAt: Date | null;
};

type DirectQuestionKind =
  | "GREETING"
  | "THANKS"
  | "JOKE"
  | "IDENTITY"
  | "SCOPE"
  | "CURRENT_BALANCE"
  | "BILLING_SUMMARY"
  | "PAYMENT_HISTORY"
  | "COLLECTION_BOND_REFUND"
  | "REQUEST_STATUS"
  | "CREATE_COMPLAINT_GUIDANCE"
  | "ANNOUNCEMENTS"
  | "EVENTS"
  | "ORGANIZATION_OFFICER"
  | "ACCOUNT_NUMBER"
  | "MY_PROFILE"
  | "AVAILABLE_POLICIES"
  | "AVAILABLE_DOCUMENTS"
  | "DOCUMENT_REQUIREMENTS"
  | "OTHER_HOMEOWNER_PRIVATE";

type StaffQuestionKind =
  | "STAFF_SCOPE"
  | "STAFF_JOKE"
  | "TODAY_COLLECTION_TOTAL"
  | "FINANCE_SUMMARY"
  | "HOMEOWNER_DIRECTORY"
  | "DRAFT_RESOLUTION";

type ResidentPublicDocument = {
  id: string;
  title: string;
  documentReference: string | null;
  currentRevision: number;
  originalFileName: string;
  storageKey: string;
  contentType: string;
  fileExtension: string;
  fileSizeBytes: bigint;
  checksumSha256: string;
  effectiveAt: Date | null;
  category: { name: string };
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

async function bytesFromStream(stream: Readable, limitBytes = MAX_DOCUMENT_TEXT_BYTES) {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > limitBytes) throw new Error("Repository document is too large for direct AI text extraction.");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/\bsec(?:tion)?\b/g, "section")
    .replace(/\bkarta\b/g, "carta")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function questionTerms(question: string) {
  const stop = new Set(["what", "whats", "what's", "where", "when", "who", "how", "is", "are", "the", "a", "an", "of", "in", "on", "for", "to", "from", "and", "or", "my", "our", "your", "their", "available", "existing", "tell", "me", "about", "please"]);
  return [...new Set(normalizeSearchText(question).split(" ").filter((term) => term.length >= 3 && !stop.has(term)))];
}

function sectionQuery(question: string) {
  const normalized = normalizeSearchText(question);
  const sectionNumber = /\bsection\s+([0-9]+[a-z]?)\b/.exec(normalized)?.[1];
  const title = /declaration\s+of\s+policy/.test(normalized) ? "declaration of policy" : null;
  return sectionNumber ? { sectionNumber, title } : null;
}

function sourceForRepositoryDocument(document: ResidentPublicDocument): AssistantSource {
  return {
    documentId: document.id,
    title: document.title,
    category: document.category.name,
    reference: document.documentReference,
    revision: document.currentRevision,
    effectiveAt: document.effectiveAt,
  };
}

async function extractRepositoryDocumentText(input: { tenantSlug: string; document: ResidentPublicDocument }) {
  const cached = documentTextCache.get(input.document.checksumSha256);
  if (cached) return cached;

  const stream = await repositoryStorage.openReadStream({ tenantSlug: input.tenantSlug, storageKey: input.document.storageKey });
  const bytes = await bytesFromStream(stream);
  const extension = input.document.fileExtension.toLowerCase();
  const contentType = input.document.contentType.toLowerCase();
  let text = "";

  if (contentType.startsWith("text/") || [".txt", ".md", ".csv"].includes(extension)) {
    text = bytes.toString("utf8");
  } else if (contentType === "application/pdf" || extension === ".pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: bytes });
    try {
      const result = await parser.getText();
      text = result.text || "";
    } finally {
      await parser.destroy();
    }
  } else if (contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || extension === ".docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: bytes });
    text = result.value || "";
  }

  const normalized = text.replace(/\r/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_DOCUMENT_TEXT_CHARS);
  if (normalized) {
    if (documentTextCache.size > 40) {
      const firstKey = documentTextCache.keys().next().value;
      if (firstKey) documentTextCache.delete(firstKey);
    }
    documentTextCache.set(input.document.checksumSha256, normalized);
  }
  return normalized;
}

function sentenceWindow(text: string, start: number, maxChars = 1400) {
  const safeStart = Math.max(0, start);
  let end = Math.min(text.length, safeStart + maxChars);
  const nextSection = text.slice(safeStart + 20, end + 1200).search(/\b(?:SEC\.?|SECTION)\s+[0-9]+[A-Z]?\b/i);
  if (nextSection > 80) end = safeStart + 20 + nextSection;
  const slice = text.slice(safeStart, end).trim();
  return slice.replace(/\s+/g, " ");
}

function bestSnippetForQuestion(text: string, question: string) {
  const section = sectionQuery(question);
  if (section) {
    const sectionPattern = new RegExp(`\\b(?:SEC\\.?|SECTION)\\s*${section.sectionNumber}\\b`, "i");
    const sectionMatch = sectionPattern.exec(text);
    if (sectionMatch) {
      const titleWindow = text.slice(sectionMatch.index, sectionMatch.index + 300);
      if (!section.title || normalizeSearchText(titleWindow).includes(section.title)) {
        return sentenceWindow(text, sectionMatch.index);
      }
    }
  }

  const normalizedText = normalizeSearchText(text);
  const terms = questionTerms(question);
  if (!terms.length) return "";
  let best = { score: 0, index: -1 };
  for (let index = 0; index < text.length; index += 900) {
    const raw = text.slice(index, index + 1800);
    const normalized = normalizeSearchText(raw);
    const score = terms.reduce((sum, term) => sum + (normalized.includes(term) ? 1 : 0), 0);
    if (score > best.score) best = { score, index };
    if (best.score >= Math.min(terms.length, 5)) break;
  }
  if (best.score < Math.min(2, terms.length)) {
    const firstTermIndex = terms.map((term) => normalizedText.indexOf(term)).filter((index) => index >= 0).sort((a, b) => a - b)[0];
    if (firstTermIndex == null) return "";
  }
  return best.index >= 0 ? sentenceWindow(text, best.index) : "";
}

function metadataScore(document: ResidentPublicDocument, terms: string[]) {
  const metadata = normalizeSearchText([document.title, document.documentReference, document.originalFileName, document.category.name].filter(Boolean).join(" "));
  return terms.reduce((score, term) => score + (metadata.includes(term) ? 2 : 0), 0);
}

async function answerFromRepositoryDocumentText(input: { tenantId: string; tenantSlug: string; question: string; where: Prisma.RepositoryDocumentWhereInput }) {
  const terms = questionTerms(input.question);
  const documents = await prisma.repositoryDocument.findMany({
    where: input.where,
    orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
    take: 24,
    select: {
      id: true,
      title: true,
      documentReference: true,
      currentRevision: true,
      originalFileName: true,
      storageKey: true,
      contentType: true,
      fileExtension: true,
      fileSizeBytes: true,
      checksumSha256: true,
      effectiveAt: true,
      category: { select: { name: true } },
    },
  });
  if (!documents.length) return null;

  const candidates = [...documents]
    .sort((a, b) => metadataScore(b, terms) - metadataScore(a, terms))
    .slice(0, 10);

  for (const document of candidates) {
    if (document.fileSizeBytes > BigInt(MAX_DOCUMENT_TEXT_BYTES)) continue;
    let text = "";
    try {
      text = await extractRepositoryDocumentText({ tenantSlug: input.tenantSlug, document });
    } catch {
      continue;
    }
    if (!text) continue;
    const snippet = bestSnippetForQuestion(text, input.question);
    if (!snippet) continue;
    return {
      answer: `I found this in ${document.title}${document.documentReference ? ` (${document.documentReference})` : ""}:\n\n${snippet}\n\nFor official use, open the source document in Document Library and confirm the full section context.`,
      sources: [sourceForRepositoryDocument(document)],
    };
  }
  return null;
}

function directQuestionKind(question: string): DirectQuestionKind | null {
  const compact = question.trim().toLowerCase().replace(/[!.?]+$/g, "");
  if (/^(hi|hello|hey|good morning|good afternoon|good evening|kumusta|kamusta)(\s+(hoa|hoahub|assistant|there))?$/.test(compact)) return "GREETING";
  if (/^(thanks|thank you|salamat|ty|okay thanks|ok thanks)(\s+(hoa|hoahub|assistant))?$/.test(compact)) return "THANKS";
  if (/\b(tell me a joke|joke|make me laugh|funny)\b/i.test(question)) return "JOKE";
  if (/\b(who are you|what are you|your name|what('?s| is) your name|anong pangalan mo)\b/i.test(question)) return "IDENTITY";
  if (/\b(what can you do|help me|how can you help|what do you know|what questions can i ask)\b/i.test(question)) return "SCOPE";
  if (/\b(another|other|neighbor|neighbour|someone else|different homeowner|all homeowners)\b.{0,80}\b(balance|account number|account|dues|profile|address|phone|email)\b/i.test(question)) return "OTHER_HOMEOWNER_PRIVATE";
  if (/\b(who|current|association|hoa)\b.{0,80}\b(president|vice president|secretary|treasurer|auditor|officer|board|director|committee)\b/i.test(question) || /\b(president|vice president|secretary|treasurer|auditor)\b.{0,80}\b(association|hoa|current|who)\b/i.test(question)) return "ORGANIZATION_OFFICER";
  if (
    /\b(current|outstanding|account|hoa|dues)\s+balance\b/i.test(question)
    || /\bbalance\s+(ko|namin|ng account|on my account|due)\b/i.test(question)
    || /\bhow much\b.{0,50}\b(owe|due|pay)\b/i.test(question)
    || /\bwhat('?s| is)\b.{0,40}\b(amount due|outstanding|unpaid dues)\b/i.test(question)
  ) return "CURRENT_BALANCE";
  if (/\b(my|own)?\s*(billing|bills|dues|open billings|unpaid bills|statement)\b/i.test(question)) return "BILLING_SUMMARY";
  if (/\b(my|own)?\s*(payment history|payments|receipts|latest payment|recent payment|paid)\b/i.test(question)) return "PAYMENT_HISTORY";
  if (/\b(collections?|bonds?|construction bond|contractor bond|refunds?|refundable|forfeited|forfeiture)\b/i.test(question)) return "COLLECTION_BOND_REFUND";
  if (/\b(my|own)\s+(homeowner\s+)?account\s+(number|no\.?|#)\b/i.test(question) || /\bwhat('?s| is)\b.{0,40}\baccount\s+(number|no\.?|#)\b/i.test(question)) return "ACCOUNT_NUMBER";
  if (/\b(my|own)\s+(profile|property|block|lot|address|monthly dues|dues amount)\b/i.test(question) || /\bwhat('?s| is)\b.{0,50}\b(block|lot|address|monthly dues|dues amount)\b/i.test(question)) return "MY_PROFILE";
  if (/\b(policy|policies|bylaws|by-laws|rules|guidelines)\b.{0,80}\b(available|existing|list|published|documents?)\b/i.test(question) || /\b(available|existing|list|published)\b.{0,80}\b(policy|policies|bylaws|by-laws|rules|guidelines)\b/i.test(question)) return "AVAILABLE_POLICIES";
  if (/\b(document library|available documents|published documents|what documents|list documents|records available)\b/i.test(question)) return "AVAILABLE_DOCUMENTS";
  if (/\b(requirements?|requirement|needed|need|how to request|how do i request|document request|residency certificate|certificate|clearance|gate pass)\b/i.test(question)) return "DOCUMENT_REQUIREMENTS";
  if (/\b(create|submit|file|make|raise|report)\b.{0,60}\b(complaint|complain|issue|incident|concern)\b/i.test(question) || /\b(how do i|how to)\b.{0,60}\b(complaint|complain|report an issue)\b/i.test(question)) return "CREATE_COMPLAINT_GUIDANCE";
  if (/\b(my|own|recent|latest|pending|open)\s+(requests?|document requests?|complaints?|service requests?)\b/i.test(question) || /\b(request status|pending requests?|open requests?)\b/i.test(question)) return "REQUEST_STATUS";
  if (/\b(announcements?|notices?|memos?|advisor(?:y|ies)|latest news|community updates?)\b/i.test(question)) return "ANNOUNCEMENTS";
  if (/\b(events?|activities|calendar|schedule|upcoming|meeting)\b/i.test(question)) return "EVENTS";
  return null;
}

function staffQuestionKind(question: string): StaffQuestionKind | null {
  if (/\b(what can you do|help me|how can you help|what reports can you answer|staff copilot|admin assistant)\b/i.test(question)) return "STAFF_SCOPE";
  if (/\b(tell me a joke|joke|make me laugh|funny)\b/i.test(question)) return "STAFF_JOKE";
  if (/\b(create|draft|make|prepare|write)\b.{0,80}\b(resolution|board resolution|hoa resolution)\b/i.test(question)) return "DRAFT_RESOLUTION";
  if (
    /\b(list|show|give|provide|display|how many|count)\b.{0,80}\b(residents?|homeowners?|home owners?|members?)\b/i.test(question)
    || /\b(residents?|homeowners?|home owners?)\b.{0,80}\b(block|active|inactive|list|count)\b/i.test(question)
  ) return "HOMEOWNER_DIRECTORY";
  if (
    /\b(total|summary|breakdown|how much)\b.{0,80}\b(collections?|collected|receipts?|payments?)\b/i.test(question)
    && /\b(today|this day|now)\b/i.test(question)
  ) return "TODAY_COLLECTION_TOTAL";
  if (
    /\b(collections?|collected|receipts?|payments?)\b.{0,80}\b(today|this day|now)\b/i.test(question)
  ) return "TODAY_COLLECTION_TOTAL";
  if (/\b(finance|financial|receivables?|outstanding|overdue|income|expenses?|net collection|cash flow|summary|dashboard)\b/i.test(question)) return "FINANCE_SUMMARY";
  return null;
}

function blockFilterFromQuestion(question: string) {
  const match = /\bblock\s+([a-z0-9-]+)\b/i.exec(question);
  return match?.[1]?.trim() || null;
}

function homeownerStatusFilterFromQuestion(question: string) {
  if (/\binactive|deactivated|not active\b/i.test(question)) return "INACTIVE" as const;
  if (/\bactive|activated|current homeowners?|current residents?\b/i.test(question)) return "ACTIVE" as const;
  return null;
}

function draftSubjectFromQuestion(question: string) {
  return question
    .replace(/\b(create|draft|make|prepare|write)\b/ig, "")
    .replace(/\b(a|an|the|board|hoa|resolution|for|about|regarding|re:)\b/ig, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180) || "[state the matter for board action]";
}

function residentDocumentWhere(tenantId: string, now: Date): Prisma.RepositoryDocumentWhereInput {
  return {
    tenantId,
    aiEnabled: true,
    status: "PUBLISHED",
    visibility: RepositoryDocumentVisibility.TENANT_PUBLIC,
    malwareScanStatus: { notIn: [RepositoryMalwareScanStatus.PENDING, RepositoryMalwareScanStatus.FAILED, RepositoryMalwareScanStatus.BLOCKED] },
    ...effectiveFilter(now),
  };
}

function staffDocumentWhere(tenantId: string, now: Date): Prisma.RepositoryDocumentWhereInput {
  return {
    tenantId,
    aiEnabled: true,
    status: "PUBLISHED",
    visibility: { in: [RepositoryDocumentVisibility.TENANT_PUBLIC, RepositoryDocumentVisibility.INTERNAL] },
    malwareScanStatus: { notIn: [RepositoryMalwareScanStatus.PENDING, RepositoryMalwareScanStatus.FAILED, RepositoryMalwareScanStatus.BLOCKED] },
    ...effectiveFilter(now),
  };
}

function formatDocumentList(documents: Array<{ title: string; documentReference: string | null; category: { name: string } }>, empty: string) {
  if (!documents.length) return empty;
  const lines = documents.slice(0, 8).map((document, index) => {
    const reference = document.documentReference ? ` (${document.documentReference})` : "";
    return `${index + 1}. ${document.title}${reference} - ${document.category.name}`;
  });
  const more = documents.length > lines.length ? `\n\nThere are ${documents.length - lines.length} more available in the Document Library.` : "";
  return `${lines.join("\n")}${more}`;
}

function tenantLocalDateString(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function timeAwareGreeting(name?: string | null, now = new Date()) {
  const hourText = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    hour12: false,
  }).format(now);
  const hour = Number(hourText);
  const period = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = name?.trim().split(/\s+/)[0];
  return firstName ? `${period}, ${firstName}` : period;
}

function tenantDateRange(dateString = tenantLocalDateString()) {
  const start = new Date(`${dateString}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { dateString, start, end };
}

function sumMoney(items: Array<{ amount: Prisma.Decimal | number }>) {
  return items.reduce((total, item) => total + Number(item.amount), 0);
}

function groupedTotals<T extends string>(items: Array<{ key: T; amount: Prisma.Decimal | number }>) {
  const totals = new Map<T, number>();
  for (const item of items) totals.set(item.key, (totals.get(item.key) || 0) + Number(item.amount));
  return [...totals.entries()].sort((a, b) => b[1] - a[1]);
}

async function answerProfileQuestion(input: { tenantId: string; homeownerProfileId?: string | null; includeAccountNumber?: boolean }) {
  if (!input.homeownerProfileId) {
    return {
      answer: "I could not find an active homeowner profile for your signed-in account. Please contact your HOA administrator to check your account setup.",
      sources: [] as AssistantSource[],
    };
  }
  const profile = await prisma.homeownerProfile.findFirst({
    where: { tenantId: input.tenantId, id: input.homeownerProfileId },
    select: { accountNumber: true, block: true, lot: true, address: true, phase: true, propertyType: true, occupancyStatus: true, monthlyDuesAmount: true, user: { select: { name: true } } },
  });
  if (!profile) {
    return {
      answer: "I could not find an active homeowner profile for your signed-in account. Please contact your HOA administrator to check your account setup.",
      sources: [] as AssistantSource[],
    };
  }
  if (input.includeAccountNumber) {
    return {
      answer: `Your HOAHub homeowner account number is ${homeownerAccountNumber(profile)}. This answer is from your signed-in homeowner profile only.`,
      sources: [PROFILE_SOURCE],
    };
  }
  const details = [
    `Name: ${profile.user.name}`,
    `Property: Block ${profile.block}, Lot ${profile.lot}`,
    `Address: ${profile.address}`,
    profile.phase ? `Phase: ${profile.phase}` : null,
    profile.propertyType ? `Property type: ${profile.propertyType}` : null,
    profile.occupancyStatus ? `Occupancy: ${profile.occupancyStatus}` : null,
    `Standard monthly dues: ${money(profile.monthlyDuesAmount)}`,
  ].filter(Boolean).join("\n");
  return {
    answer: `Here is what I can share from your signed-in HOAHub profile:\n\n${details}`,
    sources: [PROFILE_SOURCE],
  };
}

async function answerAvailablePolicies(input: { tenantId: string }) {
  const now = new Date();
  const categories = await prisma.repositoryDocumentCategory.findMany({
    where: {
      tenantId: input.tenantId,
      active: true,
      OR: [
        { categoryGroup: { contains: "POLICY" } },
        { categoryGroup: { contains: "GOVERNANCE" } },
        { categoryGroup: { contains: "COMMUNITY" } },
        { name: { contains: "Policy" } },
        { name: { contains: "Bylaw" } },
        { name: { contains: "Rule" } },
        { name: { contains: "Guideline" } },
      ],
    },
    select: { id: true },
  });
  const documents = categories.length ? await prisma.repositoryDocument.findMany({
    where: { ...residentDocumentWhere(input.tenantId, now), categoryId: { in: categories.map((category) => category.id) } },
    orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
    take: 20,
    select: { title: true, documentReference: true, category: { select: { name: true } } },
  }) : [];
  return {
    answer: documents.length
      ? `These are the currently published resident-visible policy/rule documents I found:\n\n${formatDocumentList(documents, "")}\n\nOpen Document Library to download the full files or ask me about one of these titles.`
      : "I did not find any currently published resident-visible policy documents in the Document Library. Ask your HOA administrator to publish and AI-enable the policy documents you expect residents to use.",
    sources: [DOCUMENT_LIBRARY_SOURCE],
  };
}

async function answerAvailableDocuments(input: { tenantId: string }) {
  const documents = await prisma.repositoryDocument.findMany({
    where: residentDocumentWhere(input.tenantId, new Date()),
    orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
    take: 20,
    select: { title: true, documentReference: true, category: { select: { name: true } } },
  });
  return {
    answer: documents.length
      ? `These are currently available in your resident Document Library:\n\n${formatDocumentList(documents, "")}\n\nOpen Document Library to download a document or ask me a question about a specific approved source.`
      : "I did not find any currently published resident-visible documents in the Document Library yet.",
    sources: [DOCUMENT_LIBRARY_SOURCE],
  };
}

async function answerDocumentRequirements(input: { tenantId: string; question: string }) {
  const compact = input.question.toLowerCase();
  const search = compact.includes("residency") || compact.includes("certificate")
    ? "residency"
    : compact.includes("gate pass") || compact.includes("gate")
      ? "gate"
      : compact.includes("clearance")
        ? "clearance"
        : "";
  const definitions = await prisma.documentDefinition.findMany({
    where: {
      tenantId: input.tenantId,
      active: true,
      status: "ACTIVE",
      archivedAt: null,
      ...(search ? { OR: [{ displayName: { contains: search } }, { code: { contains: search } }, { description: { contains: search } }] } : {}),
    },
    orderBy: [{ displayOrder: "asc" }, { displayName: "asc" }],
    take: search ? 5 : 8,
    select: {
      displayName: true,
      description: true,
      deliveryMode: true,
      paymentRequired: true,
      feeAmount: true,
      approvalRequired: true,
      maxCopies: true,
      fields: { where: { active: true }, orderBy: [{ displayOrder: "asc" }, { label: "asc" }], select: { label: true, required: true } },
    },
  });
  if (!definitions.length) {
    return {
      answer: "I did not find an active document request setup matching that question. You can still open Document Requests, or contact your HOA administrator to confirm the requirement.",
      sources: [DOCUMENT_REQUEST_SOURCE],
    };
  }
  const lines = definitions.map((definition, index) => {
    const requiredFields = definition.fields.filter((field) => field.required).map((field) => field.label);
    const fee = definition.paymentRequired ? ` Fee: ${money(definition.feeAmount)}.` : " No configured fee.";
    const approval = definition.approvalRequired ? " HOA approval is required." : " HOA approval is not required by this setup.";
    const fields = requiredFields.length ? ` Required fields: ${requiredFields.join(", ")}.` : " No extra required fields are configured.";
    return `${index + 1}. ${definition.displayName}.${fee}${approval}${fields}`;
  });
  return {
    answer: `Here are the active document request requirements I found:\n\n${lines.join("\n")}\n\nOpen Document Requests to submit one.`,
    sources: [DOCUMENT_REQUEST_SOURCE],
  };
}

async function answerOrganizationQuestion(input: { tenantId: string; question: string }) {
  const roleMatch = /\b(president|vice president|secretary|treasurer|auditor|director|officer|board|committee)\b/i.exec(input.question);
  const role = roleMatch?.[1]?.toLowerCase();
  const now = new Date();
  const officers = await prisma.organizationOfficer.findMany({
    where: {
      tenantId: input.tenantId,
      active: true,
      archivedAt: null,
      effectiveDate: { lte: now },
      OR: [{ endDate: null }, { endDate: { gt: now } }],
      ...(role && !["officer", "board", "committee"].includes(role) ? { position: { contains: role } } : {}),
    },
    orderBy: [{ displayOrder: "asc" }, { position: "asc" }, { fullName: "asc" }],
    take: role && !["officer", "board", "committee"].includes(role) ? 5 : 12,
    select: { fullName: true, position: true, committee: true, effectiveDate: true, endDate: true },
  });
  if (!officers.length) {
    return {
      answer: role && !["officer", "board", "committee"].includes(role)
        ? `I could not find a currently active ${role} record in this association's HOAHub organization setup. Please contact the HOA office to confirm.`
        : "I could not find active association officers in this tenant's HOAHub organization setup. Please contact the HOA office to confirm.",
      sources: [ORGANIZATION_SOURCE],
    };
  }
  const lines = officers.map((officer, index) => `${index + 1}. ${officer.fullName} - ${officer.position}${officer.committee ? `, ${officer.committee}` : ""}`);
  return {
    answer: role && !["officer", "board", "committee"].includes(role)
      ? `The current ${role} record I found is:\n\n${lines.join("\n")}`
      : `These are the current active association officers I found:\n\n${lines.join("\n")}`,
    sources: [ORGANIZATION_SOURCE],
  };
}

async function answerBillingSummary(input: { tenantId: string; homeownerProfileId?: string | null }) {
  if (!input.homeownerProfileId) {
    return { answer: "I could not find an active homeowner profile for your signed-in account.", sources: [] as AssistantSource[] };
  }
  const soa = await getStatementOfAccount(input.homeownerProfileId, input.tenantId, getAppUrl());
  const openBills = await prisma.bill.findMany({
    where: { tenantId: input.tenantId, homeownerId: input.homeownerProfileId, archivedAt: null, balance: { gt: 0 } },
    orderBy: [{ dueDate: "asc" }, { billingMonth: "asc" }],
    take: 5,
    select: { billingMonth: true, dueDate: true, amount: true, balance: true, status: true },
  });
  const lines = openBills.map((bill, index) => `${index + 1}. ${monthLabel(bill.billingMonth)} - ${money(bill.balance)} balance, due ${shortDate(bill.dueDate)}, status ${bill.status.replaceAll("_", " ")}`);
  return {
    answer: `Your current outstanding balance is ${money(soa.summary.currentOutstandingBalance)}. Collection status: ${soa.summary.collectionStatus}.${lines.length ? `\n\nOpen billing items:\n${lines.join("\n")}` : "\n\nNo open billing items are recorded right now."}`,
    sources: [ACCOUNT_SUMMARY_SOURCE],
  };
}

async function answerPaymentHistory(input: { tenantId: string; homeownerProfileId?: string | null }) {
  if (!input.homeownerProfileId) {
    return { answer: "I could not find an active homeowner profile for your signed-in account.", sources: [] as AssistantSource[] };
  }
  const [payments, total] = await Promise.all([
    prisma.payment.findMany({
      where: { tenantId: input.tenantId, homeownerId: input.homeownerProfileId, status: "ACTIVE" },
      orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
      take: 5,
      select: { amount: true, paymentDate: true, method: true, receiptNumber: true, referenceNumber: true, remarks: true },
    }),
    prisma.payment.count({ where: { tenantId: input.tenantId, homeownerId: input.homeownerProfileId, status: "ACTIVE" } }),
  ]);
  if (!payments.length) return { answer: "I did not find active payment records for your signed-in homeowner account yet.", sources: [PAYMENT_HISTORY_SOURCE] };
  const lines = payments.map((payment, index) => `${index + 1}. ${shortDate(payment.paymentDate)} - ${money(payment.amount)} via ${payment.method.replaceAll("_", " ")}${payment.receiptNumber ? `, receipt ${payment.receiptNumber}` : ""}${payment.referenceNumber ? `, ref ${payment.referenceNumber}` : ""}`);
  return {
    answer: `You have ${total} active payment record${total === 1 ? "" : "s"}. Recent payments:\n\n${lines.join("\n")}\n\nOpen Payment History for receipts and full details.`,
    sources: [PAYMENT_HISTORY_SOURCE],
  };
}

async function answerCollectionBondRefund(input: { tenantId: string; homeownerProfileId?: string | null }) {
  if (!input.homeownerProfileId) {
    return { answer: "I could not find an active homeowner profile for your signed-in account.", sources: [] as AssistantSource[] };
  }
  const collections = await prisma.collection.findMany({
    where: { tenantId: input.tenantId, homeownerId: input.homeownerProfileId },
    orderBy: [{ collectionDate: "desc" }, { createdAt: "desc" }],
    take: 8,
    select: {
      type: true,
      description: true,
      amount: true,
      collectionDate: true,
      method: true,
      receiptNumber: true,
      referenceNumber: true,
      refundable: true,
      amountRefunded: true,
      amountForfeited: true,
      refundStatus: true,
    },
  });
  if (!collections.length) return { answer: "I did not find collection, bond, or refund records for your signed-in homeowner account.", sources: [COLLECTIONS_SOURCE] };
  const refundable = collections.filter((item) => item.refundable);
  const refundableBalance = refundable.reduce((total, item) => total + Number(item.amount) - Number(item.amountRefunded) - Number(item.amountForfeited), 0);
  const lines = collections.slice(0, 5).map((item, index) => {
    const balance = item.refundable ? Number(item.amount) - Number(item.amountRefunded) - Number(item.amountForfeited) : 0;
    const refund = item.refundable ? `, refunded ${money(item.amountRefunded)}, remaining ${money(balance)}, status ${item.refundStatus.replaceAll("_", " ")}` : "";
    return `${index + 1}. ${collectionLabel(item.type, item.description)} - ${money(item.amount)} on ${shortDate(item.collectionDate)} via ${item.method.replaceAll("_", " ")}${refund}${item.receiptNumber ? `, receipt ${item.receiptNumber}` : item.referenceNumber ? `, ref ${item.referenceNumber}` : ""}`;
  });
  return {
    answer: `I found ${collections.length} collection/bond record${collections.length === 1 ? "" : "s"} for your signed-in account. Refundable balance from the latest records is ${money(refundableBalance)}.\n\nRecent records:\n${lines.join("\n")}\n\nOpen Collections & Bonds for receipts and full refund history.`,
    sources: [COLLECTIONS_SOURCE],
  };
}

async function answerAnnouncements(input: { tenantId: string }) {
  const announcements = await prisma.announcement.findMany({
    where: { tenantId: input.tenantId, status: "PUBLISHED" },
    orderBy: [{ createdAt: "desc" }],
    take: 5,
    select: { title: true, type: true, content: true, createdAt: true },
  });
  if (!announcements.length) return { answer: "I did not find published announcements for this tenant right now.", sources: [ANNOUNCEMENTS_SOURCE] };
  const lines = announcements.map((item, index) => {
    const summary = item.content.replace(/\s+/g, " ").trim().slice(0, 180);
    return `${index + 1}. ${item.title} - ${item.type.replaceAll("_", " ")}, posted ${shortDate(item.createdAt)}${summary ? `: ${summary}${item.content.length > 180 ? "..." : ""}` : ""}`;
  });
  return {
    answer: `Latest published announcements:\n\n${lines.join("\n")}\n\nOpen Announcements for the full notices.`,
    sources: [ANNOUNCEMENTS_SOURCE],
  };
}

async function answerEvents(input: { tenantId: string }) {
  const today = tenantDateRange().start;
  const events = await prisma.event.findMany({
    where: { tenantId: input.tenantId, status: "PUBLISHED", eventDate: { gte: today } },
    orderBy: [{ eventDate: "asc" }, { startTime: "asc" }],
    take: 6,
    select: { title: true, type: true, description: true, eventDate: true, eventTime: true, startTime: true, endTime: true, location: true },
  });
  if (!events.length) return { answer: "I did not find upcoming published events for this tenant right now.", sources: [EVENTS_SOURCE] };
  const lines = events.map((item, index) => {
    const time = item.startTime && item.endTime ? `${item.startTime}-${item.endTime}` : item.eventTime;
    const summary = item.description.replace(/\s+/g, " ").trim().slice(0, 150);
    return `${index + 1}. ${item.title} - ${shortDate(item.eventDate)} ${time}, ${item.location}${summary ? `: ${summary}${item.description.length > 150 ? "..." : ""}` : ""}`;
  });
  return {
    answer: `Upcoming published events:\n\n${lines.join("\n")}\n\nOpen Events for the full schedule.`,
    sources: [EVENTS_SOURCE],
  };
}

async function answerComplaintCreationGuidance(input: { tenantId: string }) {
  const categories = await prisma.complaintCategory.findMany({
    where: { tenantId: input.tenantId, active: true },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    take: 8,
    select: { name: true, requiresBoardReview: true },
  });
  const categoryLine = categories.length
    ? `Available categories include: ${categories.map((category) => `${category.name}${category.requiresBoardReview ? " (board review)" : ""}`).join(", ")}.`
    : "No active complaint categories are configured yet, so use General or contact the HOA office.";
  return {
    answer: `I can guide you in preparing a complaint, but I will not submit or decide it without the normal HOAHub workflow. Open Submit Complaint and provide a clear title, category, description, location, incident date if known, requested action, privacy mode, and attachments if needed. ${categoryLine}\n\nIf AI-assisted complaint creation is enabled later, I should first show a draft and require your explicit confirmation before submission.`,
    sources: [COMPLAINTS_SOURCE],
  };
}

async function answerRequestStatus(input: { tenantId: string; homeownerProfileId?: string | null; actorId: string }) {
  if (!input.homeownerProfileId) {
    return { answer: "I could not find an active homeowner profile for your signed-in account.", sources: [] as AssistantSource[] };
  }
  const [documents, complaints] = await Promise.all([
    prisma.documentRequest.findMany({
      where: { tenantId: input.tenantId, homeownerId: input.homeownerProfileId, archivedAt: null },
      orderBy: [{ updatedAt: "desc" }, { requestedAt: "desc" }],
      take: 5,
      select: { documentNumber: true, status: true, requestedAt: true, definition: { select: { displayName: true } }, configuration: { select: { displayName: true } }, type: true },
    }),
    prisma.complaint.findMany({
      where: {
        tenantId: input.tenantId,
        OR: [
          { submittedById: input.actorId },
          { homeownerId: input.homeownerProfileId },
          { confidentialIdentity: { is: { userId: input.actorId } } },
          { confidentialIdentity: { is: { homeownerId: input.homeownerProfileId } } },
        ],
      },
      orderBy: [{ updatedAt: "desc" }, { submittedAt: "desc" }],
      take: 5,
      select: { title: true, publicReference: true, complaintNumber: true, status: true, submittedAt: true },
    }),
  ]);
  const documentLines = documents.map((request, index) => `${index + 1}. ${request.definition?.displayName || request.configuration?.displayName || request.type || "Document request"} - ${request.status.replaceAll("_", " ")}${request.documentNumber ? ` (${request.documentNumber})` : ""}, requested ${shortDate(request.requestedAt)}`);
  const complaintLines = complaints.map((complaint, index) => `${index + 1}. ${complaint.title} - ${complaint.status.replaceAll("_", " ")} (${complaint.complaintNumber || complaint.publicReference}), submitted ${shortDate(complaint.submittedAt)}`);
  if (!documentLines.length && !complaintLines.length) return { answer: "I did not find recent document or complaint requests for your signed-in account.", sources: [DOCUMENT_REQUEST_SOURCE] };
  return {
    answer: [
      documentLines.length ? `Recent document requests:\n${documentLines.join("\n")}` : "",
      complaintLines.length ? `Recent complaints:\n${complaintLines.join("\n")}` : "",
      "Open Requests for full details and next actions.",
    ].filter(Boolean).join("\n\n"),
    sources: [DOCUMENT_REQUEST_SOURCE],
  };
}

async function answerTodayCollectionTotal(input: { tenantId: string; permissions: readonly string[] }) {
  if (!canReadTenantFinance(input.permissions)) {
    return {
      answer: "I cannot show tenant-wide collection totals because your current role does not include finance/report permissions. Ask a Billing Manager, HOA Admin, or System Admin to review the collection report.",
      sources: [] as AssistantSource[],
    };
  }

  const { dateString, start, end } = tenantDateRange();
  const [payments, collections] = await Promise.all([
    prisma.payment.findMany({
      where: { tenantId: input.tenantId, status: "ACTIVE", paymentDate: { gte: start, lt: end } },
      orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
      select: {
        amount: true,
        method: true,
        receiptNumber: true,
        referenceNumber: true,
        paymentDate: true,
        homeowner: { select: { block: true, lot: true, user: { select: { name: true } } } },
        processedBy: { select: { name: true } },
      },
    }),
    prisma.collection.findMany({
      where: { tenantId: input.tenantId, collectionDate: { gte: start, lt: end } },
      orderBy: [{ collectionDate: "desc" }, { createdAt: "desc" }],
      select: {
        type: true,
        description: true,
        payerType: true,
        amount: true,
        collectionDate: true,
        method: true,
        receiptNumber: true,
        referenceNumber: true,
        refundable: true,
        refundStatus: true,
        homeowner: { select: { block: true, lot: true, user: { select: { name: true } } } },
        contractor: { select: { companyName: true } },
        createdBy: { select: { name: true } },
      },
    }),
  ]);

  const paymentTotal = sumMoney(payments);
  const otherCollectionTotal = sumMoney(collections);
  const grandTotal = paymentTotal + otherCollectionTotal;
  const methodTotals = groupedTotals([
    ...payments.map((item) => ({ key: item.method, amount: item.amount })),
    ...collections.map((item) => ({ key: item.method, amount: item.amount })),
  ]);
  const typeTotals = groupedTotals([
    ...payments.map((item) => ({ key: "Homeowner payments", amount: item.amount })),
    ...collections.map((item) => ({ key: collectionLabel(item.type, item.description), amount: item.amount })),
  ]);

  const paymentLines = payments.slice(0, 6).map((payment, index) => {
    const homeowner = `${payment.homeowner.user.name} (Block ${payment.homeowner.block}, Lot ${payment.homeowner.lot})`;
    const reference = payment.receiptNumber ? `receipt ${payment.receiptNumber}` : payment.referenceNumber ? `ref ${payment.referenceNumber}` : "no receipt/reference";
    return `${index + 1}. ${money(payment.amount)} - ${homeowner}, ${payment.method.replaceAll("_", " ")}, ${reference}${payment.processedBy ? `, processed by ${payment.processedBy.name}` : ""}`;
  });
  const collectionLines = collections.slice(0, 6).map((collection, index) => {
    const payer = collection.homeowner
      ? `${collection.homeowner.user.name} (Block ${collection.homeowner.block}, Lot ${collection.homeowner.lot})`
      : collection.contractor?.companyName || collection.payerType.replaceAll("_", " ");
    const reference = collection.receiptNumber ? `receipt ${collection.receiptNumber}` : collection.referenceNumber ? `ref ${collection.referenceNumber}` : "no receipt/reference";
    const status = collection.refundable ? `, ${collection.refundStatus.replaceAll("_", " ")}` : "";
    return `${index + 1}. ${money(collection.amount)} - ${collectionLabel(collection.type, collection.description)}, ${payer}, ${collection.method.replaceAll("_", " ")}, ${reference}${status}, recorded by ${collection.createdBy.name}`;
  });

  return {
    answer: [
      `For ${dateString} (tenant local date), total recorded collection is ${money(grandTotal)}.`,
      `Homeowner payments: ${money(paymentTotal)} from ${payments.length} active payment record${payments.length === 1 ? "" : "s"}.`,
      `Other collections/bonds: ${money(otherCollectionTotal)} from ${collections.length} collection record${collections.length === 1 ? "" : "s"}.`,
      methodTotals.length ? `By payment method:\n${methodTotals.map(([method, total]) => `- ${method.replaceAll("_", " ")}: ${money(total)}`).join("\n")}` : "",
      typeTotals.length ? `By source/type:\n${typeTotals.map(([type, total]) => `- ${type}: ${money(total)}`).join("\n")}` : "",
      paymentLines.length ? `Recent homeowner payments:\n${paymentLines.join("\n")}` : "No active homeowner payments are recorded for today.",
      collectionLines.length ? `Recent other collections/bonds:\n${collectionLines.join("\n")}` : "No other collection/bond receipts are recorded for today.",
      "Open Finance Dashboard or Receipt Register to verify full operational details before making official financial decisions.",
    ].filter(Boolean).join("\n\n"),
    sources: [ADMIN_COLLECTIONS_SOURCE],
  };
}

function canReadTenantFinance(permissions: readonly string[]) {
  const permissionSet = new Set(permissions);
  return [
    Permission.BILLING_READ,
    Permission.BILLING_MANAGE,
    Permission.PAYMENTS_READ,
    Permission.PAYMENTS_MANAGE,
    Permission.COLLECTIONS_MANAGE,
    Permission.REPORTS_FINANCIAL,
  ].some((permission) => permissionSet.has(permission));
}

async function answerFinanceSummary(input: { tenantId: string; permissions: readonly string[] }) {
  if (!canReadTenantFinance(input.permissions)) {
    return {
      answer: "I cannot show tenant-wide finance details because your current role does not include finance/report permissions.",
      sources: [] as AssistantSource[],
    };
  }
  const { start: todayStart, end: todayEnd, dateString } = tenantDateRange();
  const now = new Date();
  const monthStartDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [openBills, overdueBills, todayPayments, todayCollections, monthPayments, monthCollections, monthExpenses] = await Promise.all([
    prisma.bill.aggregate({ where: { tenantId: input.tenantId, archivedAt: null, balance: { gt: 0 } }, _sum: { balance: true }, _count: { _all: true } }),
    prisma.bill.aggregate({ where: { tenantId: input.tenantId, archivedAt: null, balance: { gt: 0 }, dueDate: { lt: todayStart } }, _sum: { balance: true }, _count: { _all: true } }),
    prisma.payment.aggregate({ where: { tenantId: input.tenantId, status: "ACTIVE", paymentDate: { gte: todayStart, lt: todayEnd } }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.collection.aggregate({ where: { tenantId: input.tenantId, collectionDate: { gte: todayStart, lt: todayEnd } }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.payment.aggregate({ where: { tenantId: input.tenantId, status: "ACTIVE", paymentDate: { gte: monthStartDate } }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.collection.aggregate({ where: { tenantId: input.tenantId, collectionDate: { gte: monthStartDate } }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.expense.aggregate({ where: { tenantId: input.tenantId, expenseDate: { gte: monthStartDate } }, _sum: { amount: true }, _count: { _all: true } }),
  ]);
  const todayTotal = Number(todayPayments._sum.amount || 0) + Number(todayCollections._sum.amount || 0);
  const monthIncome = Number(monthPayments._sum.amount || 0) + Number(monthCollections._sum.amount || 0);
  const monthExpenseTotal = Number(monthExpenses._sum.amount || 0);
  return {
    answer: [
      `Finance summary as of ${dateString} (tenant local date):`,
      `Open receivables: ${money(Number(openBills._sum.balance || 0))} across ${openBills._count._all} bill${openBills._count._all === 1 ? "" : "s"}.`,
      `Overdue receivables: ${money(Number(overdueBills._sum.balance || 0))} across ${overdueBills._count._all} overdue bill${overdueBills._count._all === 1 ? "" : "s"}.`,
      `Today's collections: ${money(todayTotal)} (${todayPayments._count._all} homeowner payment${todayPayments._count._all === 1 ? "" : "s"} and ${todayCollections._count._all} other collection/bond record${todayCollections._count._all === 1 ? "" : "s"}).`,
      `Month-to-date income: ${money(monthIncome)} from payments and other collections.`,
      `Month-to-date expenses: ${money(monthExpenseTotal)} across ${monthExpenses._count._all} expense record${monthExpenses._count._all === 1 ? "" : "s"}.`,
      `Net month-to-date movement: ${money(monthIncome - monthExpenseTotal)}.`,
      "Use Finance Dashboard, Billing, Payment History, Receipt Register, and Expenses to verify details before official reporting or board decisions.",
    ].join("\n\n"),
    sources: [ADMIN_COLLECTIONS_SOURCE],
  };
}

async function answerHomeownerDirectory(input: { tenantId: string; permissions: readonly string[]; question: string }) {
  const permissionSet = new Set(input.permissions);
  const canReadHomeowners = [Permission.HOMEOWNERS_READ, Permission.HOMEOWNERS_MANAGE].some((permission) => permissionSet.has(permission));
  if (!canReadHomeowners) {
    return {
      answer: "I cannot show the homeowner directory because your current role does not include homeowner read/manage permissions.",
      sources: [] as AssistantSource[],
    };
  }

  const block = blockFilterFromQuestion(input.question);
  const status = homeownerStatusFilterFromQuestion(input.question);
  const where: Prisma.HomeownerProfileWhereInput = {
    tenantId: input.tenantId,
    ...(block ? { block: { equals: block } } : {}),
    ...(status ? { status } : {}),
  };
  const [homeowners, total, activeCount] = await Promise.all([
    prisma.homeownerProfile.findMany({
      where,
      orderBy: [{ block: "asc" }, { lot: "asc" }, { user: { name: "asc" } }],
      take: 25,
      select: {
        accountNumber: true,
        block: true,
        lot: true,
        address: true,
        phone: true,
        status: true,
        monthlyDuesAmount: true,
        user: { select: { name: true, email: true, active: true } },
      },
    }),
    prisma.homeownerProfile.count({ where }),
    prisma.homeownerProfile.count({ where: { tenantId: input.tenantId, ...(block ? { block: { equals: block } } : {}), status: "ACTIVE" } }),
  ]);
  const scope = `${status ? `${status.toLowerCase()} ` : ""}homeowner${total === 1 ? "" : "s"}${block ? ` in Block ${block}` : ""}`;
  if (!homeowners.length) {
    return {
      answer: `I did not find ${scope || "matching homeowners"} in this tenant's homeowner directory.`,
      sources: [ADMIN_HOMEOWNERS_SOURCE],
    };
  }
  const lines = homeowners.map((profile, index) => {
    const account = homeownerAccountNumber(profile);
    return `${index + 1}. ${profile.user.name} - ${account}, Block ${profile.block}, Lot ${profile.lot}, ${profile.status}, dues ${money(profile.monthlyDuesAmount)}, ${profile.address}, ${profile.phone || profile.user.email || "no contact on file"}`;
  });
  return {
    answer: [
      `I found ${total} ${scope || "matching homeowner records"}${block ? `; ${activeCount} are active in Block ${block}` : ""}.`,
      `Showing first ${homeowners.length} record${homeowners.length === 1 ? "" : "s"}:\n${lines.join("\n")}`,
      total > homeowners.length ? `There are ${total - homeowners.length} more matching records. Open Homeowners and filter${block ? ` Block ${block}` : ""} to view the full list.` : "Open Homeowners for edit history, documents, balances, and full administrative actions.",
    ].join("\n\n"),
    sources: [ADMIN_HOMEOWNERS_SOURCE],
  };
}

async function answerDraftResolution(input: { question: string }) {
  const subject = draftSubjectFromQuestion(input.question);
  const today = tenantLocalDateString();
  return {
    answer: [
      "Draft only - for board/authorized officer review before adoption:",
      `BOARD RESOLUTION NO. [____], SERIES OF ${today.slice(0, 4)}`,
      `A RESOLUTION REGARDING ${subject.toUpperCase()}`,
      "WHEREAS, the Association is responsible for administering community affairs in accordance with its bylaws, applicable policies, board authority, and approved tenant records;",
      `WHEREAS, the matter concerning ${subject} has been presented for review and action by the Board of Directors;`,
      "WHEREAS, the Board has considered the operational, financial, resident-service, compliance, and implementation effects of the proposed action;",
      `NOW, THEREFORE, BE IT RESOLVED, as it is hereby resolved, that the Association approves in principle the action concerning ${subject}, subject to final review of supporting documents, budget availability where applicable, implementation assignments, resident notice requirements, and any legal or governance review required by the Association.`,
      "RESOLVED FURTHER, that the authorized officers and/or assigned committee are directed to prepare the necessary implementation steps, notices, records, and monitoring report for the Board.",
      "RESOLVED FINALLY, that this resolution shall take effect upon approval and signing by the authorized officers, unless a later effective date is stated in the final adopted version.",
      "Prepared by: [Name / Position]",
      "Reviewed by: [Secretary / Legal / Committee, if applicable]",
      "Approved by: [Board / President / Authorized Signatories]",
      "Note: verify source policies, bylaws, quorum, voting, fiscal authority, and signatory rules before using this as an official resolution.",
    ].join("\n\n"),
    sources: [STAFF_DRAFT_SOURCE],
  };
}

async function answerDirectStaffQuestion(input: { kind: StaffQuestionKind; tenantId: string; permissions: readonly string[]; question: string; actorName?: string | null }) {
  if (input.kind === "STAFF_SCOPE") {
    return {
      answer: `${timeAwareGreeting(input.actorName)}. I can help authorized staff and admins search tenant-approved knowledge, summarize tenant records they are permitted to manage, draft non-final content, explain workflows, and prepare reports. I cannot approve, reject, post payments, reveal restricted data, or take consequential actions without the normal HOAHub permissions, validation, confirmation, and audit.`,
      sources: [] as AssistantSource[],
    };
  }
  if (input.kind === "STAFF_JOKE") {
    return {
      answer: "Sure. Why did the finance report arrive early? Because it wanted to be outstanding before the receivables were. I can switch back to collections, residents, documents, or draft work whenever you are ready.",
      sources: [] as AssistantSource[],
    };
  }
  if (input.kind === "TODAY_COLLECTION_TOTAL") return answerTodayCollectionTotal({ tenantId: input.tenantId, permissions: input.permissions });
  if (input.kind === "FINANCE_SUMMARY") return answerFinanceSummary({ tenantId: input.tenantId, permissions: input.permissions });
  if (input.kind === "HOMEOWNER_DIRECTORY") return answerHomeownerDirectory({ tenantId: input.tenantId, permissions: input.permissions, question: input.question });
  if (input.kind === "DRAFT_RESOLUTION") return answerDraftResolution({ question: input.question });
  return null;
}

async function answerDirectResidentQuestion(input: { kind: DirectQuestionKind; tenantId: string; actorId: string; homeownerProfileId?: string | null; question: string; actorName?: string | null }) {
  if (input.kind === "GREETING") {
    return {
      answer: `${timeAwareGreeting(input.actorName)}. I am HOAHub Association Assistant. How can I help you today? ${ASSISTANT_SCOPE_RESPONSE}`,
      sources: [] as AssistantSource[],
    };
  }
  if (input.kind === "THANKS") {
    return {
      answer: "You're welcome. I can keep helping with your balance, profile, document requests, available policies, or approved association knowledge.",
      sources: [] as AssistantSource[],
    };
  }
  if (input.kind === "JOKE") {
    return {
      answer: "Sure. Why did the HOA document go to the meeting? Because it wanted to be properly approved before making any statements. I can also help with your account, requests, announcements, events, or approved policies.",
      sources: [] as AssistantSource[],
    };
  }
  if (input.kind === "IDENTITY") {
    return {
      answer: `I am HOAHub Association Assistant, the resident AI for your signed-in HOA account. ${ASSISTANT_SCOPE_RESPONSE}`,
      sources: [] as AssistantSource[],
    };
  }
  if (input.kind === "SCOPE") {
    return {
      answer: ASSISTANT_SCOPE_RESPONSE,
      sources: [] as AssistantSource[],
    };
  }
  if (input.kind === "OTHER_HOMEOWNER_PRIVATE") {
    return {
      answer: "I cannot access or reveal another homeowner's balance, account number, contact details, or private profile. I can only answer from your signed-in account and resident-visible approved knowledge.",
      sources: [] as AssistantSource[],
    };
  }
  if (input.kind === "ACCOUNT_NUMBER") return answerProfileQuestion({ tenantId: input.tenantId, homeownerProfileId: input.homeownerProfileId, includeAccountNumber: true });
  if (input.kind === "BILLING_SUMMARY") return answerBillingSummary({ tenantId: input.tenantId, homeownerProfileId: input.homeownerProfileId });
  if (input.kind === "PAYMENT_HISTORY") return answerPaymentHistory({ tenantId: input.tenantId, homeownerProfileId: input.homeownerProfileId });
  if (input.kind === "COLLECTION_BOND_REFUND") return answerCollectionBondRefund({ tenantId: input.tenantId, homeownerProfileId: input.homeownerProfileId });
  if (input.kind === "REQUEST_STATUS") return answerRequestStatus({ tenantId: input.tenantId, homeownerProfileId: input.homeownerProfileId, actorId: input.actorId });
  if (input.kind === "CREATE_COMPLAINT_GUIDANCE") return answerComplaintCreationGuidance({ tenantId: input.tenantId });
  if (input.kind === "ANNOUNCEMENTS") return answerAnnouncements({ tenantId: input.tenantId });
  if (input.kind === "EVENTS") return answerEvents({ tenantId: input.tenantId });
  if (input.kind === "ORGANIZATION_OFFICER") return answerOrganizationQuestion({ tenantId: input.tenantId, question: input.question });
  if (input.kind === "MY_PROFILE") return answerProfileQuestion({ tenantId: input.tenantId, homeownerProfileId: input.homeownerProfileId });
  if (input.kind === "AVAILABLE_POLICIES") return answerAvailablePolicies({ tenantId: input.tenantId });
  if (input.kind === "AVAILABLE_DOCUMENTS") return answerAvailableDocuments({ tenantId: input.tenantId });
  if (input.kind === "DOCUMENT_REQUIREMENTS") return answerDocumentRequirements({ tenantId: input.tenantId, question: input.question });

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
  const staffKind = input.experience === "STAFF" ? staffQuestionKind(question) : null;
  if (staffKind) {
    const direct = await answerDirectStaffQuestion({ kind: staffKind, tenantId, permissions: access.user.permissions, question, actorName: access.user.name });
    if (direct) {
      await recordAssistantAnswer({ tenantId, actorId, conversationId: conversation.id, requestId, answer: direct.answer, sources: direct.sources, started, action: `AI_STAFF_${staffKind}` });
      return { conversationId: conversation.id, answer: direct.answer, sources: direct.sources, requestId };
    }
  }
  if (directKind) {
    const direct = await answerDirectResidentQuestion({ kind: directKind, tenantId, actorId, homeownerProfileId: access.user.homeownerProfile?.id, question, actorName: access.user.name });
    await recordAssistantAnswer({ tenantId, actorId, conversationId: conversation.id, requestId, answer: direct.answer, sources: direct.sources, started, action: `AI_DIRECT_${directKind}` });
    return { conversationId: conversation.id, answer: direct.answer, sources: direct.sources, requestId };
  }

  if (input.experience === "RESIDENT") {
    const publicDocumentAnswer = await answerFromRepositoryDocumentText({ tenantId, tenantSlug: access.user.tenant.slug, question, where: residentDocumentWhere(tenantId, new Date()) });
    if (publicDocumentAnswer) {
      await recordAssistantAnswer({ tenantId, actorId, conversationId: conversation.id, requestId, answer: publicDocumentAnswer.answer, sources: publicDocumentAnswer.sources, started, action: "AI_PUBLIC_DOCUMENT_ANSWER" });
      return { conversationId: conversation.id, answer: publicDocumentAnswer.answer, sources: publicDocumentAnswer.sources, requestId };
    }
  }

  if (input.experience === "STAFF") {
    const staffDocumentAnswer = await answerFromRepositoryDocumentText({ tenantId, tenantSlug: access.user.tenant.slug, question, where: staffDocumentWhere(tenantId, new Date()) });
    if (staffDocumentAnswer) {
      await recordAssistantAnswer({ tenantId, actorId, conversationId: conversation.id, requestId, answer: staffDocumentAnswer.answer, sources: staffDocumentAnswer.sources, started, action: "AI_STAFF_DOCUMENT_ANSWER" });
      return { conversationId: conversation.id, answer: staffDocumentAnswer.answer, sources: staffDocumentAnswer.sources, requestId };
    }
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
