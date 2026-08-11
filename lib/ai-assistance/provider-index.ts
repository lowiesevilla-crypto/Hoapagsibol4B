import "server-only";
import { createHash } from "node:crypto";
import type { Readable } from "node:stream";
import { requireAiAssistanceEntitlement } from "@/lib/ai-assistance/entitlement";
import { requireUser } from "@/lib/auth";
import { Permission } from "@/lib/authorization/permissions";
import { repositoryStorage } from "@/lib/document-repository/storage";
import { prisma } from "@/lib/db";

const INDEX_METADATA_VERSION = 2;

function providerKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("HOAHub AI provider credential is not configured.");
  return key;
}

function providerHeaders() {
  return { Authorization: `Bearer ${providerKey()}`, "Content-Type": "application/json" };
}

async function providerJson(path: string, init: RequestInit) {
  const response = await fetch(`https://api.openai.com/v1${path}`, { ...init, signal: AbortSignal.timeout(30_000) });
  const body = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    const error = body.error && typeof body.error === "object" ? body.error as Record<string, unknown> : {};
    throw new Error(typeof error.message === "string" ? `AI provider indexing error: ${error.message}` : `AI provider indexing error (${response.status}).`);
  }
  return body;
}

async function bytesFromStream(stream: Readable) {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function providerNamespaceName(tenantId: string) {
  return `HOAHub tenant ${createHash("sha256").update(tenantId).digest("hex").slice(0, 16)}`;
}

function hasKnowledgePermission(user: Awaited<ReturnType<typeof requireUser>>) {
  return new Set(user.permissions).has(Permission.AI_KNOWLEDGE_MANAGE);
}

async function requireKnowledgeManagerForIndex() {
  const user = await requireUser();
  if (!hasKnowledgePermission(user)) throw new Error("AI knowledge-management permission is required.");
  await requireAiAssistanceEntitlement(user.tenantId);
  const governance = await prisma.tenantAiConfiguration.findUnique({ where: { tenantId: user.tenantId } });
  if (!governance?.boardApprovedAt || !governance.piaApprovedAt || !governance.dpoApprovedAt || !governance.providerApprovedAt || !governance.crossBorderReviewApprovedAt || !governance.privacyNoticePublishedAt || !governance.privacyNoticeVersion || !governance.lawfulBasis) {
    throw new Error("AI knowledge processing is blocked until the tenant governance, privacy, provider, and cross-border approvals are complete.");
  }
  return { user, governance };
}

async function requireKnowledgeManagerForCleanup() {
  const user = await requireUser();
  if (!hasKnowledgePermission(user)) throw new Error("AI knowledge-management permission is required.");
  return user;
}

async function ensureTenantProviderIndex(tenantId: string, actorId: string) {
  const existing = await prisma.tenantAiProviderIndex.findUnique({ where: { tenantId } });
  if (existing) {
    if (existing.status !== "ACTIVE") throw new Error("The tenant AI provider index is not active.");
    return existing;
  }
  const vectorStoreId = process.env.AI_PROVIDER_MODE === "mock"
    ? `vs_mock_${createHash("sha256").update(tenantId).digest("hex").slice(0, 20)}`
    : String((await providerJson("/vector_stores", { method: "POST", headers: providerHeaders(), body: JSON.stringify({ name: providerNamespaceName(tenantId) }) })).id || "");
  if (!vectorStoreId) throw new Error("AI provider did not return a tenant vector-store identifier.");
  try {
    return await prisma.tenantAiProviderIndex.create({ data: { tenantId, vectorStoreId, createdById: actorId } });
  } catch (error) {
    const concurrent = await prisma.tenantAiProviderIndex.findUnique({ where: { tenantId } });
    if (concurrent) return concurrent;
    throw error;
  }
}

async function uploadProviderFile(input: { bytes: Buffer; fileName: string; contentType: string }) {
  if (process.env.AI_PROVIDER_MODE === "mock") return "file_hoahub_ci_policy";
  const form = new FormData();
  const arrayBuffer = input.bytes.buffer.slice(input.bytes.byteOffset, input.bytes.byteOffset + input.bytes.byteLength) as ArrayBuffer;
  form.append("purpose", "user_data");
  form.append("file", new Blob([arrayBuffer], { type: input.contentType }), input.fileName);
  const response = await fetch("https://api.openai.com/v1/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${providerKey()}` },
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error("AI provider file upload failed.");
  if (typeof body.id !== "string") throw new Error("AI provider file upload returned no identifier.");
  return body.id;
}

function normalizeMetadataText(value: string | null | undefined) {
  return (value || "").trim().slice(0, 500);
}

function authorityPriority(title: string, category: string) {
  const text = `${title} ${category}`.toLowerCase();
  if (/magna carta|republic act|\blaw\b|ordinance/.test(text)) return 60;
  if (/bylaws|by-laws|master deed|declaration/.test(text)) return 55;
  if (/board resolution|resolution/.test(text)) return 45;
  if (/policy|policies/.test(text)) return 35;
  if (/house rules|\brules\b|regulation/.test(text)) return 30;
  if (/procedure|guideline|manual|memo/.test(text)) return 20;
  return 10;
}

type ProviderDocumentMetadata = {
  documentId: string;
  title: string;
  reference: string | null;
  category: string;
  issuingBody: string | null;
  revision: number;
  classification: string;
  audience: "RESIDENT" | "STAFF";
  effectiveAt: Date | null;
  approvalDate: Date | null;
};

function providerFileAttributes(input: ProviderDocumentMetadata) {
  return {
    audience: input.audience,
    revision: input.revision,
    privacy_classification: input.classification,
    document_id: input.documentId,
    document_title: normalizeMetadataText(input.title),
    document_reference: normalizeMetadataText(input.reference),
    category: normalizeMetadataText(input.category),
    issuing_body: normalizeMetadataText(input.issuingBody),
    effective_at: input.effectiveAt ? Math.floor(input.effectiveAt.getTime() / 1000) : 0,
    approval_at: input.approvalDate ? Math.floor(input.approvalDate.getTime() / 1000) : 0,
    authority_priority: authorityPriority(input.title, input.category),
    index_metadata_version: INDEX_METADATA_VERSION,
  };
}

async function attachProviderFile(input: { vectorStoreId: string; providerFileId: string; metadata: ProviderDocumentMetadata }) {
  if (process.env.AI_PROVIDER_MODE === "mock") return;
  const attached = await providerJson(`/vector_stores/${encodeURIComponent(input.vectorStoreId)}/files`, {
    method: "POST",
    headers: providerHeaders(),
    body: JSON.stringify({ file_id: input.providerFileId, attributes: providerFileAttributes(input.metadata) }),
  });
  if (attached.status === "completed") return;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const state = await providerJson(`/vector_stores/${encodeURIComponent(input.vectorStoreId)}/files/${encodeURIComponent(input.providerFileId)}`, { method: "GET", headers: providerHeaders() });
    if (state.status === "completed") return;
    if (state.status === "failed" || state.status === "cancelled") throw new Error("AI provider could not index the approved document.");
  }
  throw new Error("AI provider indexing did not complete within the HOAHub request window.");
}

async function updateProviderFileAttributes(input: { vectorStoreId: string; providerFileId: string; metadata: ProviderDocumentMetadata }) {
  if (process.env.AI_PROVIDER_MODE === "mock") return;
  await providerJson(`/vector_stores/${encodeURIComponent(input.vectorStoreId)}/files/${encodeURIComponent(input.providerFileId)}`, {
    method: "POST",
    headers: providerHeaders(),
    body: JSON.stringify({ attributes: providerFileAttributes(input.metadata) }),
  });
}

async function deleteProviderFile(providerFileId: string) {
  if (process.env.AI_PROVIDER_MODE === "mock") return;
  await providerJson(`/files/${encodeURIComponent(providerFileId)}`, { method: "DELETE", headers: providerHeaders() });
}

export async function indexRepositoryDocumentForAi(documentId: string) {
  const { user } = await requireKnowledgeManagerForIndex();
  const now = new Date();
  const document = await prisma.repositoryDocument.findFirst({
    where: { tenantId: user.tenantId, id: documentId },
    select: {
      id: true,
      tenantId: true,
      title: true,
      documentReference: true,
      visibility: true,
      status: true,
      aiEnabled: true,
      privacyClassification: true,
      malwareScanStatus: true,
      effectiveAt: true,
      expiresAt: true,
      approvalDate: true,
      issuingBody: true,
      currentRevision: true,
      originalFileName: true,
      storageKey: true,
      contentType: true,
      checksumSha256: true,
      category: { select: { name: true } },
    },
  });
  if (!document) throw new Error("Document not found in the active tenant.");
  if (!document.aiEnabled || document.status !== "PUBLISHED") throw new Error("Only published documents explicitly enabled for AI can be indexed.");
  if (["PERSONAL", "SENSITIVE", "RESTRICTED"].includes(document.privacyClassification)) throw new Error("Personal, sensitive, or restricted documents cannot enter the general AI knowledge index.");
  if (document.visibility === "RESTRICTED") throw new Error("Restricted documents cannot enter the general AI knowledge index.");
  if (["PENDING", "FAILED", "BLOCKED"].includes(document.malwareScanStatus)) throw new Error("Document malware status does not permit AI indexing.");
  if (document.effectiveAt && document.effectiveAt > now) throw new Error("A future-effective document cannot be indexed for active AI retrieval.");
  if (document.expiresAt && document.expiresAt <= now) throw new Error("An expired document cannot be indexed for active AI retrieval.");

  const audience: "RESIDENT" | "STAFF" = document.visibility === "TENANT_PUBLIC" && document.privacyClassification === "PUBLIC" ? "RESIDENT" : "STAFF";
  const metadata: ProviderDocumentMetadata = {
    documentId: document.id,
    title: document.title,
    reference: document.documentReference,
    category: document.category.name,
    issuingBody: document.issuingBody,
    revision: document.currentRevision,
    classification: document.privacyClassification,
    audience,
    effectiveAt: document.effectiveAt,
    approvalDate: document.approvalDate,
  };
  const namespace = await ensureTenantProviderIndex(user.tenantId, user.id);
  const existing = await prisma.aiKnowledgeBinding.findUnique({ where: { tenantId_documentId: { tenantId: user.tenantId, documentId } } });
  if (existing?.indexStatus === "INDEXED" && existing.indexedChecksumSha256 === document.checksumSha256 && existing.vectorStoreId === namespace.vectorStoreId) {
    if (existing.providerFileId) await updateProviderFileAttributes({ vectorStoreId: namespace.vectorStoreId, providerFileId: existing.providerFileId, metadata });
    return existing;
  }

  await prisma.aiKnowledgeBinding.upsert({
    where: { tenantId_documentId: { tenantId: user.tenantId, documentId } },
    update: { indexStatus: "PENDING", revision: document.currentRevision, lastError: null, updatedById: user.id },
    create: { tenantId: user.tenantId, documentId, revision: document.currentRevision, indexStatus: "PENDING", createdById: user.id, updatedById: user.id },
  });

  let providerFileId = "";
  try {
    const stream = await repositoryStorage.openReadStream({ tenantSlug: user.tenant.slug, storageKey: document.storageKey });
    providerFileId = await uploadProviderFile({ bytes: await bytesFromStream(stream), fileName: document.originalFileName, contentType: document.contentType });
    await attachProviderFile({ vectorStoreId: namespace.vectorStoreId, providerFileId, metadata });
    const binding = await prisma.aiKnowledgeBinding.update({
      where: { tenantId_documentId: { tenantId: user.tenantId, documentId } },
      data: { providerFileId, vectorStoreId: namespace.vectorStoreId, indexStatus: "INDEXED", indexedChecksumSha256: document.checksumSha256, indexedAt: new Date(), lastError: null, updatedById: user.id },
    });
    if (existing?.providerFileId && existing.providerFileId !== providerFileId) {
      await deleteProviderFile(existing.providerFileId).catch((error) => console.error("[ai-assistance] Old provider file cleanup requires retry.", { tenantId: user.tenantId, documentId, error }));
    }
    await prisma.auditLog.create({ data: { tenantId: user.tenantId, actorId: user.id, module: "AI_ASSISTANCE", action: "AI_KNOWLEDGE_INDEXED", entityType: "RepositoryDocument", entityId: document.id, metadata: { audience, revision: document.currentRevision, classification: document.privacyClassification, category: document.category.name, authorityPriority: authorityPriority(document.title, document.category.name), indexMetadataVersion: INDEX_METADATA_VERSION, vectorNamespaceTenantScoped: true } } });
    return binding;
  } catch (error) {
    if (providerFileId) await deleteProviderFile(providerFileId).catch(() => undefined);
    await prisma.aiKnowledgeBinding.update({ where: { tenantId_documentId: { tenantId: user.tenantId, documentId } }, data: { indexStatus: "FAILED", lastError: error instanceof Error ? error.message.slice(0, 1000) : "Indexing failed", updatedById: user.id } }).catch(() => undefined);
    throw error;
  }
}

export async function purgeAiKnowledgeBindingForTenant(input: { tenantId: string; documentId: string; actorId: string }) {
  const binding = await prisma.aiKnowledgeBinding.findUnique({ where: { tenantId_documentId: { tenantId: input.tenantId, documentId: input.documentId } } });
  if (!binding) return null;
  if (binding.providerFileId) await deleteProviderFile(binding.providerFileId);
  const purged = await prisma.aiKnowledgeBinding.update({
    where: { tenantId_documentId: { tenantId: input.tenantId, documentId: input.documentId } },
    data: { providerFileId: null, vectorStoreId: null, indexStatus: "PURGED", indexedChecksumSha256: null, indexedAt: null, lastError: null, updatedById: input.actorId },
  });
  await prisma.auditLog.create({ data: { tenantId: input.tenantId, actorId: input.actorId, module: "AI_ASSISTANCE", action: "AI_KNOWLEDGE_PURGED", entityType: "RepositoryDocument", entityId: input.documentId } });
  return purged;
}

export async function purgeRepositoryDocumentFromAi(documentId: string) {
  const user = await requireKnowledgeManagerForCleanup();
  return purgeAiKnowledgeBindingForTenant({ tenantId: user.tenantId, documentId, actorId: user.id });
}
