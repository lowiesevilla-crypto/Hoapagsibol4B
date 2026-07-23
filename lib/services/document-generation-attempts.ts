import "server-only";

import { DocumentGenerationMode, DocumentGenerationState, Prisma } from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import { DocumentRuntimeError } from "@/lib/services/document-runtime-errors";
import type { DocumentExecutionContext } from "@/lib/services/document-runtime-context";

export async function claimDocumentGenerationAttempt(context: DocumentExecutionContext, input: { requestId: string; mode: DocumentGenerationMode; idempotencyKey: string; correlationId: string }) {
  const existing = await findAttempt(context, input);
  if (existing?.documentVersion && successfulState(existing.state)) return { attempt: existing, replay: true } as const;
  if (existing && inProgressStates.has(existing.state)) throw new DocumentRuntimeError("CONCURRENCY_CONFLICT", "A generation attempt with this idempotency key is already in progress.", { attemptId: existing.id, correlationId: existing.correlationId });
  if (existing) {
    const attempt = await platformPrisma.documentGenerationAttempt.update({ where: { id: existing.id }, data: { state: DocumentGenerationState.VALIDATING, attemptNumber: { increment: 1 }, startedAt: new Date(), completedAt: null, failureCode: null, failureMessage: null, correlationId: input.correlationId, actorId: context.authenticatedUserId } , include: { documentVersion: true } });
    return { attempt, replay: false } as const;
  }
  try {
    const attempt = await platformPrisma.documentGenerationAttempt.create({ data: { tenantId: context.tenantId, requestId: input.requestId, mode: input.mode, state: DocumentGenerationState.VALIDATING, idempotencyKey: input.idempotencyKey, correlationId: input.correlationId, actorId: context.authenticatedUserId, startedAt: new Date() }, include: { documentVersion: true } });
    return { attempt, replay: false } as const;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const concurrent = await findAttempt(context, input);
      if (concurrent?.documentVersion && successfulState(concurrent.state)) return { attempt: concurrent, replay: true } as const;
      throw new DocumentRuntimeError("CONCURRENCY_CONFLICT", "A concurrent generation attempt already claimed this idempotency key.", { correlationId: concurrent?.correlationId ?? null });
    }
    throw error;
  }
}

export async function updateDocumentGenerationAttempt(context: DocumentExecutionContext, attemptId: string, data: Prisma.DocumentGenerationAttemptUpdateInput, client: typeof platformPrisma | Prisma.TransactionClient = platformPrisma) {
  const attempt = await client.documentGenerationAttempt.findFirst({ where: { tenantId: context.tenantId, id: attemptId }, select: { id: true } });
  if (!attempt) throw new DocumentRuntimeError("NOT_FOUND", "Document generation attempt was not found for the authenticated tenant.");
  return client.documentGenerationAttempt.update({ where: { id: attempt.id }, data });
}

async function findAttempt(context: DocumentExecutionContext, input: { requestId: string; mode: DocumentGenerationMode; idempotencyKey: string }) {
  return platformPrisma.documentGenerationAttempt.findFirst({ where: { tenantId: context.tenantId, requestId: input.requestId, mode: input.mode, idempotencyKey: input.idempotencyKey }, include: { documentVersion: true } });
}

function successfulState(state: DocumentGenerationState) {
  return successfulStates.has(state);
}

const inProgressStates = new Set<DocumentGenerationState>([
  DocumentGenerationState.VALIDATING,
  DocumentGenerationState.READY,
  DocumentGenerationState.RENDERING,
  DocumentGenerationState.GENERATED,
]);

const successfulStates = new Set<DocumentGenerationState>([
  DocumentGenerationState.ISSUED,
  DocumentGenerationState.RELEASE_PENDING,
  DocumentGenerationState.RELEASED,
  DocumentGenerationState.REISSUED,
]);
