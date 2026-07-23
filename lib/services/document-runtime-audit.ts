import "server-only";

import type { Prisma } from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import type { DocumentExecutionContext } from "@/lib/services/document-runtime-context";

type AuditClient = Pick<Prisma.TransactionClient, "auditLog"> | typeof platformPrisma;

export async function writeDocumentAudit(input: {
  context: DocumentExecutionContext;
  action: string;
  entityType: string;
  entityId?: string | null;
  reason?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
  client?: AuditClient;
}) {
  const client = input.client || platformPrisma;
  const metadata = isRecord(input.metadata) ? redact(input.metadata) as Record<string, unknown> : {};
  return client.auditLog.create({ data: {
    tenantId: input.context.tenantId,
    actorId: input.context.authenticatedUserId,
    module: "DOCUMENTS",
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    reason: input.reason ?? null,
    correlationId: input.context.correlationId ?? null,
    aiAction: false,
    metadata: toJson({ before: redact(input.before), after: redact(input.after), ...metadata }),
  } });
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
    if (/token|password|secret|credential|hash/i.test(key)) return [key, "[REDACTED]"];
    return [key, redact(entry)];
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
