import "server-only";

import { DocumentSequenceScope, Prisma } from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import { allocateDefinitionDocumentNumber } from "@/lib/services/documents";
import { validateNumberingFormat } from "@/lib/services/document-numbering";
import { requireDocumentPermission, type DocumentExecutionContext } from "@/lib/services/document-runtime-context";
import { writeDocumentAudit } from "@/lib/services/document-runtime-audit";

export async function resolveDocumentNumberingConfiguration(context: DocumentExecutionContext, definitionId: string) {
  requireDocumentPermission(context, "MANAGE_NUMBERING");
  const definition = await platformPrisma.documentDefinition.findFirst({ where: { tenantId: context.tenantId, id: definitionId }, include: { numberingConfiguration: true } });
  if (!definition) throw new Error("Document definition was not found for the authenticated tenant.");
  const config = definition.numberingConfiguration;
  return config ?? { tenantId: context.tenantId, definitionId: definition.id, prefix: definition.code, yearFormat: "YYYY", sequenceLength: 6, resetRule: definition.sequenceScope, currentSequence: 0, lastResetAt: null, separator: "-", suffix: null, manualOverrideAllowed: false, version: definition.version };
}

export async function previewNextDocumentNumber(context: DocumentExecutionContext, definitionId: string, date = new Date()) {
  const definition = await getDefinition(context, definitionId);
  const config = await platformPrisma.documentNumberingConfiguration.findFirst({ where: { tenantId: context.tenantId, definitionId } });
  const sequenceScope = config?.resetRule ?? definition.sequenceScope;
  const year = sequenceScope === DocumentSequenceScope.ANNUAL ? date.getUTCFullYear() : 0;
  const counter = await platformPrisma.documentDefinitionCounter.findUnique({ where: { tenantId_definitionId_sequenceScope_year: { tenantId: context.tenantId, definitionId, sequenceScope, year } }, select: { lastNumber: true } });
  return formatNumber(config ? { prefix: config.prefix, separator: config.separator, suffix: config.suffix, yearFormat: config.yearFormat, sequenceLength: config.sequenceLength } : { prefix: definition.code, separator: "-", suffix: null, yearFormat: "YYYY", sequenceLength: definition.numberingFormat.includes("{SEQUENCE:4}") ? 4 : 6 }, (counter?.lastNumber ?? 0) + 1, date);
}

export async function allocateNextDocumentNumber(context: DocumentExecutionContext, definitionId: string, tx: Prisma.TransactionClient, date = new Date()) {
  requireDocumentPermission(context, "MANAGE_NUMBERING");
  return allocateDocumentNumber(context, definitionId, tx, date);
}

// Generation authorization is established by the orchestrator before this
// server-only adapter is called. It deliberately does not grant access to
// numbering configuration or manual overrides.
export async function allocateNextDocumentNumberForGeneration(context: DocumentExecutionContext, definitionId: string, tx: Prisma.TransactionClient, date = new Date()) {
  requireDocumentPermission(context, "VALIDATE_GENERATION");
  return allocateDocumentNumber(context, definitionId, tx, date);
}

async function allocateDocumentNumber(context: DocumentExecutionContext, definitionId: string, tx: Prisma.TransactionClient, date: Date) {
  const definition = await getDefinition(context, definitionId, tx);
  const config = await tx.documentNumberingConfiguration.findFirst({ where: { tenantId: context.tenantId, definitionId } });
  let number = "";
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    if (!config) {
      number = await allocateDefinitionDocumentNumber(tx, context.tenantId, definition, date);
    } else {
      const year = config.resetRule === DocumentSequenceScope.ANNUAL ? date.getUTCFullYear() : 0;
      const counter = await tx.documentDefinitionCounter.upsert({ where: { tenantId_definitionId_sequenceScope_year: { tenantId: context.tenantId, definitionId, sequenceScope: config.resetRule, year } }, create: { tenantId: context.tenantId, definitionId, sequenceScope: config.resetRule, year, lastNumber: 1 }, update: { lastNumber: { increment: 1 } }, select: { lastNumber: true } });
      number = formatNumber(config, counter.lastNumber, date);
      await tx.documentNumberingConfiguration.update({ where: { id: config.id }, data: { currentSequence: counter.lastNumber, lastResetAt: config.resetRule === DocumentSequenceScope.ANNUAL && config.lastResetAt?.getUTCFullYear() !== date.getUTCFullYear() ? date : config.lastResetAt, version: { increment: 1 } } });
    }
    const [requestConflict, versionConflict] = await Promise.all([
      tx.documentRequest.findFirst({ where: { tenantId: context.tenantId, documentNumber: number }, select: { id: true } }),
      tx.documentVersion.findFirst({ where: { tenantId: context.tenantId, documentNumber: number }, select: { id: true } }),
    ]);
    if (!requestConflict && !versionConflict) break;
    number = "";
  }
  if (!number) throw new Error("Unable to allocate an unused tenant document number after 1,000 attempts.");
  await writeDocumentAudit({ context, action: "ALLOCATE_DOCUMENT_NUMBER", entityType: "DocumentDefinition", entityId: definition.id, after: { documentNumber: number }, client: tx });
  return number;
}

export async function recordManualDocumentNumberOverride(context: DocumentExecutionContext, definitionId: string, documentNumber: string, reason: string) {
  requireDocumentPermission(context, "MANAGE_NUMBERING");
  if (!reason.trim()) throw new Error("A reason is required for a manual document number override.");
  const definition = await getDefinition(context, definitionId);
  const config = await platformPrisma.documentNumberingConfiguration.findFirst({ where: { tenantId: context.tenantId, definitionId } });
  if (!config?.manualOverrideAllowed) throw new Error("Manual document number overrides are not enabled for this definition.");
  await writeDocumentAudit({ context, action: "MANUAL_DOCUMENT_NUMBER_OVERRIDE", entityType: "DocumentDefinition", entityId: definition.id, reason, after: { documentNumber } });
  return documentNumber;
}

async function getDefinition(context: DocumentExecutionContext, definitionId: string, client: typeof platformPrisma | Prisma.TransactionClient = platformPrisma) {
  const definition = await client.documentDefinition.findFirst({ where: { tenantId: context.tenantId, id: definitionId }, select: { id: true, tenantId: true, code: true, numberingFormat: true, sequenceScope: true } });
  if (!definition) throw new Error("Document definition was not found for the authenticated tenant.");
  const validation = validateNumberingFormat(definition.numberingFormat);
  if (!validation.valid) throw new Error(`Numbering format is invalid: ${validation.errors.join(" ")}`);
  return definition;
}

function formatNumber(config: { prefix: string; separator?: string; suffix?: string | null; yearFormat?: string; sequenceLength?: number }, sequence: number, date: Date) {
  const year = date.getUTCFullYear();
  const yearValue = config.yearFormat === "YY" ? String(year).slice(-2) : String(year);
  const width = Math.min(12, Math.max(1, config.sequenceLength ?? 6));
  return `${config.prefix}${config.separator ?? "-"}${yearValue}${config.separator ?? "-"}${String(sequence).padStart(width, "0")}${config.suffix ? `${config.separator ?? "-"}${config.suffix}` : ""}`;
}
