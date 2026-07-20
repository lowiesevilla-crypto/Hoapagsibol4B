import "server-only";

import type { DocumentGenerationMode } from "@prisma/client";
import {
  defaultOfficerListConfig,
  normalizeTemplateDefinition,
  type DocumentTemplateBlock,
  type DocumentTemplateDefinition,
  type DocumentRichText,
} from "@/lib/services/document-template-builder";
import {
  resolveDocumentPlaceholders,
  type PlaceholderDefinition,
  type PlaceholderMode,
  type PlaceholderResolutionContext,
} from "@/lib/services/document-placeholders";

export type DocumentRenderBlock = Omit<DocumentTemplateBlock, "content" | "text" | "table"> & {
  content: string;
  table?: { rows: string[][] };
  richText?: DocumentRichText;
  officerListData?: {
    heading: string;
    term: string | null;
    termLabel: string;
    showHeading: boolean;
    showTerm: boolean;
    showSeparators: boolean;
    headingFontSize: number;
    termFontSize: number;
    nameFontSize: number;
    positionFontSize: number;
    lineHeight: number;
    officerSpacing: number;
    nameFontWeight: "normal" | "bold";
    positionFontWeight: "normal" | "bold";
    headingColor: string;
    termColor: string;
    nameColor: string;
    positionColor: string;
    officers: Array<{ id: string; fullName: string; position: string; displayOrder: number }>;
  };
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
  visualLayout: boolean;
  sections: Record<"header" | "body" | "footer", DocumentRenderBlock[]>;
  unresolvedPlaceholders: string[];
  unauthorizedPlaceholders: string[];
  resolvedValues: Record<string, string>;
  officerListSnapshot?: {
    sourceTenantId: string;
    term: string | null;
    officers: Array<{ id: string; fullName: string; position: string; displayOrder: number }>;
  } | null;
  officerListValidationErrors?: string[];
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
  placeholderMode?: PlaceholderMode;
  placeholderContext: PlaceholderResolutionContext;
  placeholderDefinitions: readonly PlaceholderDefinition[];
}): DocumentRenderModel {
  const template = normalizeTemplateDefinition(input.templateDefinition, input.title);
  const visualLayout = template.blocks.some((block) => Boolean(block.position));
  const unresolved = new Set<string>();
  const unauthorized = new Set<string>();
  const warnings = new Set<string>();
  const officerListValidationErrors = new Set<string>();
  const resolvedValues: Record<string, string> = {};
  let officerListSnapshot: DocumentRenderModel["officerListSnapshot"] = null;
  const placeholderMode = input.placeholderMode ?? (input.mode === "PREVIEW" ? "REQUEST_PREVIEW" : "GENERATE");
  const resolveText = (value: string) => {
    const result = resolveDocumentPlaceholders(value, input.placeholderContext, placeholderMode, input.placeholderDefinitions);
    return result;
  };
  const collect = (result: ReturnType<typeof resolveText>) => {
    result.unresolvedPlaceholders.forEach((item) => unresolved.add(item));
    result.unauthorizedPlaceholders.forEach((item) => unauthorized.add(item));
    result.warnings.forEach((item) => warnings.add(item));
    Object.assign(resolvedValues, result.resolvedValues);
  };
  const section = (name: "header" | "body" | "footer") => template.sections[name].map((block) => {
    if (block.type === "officerList") {
      const officerResult = resolveOfficerList(block.officerList || defaultOfficerListConfig, input.placeholderContext);
      officerResult.errors.forEach((item) => officerListValidationErrors.add(item));
      officerResult.warnings.forEach((item) => warnings.add(item));
      if (officerResult.snapshot) officerListSnapshot = officerResult.snapshot;
      const resolvedOfficerList = officerResult.snapshot ? {
        heading: block.officerList?.heading || defaultOfficerListConfig.heading,
        term: officerResult.snapshot.term,
        termLabel: block.officerList?.termLabel || defaultOfficerListConfig.termLabel,
        showHeading: block.officerList?.showHeading !== false,
        showTerm: block.officerList?.showTerm !== false,
        showSeparators: block.officerList?.showSeparators !== false,
        headingFontSize: block.officerList?.headingFontSize || defaultOfficerListConfig.headingFontSize,
        termFontSize: block.officerList?.termFontSize || defaultOfficerListConfig.termFontSize,
        nameFontSize: block.officerList?.nameFontSize || defaultOfficerListConfig.nameFontSize,
        positionFontSize: block.officerList?.positionFontSize || defaultOfficerListConfig.positionFontSize,
        lineHeight: block.officerList?.lineHeight || defaultOfficerListConfig.lineHeight,
        officerSpacing: block.officerList?.officerSpacing ?? defaultOfficerListConfig.officerSpacing,
        nameFontWeight: block.officerList?.nameFontWeight || defaultOfficerListConfig.nameFontWeight,
        positionFontWeight: block.officerList?.positionFontWeight || defaultOfficerListConfig.positionFontWeight,
        headingColor: block.officerList?.headingColor || defaultOfficerListConfig.headingColor,
        termColor: block.officerList?.termColor || defaultOfficerListConfig.termColor,
        nameColor: block.officerList?.nameColor || defaultOfficerListConfig.nameColor,
        positionColor: block.officerList?.positionColor || defaultOfficerListConfig.positionColor,
        officers: officerResult.snapshot.officers,
      } : undefined;
      return {
        ...block,
        visible: block.visible && Boolean(resolvedOfficerList),
        content: resolvedOfficerList ? officerListText(resolvedOfficerList) : "",
        officerListData: resolvedOfficerList,
      };
    }
    const richTextResult = block.richText ? resolveRichText(block.richText, resolveText, collect) : null;
    const result = richTextResult ? { resolvedContent: richTextResult.text, unresolvedPlaceholders: richTextResult.unresolved, unauthorizedPlaceholders: richTextResult.unauthorized, warnings: richTextResult.warnings, validationErrors: [], resolvedValues: richTextResult.resolvedValues } : resolveText(block.content ?? block.text ?? (block.binding ? `{{${block.binding}}}` : ""));
    const omit = block.required === false && (result.unresolvedPlaceholders.length > 0 || result.unauthorizedPlaceholders.length > 0);
    if (!omit) collect(result);
    const table = block.table ? { rows: block.table.rows.map((row) => row.map((cell) => { const cellResult = resolveText(cell); collect(cellResult); return cellResult.resolvedContent; })) } : undefined;
    const imageSource = resolveImageSource(block, input.placeholderContext);
    return { ...block, image: imageSource ? { ...block.image, src: imageSource } : block.image, visible: block.visible && !omit, content: omit ? "" : result.resolvedContent, richText: richTextResult?.richText, table };
  });
  const page = input.mode === "PREVIEW"
    ? { ...template.page, watermark: { ...template.page.watermark, enabled: true, text: "PREVIEW - NOT AN OFFICIAL DOCUMENT", opacity: 0.12 } }
    : template.page;
  return {
    schemaVersion: 1,
    rendererVersion: "1.0.0",
    mode: input.mode,
    preview: input.mode === "PREVIEW",
    metadata: { title: input.title, documentNumber: input.documentNumber, issueDate: input.issueDate, validUntil: input.validUntil ?? null, verificationUrl: input.verificationUrl ?? null, locale: "en-PH" },
    page,
    visualLayout,
    sections: { header: section("header"), body: section("body"), footer: section("footer") },
    unresolvedPlaceholders: [...unresolved],
    unauthorizedPlaceholders: [...unauthorized],
    resolvedValues,
    officerListSnapshot,
    officerListValidationErrors: [...officerListValidationErrors],
    warnings: [...warnings],
  };
}

function resolveRichText(richText: DocumentRichText, resolveText: (value: string) => ReturnType<typeof resolveDocumentPlaceholders>, collect: (result: ReturnType<typeof resolveDocumentPlaceholders>) => void) {
  const unresolved = new Set<string>();
  const unauthorized = new Set<string>();
  const warnings = new Set<string>();
  const resolvedValues: Record<string, string> = {};
  const children = richText.children.map((node) => {
    const source = node.type === "placeholder" ? `{{${node.key}}}` : node.text;
    const result = resolveText(source);
    collect(result);
    result.unresolvedPlaceholders.forEach((item) => unresolved.add(item));
    result.unauthorizedPlaceholders.forEach((item) => unauthorized.add(item));
    result.warnings.forEach((item) => warnings.add(item));
    Object.assign(resolvedValues, result.resolvedValues);
    return { ...node, resolvedText: result.resolvedContent };
  });
  return { richText: { type: "paragraph" as const, children }, text: children.map((node) => node.resolvedText || (node.type === "placeholder" ? `{{${node.key}}}` : node.text)).join(""), unresolved: [...unresolved], unauthorized: [...unauthorized], warnings: [...warnings], resolvedValues };
}

function resolveImageSource(block: DocumentTemplateBlock, context: PlaceholderResolutionContext) {
  const source = block.image?.src || block.content || (block.type === "logo" && block.binding ? `{{${block.binding}}}` : "");
  if (source === "{{tenant.logo}}" || (!block.image?.src && (block.binding === "tenant.logo" || block.type === "logo"))) return context.tenant?.logo || undefined;
  return block.image?.src;
}

function resolveOfficerList(config: NonNullable<DocumentTemplateBlock["officerList"]>, context: PlaceholderResolutionContext) {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (config.source !== "TENANT_ORGANIZATION_OFFICERS") errors.push("Officer list source is not trusted for this tenant.");
  if (config.termMode !== "CURRENT") errors.push("Officer list must use the current organization term.");
  const organization = context.organization;
  if (!organization || !context.tenantId || organization.tenantId !== context.tenantId) {
    errors.push("Officer list source does not belong to the authenticated tenant.");
    return { snapshot: null, errors, warnings };
  }
  const roles = config.roleFilters.map((role) => role.trim().toLowerCase()).filter(Boolean);
  const invalidRoles = roles.filter((role) => !organization.officers.some((officer) => officer.position.trim().toLowerCase() === role));
  if (invalidRoles.length) errors.push("Officer list role filter does not match an active tenant officer position.");
  const filtered = organization.officers.filter((officer) => !roles.length || roles.includes(officer.position.trim().toLowerCase()));
  if (!filtered.length) {
    errors.push("Officer list has no available active tenant officers.");
    return { snapshot: null, errors, warnings };
  }
  const sorted = [...filtered].sort((left, right) => {
    const compare = config.sortBy === "displayOrder" ? left.displayOrder - right.displayOrder : config.sortBy === "position" ? left.position.localeCompare(right.position) : left.fullName.localeCompare(right.fullName);
    return config.sortDirection === "desc" ? compare * -1 : compare;
  }).slice(0, config.maxOfficers);
  if (sorted.length < filtered.length) warnings.push(`Officer list is limited to ${config.maxOfficers} active officers.`);
  const snapshot = { sourceTenantId: organization.tenantId, term: organization.term ?? null, officers: sorted.map((officer) => ({ id: officer.id, fullName: officer.fullName, position: officer.position, displayOrder: officer.displayOrder })) };
  return { snapshot, errors, warnings };
}

function officerListText(list: NonNullable<DocumentRenderBlock["officerListData"]>) {
  const lines = [list.showHeading ? list.heading : "", list.showTerm && list.term ? `${list.termLabel ? `${list.termLabel} ` : ""}${list.term}` : "", ...list.officers.flatMap((officer) => [officer.fullName, officer.position])];
  return lines.filter(Boolean).join("\n");
}
