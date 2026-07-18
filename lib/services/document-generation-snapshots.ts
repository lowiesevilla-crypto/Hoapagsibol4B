import type { Prisma } from "@prisma/client";

const secretKey = /password|secret|credential|token|hash|privateKey/i;
const governmentKey = /governmentId|nationalId|passport|taxId|sss|philhealth|pagibig/i;
const privateInternalKey = /internalNotes?|privateRemarks?|violationDetails?/i;

export function safeGenerationSnapshot(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(redact(value))) as Prisma.InputJsonValue;
}

export function publicIssuedDocumentProjection(input: { tenantName: string; documentType: string; documentNumber: string; status: string; issueDate: Date | null }) {
  return { issuingOrganization: input.tenantName, documentType: input.documentType, documentNumber: input.documentNumber, status: input.status, issueDate: input.issueDate };
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
    if (secretKey.test(key) || governmentKey.test(key) || privateInternalKey.test(key)) return [key, "[REDACTED]"];
    return [key, redact(entry)];
  }));
}
