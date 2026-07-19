import "server-only";

import { DocumentPlaceholderOwnership } from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import { allowedDocumentPlaceholders, extractPlaceholders, placeholderGroups, sampleTemplateValue } from "@/lib/services/document-template-builder";
import { assertDocumentTenant, type DocumentExecutionContext } from "@/lib/services/document-runtime-context";

export type PlaceholderMode = "VALIDATE" | "PREVIEW" | "GENERATE";
export type PlaceholderDefinition = { key: string; category: string; displayName: string; description: string; dataType: string; sample: string; sensitivity: string | null; ownership: DocumentPlaceholderOwnership };
export type PlaceholderResolutionContext = {
  tenantId?: string;
  tenant?: { name?: string; address?: string; tin?: string; secRegistration?: string; contactNumber?: string; email?: string; logo?: string };
  document?: { number?: string; title?: string; issueDate?: string; issuePlace?: string; status?: string; validUntil?: string };
  subject?: { fullName?: string; relationship?: string; address?: string; birthDate?: string; civilStatus?: string; nationality?: string; status?: string; residencyStartDate?: string; age?: string | number; occupation?: string; contactNumber?: string; phase?: string; propertyType?: string; occupancyStatus?: string };
  property?: { block?: string; lot?: string; address?: string; accountLabel?: string; phase?: string; subdivision?: string };
  request?: { purpose?: string; remarks?: string; copies?: string | number; requestedAt?: string };
  signatory?: { name?: string; position?: string };
  verification?: { url?: string; code?: string };
  system?: { generatedAt?: string; platformName?: string };
  organization?: {
    tenantId: string;
    term?: string | null;
    officers: Array<{ id: string; fullName: string; position: string; displayOrder: number }>;
  };
  permissions?: ReadonlySet<string>;
  customResolvers?: Record<string, (context: PlaceholderResolutionContext) => unknown>;
};

export type PlaceholderResolutionResult = {
  resolvedContent: string;
  resolvedValues: Record<string, string>;
  unresolvedPlaceholders: string[];
  unauthorizedPlaceholders: string[];
  validationErrors: string[];
  warnings: string[];
};

const staticDefinitions: PlaceholderDefinition[] = placeholderGroups.flatMap((group) => group.items.map((item) => ({
  key: item.key,
  category: group.group,
  displayName: item.label,
  description: `Allowlisted ${item.label.toLowerCase()} document placeholder.`,
  dataType: "TEXT",
  sample: item.sample,
  sensitivity: ["subject.birthDate", "subject.address", "subject.civilStatus", "subject.nationality"].includes(item.key) ? "PERSONAL" : null,
  ownership: DocumentPlaceholderOwnership.PLATFORM,
})));

export async function listDocumentPlaceholders(context: DocumentExecutionContext, options: { search?: string; category?: string } = {}) {
  assertDocumentTenant(context, context.tenantId);
  const custom = await platformPrisma.documentPlaceholderDefinition.findMany({ where: { OR: [{ tenantId: null, ownership: DocumentPlaceholderOwnership.PLATFORM }, { tenantId: context.tenantId, ownership: DocumentPlaceholderOwnership.TENANT }], active: true, ...(options.category ? { category: options.category } : {}) }, orderBy: [{ category: "asc" }, { key: "asc" }] });
  const customKeys = new Set(custom.map((item) => item.key));
  const search = options.search?.trim().toLowerCase();
  const platform = staticDefinitions.filter((item) => !customKeys.has(item.key) && (!options.category || item.category.toLowerCase() === options.category.toLowerCase()) && (!search || `${item.key} ${item.displayName} ${item.description}`.toLowerCase().includes(search)));
  return [...platform, ...custom.map((item) => ({ key: item.key, category: item.category, displayName: item.displayName, description: item.description || "Tenant-defined placeholder.", dataType: item.dataType, sample: item.exampleValue || sampleTemplateValue(item.key), sensitivity: item.sensitivity, ownership: item.ownership }))];
}

export function validateDocumentPlaceholders(content: string, knownKeys: ReadonlySet<string> = new Set(allowedDocumentPlaceholders)) {
  const validationErrors: string[] = [];
  const malformed = content.match(/\{\{[^{}]*\}\}|\{\{[^{}]*$/g) || [];
  for (const expression of malformed) {
    const key = expression.match(/^\{\{\s*([A-Za-z0-9_.]+)\s*\}\}$/)?.[1];
    if (!key) validationErrors.push(`Malformed placeholder syntax: ${expression.slice(0, 100)}.`);
  }
  const keys = extractPlaceholders(content);
  const unknown = [...new Set(keys.filter((key) => !knownKeys.has(key)))];
  validationErrors.push(...unknown.map((key) => `Unknown placeholder: ${key}.`));
  return { valid: validationErrors.length === 0, placeholders: [...new Set(keys)], unknownPlaceholders: unknown, validationErrors };
}

export async function validateTemplatePlaceholdersForTenant(context: DocumentExecutionContext, content: string) {
  const definitions = await listDocumentPlaceholders(context);
  return validateDocumentPlaceholders(content, new Set(definitions.map((item) => item.key)));
}

export function resolveDocumentPlaceholders(content: string, context: PlaceholderResolutionContext, mode: PlaceholderMode = "GENERATE", definitions: readonly PlaceholderDefinition[] = staticDefinitions): PlaceholderResolutionResult {
  const known = new Set(definitions.map((item) => item.key));
  const validation = validateDocumentPlaceholders(content, known);
  const resolvedValues: Record<string, string> = {};
  const unresolvedPlaceholders: string[] = [];
  const unauthorizedPlaceholders: string[] = [];
  const warnings: string[] = [];
  const resolvedContent = content.replace(/\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g, (expression, key: string) => {
    if (!known.has(key)) { unresolvedPlaceholders.push(key); return expression; }
    const definition = definitions.find((item) => item.key === key);
    if (definition?.sensitivity && !context.permissions?.has(`DOCUMENT_PLACEHOLDER:${definition.sensitivity}`) && mode === "GENERATE") {
      unauthorizedPlaceholders.push(key);
      return expression;
    }
    const raw = mode === "PREVIEW" ? sampleTemplateValue(key) : readKnownValue(key, context);
    if (raw == null || raw === "") { unresolvedPlaceholders.push(key); return expression; }
    const value = String(raw);
    resolvedValues[key] = value;
    return value;
  });
  if (mode === "GENERATE" && unresolvedPlaceholders.length) warnings.push("Some placeholders could not be resolved and remain visible.");
  return { resolvedContent, resolvedValues, unresolvedPlaceholders: [...new Set(unresolvedPlaceholders)], unauthorizedPlaceholders: [...new Set(unauthorizedPlaceholders)], validationErrors: validation.validationErrors, warnings };
}

function readKnownValue(key: string, context: PlaceholderResolutionContext) {
  const [namespace, name] = key.split(".");
  const source = namespace === "tenant" ? context.tenant : namespace === "document" ? context.document : namespace === "subject" ? context.subject : namespace === "property" ? context.property : namespace === "request" ? context.request : namespace === "signatory" ? context.signatory : namespace === "verification" ? context.verification : namespace === "system" ? context.system : undefined;
  if (source && name in source) return (source as Record<string, unknown>)[name];
  const resolver = context.customResolvers?.[key];
  return resolver ? resolver(context) : undefined;
}
