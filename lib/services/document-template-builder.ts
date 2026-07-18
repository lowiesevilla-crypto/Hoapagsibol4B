export const documentTemplateSchemaVersion = 2;

export const allowedDocumentPlaceholders = [
  "tenant.name",
  "tenant.address",
  "tenant.tin",
  "tenant.secRegistration",
  "tenant.contactNumber",
  "tenant.email",
  "tenant.logo",
  "document.number",
  "document.title",
  "document.issueDate",
  "document.validUntil",
  "subject.fullName",
  "subject.relationship",
  "subject.address",
  "subject.birthDate",
  "subject.civilStatus",
  "subject.nationality",
  "property.block",
  "property.lot",
  "property.address",
  "property.accountLabel",
  "request.purpose",
  "request.remarks",
  "request.copies",
  "signatory.name",
  "signatory.position",
  "verification.url",
  "verification.code",
] as const;

export type AllowedDocumentPlaceholder = typeof allowedDocumentPlaceholders[number];

export const placeholderGroups: { group: string; items: { key: AllowedDocumentPlaceholder; label: string; sample: string }[] }[] = [
  { group: "Tenant", items: [
    { key: "tenant.name", label: "Tenant name", sample: "Test HOA" },
    { key: "tenant.address", label: "Tenant address", sample: "Sample HOA Address" },
    { key: "tenant.tin", label: "TIN", sample: "000-000-000" },
    { key: "tenant.secRegistration", label: "SEC registration", sample: "SEC-000000" },
    { key: "tenant.contactNumber", label: "Contact number", sample: "0917 000 0000" },
    { key: "tenant.email", label: "Email", sample: "admin@example.test" },
    { key: "tenant.logo", label: "Tenant logo", sample: "/uploads/logo.png" },
  ] },
  { group: "Document", items: [
    { key: "document.number", label: "Document number", sample: "COR-2026-000001" },
    { key: "document.title", label: "Document title", sample: "Certificate of Residency" },
    { key: "document.issueDate", label: "Issue date", sample: "July 18, 2026" },
    { key: "document.validUntil", label: "Valid until", sample: "July 18, 2027" },
  ] },
  { group: "Subject", items: [
    { key: "subject.fullName", label: "Full name", sample: "Juan Dela Cruz" },
    { key: "subject.relationship", label: "Relationship", sample: "Homeowner" },
    { key: "subject.address", label: "Address", sample: "Block 1 Lot 2" },
    { key: "subject.birthDate", label: "Date of birth", sample: "January 1, 1990" },
    { key: "subject.civilStatus", label: "Civil status", sample: "Married" },
    { key: "subject.nationality", label: "Nationality", sample: "Filipino" },
  ] },
  { group: "Property", items: [
    { key: "property.block", label: "Block", sample: "1" },
    { key: "property.lot", label: "Lot", sample: "2" },
    { key: "property.address", label: "Property address", sample: "Block 1 Lot 2, Test HOA" },
    { key: "property.accountLabel", label: "Account label", sample: "Block 1 Lot 2" },
  ] },
  { group: "Request", items: [
    { key: "request.purpose", label: "Purpose", sample: "For official purposes" },
    { key: "request.remarks", label: "Remarks", sample: "No remarks" },
    { key: "request.copies", label: "Number of copies", sample: "1" },
  ] },
  { group: "Signatory", items: [
    { key: "signatory.name", label: "Signatory name", sample: "Maria Santos" },
    { key: "signatory.position", label: "Position", sample: "HOA President" },
  ] },
  { group: "Verification", items: [
    { key: "verification.url", label: "Verification URL", sample: "https://example.test/verify/abc123" },
    { key: "verification.code", label: "Verification code", sample: "VERIFY123" },
  ] },
];

export const documentTemplateBlockTypes = [
  "logo",
  "tenantName",
  "address",
  "tin",
  "secRegistration",
  "documentTitle",
  "text",
  "bodyText",
  "textBox",
  "subjectInfo",
  "propertyInfo",
  "purpose",
  "remarks",
  "issueDate",
  "validityDate",
  "documentNumber",
  "signatory",
  "signature",
  "footer",
  "qrVerification",
  "watermark",
  "divider",
  "spacer",
  "table",
  "pageBreak",
  "horizontalLine",
  "verticalLine",
  "image",
] as const;

export type DocumentTemplateBlockType = typeof documentTemplateBlockTypes[number];
export type DocumentTemplateSectionName = "header" | "body" | "footer";
export type DocumentPageFormat = "A4" | "LETTER" | "LEGAL";
export type DocumentPageOrientation = "portrait" | "landscape";

export const safeFontFamilies = ["Arial", "Inter", "Times New Roman", "Georgia", "Calibri"] as const;
export type SafeFontFamily = typeof safeFontFamilies[number];

export type DocumentTemplateBlock = {
  id: string;
  type: DocumentTemplateBlockType;
  section: DocumentTemplateSectionName;
  label?: string;
  text?: string;
  content?: string;
  binding?: AllowedDocumentPlaceholder;
  order: number;
  visible: boolean;
  style?: {
    align?: "left" | "center" | "right" | "justify";
    fontFamily?: SafeFontFamily;
    fontSize?: number;
    fontWeight?: "normal" | "bold";
    italic?: boolean;
    underline?: boolean;
    strike?: boolean;
    superscript?: boolean;
    subscript?: boolean;
    textColor?: string;
    highlightColor?: string;
    backgroundColor?: string;
    border?: string;
    padding?: number;
    margin?: number;
    width?: number;
    height?: number;
    lineHeight?: number;
    paragraphSpacing?: number;
    indent?: number;
    listStyle?: "none" | "bullet" | "number";
  };
  image?: {
    src?: string;
    alt?: string;
    width?: number;
    height?: number;
  };
  table?: {
    rows: string[][];
  };
};

export type DocumentTemplateDefinition = {
  schemaVersion: typeof documentTemplateSchemaVersion;
  page: {
    format: DocumentPageFormat;
    orientation: DocumentPageOrientation;
    marginPreset: "normal" | "narrow" | "moderate" | "wide" | "custom";
    margins: { top: number; right: number; bottom: number; left: number };
    headerDistance: number;
    footerDistance: number;
    columns: { count: 1 | 2 | 3; gap: number };
    border: { enabled: boolean; style: "solid" | "dashed" | "dotted"; width: number; color: string };
    backgroundColor: string;
    watermark: { enabled: boolean; text: string; opacity: number };
  };
  sections: Record<DocumentTemplateSectionName, DocumentTemplateBlock[]>;
  blocks: DocumentTemplateBlock[];
  meta: {
    editor: "professional-document-editor";
    revisionNote?: string;
  };
};

const defaultPage: DocumentTemplateDefinition["page"] = {
  format: "A4",
  orientation: "portrait",
  marginPreset: "normal",
  margins: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
  headerDistance: 12,
  footerDistance: 12,
  columns: { count: 1, gap: 10 },
  border: { enabled: false, style: "solid", width: 1, color: "#111827" },
  backgroundColor: "#ffffff",
  watermark: { enabled: false, text: "", opacity: 0.08 },
};

export function validateTemplateDefinition(definition: DocumentTemplateDefinition) {
  const errors: string[] = [];
  if (definition.schemaVersion !== documentTemplateSchemaVersion) errors.push("Unsupported template schema version.");
  if (!["A4", "LETTER", "LEGAL"].includes(definition.page.format)) errors.push("Unsupported page size.");
  if (!["portrait", "landscape"].includes(definition.page.orientation)) errors.push("Unsupported page orientation.");
  for (const margin of Object.values(definition.page.margins)) {
    if (!Number.isFinite(margin) || margin < 5 || margin > 60) errors.push("Page margins must be between 5mm and 60mm.");
  }
  if (!isSafeColor(definition.page.backgroundColor)) errors.push("Page background color must be a safe hex value.");
  if (definition.page.border.enabled && !isSafeColor(definition.page.border.color)) errors.push("Page border color must be a safe hex value.");
  const blocks = flattenSections(definition.sections);
  if (!blocks.some((block) => block.visible && block.type !== "spacer" && block.type !== "divider")) errors.push("Template must contain at least one visible content block.");
  for (const block of blocks) {
    if (!documentTemplateBlockTypes.includes(block.type)) errors.push(`Unsupported block type: ${block.type}`);
    if (!["header", "body", "footer"].includes(block.section)) errors.push(`Unsupported section for block ${block.id}.`);
    if (block.binding && !allowedDocumentPlaceholders.includes(block.binding)) errors.push(`Unsupported placeholder: ${block.binding}`);
    const text = block.content ?? block.text ?? "";
    for (const placeholder of extractPlaceholders(text)) {
      if (!allowedDocumentPlaceholders.includes(placeholder as AllowedDocumentPlaceholder)) errors.push(`Unsupported placeholder: ${placeholder}`);
    }
    if (containsUnsafeTemplateContent(text)) errors.push(`Unsafe text content in block ${block.id}.`);
    if (block.style?.fontFamily && !safeFontFamilies.includes(block.style.fontFamily)) errors.push(`Unsupported font in block ${block.id}.`);
    for (const color of [block.style?.textColor, block.style?.highlightColor, block.style?.backgroundColor].filter(Boolean)) {
      if (!isSafeColor(String(color))) errors.push(`Unsafe color value in block ${block.id}.`);
    }
    if (block.image?.src && !isSafeImageSource(block.image.src)) errors.push(`Unsafe image source in block ${block.id}.`);
    if (block.table?.rows && (block.table.rows.length > 40 || block.table.rows.some((row) => row.length > 12))) errors.push(`Table block ${block.id} is too large.`);
  }
  return { valid: errors.length === 0, errors: Array.from(new Set(errors)) };
}

export function extractPlaceholders(text: string) {
  return Array.from(text.matchAll(/\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g)).map((match) => match[1]);
}

export function normalizeTemplateDefinition(value: unknown, title = "Official HOA Document"): DocumentTemplateDefinition {
  const fallback = defaultTemplateDefinition(title);
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Partial<DocumentTemplateDefinition> & { page?: Partial<DocumentTemplateDefinition["page"]>; blocks?: unknown[]; sections?: Partial<Record<DocumentTemplateSectionName, unknown[]>> } : fallback;
  const rawSections = source.sections && typeof source.sections === "object"
    ? {
        header: Array.isArray(source.sections.header) ? source.sections.header : [],
        body: Array.isArray(source.sections.body) ? source.sections.body : [],
        footer: Array.isArray(source.sections.footer) ? source.sections.footer : [],
      }
    : {
        header: [],
        body: Array.isArray(source.blocks) ? source.blocks : fallback.sections.body,
        footer: [],
      };
  const page = normalizePage(source.page);
  const sections: Record<DocumentTemplateSectionName, DocumentTemplateBlock[]> = {
    header: normalizeBlocks(rawSections.header, "header"),
    body: normalizeBlocks(rawSections.body.length ? rawSections.body : fallback.sections.body, "body"),
    footer: normalizeBlocks(rawSections.footer, "footer"),
  };
  const blocks = flattenSections(sections);
  return {
    schemaVersion: documentTemplateSchemaVersion,
    page,
    sections,
    blocks,
    meta: { editor: "professional-document-editor", revisionNote: typeof source.meta?.revisionNote === "string" ? source.meta.revisionNote : undefined },
  };
}

export function defaultTemplateDefinition(title = "Official HOA Document"): DocumentTemplateDefinition {
  const sections: Record<DocumentTemplateSectionName, DocumentTemplateBlock[]> = {
    header: [
      { id: "tenant-logo", section: "header", type: "logo", binding: "tenant.logo", order: 10, visible: true, style: { align: "center", width: 64, height: 64 } },
      { id: "tenant-name", section: "header", type: "tenantName", binding: "tenant.name", order: 20, visible: true, style: { align: "center", fontFamily: "Arial", fontSize: 16, fontWeight: "bold" } },
      { id: "tenant-address", section: "header", type: "address", binding: "tenant.address", order: 30, visible: true, style: { align: "center", fontFamily: "Arial", fontSize: 10 } },
    ],
    body: [
      { id: "title", section: "body", type: "documentTitle", text: title, order: 10, visible: true, style: { align: "center", fontFamily: "Times New Roman", fontSize: 18, fontWeight: "bold", paragraphSpacing: 16 } },
      { id: "body-intro", section: "body", type: "bodyText", content: "This is to certify that {{subject.fullName}} is a registered resident of {{tenant.name}}.", order: 20, visible: true, style: { align: "justify", fontFamily: "Times New Roman", fontSize: 12, lineHeight: 1.6 } },
      { id: "purpose", section: "body", type: "purpose", binding: "request.purpose", order: 30, visible: true, style: { fontFamily: "Times New Roman", fontSize: 12 } },
      { id: "issue-date", section: "body", type: "issueDate", content: "Issued on {{document.issueDate}}.", order: 40, visible: true, style: { fontFamily: "Times New Roman", fontSize: 12 } },
      { id: "signatory", section: "body", type: "signatory", content: "{{signatory.name}}\n{{signatory.position}}", order: 50, visible: true, style: { align: "right", fontFamily: "Times New Roman", fontSize: 12, fontWeight: "bold" } },
    ],
    footer: [
      { id: "verification-footer", section: "footer", type: "footer", content: "Document No. {{document.number}} | Verification: {{verification.code}}", order: 10, visible: true, style: { align: "center", fontFamily: "Arial", fontSize: 9 } },
    ],
  };
  return {
    schemaVersion: documentTemplateSchemaVersion,
    page: defaultPage,
    sections,
    blocks: flattenSections(sections),
    meta: { editor: "professional-document-editor" },
  };
}

export function renderTemplateDefinitionText(value: unknown, title?: string) {
  const definition = normalizeTemplateDefinition(value, title);
  return flattenSections(definition.sections).filter((block) => block.visible).map((block) => {
    if (block.type === "spacer") return "";
    if (block.type === "divider" || block.type === "horizontalLine") return "------------------------------";
    if (block.type === "pageBreak") return "\n";
    if (block.table?.rows?.length) return block.table.rows.map((row) => row.join(" | ")).join("\n");
    const text = block.content ?? block.text;
    if (text) return text;
    if (block.binding) return `{{${block.binding}}}`;
    return block.label || block.type;
  }).join("\n\n").trim();
}

export function sampleTemplateValue(key: string) {
  return placeholderGroups.flatMap((group) => group.items).find((item) => item.key === key)?.sample || `{{${key}}}`;
}

function normalizePage(value: unknown): DocumentTemplateDefinition["page"] {
  const page = value && typeof value === "object" && !Array.isArray(value) ? value as Partial<DocumentTemplateDefinition["page"]> : {};
  const margins = page.margins && typeof page.margins === "object" ? page.margins as Partial<DocumentTemplateDefinition["page"]["margins"]> : {};
  const border = page.border && typeof page.border === "object" ? page.border as Partial<DocumentTemplateDefinition["page"]["border"]> : {};
  const watermark = page.watermark && typeof page.watermark === "object" ? page.watermark as Partial<DocumentTemplateDefinition["page"]["watermark"]> : {};
  const columns = page.columns && typeof page.columns === "object" ? page.columns as Partial<DocumentTemplateDefinition["page"]["columns"]> : {};
  return {
    format: ["A4", "LETTER", "LEGAL"].includes(String(page.format)) ? page.format as DocumentPageFormat : defaultPage.format,
    orientation: page.orientation === "landscape" ? "landscape" : "portrait",
    marginPreset: ["normal", "narrow", "moderate", "wide", "custom"].includes(String(page.marginPreset)) ? page.marginPreset as DocumentTemplateDefinition["page"]["marginPreset"] : defaultPage.marginPreset,
    margins: {
      top: clampNumber(margins.top, 5, 60, defaultPage.margins.top),
      right: clampNumber(margins.right, 5, 60, defaultPage.margins.right),
      bottom: clampNumber(margins.bottom, 5, 60, defaultPage.margins.bottom),
      left: clampNumber(margins.left, 5, 60, defaultPage.margins.left),
    },
    headerDistance: clampNumber(page.headerDistance, 0, 40, defaultPage.headerDistance),
    footerDistance: clampNumber(page.footerDistance, 0, 40, defaultPage.footerDistance),
    columns: { count: [1, 2, 3].includes(Number(columns.count)) ? Number(columns.count) as 1 | 2 | 3 : 1, gap: clampNumber(columns.gap, 0, 30, defaultPage.columns.gap) },
    border: { enabled: Boolean(border.enabled), style: ["solid", "dashed", "dotted"].includes(String(border.style)) ? border.style as "solid" | "dashed" | "dotted" : "solid", width: clampNumber(border.width, 0, 6, 1), color: isSafeColor(String(border.color || "")) ? String(border.color) : defaultPage.border.color },
    backgroundColor: isSafeColor(String(page.backgroundColor || "")) ? String(page.backgroundColor) : defaultPage.backgroundColor,
    watermark: { enabled: Boolean(watermark.enabled), text: sanitizeText(String(watermark.text || "")), opacity: clampNumber(watermark.opacity, 0.02, 0.3, defaultPage.watermark.opacity) },
  };
}

function normalizeBlocks(values: unknown[], section: DocumentTemplateSectionName) {
  return values.map((value, index) => normalizeBlock(value, section, index)).sort((a, b) => a.order - b.order).map((block, index) => ({ ...block, order: (index + 1) * 10 }));
}

function normalizeBlock(value: unknown, fallbackSection: DocumentTemplateSectionName, index: number): DocumentTemplateBlock {
  const item = value && typeof value === "object" && !Array.isArray(value) ? value as Partial<DocumentTemplateBlock> : {};
  const type = documentTemplateBlockTypes.includes(item.type as DocumentTemplateBlockType) ? item.type as DocumentTemplateBlockType : "text";
  const section = ["header", "body", "footer"].includes(String(item.section)) ? item.section as DocumentTemplateSectionName : fallbackSection;
  const style = item.style && typeof item.style === "object" ? item.style as NonNullable<DocumentTemplateBlock["style"]> : {};
  const table = item.table && typeof item.table === "object" && Array.isArray(item.table.rows)
    ? { rows: item.table.rows.slice(0, 40).map((row) => Array.isArray(row) ? row.slice(0, 12).map((cell) => sanitizeText(String(cell ?? ""))) : []) }
    : undefined;
  const image = item.image && typeof item.image === "object" ? item.image : undefined;
  return {
    id: typeof item.id === "string" && /^[A-Za-z0-9_-]{2,80}$/.test(item.id) ? item.id : `block-${index + 1}`,
    type,
    section,
    label: typeof item.label === "string" ? sanitizeText(item.label).slice(0, 120) : undefined,
    text: typeof item.text === "string" ? sanitizeText(item.text) : undefined,
    content: typeof item.content === "string" ? sanitizeText(item.content) : typeof item.text === "string" ? sanitizeText(item.text) : undefined,
    binding: allowedDocumentPlaceholders.includes(item.binding as AllowedDocumentPlaceholder) ? item.binding as AllowedDocumentPlaceholder : undefined,
    order: Number.isFinite(Number(item.order)) ? Number(item.order) : (index + 1) * 10,
    visible: item.visible !== false,
    style: {
      align: ["left", "center", "right", "justify"].includes(String(style.align)) ? style.align as NonNullable<DocumentTemplateBlock["style"]>["align"] : undefined,
      fontFamily: safeFontFamilies.includes(style.fontFamily as SafeFontFamily) ? style.fontFamily as SafeFontFamily : undefined,
      fontSize: clampNumber(style.fontSize, 6, 72, undefined),
      fontWeight: style.fontWeight === "bold" ? "bold" : style.fontWeight === "normal" ? "normal" : undefined,
      italic: Boolean(style.italic),
      underline: Boolean(style.underline),
      strike: Boolean(style.strike),
      superscript: Boolean(style.superscript),
      subscript: Boolean(style.subscript),
      textColor: isSafeColor(String(style.textColor || "")) ? String(style.textColor) : undefined,
      highlightColor: isSafeColor(String(style.highlightColor || "")) ? String(style.highlightColor) : undefined,
      backgroundColor: isSafeColor(String(style.backgroundColor || "")) ? String(style.backgroundColor) : undefined,
      border: typeof style.border === "string" && /^[A-Za-z0-9 #().,-]{0,80}$/.test(style.border) ? style.border : undefined,
      padding: clampNumber(style.padding, 0, 40, undefined),
      margin: clampNumber(style.margin, 0, 60, undefined),
      width: clampNumber(style.width, 1, 100, undefined),
      height: clampNumber(style.height, 1, 400, undefined),
      lineHeight: clampNumber(style.lineHeight, 0.8, 3, undefined),
      paragraphSpacing: clampNumber(style.paragraphSpacing, 0, 60, undefined),
      indent: clampNumber(style.indent, 0, 120, undefined),
      listStyle: ["none", "bullet", "number"].includes(String(style.listStyle)) ? style.listStyle as "none" | "bullet" | "number" : undefined,
    },
    image: image ? { src: typeof image.src === "string" && isSafeImageSource(image.src) ? image.src : undefined, alt: typeof image.alt === "string" ? sanitizeText(image.alt).slice(0, 140) : undefined, width: clampNumber(image.width, 8, 500, undefined), height: clampNumber(image.height, 8, 500, undefined) } : undefined,
    table,
  };
}

function flattenSections(sections: Record<DocumentTemplateSectionName, DocumentTemplateBlock[]>) {
  return (["header", "body", "footer"] as const).flatMap((section) => sections[section].map((block) => ({ ...block, section })));
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number;
function clampNumber(value: unknown, min: number, max: number, fallback: undefined): number | undefined;
function clampNumber(value: unknown, min: number, max: number, fallback: number | undefined) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function sanitizeText(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/[<>]/g, "").slice(0, 8000);
}

function containsUnsafeTemplateContent(text: string) {
  return /<script|javascript:|on[a-z]+\s*=|<iframe|<object|<embed/i.test(text);
}

function isSafeColor(value: string) {
  return /^#[0-9A-Fa-f]{6}$/.test(value);
}

function isSafeImageSource(value: string) {
  return value === "{{tenant.logo}}" || value.startsWith("/uploads/") || value.startsWith("/api/");
}
