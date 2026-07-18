import "server-only";

import type { DocumentGenerationState, Prisma } from "@prisma/client";
import { writeDocumentAudit } from "@/lib/services/document-runtime-audit";
import type { DocumentExecutionContext } from "@/lib/services/document-runtime-context";

export type DocumentGenerationEvent = "GENERATION_REQUESTED" | "VALIDATION_STARTED" | "VALIDATION_BLOCKED" | "RENDER_STARTED" | "RENDER_COMPLETED" | "NUMBER_ALLOCATED" | "VERIFICATION_CREATED" | "DOCUMENT_ISSUED" | "RELEASE_PENDING" | "DOCUMENT_RELEASED" | "GENERATION_FAILED" | "DOCUMENT_REISSUED";

export async function recordDocumentGenerationEvent(input: { context: DocumentExecutionContext; event: DocumentGenerationEvent; requestId: string; attemptId?: string | null; documentVersionId?: string | null; attemptNumber?: number; state?: DocumentGenerationState; metadata?: unknown; reason?: string; client?: Prisma.TransactionClient }) {
  return writeDocumentAudit({ context: input.context, action: input.event, entityType: input.documentVersionId ? "DocumentVersion" : "DocumentRequest", entityId: input.documentVersionId ?? input.requestId, reason: input.reason, metadata: { requestId: input.requestId, attemptId: input.attemptId ?? null, documentVersionId: input.documentVersionId ?? null, attemptNumber: input.attemptNumber ?? 1, state: input.state ?? null, ...(record(input.metadata)) }, client: input.client });
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
