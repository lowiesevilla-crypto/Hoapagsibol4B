import "server-only";

import type { DocumentGenerationMode } from "@prisma/client";
import {
  normalizeTemplateDefinition,
  type DocumentTemplateBlock,
  type DocumentTemplateDefinition,
} from "@/lib/services/document-template-builder";
import {
  resolveDocumentPlaceholders,
  type PlaceholderDefinition,
  type PlaceholderResolutionContext,
} from "@/lib/services/document-placeholders";

export type DocumentRenderBlock = Omit<DocumentTemplateBlock, "content" | "text" | "table"> & {
  content: string;
  table?: { rows: string[][] };
};

export type DocumentRenderModel = {
  schemaVersion: 1;
  rendererVersion: string;
  mode: DocumentGenerationMode;
  preview: boolean;
  metadata: {
    title: string;
    documentNumber: string;
    issueDate: string;
    validUntil: string | null;
    verificationUrl: string | null;
    locale: string;
  };
  page: DocumentTemplateDefinition["page"];
  sections: Record<"header" | "body" | "footer", DocumentRenderBlock[]>;
  unresolvedPlaceholders: string[];
  unauthorizedPlaceholders: string[];
  resolvedValues: Record<string, string>;
  warnings: string[];
};

export function buildDocumentRenderModel(input: {
  templateDefinition: unknown;
  title: string;
  documentNumber: string;
  issueDate: string;
  validUntil?: string | null;
  verificationUrl?: string | null;
  mode: DocumentGenerationMode;
  placeholderContext: PlaceholderResolutionContext;
  placeholderDefinitions: readonly PlaceholderDefinition[];
}): DocumentRenderModel {
  const template = normalizeTemplateDefinition(input.templateDefinition, input.title);
  const unresolved = new Set<string>();
  const unauthorized = new Set<string>();
  const warnings = new Set<string>();
  const resolvedValues: Record<string, string> = {};
  const resolveText = (value: string) => {
    const result = resolveDocumentPlaceholders(value, input.placeholderContext, input.mode === "PREVIEW" ? "PREVIEW" : "GENERATE", input.placeholderDefinitions);
    result.unresolvedPlaceholders.forEach((item) => unresolved.add(item));
    result.unauthorizedPlaceholders.forEach((item) => unauthorized.add(item));
    result.warnings.forEach((item) => warnings.add(item));
    Object.assign(resolvedValues, result.resolvedValues);
    return result.resolvedContent;
  };
  const section = (name: "header" | "body" | "footer") => template.sections[name].map((block) => ({
    ...block,
    content: resolveText(block.content ?? block.text ?? (block.binding ? `{{${block.binding}}}` : block.label ?? "")),
    table: block.table ? { rows: block.table.rows.map((row) => row.map(resolveText)) } : undefined,
  }));
  const page = input.mode === "PREVIEW"
    ? { ...template.page, watermark: { enabled: true, text: "PREVIEW - NOT AN OFFICIAL DOCUMENT", opacity: 0.12 } }
    : template.page;
  return {
    schemaVersion: 1,
    rendererVersion: "1.0.0",
    mode: input.mode,
    preview: input.mode === "PREVIEW",
    metadata: { title: input.title, documentNumber: input.documentNumber, issueDate: input.issueDate, validUntil: input.validUntil ?? null, verificationUrl: input.verificationUrl ?? null, locale: "en-PH" },
    page,
    sections: { header: section("header"), body: section("body"), footer: section("footer") },
    unresolvedPlaceholders: [...unresolved],
    unauthorizedPlaceholders: [...unauthorized],
    resolvedValues,
    warnings: [...warnings],
  };
}
