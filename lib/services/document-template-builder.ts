import "server-only";

export const documentTemplateSchemaVersion = 1;

export const allowedDocumentPlaceholders = [
  "tenant.name",
  "tenant.address",
  "tenant.tin",
  "tenant.secRegistration",
  "tenant.contactNumber",
  "tenant.email",
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

export const documentTemplateBlockTypes = [
  "logo",
  "tenantName",
  "address",
  "tin",
  "secRegistration",
  "documentTitle",
  "text",
  "bodyText",
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
] as const;

export type DocumentTemplateBlockType = typeof documentTemplateBlockTypes[number];

export type DocumentTemplateBlock = {
  id: string;
  type: DocumentTemplateBlockType;
  label?: string;
  text?: string;
  binding?: AllowedDocumentPlaceholder;
  order: number;
  visible: boolean;
  style?: {
    align?: "left" | "center" | "right";
    fontFamily?: "Inter" | "Arial" | "Times New Roman";
    fontSize?: number;
    fontWeight?: "normal" | "bold";
    textColor?: string;
    backgroundColor?: string;
    border?: string;
    padding?: number;
    margin?: number;
    width?: number;
    height?: number;
  };
};

export type DocumentTemplateDefinition = {
  schemaVersion: typeof documentTemplateSchemaVersion;
  page: { format: "A4"; orientation: "portrait" };
  blocks: DocumentTemplateBlock[];
};

export function validateTemplateDefinition(definition: DocumentTemplateDefinition) {
  const errors: string[] = [];
  if (definition.schemaVersion !== documentTemplateSchemaVersion) errors.push("Unsupported template schema version.");
  if (definition.page.format !== "A4" || definition.page.orientation !== "portrait") errors.push("Only A4 portrait templates are supported.");
  for (const block of definition.blocks) {
    if (!documentTemplateBlockTypes.includes(block.type)) errors.push(`Unsupported block type: ${block.type}`);
    if (block.binding && !allowedDocumentPlaceholders.includes(block.binding)) errors.push(`Unsupported placeholder: ${block.binding}`);
    for (const placeholder of extractPlaceholders(block.text || "")) {
      if (!allowedDocumentPlaceholders.includes(placeholder as AllowedDocumentPlaceholder)) errors.push(`Unsupported placeholder: ${placeholder}`);
    }
    if (block.text && /<script|javascript:/i.test(block.text)) errors.push(`Unsafe text content in block ${block.id}.`);
  }
  return { valid: errors.length === 0, errors };
}

export function extractPlaceholders(text: string) {
  return Array.from(text.matchAll(/\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g)).map((match) => match[1]);
}

export function normalizeTemplateDefinition(value: unknown, title = "Official HOA Document"): DocumentTemplateDefinition {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Partial<DocumentTemplateDefinition> : defaultTemplateDefinition(title);
  const blocks = Array.isArray(source.blocks) ? source.blocks : defaultTemplateDefinition(title).blocks;
  return {
    schemaVersion: documentTemplateSchemaVersion,
    page: { format: "A4", orientation: "portrait" },
    blocks: blocks.map((block, index) => ({
      id: typeof block.id === "string" && block.id ? block.id : `block-${index + 1}`,
      type: documentTemplateBlockTypes.includes(block.type as DocumentTemplateBlockType) ? block.type as DocumentTemplateBlockType : "text",
      label: typeof block.label === "string" ? block.label : undefined,
      text: typeof block.text === "string" ? block.text : undefined,
      binding: allowedDocumentPlaceholders.includes(block.binding as AllowedDocumentPlaceholder) ? block.binding as AllowedDocumentPlaceholder : undefined,
      order: Number.isFinite(Number(block.order)) ? Number(block.order) : (index + 1) * 10,
      visible: block.visible !== false,
      style: block.style && typeof block.style === "object" ? block.style : undefined,
    })).sort((a, b) => a.order - b.order).map((block, index) => ({ ...block, order: (index + 1) * 10 })),
  };
}

export function defaultTemplateDefinition(title = "Official HOA Document"): DocumentTemplateDefinition {
  return {
    schemaVersion: documentTemplateSchemaVersion,
    page: { format: "A4", orientation: "portrait" },
    blocks: [
      { id: "tenant-name", type: "tenantName", binding: "tenant.name", order: 10, visible: true, style: { align: "center", fontSize: 16, fontWeight: "bold" } },
      { id: "tenant-address", type: "address", binding: "tenant.address", order: 20, visible: true, style: { align: "center", fontSize: 10 } },
      { id: "title", type: "documentTitle", text: title, order: 30, visible: true, style: { align: "center", fontSize: 18, fontWeight: "bold", margin: 16 } },
      { id: "subject", type: "subjectInfo", binding: "subject.fullName", order: 40, visible: true },
      { id: "purpose", type: "purpose", binding: "request.purpose", order: 50, visible: true },
      { id: "signatory", type: "signatory", binding: "signatory.name", order: 60, visible: true },
      { id: "qr", type: "qrVerification", binding: "verification.url", order: 70, visible: true },
    ],
  };
}
