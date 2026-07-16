import "server-only";

export const documentTemplateSchemaVersion = 1;

export const allowedDocumentPlaceholders = [
  "tenant.name",
  "tenant.address",
  "tenant.tin",
  "tenant.secRegistration",
  "document.number",
  "document.title",
  "subject.fullName",
  "subject.address",
  "property.block",
  "property.lot",
  "request.purpose",
  "document.issueDate",
  "document.validUntil",
  "signatory.name",
  "signatory.position",
  "verification.url",
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
  "subjectInfo",
  "propertyInfo",
  "purpose",
  "issueDate",
  "validityDate",
  "documentNumber",
  "signatory",
  "signature",
  "footer",
  "qrVerification",
  "divider",
  "spacer",
  "table",
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
    if (block.text && /<script|javascript:/i.test(block.text)) errors.push(`Unsafe text content in block ${block.id}.`);
  }
  return { valid: errors.length === 0, errors };
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
