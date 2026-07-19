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
  "document.issuePlace",
  "document.status",
  "document.validUntil",
  "subject.fullName",
  "subject.relationship",
  "subject.address",
  "subject.birthDate",
  "subject.civilStatus",
  "subject.nationality",
  "subject.status",
  "subject.residencyStartDate",
  "subject.age",
  "subject.occupation",
  "subject.contactNumber",
  "subject.phase",
  "subject.propertyType",
  "subject.occupancyStatus",
  "property.block",
  "property.lot",
  "property.address",
  "property.accountLabel",
  "property.phase",
  "property.subdivision",
  "request.purpose",
  "request.remarks",
  "request.copies",
  "request.requestedAt",
  "signatory.name",
  "signatory.position",
  "verification.url",
  "verification.code",
  "system.generatedAt",
  "system.platformName",
] as const;

export type AllowedDocumentPlaceholder = typeof allowedDocumentPlaceholders[number];
export type DocumentPlaceholderKey = string;

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
    { key: "document.issuePlace", label: "Issue place", sample: "Test HOA Office" },
    { key: "document.status", label: "Document status", sample: "Issued" },
    { key: "document.validUntil", label: "Valid until", sample: "July 18, 2027" },
  ] },
  { group: "Subject", items: [
    { key: "subject.fullName", label: "Full name", sample: "Juan Dela Cruz" },
    { key: "subject.relationship", label: "Relationship", sample: "Homeowner" },
    { key: "subject.address", label: "Address", sample: "Block 1 Lot 2" },
    { key: "subject.birthDate", label: "Date of birth", sample: "January 1, 1990" },
    { key: "subject.civilStatus", label: "Civil status", sample: "Married" },
    { key: "subject.nationality", label: "Nationality", sample: "Filipino" },
    { key: "subject.status", label: "Residency status", sample: "Owner occupied" },
    { key: "subject.residencyStartDate", label: "Residency start date", sample: "January 1, 2020" },
    { key: "subject.age", label: "Age", sample: "39" },
    { key: "subject.occupation", label: "Occupation", sample: "Property manager" },
    { key: "subject.contactNumber", label: "Contact number", sample: "0917 000 0000" },
    { key: "subject.phase", label: "Phase", sample: "Phase 2" },
    { key: "subject.propertyType", label: "Property type", sample: "Residential" },
    { key: "subject.occupancyStatus", label: "Occupancy status", sample: "Owner occupied" },
  ] },
  { group: "Property", items: [
    { key: "property.block", label: "Block", sample: "1" },
    { key: "property.lot", label: "Lot", sample: "2" },
    { key: "property.address", label: "Property address", sample: "Block 1 Lot 2, Test HOA" },
    { key: "property.accountLabel", label: "Account label", sample: "Block 1 Lot 2" },
    { key: "property.phase", label: "Phase", sample: "Phase 2" },
    { key: "property.subdivision", label: "Subdivision", sample: "Test HOA" },
  ] },
  { group: "Request", items: [
    { key: "request.purpose", label: "Purpose", sample: "For official purposes" },
    { key: "request.remarks", label: "Remarks", sample: "No remarks" },
    { key: "request.copies", label: "Number of copies", sample: "1" },
    { key: "request.requestedAt", label: "Request date", sample: "July 18, 2026" },
  ] },
  { group: "Signatory", items: [
    { key: "signatory.name", label: "Signatory name", sample: "Maria Santos" },
    { key: "signatory.position", label: "Position", sample: "HOA President" },
  ] },
  { group: "Verification", items: [
    { key: "verification.url", label: "Verification URL", sample: "https://example.test/verify/abc123" },
    { key: "verification.code", label: "Verification code", sample: "VERIFY123" },
  ] },
  { group: "System", items: [
    { key: "system.generatedAt", label: "Generated date", sample: "July 18, 2026" },
    { key: "system.platformName", label: "Platform name", sample: "HOAHub" },
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
  "heading",
  "paragraph",
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
  "rectangle",
  "officerName",
  "officerTitle",
  "verificationText",
  "pageNumber",
  "officerList",
] as const;

export type DocumentTemplateBlockType = typeof documentTemplateBlockTypes[number];
export type DocumentTemplateSectionName = "header" | "body" | "footer";
export type DocumentPageFormat = "A4" | "LETTER" | "LEGAL";
export type DocumentPageOrientation = "portrait" | "landscape";
export type DocumentGuide = { positionMm: number; label?: string };
export type DocumentPageImage = {
  src: string;
  fit: "cover" | "contain" | "fill";
  position: "center" | "top" | "bottom" | "left" | "right";
  opacity: number;
};

export const documentPageSizes: Record<DocumentPageFormat, { width: number; height: number; label: string }> = {
  A4: { width: 210, height: 297, label: "A4" },
  LETTER: { width: 216, height: 279, label: "Letter" },
  LEGAL: { width: 216, height: 356, label: "Legal" },
};

export function documentPageDimensions(format: DocumentPageFormat, orientation: DocumentPageOrientation) {
  const size = documentPageSizes[format];
  return orientation === "landscape" ? { widthMm: size.height, heightMm: size.width } : { widthMm: size.width, heightMm: size.height };
}

export type DocumentOfficerListConfig = {
  source: "TENANT_ORGANIZATION_OFFICERS";
  termMode: "CURRENT";
  roleFilters: string[];
  sortBy: "displayOrder" | "position" | "fullName";
  sortDirection: "asc" | "desc";
  maxOfficers: number;
  heading: string;
  termLabel: string;
  showHeading: boolean;
  showTerm: boolean;
  showSeparators: boolean;
};

export const defaultOfficerListConfig: DocumentOfficerListConfig = {
  source: "TENANT_ORGANIZATION_OFFICERS",
  termMode: "CURRENT",
  roleFilters: [],
  sortBy: "displayOrder",
  sortDirection: "asc",
  maxOfficers: 8,
  heading: "HOA OFFICERS",
  termLabel: "",
  showHeading: true,
  showTerm: true,
  showSeparators: true,
};

export const safeFontFamilies = ["Arial", "Inter", "Times New Roman", "Georgia", "Calibri"] as const;
export type SafeFontFamily = typeof safeFontFamilies[number];

export type DocumentTemplateBlock = {
  id: string;
  type: DocumentTemplateBlockType;
  section: DocumentTemplateSectionName;
  label?: string;
  text?: string;
  content?: string;
  binding?: DocumentPlaceholderKey;
  order: number;
  visible: boolean;
  locked?: boolean;
  required?: boolean;
  position?: {
    x: number;
    y: number;
    width: number;
    height: number;
    zIndex: number;
  };
  accessibility?: {
    ariaLabel?: string;
    altText?: string;
  };
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
    borderColor?: string;
    borderWidth?: number;
    radius?: number;
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
  officerList?: DocumentOfficerListConfig;
};

export type DocumentTemplateDefinition = {
  schemaVersion: typeof documentTemplateSchemaVersion;
  page: {
    id: string;
    format: DocumentPageFormat;
    orientation: DocumentPageOrientation;
    widthMm: number;
    heightMm: number;
    pageNumber: number;
    marginPreset: "normal" | "narrow" | "moderate" | "wide" | "custom";
    margins: { top: number; right: number; bottom: number; left: number };
    padding: { top: number; right: number; bottom: number; left: number };
    headerHeightMm: number;
    footerHeightMm: number;
    headerLocked: boolean;
    footerLocked: boolean;
    showHeaderBoundary: boolean;
    showFooterBoundary: boolean;
    headerDistance: number;
    footerDistance: number;
    columns: { count: 1 | 2 | 3; gap: number };
    border: { enabled: boolean; style: "solid" | "dashed" | "dotted"; width: number; color: string };
    backgroundColor: string;
    backgroundOpacity: number;
    backgroundImage?: DocumentPageImage;
    watermark: { enabled: boolean; text: string; opacity: number; fontSize: number; position: "center" | "top" | "bottom"; rotation: number; image?: DocumentPageImage };
    canvas: { gridSize: number; snapToGrid: boolean; showGrid: boolean; showRulers: boolean; showMarginGuides: boolean; showCenterGuides: boolean };
    guides: { horizontal: DocumentGuide[]; vertical: DocumentGuide[] };
    safeArea: { showBoundary: boolean; showNonPrintableArea: boolean; warnOnOverflow: boolean; minimumMarginMm: number };
  };
  sections: Record<DocumentTemplateSectionName, DocumentTemplateBlock[]>;
  blocks: DocumentTemplateBlock[];
  meta: {
    editor: "professional-document-editor";
    revisionNote?: string;
    requiresSignatory?: boolean;
  };
};

const defaultPage: DocumentTemplateDefinition["page"] = {
  id: "page-1",
  format: "A4",
  orientation: "portrait",
  widthMm: 210,
  heightMm: 297,
  pageNumber: 1,
  marginPreset: "normal",
  margins: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
  headerHeightMm: 54,
  footerHeightMm: 30,
  headerLocked: false,
  footerLocked: false,
  showHeaderBoundary: true,
  showFooterBoundary: true,
  headerDistance: 12,
  footerDistance: 12,
  columns: { count: 1, gap: 10 },
  border: { enabled: false, style: "solid", width: 1, color: "#111827" },
  backgroundColor: "#ffffff",
  backgroundOpacity: 1,
  watermark: { enabled: false, text: "", opacity: 0.08, fontSize: 34, position: "center", rotation: -28 },
  canvas: { gridSize: 5, snapToGrid: true, showGrid: true, showRulers: true, showMarginGuides: true, showCenterGuides: true },
  guides: { horizontal: [], vertical: [] },
  safeArea: { showBoundary: true, showNonPrintableArea: false, warnOnOverflow: true, minimumMarginMm: 12 },
};

export function validateTemplateDefinition(value: unknown, options: { allowedPlaceholders?: ReadonlySet<string>; officerPositions?: readonly string[]; activeOfficerCount?: number } = {}) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const knownPlaceholders = options.allowedPlaceholders || new Set<string>(allowedDocumentPlaceholders);
  if (!isRecord(value)) return { valid: false, errors: ["Template definition is missing."], warnings: [] };
  const definition = value;
  if (definition.schemaVersion !== documentTemplateSchemaVersion && definition.schemaVersion !== 1) errors.push("Unsupported template schema version.");

  const page = isRecord(definition.page) ? definition.page : null;
  if (!page) {
    errors.push("Missing page settings.");
  } else {
    if (!["A4", "LETTER", "LEGAL"].includes(String(page.format))) errors.push("Unsupported page size.");
    if (!["portrait", "landscape"].includes(String(page.orientation))) errors.push("Unsupported page orientation.");
    const margins = isRecord(page.margins) ? page.margins : null;
    if (!margins) {
      errors.push("Missing margins.");
    } else {
      for (const side of ["top", "right", "bottom", "left"]) {
        const margin = Number(margins[side]);
        if (!Number.isFinite(margin) || margin < 5 || margin > 60) errors.push("Page margins must be between 5mm and 60mm.");
      }
    }
    if (typeof page.backgroundColor === "string" && !isSafeColor(page.backgroundColor)) errors.push("Page background color must be a safe hex value.");
    if (page.backgroundOpacity != null && (!Number.isFinite(Number(page.backgroundOpacity)) || Number(page.backgroundOpacity) < 0.05 || Number(page.backgroundOpacity) > 1)) errors.push("Page background opacity must be between 0.05 and 1.");
    if (page.backgroundImage != null) {
      if (!isRecord(page.backgroundImage) || typeof page.backgroundImage.src !== "string" || !isSafeImageSource(page.backgroundImage.src)) errors.push("Page background image must use a tenant-approved upload.");
      if (isRecord(page.backgroundImage) && !["cover", "contain", "fill"].includes(String(page.backgroundImage.fit))) errors.push("Page background fit is not supported.");
    }
    if (isRecord(page.watermark)) {
      if (containsUnsafeTemplateContent(String(page.watermark.text || ""))) errors.push("Watermark text contains unsafe content.");
      if (page.watermark.image != null && (!isRecord(page.watermark.image) || typeof page.watermark.image.src !== "string" || !isSafeImageSource(page.watermark.image.src))) errors.push("Watermark image must use a tenant-approved upload.");
    }
    for (const key of ["headerHeightMm", "footerHeightMm"] as const) if (page[key] != null && (!Number.isFinite(Number(page[key])) || Number(page[key]) < 0 || Number(page[key]) > 120)) errors.push(`${key} must be between 0mm and 120mm.`);
    const canvas = isRecord(page.canvas) ? page.canvas : null;
    if (canvas) {
      const gridSize = Number(canvas.gridSize);
      if (!Number.isFinite(gridSize) || gridSize < 1 || gridSize > 20) errors.push("Grid size must be between 1mm and 20mm.");
    }
    if (isRecord(page.guides)) {
      for (const [axis, max] of [["horizontal", Number(page.heightMm) || 356], ["vertical", Number(page.widthMm) || 216]] as const) {
        if (page.guides[axis] != null && (!Array.isArray(page.guides[axis]) || page.guides[axis].some((guide) => !isRecord(guide) || !Number.isFinite(Number(guide.positionMm)) || Number(guide.positionMm) < 0 || Number(guide.positionMm) > max))) errors.push(`${axis} guides must stay within the page boundary.`);
      }
    }
    const border = isRecord(page.border) ? page.border : null;
    if (border?.enabled === true && !isSafeColor(String(border.color || ""))) errors.push("Page border color must be a safe hex value.");
  }

  const sections = isRecord(definition.sections) ? definition.sections : null;
  const legacyBlocks = Array.isArray(definition.blocks) ? definition.blocks : [];
  const sectionBlocks = sections ? [
    ...sectionValidationBlocks(sections.header, "header", errors),
    ...sectionValidationBlocks(sections.body, "body", errors),
    ...sectionValidationBlocks(sections.footer, "footer", errors),
  ] : [];
  if (!sections && legacyBlocks.length === 0) errors.push("Missing layout.");
  if (sections && !Array.isArray(sections.header)) errors.push("Missing header.");
  if (sections && !Array.isArray(sections.body)) errors.push("Missing body.");
  if (sections && !Array.isArray(sections.footer)) errors.push("Missing footer.");
  const blocks = sectionBlocks.length ? sectionBlocks : sectionValidationBlocks(legacyBlocks, "body", errors);
  if (blocks.length > 100) errors.push("Templates are limited to 100 elements.");
  if (!blocks.some((block) => block.visible && block.type !== "spacer" && block.type !== "divider")) errors.push("Template must contain at least one visible content block.");
  const officerLists = blocks.filter((block) => block.type === "officerList");
  if (officerLists.length > 1) errors.push("Only one HOA officer list is allowed per template.");
  const format = page && ["A4", "LETTER", "LEGAL"].includes(String(page.format)) ? page.format as DocumentPageFormat : "A4";
  const orientation = page?.orientation === "landscape" ? "landscape" : "portrait";
  const dimensions = documentPageDimensions(format, orientation);
  const pageWidth = Number(page?.widthMm) || dimensions.widthMm;
  const pageHeight = Number(page?.heightMm) || dimensions.heightMm;
  const margins = isRecord(page?.margins) ? page.margins : {};
  const safeArea = isRecord(page?.safeArea) ? page.safeArea : null;
  if (safeArea?.warnOnOverflow === true && ["top", "right", "bottom", "left"].some((side) => Number(margins[side]) < Number(safeArea.minimumMarginMm || 12))) warnings.push("The page margin is smaller than the recommended printer-safe margin.");
  for (const block of blocks) {
    if (!documentTemplateBlockTypes.includes(block.type)) errors.push(`Unsupported block type: ${block.type}`);
    if (!["header", "body", "footer"].includes(block.section)) errors.push(`Unsupported section for block ${block.id}.`);
    if (block.binding && !knownPlaceholders.has(block.binding)) errors.push(`Unsupported placeholder: ${block.binding}`);
    if (block.position) {
      const position = block.position;
      for (const key of ["x", "y", "width", "height", "zIndex"] as const) if (!Number.isFinite(Number(position[key]))) errors.push(`Invalid position for block ${block.id}.`);
      if (position.width <= 0 || position.height <= 0) errors.push(`Block ${block.id} must have a positive size.`);
      if (position.x < 0 || position.y < 0 || position.x + position.width > pageWidth || position.y + position.height > pageHeight) errors.push(`${block.label || block.id} is outside the page.`);
      if (position.width > pageWidth || position.height > pageHeight) errors.push(`${block.label || block.id} is larger than the page.`);
      if (safeArea?.warnOnOverflow === true && (position.x < Number(margins.left || 0) || position.y < Number(margins.top || 0) || position.x + position.width > pageWidth - Number(margins.right || 0) || position.y + position.height > pageHeight - Number(margins.bottom || 0))) warnings.push(`${block.label || block.id} extends beyond the printable area.`);
    }
    const text = block.content ?? block.text ?? "";
    for (const placeholder of extractPlaceholders(text)) {
      if (!knownPlaceholders.has(placeholder)) errors.push(`Unsupported placeholder: ${placeholder}`);
    }
    if (containsUnsafeTemplateContent(text)) errors.push(`Unsafe text content in block ${block.id}.`);
    if (block.style?.fontFamily && !safeFontFamilies.includes(block.style.fontFamily)) errors.push(`Unsupported font in block ${block.id}.`);
    for (const color of [block.style?.textColor, block.style?.highlightColor, block.style?.backgroundColor].filter(Boolean)) {
      if (!isSafeColor(String(color))) errors.push(`Unsafe color value in block ${block.id}.`);
    }
    if (block.style?.borderColor && !isSafeColor(block.style.borderColor)) errors.push(`Unsafe border color in block ${block.id}.`);
    if (block.image?.src && !isSafeImageSource(block.image.src)) errors.push(`Unsafe image source in block ${block.id}.`);
    if (block.table?.rows && (block.table.rows.length > 40 || block.table.rows.some((row) => row.length > 12))) errors.push(`Table block ${block.id} is too large.`);
    if (block.type === "officerList") {
      const config = block.officerList || defaultOfficerListConfig;
      if (config.source !== "TENANT_ORGANIZATION_OFFICERS") errors.push(`Officer list ${block.id} must use the trusted tenant organization source.`);
      if (config.termMode !== "CURRENT") errors.push(`Officer list ${block.id} must use the current organization term.`);
      if (!Array.isArray(config.roleFilters) || config.roleFilters.some((role) => typeof role !== "string" || role.trim().length === 0 || role.length > 100)) errors.push(`Officer list ${block.id} has invalid role filters.`);
      if (!["displayOrder", "position", "fullName"].includes(config.sortBy)) errors.push(`Officer list ${block.id} has an invalid sort field.`);
      if (!["asc", "desc"].includes(config.sortDirection)) errors.push(`Officer list ${block.id} has an invalid sort direction.`);
      if (!Number.isInteger(config.maxOfficers) || config.maxOfficers < 1 || config.maxOfficers > 30) errors.push(`Officer list ${block.id} must show between 1 and 30 officers.`);
      if (typeof config.heading !== "string" || config.heading.length > 120 || containsUnsafeTemplateContent(config.heading)) errors.push(`Officer list ${block.id} has an invalid heading.`);
      if (typeof config.termLabel !== "string" || config.termLabel.length > 80 || containsUnsafeTemplateContent(config.termLabel)) errors.push(`Officer list ${block.id} has an invalid term label.`);
      if (options.activeOfficerCount === 0) errors.push(`Officer list ${block.id} has no available active tenant officers.`);
      if (options.officerPositions && config.roleFilters.some((role) => !options.officerPositions!.some((position) => position.trim().toLowerCase() === role.trim().toLowerCase()))) errors.push(`Officer list ${block.id} contains a role filter that does not match an active tenant officer position.`);
      if (block.position && block.position.height < 18 + (config.showHeading ? 12 : 0) + (config.showTerm ? 8 : 0) + config.maxOfficers * 9) errors.push(`Officer list ${block.label || block.id} may overflow its sidebar height for the configured officer count.`);
    }
  }
  for (const officerList of officerLists) {
    if (!officerList.position || !officerList.visible) continue;
    for (const other of blocks) {
      if (other.id === officerList.id || !other.visible || !other.position || other.type === "verticalLine" || other.type === "divider" || other.type === "spacer") continue;
      if (rectanglesOverlap(officerList.position, other.position)) {
        errors.push(other.section === "body" ? `Main certificate body overlaps the HOA officer sidebar (${officerList.label || officerList.id}).` : `HOA officer sidebar overlaps ${other.label || other.id}.`);
      }
    }
  }
  return { valid: errors.length === 0, errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
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
    meta: { editor: "professional-document-editor", revisionNote: typeof source.meta?.revisionNote === "string" ? source.meta.revisionNote : undefined, requiresSignatory: source.meta?.requiresSignatory === true },
  };
}

export function defaultTemplateDefinition(title = "Official HOA Document"): DocumentTemplateDefinition {
  const sections: Record<DocumentTemplateSectionName, DocumentTemplateBlock[]> = {
    header: [
      { id: "tenant-logo", section: "header", type: "logo", binding: "tenant.logo", order: 10, visible: true, position: { x: 75, y: 16, width: 60, height: 28, zIndex: 10 }, style: { align: "center", width: 64, height: 64 } },
      { id: "tenant-name", section: "header", type: "tenantName", binding: "tenant.name", order: 20, visible: true, position: { x: 35, y: 48, width: 140, height: 10, zIndex: 11 }, style: { align: "center", fontFamily: "Arial", fontSize: 16, fontWeight: "bold" } },
      { id: "tenant-address", section: "header", type: "address", binding: "tenant.address", order: 30, visible: true, position: { x: 35, y: 61, width: 140, height: 8, zIndex: 12 }, style: { align: "center", fontFamily: "Arial", fontSize: 10 } },
    ],
    body: [
      { id: "title", section: "body", type: "documentTitle", text: title, order: 10, visible: true, position: { x: 25, y: 84, width: 160, height: 12, zIndex: 20 }, style: { align: "center", fontFamily: "Times New Roman", fontSize: 18, fontWeight: "bold", paragraphSpacing: 16 } },
      { id: "body-intro", section: "body", type: "bodyText", content: "This is to certify that {{subject.fullName}} is a registered resident of {{tenant.name}}.", order: 20, visible: true, position: { x: 25, y: 108, width: 160, height: 34, zIndex: 21 }, style: { align: "justify", fontFamily: "Times New Roman", fontSize: 12, lineHeight: 1.6 } },
      { id: "purpose", section: "body", type: "purpose", binding: "request.purpose", order: 30, visible: true, position: { x: 25, y: 149, width: 160, height: 12, zIndex: 22 }, style: { fontFamily: "Times New Roman", fontSize: 12 } },
      { id: "issue-date", section: "body", type: "issueDate", content: "Issued on {{document.issueDate}}.", order: 40, visible: true, position: { x: 25, y: 168, width: 160, height: 12, zIndex: 23 }, style: { fontFamily: "Times New Roman", fontSize: 12 } },
      { id: "signatory", section: "body", type: "signatory", content: "{{signatory.name}}\n{{signatory.position}}", order: 50, visible: true, position: { x: 115, y: 178, width: 70, height: 28, zIndex: 24 }, style: { align: "center", fontFamily: "Times New Roman", fontSize: 12, fontWeight: "bold" } },
    ],
    footer: [
      { id: "verification-footer", section: "footer", type: "footer", content: "Document No. {{document.number}} | Verification: {{verification.code}}", order: 10, visible: true, position: { x: 25, y: 202, width: 160, height: 10, zIndex: 30 }, style: { align: "center", fontFamily: "Arial", fontSize: 9 } },
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
  const format = ["A4", "LETTER", "LEGAL"].includes(String(page.format)) ? page.format as DocumentPageFormat : defaultPage.format;
  const orientation = page.orientation === "landscape" ? "landscape" : "portrait";
  const dimensions = documentPageDimensions(format, orientation);
  const backgroundImage = isRecord(page.backgroundImage) && typeof page.backgroundImage.src === "string" && isSafeImageSource(page.backgroundImage.src) ? {
    src: page.backgroundImage.src,
    fit: ["cover", "contain", "fill"].includes(String(page.backgroundImage.fit)) ? page.backgroundImage.fit as DocumentPageImage["fit"] : "cover",
    position: ["center", "top", "bottom", "left", "right"].includes(String(page.backgroundImage.position)) ? page.backgroundImage.position as DocumentPageImage["position"] : "center",
    opacity: clampNumber(page.backgroundImage.opacity, 0.05, 1, 1),
  } : undefined;
  const watermarkImage = isRecord(watermark.image) && typeof watermark.image.src === "string" && isSafeImageSource(watermark.image.src) ? {
    src: watermark.image.src,
    fit: ["cover", "contain", "fill"].includes(String(watermark.image.fit)) ? watermark.image.fit as DocumentPageImage["fit"] : "contain",
    position: ["center", "top", "bottom", "left", "right"].includes(String(watermark.image.position)) ? watermark.image.position as DocumentPageImage["position"] : "center",
    opacity: clampNumber(watermark.image.opacity, 0.05, 1, 1),
  } : undefined;
  const normalizeGuides = (value: unknown, max: number): DocumentGuide[] => Array.isArray(value) ? value.slice(0, 20).flatMap((entry) => {
    const source = isRecord(entry) ? entry : null;
    const positionMm = clampNumber(source?.positionMm ?? entry, 0, max, undefined);
    return positionMm == null ? [] : [{ positionMm, label: typeof source?.label === "string" ? sanitizeText(source.label).slice(0, 60) : undefined }];
  }) : [];
  return {
    id: typeof page.id === "string" && /^[A-Za-z0-9_-]{2,80}$/.test(page.id) ? page.id : defaultPage.id,
    format,
    orientation,
    widthMm: dimensions.widthMm,
    heightMm: dimensions.heightMm,
    pageNumber: clampNumber(page.pageNumber, 1, 9999, defaultPage.pageNumber),
    marginPreset: ["normal", "narrow", "moderate", "wide", "custom"].includes(String(page.marginPreset)) ? page.marginPreset as DocumentTemplateDefinition["page"]["marginPreset"] : defaultPage.marginPreset,
    margins: {
      top: clampNumber(margins.top, 5, 60, defaultPage.margins.top),
      right: clampNumber(margins.right, 5, 60, defaultPage.margins.right),
      bottom: clampNumber(margins.bottom, 5, 60, defaultPage.margins.bottom),
      left: clampNumber(margins.left, 5, 60, defaultPage.margins.left),
    },
    padding: {
      top: clampNumber(isRecord(page.padding) ? page.padding.top : undefined, 0, 30, defaultPage.padding.top),
      right: clampNumber(isRecord(page.padding) ? page.padding.right : undefined, 0, 30, defaultPage.padding.right),
      bottom: clampNumber(isRecord(page.padding) ? page.padding.bottom : undefined, 0, 30, defaultPage.padding.bottom),
      left: clampNumber(isRecord(page.padding) ? page.padding.left : undefined, 0, 30, defaultPage.padding.left),
    },
    headerHeightMm: clampNumber(page.headerHeightMm, 0, 120, defaultPage.headerHeightMm),
    footerHeightMm: clampNumber(page.footerHeightMm, 0, 120, defaultPage.footerHeightMm),
    headerLocked: page.headerLocked === true,
    footerLocked: page.footerLocked === true,
    showHeaderBoundary: page.showHeaderBoundary !== false,
    showFooterBoundary: page.showFooterBoundary !== false,
    headerDistance: clampNumber(page.headerDistance, 0, 40, defaultPage.headerDistance),
    footerDistance: clampNumber(page.footerDistance, 0, 40, defaultPage.footerDistance),
    columns: { count: [1, 2, 3].includes(Number(columns.count)) ? Number(columns.count) as 1 | 2 | 3 : 1, gap: clampNumber(columns.gap, 0, 30, defaultPage.columns.gap) },
    border: { enabled: Boolean(border.enabled), style: ["solid", "dashed", "dotted"].includes(String(border.style)) ? border.style as "solid" | "dashed" | "dotted" : "solid", width: clampNumber(border.width, 0, 6, 1), color: isSafeColor(String(border.color || "")) ? String(border.color) : defaultPage.border.color },
    backgroundColor: isSafeColor(String(page.backgroundColor || "")) ? String(page.backgroundColor) : defaultPage.backgroundColor,
    backgroundOpacity: clampNumber(page.backgroundOpacity, 0.05, 1, defaultPage.backgroundOpacity),
    backgroundImage,
    watermark: { enabled: Boolean(watermark.enabled), text: sanitizeText(String(watermark.text || "")), opacity: clampNumber(watermark.opacity, 0.02, 0.3, defaultPage.watermark.opacity), fontSize: clampNumber(watermark.fontSize, 12, 96, defaultPage.watermark.fontSize), position: ["center", "top", "bottom"].includes(String(watermark.position)) ? watermark.position as "center" | "top" | "bottom" : defaultPage.watermark.position, rotation: clampNumber(watermark.rotation, -45, 45, defaultPage.watermark.rotation), image: watermarkImage },
    canvas: {
      gridSize: clampNumber(isRecord(page.canvas) ? page.canvas.gridSize : undefined, 1, 20, defaultPage.canvas.gridSize),
      snapToGrid: isRecord(page.canvas) ? page.canvas.snapToGrid !== false : defaultPage.canvas.snapToGrid,
      showGrid: isRecord(page.canvas) ? page.canvas.showGrid !== false : defaultPage.canvas.showGrid,
      showRulers: isRecord(page.canvas) ? page.canvas.showRulers !== false : defaultPage.canvas.showRulers,
      showMarginGuides: isRecord(page.canvas) ? page.canvas.showMarginGuides !== false : defaultPage.canvas.showMarginGuides,
      showCenterGuides: isRecord(page.canvas) ? page.canvas.showCenterGuides !== false : defaultPage.canvas.showCenterGuides,
    },
    guides: {
      horizontal: normalizeGuides(isRecord(page.guides) ? page.guides.horizontal : undefined, dimensions.heightMm),
      vertical: normalizeGuides(isRecord(page.guides) ? page.guides.vertical : undefined, dimensions.widthMm),
    },
    safeArea: {
      showBoundary: isRecord(page.safeArea) ? page.safeArea.showBoundary !== false : defaultPage.safeArea.showBoundary,
      showNonPrintableArea: isRecord(page.safeArea) ? page.safeArea.showNonPrintableArea === true : defaultPage.safeArea.showNonPrintableArea,
      warnOnOverflow: isRecord(page.safeArea) ? page.safeArea.warnOnOverflow !== false : defaultPage.safeArea.warnOnOverflow,
      minimumMarginMm: clampNumber(isRecord(page.safeArea) ? page.safeArea.minimumMarginMm : undefined, 5, 30, defaultPage.safeArea.minimumMarginMm),
    },
  };
}

function normalizeBlocks(values: unknown[], section: DocumentTemplateSectionName) {
  return values.map((value, index) => normalizeBlock(value, section, index)).sort((a, b) => a.order - b.order).map((block, index) => ({ ...block, order: (index + 1) * 10 }));
}

function sectionValidationBlocks(value: unknown, fallbackSection: DocumentTemplateSectionName, errors: string[]) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index): DocumentTemplateBlock[] => {
    if (!isRecord(entry)) {
      errors.push(`Invalid block in ${fallbackSection} section.`);
      return [];
    }
    const type = typeof entry.type === "string" ? entry.type as DocumentTemplateBlockType : "text";
    const section = ["header", "body", "footer"].includes(String(entry.section)) ? entry.section as DocumentTemplateSectionName : fallbackSection;
    const style = isRecord(entry.style) ? entry.style as NonNullable<DocumentTemplateBlock["style"]> : undefined;
    const image = isRecord(entry.image) ? entry.image as DocumentTemplateBlock["image"] : undefined;
    const table = isRecord(entry.table) && Array.isArray(entry.table.rows) ? { rows: entry.table.rows.filter(Array.isArray).map((row) => row.map((cell) => String(cell ?? ""))) } : undefined;
    return [{
      id: typeof entry.id === "string" && entry.id ? entry.id : `${fallbackSection}-block-${index + 1}`,
      type,
      section,
      label: typeof entry.label === "string" ? entry.label : undefined,
      text: typeof entry.text === "string" ? entry.text : undefined,
      content: typeof entry.content === "string" ? entry.content : undefined,
      binding: typeof entry.binding === "string" && isSafePlaceholderKey(entry.binding) ? entry.binding : undefined,
      order: Number.isFinite(Number(entry.order)) ? Number(entry.order) : (index + 1) * 10,
      visible: entry.visible !== false,
      locked: entry.locked === true,
      position: normalizePosition(entry.position),
      required: entry.required !== false,
      style,
      image,
      table,
      officerList: normalizeOfficerList(entry.officerList),
    }];
  });
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
    binding: typeof item.binding === "string" && isSafePlaceholderKey(item.binding) ? item.binding : undefined,
    order: Number.isFinite(Number(item.order)) ? Number(item.order) : (index + 1) * 10,
    visible: item.visible !== false,
    locked: item.locked === true,
    position: normalizePosition(item.position),
    accessibility: isRecord(item.accessibility) ? {
      ariaLabel: typeof item.accessibility.ariaLabel === "string" ? sanitizeText(item.accessibility.ariaLabel).slice(0, 140) : undefined,
      altText: typeof item.accessibility.altText === "string" ? sanitizeText(item.accessibility.altText).slice(0, 140) : undefined,
    } : undefined,
    required: item.required !== false,
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
      borderColor: isSafeColor(String(style.borderColor || "")) ? String(style.borderColor) : undefined,
      borderWidth: clampNumber(style.borderWidth, 0, 8, undefined),
      radius: clampNumber(style.radius, 0, 24, undefined),
    },
    image: image ? { src: typeof image.src === "string" && isSafeImageSource(image.src) ? image.src : undefined, alt: typeof image.alt === "string" ? sanitizeText(image.alt).slice(0, 140) : undefined, width: clampNumber(image.width, 8, 500, undefined), height: clampNumber(image.height, 8, 500, undefined) } : undefined,
    table,
    officerList: normalizeOfficerList(item.officerList),
  };
}

function normalizeOfficerList(value: unknown): DocumentOfficerListConfig | undefined {
  if (!isRecord(value)) return undefined;
  const roleFilters = Array.isArray(value.roleFilters) ? value.roleFilters.filter((role): role is string => typeof role === "string").map((role) => sanitizeText(role).trim()).filter(Boolean).slice(0, 30) : defaultOfficerListConfig.roleFilters;
  return {
    source: "TENANT_ORGANIZATION_OFFICERS",
    termMode: "CURRENT",
    roleFilters,
    sortBy: ["displayOrder", "position", "fullName"].includes(String(value.sortBy)) ? value.sortBy as DocumentOfficerListConfig["sortBy"] : defaultOfficerListConfig.sortBy,
    sortDirection: value.sortDirection === "desc" ? "desc" : "asc",
    maxOfficers: Math.round(clampNumber(value.maxOfficers, 1, 30, defaultOfficerListConfig.maxOfficers)),
    heading: typeof value.heading === "string" ? sanitizeText(value.heading).slice(0, 120) : defaultOfficerListConfig.heading,
    termLabel: typeof value.termLabel === "string" ? sanitizeText(value.termLabel).slice(0, 80) : defaultOfficerListConfig.termLabel,
    showHeading: value.showHeading !== false,
    showTerm: value.showTerm !== false,
    showSeparators: value.showSeparators !== false,
  };
}

function flattenSections(sections: Partial<Record<DocumentTemplateSectionName, DocumentTemplateBlock[]>>) {
  return (["header", "body", "footer"] as const).flatMap((section) => (Array.isArray(sections[section]) ? sections[section] : []).map((block) => ({ ...block, section })));
}

function normalizePosition(value: unknown) {
  if (!isRecord(value)) return undefined;
  const position = value;
  const x = clampNumber(position.x, 0, 500, undefined);
  const y = clampNumber(position.y, 0, 500, undefined);
  const width = clampNumber(position.width, 1, 500, undefined);
  const height = clampNumber(position.height, 1, 500, undefined);
  const zIndex = clampNumber(position.zIndex, 0, 1000, undefined);
  if ([x, y, width, height, zIndex].some((item) => item == null)) return undefined;
  return { x: x!, y: y!, width: width!, height: height!, zIndex: zIndex! };
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

function isSafePlaceholderKey(value: string) {
  return /^[A-Za-z][A-Za-z0-9_.]{1,120}$/.test(value);
}

function rectanglesOverlap(left: NonNullable<DocumentTemplateBlock["position"]>, right: NonNullable<DocumentTemplateBlock["position"]>) {
  return left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
