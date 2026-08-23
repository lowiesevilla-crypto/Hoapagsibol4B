import {
  DocumentDeliveryMode,
  DocumentFieldType,
  DocumentOutstandingBalancePolicy,
  DocumentType,
} from "@prisma/client";
import {
  defaultQrConfig,
  defaultTemplateDefinition,
  validateTemplateDefinition,
  type DocumentTemplateBlock,
  type DocumentTemplateDefinition,
} from "@/lib/services/document-template-builder";

export const FREE_DOCUMENT_LIBRARY_SOURCE = "HOAHUB_FREE_DOCUMENT_LIBRARY";
export const FREE_DOCUMENT_LIBRARY_VERSION = 2;

export type FreeDocumentTemplateField = {
  key: string;
  label: string;
  fieldType: DocumentFieldType;
  required: boolean;
  options?: string[];
  defaultValue?: string;
};

export type FreeDocumentTemplateBlueprint = {
  key: string;
  libraryVersion: number;
  code: string;
  displayName: string;
  category: string;
  description: string;
  legacyType: DocumentType | null;
  numberingFormat: string;
  validityDays: number | null;
  maxCopies: number;
  outstandingBalancePolicy: DocumentOutstandingBalancePolicy;
  workflow: {
    deliveryMode: DocumentDeliveryMode;
    approvalRequired: boolean;
    paymentRequired: boolean;
    paymentBeforeApproval: boolean;
    allowImmediateDownload: boolean;
    requiresAdminReview: boolean;
    releaseRequired: boolean;
    feeAmount: number;
  };
  fields: FreeDocumentTemplateField[];
  template: DocumentTemplateDefinition;
};

type CertificateVariant =
  | "RESIDENCY"
  | "INDIGENCY"
  | "GOOD_STANDING"
  | "CLEARANCE"
  | "PAYMENT"
  | "CONSTRUCTION_BOND"
  | "CONTRACTOR_BOND";

type PassKind = "GATE" | "MOVE_IN" | "MOVE_OUT";

const NAVY = "#071f4f";
const NAVY_2 = "#0b2a63";
const GOLD = "#b88718";
const GOLD_SOFT = "#f5edd8";
const SLATE = "#475569";
const INK = "#111827";
const LIGHT = "#f8fafc";
const LINE = "#cbd5e1";
const GREEN = "#1f7a45";
const RED = "#8b1e1e";
const MOVE_GREEN = "#17663a";

const freeApprovalWorkflow = {
  deliveryMode: DocumentDeliveryMode.APPROVAL_REQUIRED,
  approvalRequired: true,
  paymentRequired: false,
  paymentBeforeApproval: false,
  allowImmediateDownload: false,
  requiresAdminReview: true,
  releaseRequired: false,
  feeAmount: 0,
} as const;

const purposeFields = (): FreeDocumentTemplateField[] => [
  { key: "purpose", label: "Purpose", fieldType: DocumentFieldType.TEXTAREA, required: true },
  { key: "remarks", label: "Additional remarks", fieldType: DocumentFieldType.TEXTAREA, required: false },
];

const paymentCertificationFields = (): FreeDocumentTemplateField[] => [
  { key: "purpose", label: "Purpose of certification", fieldType: DocumentFieldType.TEXTAREA, required: true },
  { key: "remarks", label: "Payment / receipt details to certify", fieldType: DocumentFieldType.TEXTAREA, required: false },
];

const bondCertificationFields = (): FreeDocumentTemplateField[] => [
  { key: "purpose", label: "Purpose / project summary", fieldType: DocumentFieldType.TEXTAREA, required: true },
  { key: "representativeName", label: "Contractor / representative", fieldType: DocumentFieldType.TEXT, required: false },
  { key: "destination", label: "Project location", fieldType: DocumentFieldType.TEXT, required: false },
  { key: "remarks", label: "Contractor / bond details", fieldType: DocumentFieldType.TEXTAREA, required: false },
];

const gatePassFields = (): FreeDocumentTemplateField[] => [
  { key: "purpose", label: "Purpose / reason", fieldType: DocumentFieldType.TEXTAREA, required: true },
  { key: "scheduledDate", label: "Scheduled date", fieldType: DocumentFieldType.DATE, required: true },
  { key: "startTime", label: "Start time", fieldType: DocumentFieldType.TEXT, required: true },
  { key: "endTime", label: "End time", fieldType: DocumentFieldType.TEXT, required: true },
  { key: "representativeName", label: "Visitor / driver / representative", fieldType: DocumentFieldType.TEXT, required: true },
  { key: "vehicleDetails", label: "Vehicle details", fieldType: DocumentFieldType.TEXTAREA, required: false },
  { key: "destination", label: "Destination / gate", fieldType: DocumentFieldType.TEXT, required: false },
  { key: "remarks", label: "Remarks", fieldType: DocumentFieldType.TEXTAREA, required: false },
];

const movePassFields = (kind: "MOVE_IN" | "MOVE_OUT"): FreeDocumentTemplateField[] => [
  { key: "passType", label: "Pass type", fieldType: DocumentFieldType.SELECT, required: true, options: [kind], defaultValue: kind },
  { key: "purpose", label: "Purpose / reason", fieldType: DocumentFieldType.TEXTAREA, required: true },
  { key: "scheduledDate", label: kind === "MOVE_IN" ? "Move-in date" : "Move-out date", fieldType: DocumentFieldType.DATE, required: true },
  { key: "startTime", label: "Start time", fieldType: DocumentFieldType.TEXT, required: true },
  { key: "endTime", label: "End time", fieldType: DocumentFieldType.TEXT, required: true },
  { key: "representativeName", label: "Representative", fieldType: DocumentFieldType.TEXT, required: false },
  { key: "contractorDetails", label: "Moving company / service provider", fieldType: DocumentFieldType.TEXT, required: false },
  { key: "vehicleDetails", label: "Vehicle details", fieldType: DocumentFieldType.TEXTAREA, required: false },
  { key: "items", label: "Items / materials summary", fieldType: DocumentFieldType.TEXTAREA, required: true },
  { key: "remarks", label: "Conditions / remarks", fieldType: DocumentFieldType.TEXTAREA, required: false },
];

const workPermitFields = (): FreeDocumentTemplateField[] => [
  { key: "purpose", label: "Project / scope of work", fieldType: DocumentFieldType.TEXTAREA, required: true },
  { key: "scheduledDate", label: "Approved work date", fieldType: DocumentFieldType.DATE, required: true },
  { key: "startTime", label: "Approved start time", fieldType: DocumentFieldType.TEXT, required: true },
  { key: "endTime", label: "Approved end time", fieldType: DocumentFieldType.TEXT, required: true },
  { key: "representativeName", label: "Contractor / work lead", fieldType: DocumentFieldType.TEXT, required: true },
  { key: "destination", label: "Work location / area", fieldType: DocumentFieldType.TEXT, required: true },
  { key: "vehicleDetails", label: "Vehicle / access details", fieldType: DocumentFieldType.TEXTAREA, required: false },
  { key: "items", label: "Tools / materials summary", fieldType: DocumentFieldType.TEXTAREA, required: false },
  { key: "remarks", label: "Safety / permit conditions", fieldType: DocumentFieldType.TEXTAREA, required: false },
];

function cloneTemplate(value: DocumentTemplateDefinition): DocumentTemplateDefinition {
  return JSON.parse(JSON.stringify(value)) as DocumentTemplateDefinition;
}

function newTemplate(title: string, watermarkText = ""): DocumentTemplateDefinition {
  const template = cloneTemplate(defaultTemplateDefinition(title));
  template.page.marginPreset = "custom";
  template.page.margins = { top: 5, right: 5, bottom: 5, left: 5 };
  template.page.padding = { top: 0, right: 0, bottom: 0, left: 0 };
  template.page.headerHeightMm = 0;
  template.page.footerHeightMm = 0;
  template.page.showHeaderBoundary = false;
  template.page.showFooterBoundary = false;
  template.page.headerDistance = 0;
  template.page.footerDistance = 0;
  template.page.border = { enabled: true, style: "solid", width: 0.8, color: GOLD };
  template.page.backgroundColor = "#ffffff";
  template.page.backgroundOpacity = 1;
  template.page.watermark = {
    enabled: Boolean(watermarkText),
    text: watermarkText,
    opacity: 0.035,
    fontSize: 38,
    position: "center",
    rotation: -28,
  };
  template.page.canvas = {
    gridSize: 1,
    snapToGrid: true,
    showGrid: false,
    showRulers: false,
    showMarginGuides: false,
    showCenterGuides: true,
  };
  template.page.guides = { horizontal: [], vertical: [] };
  template.page.safeArea = {
    showBoundary: false,
    showNonPrintableArea: false,
    warnOnOverflow: false,
    minimumMarginMm: 5,
  };
  return template;
}

function finalizeTemplate(
  template: DocumentTemplateDefinition,
  sections: DocumentTemplateDefinition["sections"],
  revisionNote: string,
): DocumentTemplateDefinition {
  template.sections = sections;
  template.blocks = [...sections.header, ...sections.body, ...sections.footer];
  template.meta = {
    editor: "professional-document-editor",
    revisionNote,
    requiresSignatory: false,
  };
  return template;
}

function logoBlock(id: string, x: number, y: number, width = 24, height = 24): DocumentTemplateBlock {
  return {
    id,
    section: "header",
    type: "logo",
    binding: "tenant.logo",
    content: "{{tenant.logo}}",
    order: 10,
    visible: true,
    required: false,
    position: { x, y, width, height, zIndex: 30 },
    style: { align: "center", borderColor: GOLD, borderWidth: 1, radius: 3, padding: 1 },
    image: { fit: "contain", positionX: "center", positionY: "center", opacity: 1, lockAspectRatio: true },
  };
}

function qrBlock(id: string, section: "header" | "body" | "footer", x: number, y: number, size: number, label = "SCAN TO VERIFY"): DocumentTemplateBlock {
  return {
    id,
    section,
    type: "qrVerification",
    binding: "verification.url",
    content: "{{verification.url}}",
    order: 900,
    visible: true,
    required: false,
    position: { x, y, width: size, height: size, zIndex: 40 },
    style: { align: "center", borderColor: LINE, borderWidth: 0.6, padding: 1 },
    qr: { ...defaultQrConfig, label, instruction: "Verify this document online" },
  };
}

function legalHeader(variant: CertificateVariant): DocumentTemplateBlock[] {
  const showLeftBanner = ["RESIDENCY", "GOOD_STANDING", "CLEARANCE"].includes(variant);
  const header: DocumentTemplateBlock[] = [];

  if (showLeftBanner) {
    header.push(
      {
        id: "approved-left-banner",
        section: "header",
        type: "rectangle",
        order: 1,
        visible: true,
        position: { x: 8, y: 8, width: 34, height: 53, zIndex: 2 },
        style: { backgroundColor: NAVY, borderColor: GOLD, borderWidth: 1, radius: 1 },
      },
      {
        ...logoBlock("approved-banner-logo", 14, 13, 22, 22),
        order: 2,
      },
      {
        id: "approved-banner-label",
        section: "header",
        type: "text",
        content: "{{tenant.name}}\nOFFICIAL DOCUMENT",
        order: 3,
        visible: true,
        position: { x: 11, y: 38, width: 28, height: 18, zIndex: 20 },
        style: { align: "center", fontFamily: "Arial", fontSize: 7, fontWeight: "bold", textColor: "#ffffff", lineHeight: 1.1 },
      },
    );
  } else {
    header.push({ ...logoBlock("approved-header-logo", 12, 12, 25, 25), order: 2 });
  }

  header.push(
    {
      id: "approved-tenant-name",
      section: "header",
      type: "tenantName",
      content: "{{tenant.name}}",
      order: 10,
      visible: true,
      position: { x: 47, y: 12, width: 105, height: 8, zIndex: 20 },
      style: { align: "center", fontFamily: "Georgia", fontSize: 10.5, fontWeight: "bold", textColor: NAVY },
    },
    {
      id: "approved-tenant-address",
      section: "header",
      type: "address",
      content: "{{tenant.address}}",
      order: 20,
      visible: true,
      position: { x: 47, y: 21, width: 105, height: 6, zIndex: 20 },
      style: { align: "center", fontFamily: "Arial", fontSize: 7, textColor: SLATE },
    },
    {
      id: "approved-tenant-contact",
      section: "header",
      type: "text",
      content: "{{tenant.contactNumber}}  •  {{tenant.email}}",
      order: 30,
      visible: true,
      required: false,
      position: { x: 47, y: 28, width: 105, height: 5, zIndex: 20 },
      style: { align: "center", fontFamily: "Arial", fontSize: 7, textColor: SLATE },
    },
    {
      id: "approved-registration",
      section: "header",
      type: "text",
      content: "SEC {{tenant.secRegistration}}  •  TIN {{tenant.tin}}",
      order: 40,
      visible: true,
      required: false,
      position: { x: 47, y: 34, width: 105, height: 5, zIndex: 20 },
      style: { align: "center", fontFamily: "Arial", fontSize: 7, textColor: SLATE },
    },
    {
      id: "approved-meta-top",
      section: "header",
      type: "text",
      content: "CERTIFICATE NO.\n{{document.number}}\n\nISSUE DATE\n{{document.issueDate}}",
      order: 50,
      visible: true,
      position: { x: 158, y: 12, width: 38, height: 29, zIndex: 20 },
      style: { align: "center", fontFamily: "Arial", fontSize: 7, lineHeight: 1.15, fontWeight: "bold", textColor: NAVY },
    },
    {
      id: "approved-header-rule",
      section: "header",
      type: "horizontalLine",
      order: 60,
      visible: true,
      position: { x: 46, y: 44, width: 150, height: 1, zIndex: 15 },
      style: { lineColor: GOLD, lineWidth: 0.8, lineStyle: "solid", opacity: 1 },
    },
  );

  return header;
}

function certificateBody(variant: CertificateVariant): DocumentTemplateBlock[] {
  const titleByVariant: Record<CertificateVariant, string> = {
    RESIDENCY: "CERTIFICATE OF RESIDENCY",
    INDIGENCY: "CERTIFICATE OF INDIGENCY",
    GOOD_STANDING: "CERTIFICATE OF GOOD STANDING",
    CLEARANCE: "CLEARANCE CERTIFICATE",
    PAYMENT: "PAYMENT CERTIFICATION",
    CONSTRUCTION_BOND: "CONSTRUCTION BOND CERTIFICATION",
    CONTRACTOR_BOND: "CONTRACTOR BOND CERTIFICATION",
  };
  const body: DocumentTemplateBlock[] = [
    {
      id: "approved-cert-title",
      section: "body",
      type: "documentTitle",
      content: titleByVariant[variant],
      order: 10,
      visible: true,
      position: { x: 48, y: 50, width: 148, height: 15, zIndex: 20 },
      style: { align: "center", fontFamily: "Georgia", fontSize: variant === "RESIDENCY" ? 20 : 15.5, fontWeight: "bold", textColor: NAVY },
    },
  ];

  if (variant === "RESIDENCY") {
    body.push(
      {
        id: "residency-certify-label",
        section: "body",
        type: "text",
        content: "THIS IS TO CERTIFY THAT",
        order: 20,
        visible: true,
        position: { x: 48, y: 72, width: 148, height: 6, zIndex: 20 },
        style: { align: "center", fontFamily: "Arial", fontSize: 7, fontWeight: "bold", textColor: SLATE },
      },
      {
        id: "residency-name",
        section: "body",
        type: "text",
        content: "{{subject.fullName}}",
        order: 30,
        visible: true,
        position: { x: 48, y: 80, width: 148, height: 13, zIndex: 20 },
        style: { align: "center", fontFamily: "Georgia", fontSize: 16.5, fontWeight: "bold", textColor: NAVY },
      },
      {
        id: "residency-body",
        section: "body",
        type: "bodyText",
        content: "is a bona fide resident/homeowner of {{tenant.name}} and is currently residing at the property identified below, based on Association records reviewed as of {{document.issueDate}}.",
        order: 40,
        visible: true,
        position: { x: 52, y: 95, width: 140, height: 21, zIndex: 20 },
        style: { align: "center", fontFamily: "Times New Roman", fontSize: 9.5, lineHeight: 1.3, textColor: INK },
      },
      {
        id: "residency-panel",
        section: "body",
        type: "rectangle",
        order: 50,
        visible: true,
        position: { x: 48, y: 121, width: 148, height: 39, zIndex: 4 },
        style: { backgroundColor: LIGHT, borderColor: GOLD, borderWidth: 0.8, radius: 2 },
      },
      {
        id: "residency-panel-title",
        section: "body",
        type: "textBox",
        content: "RESIDENCE INFORMATION",
        order: 51,
        visible: true,
        position: { x: 48, y: 121, width: 148, height: 8, zIndex: 10 },
        style: { align: "center", fontFamily: "Arial", fontSize: 7.5, fontWeight: "bold", textColor: "#ffffff", backgroundColor: NAVY, borderColor: NAVY, borderWidth: 0.5, padding: 2 },
      },
      {
        id: "residency-panel-content",
        section: "body",
        type: "text",
        content: "{{property.address}}\nAccount / Unit: {{property.accountNumber}}\nBlock {{property.block}} • Lot {{property.lot}} • {{property.phase}}",
        order: 52,
        visible: true,
        position: { x: 63, y: 133, width: 120, height: 23, zIndex: 20 },
        style: { fontFamily: "Arial", fontSize: 8.8, lineHeight: 1.35, fontWeight: "bold", textColor: INK },
      },
      {
        id: "residency-purpose",
        section: "body",
        type: "paragraph",
        content: "This certification is issued upon request for {{request.purpose}} and for whatever lawful purpose it may serve.",
        order: 60,
        visible: true,
        position: { x: 52, y: 169, width: 140, height: 22, zIndex: 20 },
        style: { align: "center", fontFamily: "Times New Roman", fontSize: 9, lineHeight: 1.35, textColor: INK },
      },
    );
  }

  if (variant === "INDIGENCY") {
    body.push(
      {
        id: "indigency-salutation",
        section: "body",
        type: "heading",
        content: "TO WHOM IT MAY CONCERN:",
        order: 20,
        visible: true,
        position: { x: 37, y: 72, width: 159, height: 7, zIndex: 20 },
        style: { fontFamily: "Georgia", fontSize: 9.5, fontWeight: "bold", textColor: NAVY },
      },
      {
        id: "indigency-body",
        section: "body",
        type: "bodyText",
        content: "This is to certify that after careful evaluation of the Association records and the request presented through the configured workflow, the following resident is the subject of an approved indigency certification:",
        order: 30,
        visible: true,
        position: { x: 37, y: 82, width: 159, height: 31, zIndex: 20 },
        style: { align: "justify", fontFamily: "Times New Roman", fontSize: 9.5, lineHeight: 1.35, textColor: INK },
      },
      {
        id: "indigency-name",
        section: "body",
        type: "text",
        content: "{{subject.fullName}}",
        order: 40,
        visible: true,
        position: { x: 37, y: 116, width: 159, height: 12, zIndex: 20 },
        style: { align: "center", fontFamily: "Georgia", fontSize: 15, fontWeight: "bold", textColor: INK },
      },
      {
        id: "indigency-detail",
        section: "body",
        type: "paragraph",
        content: "Residence: {{property.address}}\nPurpose: {{request.purpose}}\nRemarks: {{request.remarks}}",
        order: 50,
        visible: true,
        position: { x: 37, y: 131, width: 159, height: 30, zIndex: 20 },
        style: { align: "center", fontFamily: "Times New Roman", fontSize: 9, lineHeight: 1.3, textColor: INK },
      },
      {
        id: "indigency-validity-panel",
        section: "body",
        type: "textBox",
        content: "RESIDENCE\n{{property.address}}     •     DATE ISSUED {{document.issueDate}}\nACCOUNT {{property.accountNumber}}     •     VALID UNTIL {{document.validUntil}}",
        order: 60,
        visible: true,
        position: { x: 37, y: 168, width: 159, height: 31, zIndex: 20 },
        style: { fontFamily: "Arial", fontSize: 7.7, lineHeight: 1.35, textColor: NAVY, backgroundColor: LIGHT, borderColor: GOLD, borderWidth: 0.7, radius: 2, padding: 4 },
      },
    );
  }

  if (variant === "GOOD_STANDING") {
    body.push(
      {
        id: "standing-name",
        section: "body",
        type: "text",
        content: "{{subject.fullName}}",
        order: 20,
        visible: true,
        position: { x: 48, y: 73, width: 148, height: 11, zIndex: 20 },
        style: { align: "center", fontFamily: "Georgia", fontSize: 14.5, fontWeight: "bold", textColor: NAVY },
      },
      {
        id: "standing-body",
        section: "body",
        type: "paragraph",
        content: "is recorded by {{tenant.name}} as a member in good standing for the purpose of this certification as of {{document.issueDate}}, subject to the Association's account, membership, and release policies.",
        order: 30,
        visible: true,
        position: { x: 51, y: 86, width: 142, height: 24, zIndex: 20 },
        style: { align: "center", fontFamily: "Times New Roman", fontSize: 9, lineHeight: 1.3, textColor: INK },
      },
      {
        id: "standing-banner",
        section: "body",
        type: "rectangle",
        order: 40,
        visible: true,
        position: { x: 45, y: 117, width: 151, height: 34, zIndex: 4 },
        style: { backgroundColor: NAVY, borderColor: GOLD, borderWidth: 1.2, radius: 2 },
      },
      {
        id: "standing-banner-text",
        section: "body",
        type: "text",
        content: "GOOD STANDING",
        order: 41,
        visible: true,
        position: { x: 54, y: 126, width: 133, height: 16, zIndex: 20 },
        style: { align: "center", fontFamily: "Georgia", fontSize: 20, fontWeight: "bold", textColor: "#ffffff" },
      },
      {
        id: "standing-validity",
        section: "body",
        type: "textBox",
        content: "VALIDITY PERIOD\n{{document.issueDate}} TO {{document.validUntil}}     •     MEMBERSHIP / ACCOUNT {{property.accountNumber}}\nPROPERTY {{property.address}}",
        order: 50,
        visible: true,
        position: { x: 45, y: 159, width: 151, height: 34, zIndex: 20 },
        style: { fontFamily: "Arial", fontSize: 7.7, lineHeight: 1.35, textColor: NAVY, backgroundColor: "#fffdf8", borderColor: GOLD, borderWidth: 0.7, radius: 2, padding: 4 },
      },
    );
  }

  if (variant === "CLEARANCE") {
    body.push(
      {
        id: "clearance-name",
        section: "body",
        type: "text",
        content: "{{subject.fullName}}",
        order: 20,
        visible: true,
        position: { x: 48, y: 73, width: 148, height: 11, zIndex: 20 },
        style: { align: "center", fontFamily: "Georgia", fontSize: 14, fontWeight: "bold", textColor: NAVY },
      },
      {
        id: "clearance-summary",
        section: "body",
        type: "paragraph",
        content: "has been cleared for the approved purpose based on Association records reviewed as of {{document.issueDate}}, subject to the tenant's configured clearance policies.",
        order: 30,
        visible: true,
        position: { x: 48, y: 86, width: 148, height: 21, zIndex: 20 },
        style: { align: "center", fontFamily: "Times New Roman", fontSize: 9, lineHeight: 1.3, textColor: INK },
      },
      {
        id: "clearance-banner",
        section: "body",
        type: "textBox",
        content: "CLEARED\nNO OUTSTANDING OBLIGATIONS",
        order: 40,
        visible: true,
        position: { x: 45, y: 113, width: 92, height: 33, zIndex: 20 },
        style: { align: "center", fontFamily: "Georgia", fontSize: 13, lineHeight: 1.25, fontWeight: "bold", textColor: "#ffffff", backgroundColor: GREEN, borderColor: GOLD, borderWidth: 1, radius: 3, padding: 4 },
      },
      {
        id: "clearance-scope",
        section: "body",
        type: "textBox",
        content: "CLEARANCE SCOPE\n• Regular assessments\n• Special assessments\n• Fines and penalties\n• Utilities / other charges\n• Architectural / compliance fees",
        order: 41,
        visible: true,
        position: { x: 143, y: 113, width: 53, height: 54, zIndex: 20 },
        style: { fontFamily: "Arial", fontSize: 7, lineHeight: 1.28, textColor: INK, backgroundColor: "#fffdf8", borderColor: GOLD, borderWidth: 0.7, radius: 2, padding: 3 },
      },
      {
        id: "clearance-property",
        section: "body",
        type: "textBox",
        content: "PROPERTY / ACCOUNT INFORMATION\nUnit / Lot: {{property.accountLabel}}\nProperty: {{property.address}}\nAccount No.: {{property.accountNumber}}\nDate Cleared: {{document.issueDate}}",
        order: 50,
        visible: true,
        position: { x: 45, y: 153, width: 92, height: 45, zIndex: 20 },
        style: { fontFamily: "Arial", fontSize: 7.1, lineHeight: 1.3, textColor: INK, backgroundColor: LIGHT, borderColor: LINE, borderWidth: 0.7, radius: 2, padding: 3 },
      },
    );
  }

  if (variant === "PAYMENT") {
    body.push(
      {
        id: "payment-summary",
        section: "body",
        type: "paragraph",
        content: "This is to certify that the amounts and payment records approved for release by {{tenant.name}} for {{subject.fullName}} are summarized below.",
        order: 20,
        visible: true,
        position: { x: 33, y: 72, width: 163, height: 18, zIndex: 20 },
        style: { align: "center", fontFamily: "Times New Roman", fontSize: 9, lineHeight: 1.3, textColor: INK },
      },
      {
        id: "payment-account",
        section: "body",
        type: "textBox",
        content: "ACCOUNT / MEMBER INFORMATION\nMember / Account Name: {{subject.fullName}}\nAccount No.: {{property.accountNumber}}\nProperty / Unit: {{property.address}}",
        order: 30,
        visible: true,
        position: { x: 33, y: 94, width: 163, height: 32, zIndex: 20 },
        style: { fontFamily: "Arial", fontSize: 7.5, lineHeight: 1.3, textColor: INK, backgroundColor: LIGHT, borderColor: LINE, borderWidth: 0.7, radius: 1, padding: 3 },
      },
      {
        id: "payment-details",
        section: "body",
        type: "textBox",
        content: "PAYMENT / RECEIPT DETAILS\n{{request.remarks}}",
        order: 40,
        visible: true,
        position: { x: 33, y: 131, width: 163, height: 55, zIndex: 20 },
        style: { fontFamily: "Arial", fontSize: 7.7, lineHeight: 1.3, textColor: INK, backgroundColor: "#ffffff", borderColor: NAVY, borderWidth: 0.8, radius: 1, padding: 4 },
      },
      {
        id: "payment-total",
        section: "body",
        type: "textBox",
        content: "TOTAL CERTIFIED AMOUNT\nSee certified payment / receipt details above",
        order: 50,
        visible: true,
        position: { x: 33, y: 193, width: 76, height: 34, zIndex: 20 },
        style: { align: "center", fontFamily: "Georgia", fontSize: 11, lineHeight: 1.3, fontWeight: "bold", textColor: NAVY, backgroundColor: "#fffdf8", borderColor: GOLD, borderWidth: 0.8, radius: 2, padding: 4 },
      },
    );
  }

  if (variant === "CONSTRUCTION_BOND") {
    body.push(
      {
        id: "construction-summary",
        section: "body",
        type: "paragraph",
        content: "This is to certify that the performance and payment bond record for the approved project below has been reviewed and is recorded through the Association's configured workflow.",
        order: 20,
        visible: true,
        position: { x: 30, y: 72, width: 166, height: 22, zIndex: 20 },
        style: { align: "center", fontFamily: "Times New Roman", fontSize: 8.7, lineHeight: 1.3, textColor: INK },
      },
      {
        id: "construction-project",
        section: "body",
        type: "textBox",
        content: "PROJECT INFORMATION\nProject / Scope: {{request.purpose}}\nLocation: {{request.destination}}\nProperty: {{property.address}}\nAccount: {{property.accountNumber}}\nDate Approved: {{request.approvalDate}}",
        order: 30,
        visible: true,
        position: { x: 30, y: 101, width: 51, height: 83, zIndex: 20 },
        style: { fontFamily: "Arial", fontSize: 7, lineHeight: 1.25, textColor: INK, backgroundColor: LIGHT, borderColor: LINE, borderWidth: 0.7, radius: 2, padding: 3 },
      },
      {
        id: "construction-contractor",
        section: "body",
        type: "textBox",
        content: "CONTRACTOR INFORMATION\nRepresentative: {{request.representativeName}}\nService Provider: {{request.serviceProvider}}\nResident / Owner: {{subject.fullName}}\nContact: {{subject.contactNumber}}",
        order: 40,
        visible: true,
        position: { x: 85, y: 101, width: 51, height: 83, zIndex: 20 },
        style: { fontFamily: "Arial", fontSize: 7, lineHeight: 1.25, textColor: INK, backgroundColor: LIGHT, borderColor: LINE, borderWidth: 0.7, radius: 2, padding: 3 },
      },
      {
        id: "construction-bond",
        section: "body",
        type: "textBox",
        content: "BOND INFORMATION\n{{request.remarks}}\n\nThis certification does not independently authorize release, refund, or forfeiture of bond amounts.",
        order: 50,
        visible: true,
        position: { x: 140, y: 101, width: 56, height: 83, zIndex: 20 },
        style: { fontFamily: "Arial", fontSize: 7, lineHeight: 1.25, textColor: INK, backgroundColor: "#fffdf8", borderColor: GOLD, borderWidth: 0.7, radius: 2, padding: 3 },
      },
    );
  }

  if (variant === "CONTRACTOR_BOND") {
    body.push(
      {
        id: "contractor-summary",
        section: "body",
        type: "paragraph",
        content: "This certifies that the contractor listed below is recorded as compliant with the Association's contractor requirements and maintains the bond record approved through the configured workflow.",
        order: 20,
        visible: true,
        position: { x: 30, y: 72, width: 166, height: 22, zIndex: 20 },
        style: { align: "center", fontFamily: "Times New Roman", fontSize: 8.8, lineHeight: 1.3, textColor: INK },
      },
      {
        id: "contractor-info",
        section: "body",
        type: "textBox",
        content: "CONTRACTOR INFORMATION\nCompany / Representative: {{request.representativeName}}\nProject / Property: {{property.address}}\nResident / Account: {{subject.fullName}} / {{property.accountNumber}}\nPurpose: {{request.purpose}}",
        order: 30,
        visible: true,
        position: { x: 30, y: 101, width: 78, height: 84, zIndex: 20 },
        style: { fontFamily: "Arial", fontSize: 7.2, lineHeight: 1.3, textColor: INK, backgroundColor: LIGHT, borderColor: LINE, borderWidth: 0.7, radius: 2, padding: 4 },
      },
      {
        id: "contractor-bond-status",
        section: "body",
        type: "textBox",
        content: "BOND STATUS\nACTIVE\nBond is active and in good standing.\n\n{{request.remarks}}",
        order: 40,
        visible: true,
        position: { x: 114, y: 101, width: 82, height: 84, zIndex: 20 },
        style: { align: "center", fontFamily: "Arial", fontSize: 8.2, lineHeight: 1.3, fontWeight: "bold", textColor: GREEN, backgroundColor: "#f4fbf6", borderColor: GREEN, borderWidth: 0.9, radius: 3, padding: 5 },
      },
    );
  }

  return body;
}

function certificateFooter(variant: CertificateVariant): DocumentTemplateBlock[] {
  const bodyStart = variant === "PAYMENT" ? 233 : variant === "CONSTRUCTION_BOND" || variant === "CONTRACTOR_BOND" ? 198 : 206;
  return [
    {
      id: "approved-seal",
      section: "footer",
      type: "textBox",
      content: "HOA\nSEAL",
      order: 10,
      visible: true,
      required: false,
      position: { x: 17, y: bodyStart, width: 27, height: 27, zIndex: 20 },
      style: { align: "center", fontFamily: "Georgia", fontSize: 7, lineHeight: 1.1, fontWeight: "bold", textColor: NAVY, backgroundColor: GOLD_SOFT, borderColor: GOLD, borderWidth: 1, radius: 13, padding: 5 },
    },
    {
      id: "approved-sign-line",
      section: "footer",
      type: "horizontalLine",
      order: 20,
      visible: true,
      required: false,
      position: { x: 63, y: bodyStart + 14, width: 54, height: 1, zIndex: 20 },
      style: { lineColor: NAVY, lineWidth: 0.7, lineStyle: "solid", opacity: 1 },
    },
    {
      id: "approved-signatory",
      section: "footer",
      type: "signatory",
      content: "{{signatory.name}}\n{{signatory.position}}",
      order: 30,
      visible: true,
      required: false,
      position: { x: 56, y: bodyStart + 17, width: 69, height: 19, zIndex: 20 },
      style: { align: "center", fontFamily: "Times New Roman", fontSize: 8.8, lineHeight: 1.12, fontWeight: "bold", textColor: NAVY },
    },
    qrBlock("approved-footer-qr", "footer", 132, bodyStart + 2, 27, "VERIFY THIS DOCUMENT"),
    {
      id: "approved-verify-text",
      section: "footer",
      type: "verificationText",
      content: "VERIFY THIS DOCUMENT\n{{verification.code}}",
      order: 50,
      visible: true,
      required: false,
      position: { x: 161, y: bodyStart + 8, width: 35, height: 15, zIndex: 20 },
      style: { fontFamily: "Arial", fontSize: 7, lineHeight: 1.2, fontWeight: "bold", textColor: NAVY },
    },
    {
      id: "approved-footer-bar",
      section: "footer",
      type: "textBox",
      content: "THIS DOCUMENT IS SYSTEM-GENERATED AND DIGITALLY VERIFIED.",
      order: 60,
      visible: true,
      position: { x: 8, y: 281, width: 194, height: 8, zIndex: 30 },
      style: { align: "center", fontFamily: "Arial", fontSize: 7, fontWeight: "bold", textColor: "#ffffff", backgroundColor: NAVY, borderColor: NAVY, borderWidth: 0.5, padding: 2 },
    },
  ];
}

function approvedCertificateTemplate(variant: CertificateVariant): DocumentTemplateDefinition {
  const title: Record<CertificateVariant, string> = {
    RESIDENCY: "CERTIFICATE OF RESIDENCY",
    INDIGENCY: "CERTIFICATE OF INDIGENCY",
    GOOD_STANDING: "CERTIFICATE OF GOOD STANDING",
    CLEARANCE: "CLEARANCE CERTIFICATE",
    PAYMENT: "PAYMENT CERTIFICATION",
    CONSTRUCTION_BOND: "CONSTRUCTION BOND CERTIFICATION",
    CONTRACTOR_BOND: "CONTRACTOR BOND CERTIFICATION",
  };
  const template = newTemplate(title[variant], variant.replaceAll("_", " "));
  return finalizeTemplate(
    template,
    {
      header: legalHeader(variant),
      body: certificateBody(variant),
      footer: certificateFooter(variant),
    },
    `HOAHub Approved Professional Document Mockups Set 1/2 • ${title[variant]} • Library v${FREE_DOCUMENT_LIBRARY_VERSION}`,
  );
}

function copyY(copyIndex: 0 | 1) {
  return copyIndex === 0 ? 0 : 148.5;
}

function passAccent(kind: PassKind) {
  if (kind === "MOVE_IN") return MOVE_GREEN;
  if (kind === "MOVE_OUT") return RED;
  return NAVY;
}

function passCopyBlocks(kind: PassKind, copyIndex: 0 | 1): DocumentTemplateBlock[] {
  const y0 = copyY(copyIndex);
  const accent = passAccent(kind);
  const title = kind === "GATE" ? "GATE PASS" : kind === "MOVE_IN" ? "MOVE-IN PASS" : "MOVE-OUT PASS";
  const copyLabel = copyIndex === 0 ? "HOLDER COPY • PRESENT TO SECURITY" : "SECURITY COPY • RETAIN";
  const idPrefix = `${kind.toLowerCase()}-${copyIndex === 0 ? "holder" : "security"}`;
  const passNoLabel = kind === "GATE" ? "GP" : kind === "MOVE_IN" ? "MI" : "MO";

  const blocks: DocumentTemplateBlock[] = [
    {
      id: `${idPrefix}-topbar`, section: "body", type: "textBox", order: 10, visible: true,
      content: `${copyLabel}                                      DATE ISSUED: {{document.issueDate}}`,
      position: { x: 8, y: y0 + 6, width: 194, height: 6.5, zIndex: 25 },
      style: { align: "center", fontFamily: "Arial", fontSize: 5.6, fontWeight: "bold", textColor: "#ffffff", backgroundColor: accent, borderColor: accent, borderWidth: 0.5, padding: 1.5 },
    },
    {
      id: `${idPrefix}-logo`, section: "body", type: "logo", binding: "tenant.logo", content: "{{tenant.logo}}", order: 20, visible: true, required: false,
      position: { x: 12, y: y0 + 17, width: 23, height: 23, zIndex: 30 },
      style: { align: "center", borderColor: LINE, borderWidth: 0.7, radius: 3, padding: 1 },
      image: { fit: "contain", positionX: "center", positionY: "center", opacity: 1, lockAspectRatio: true },
    },
    {
      id: `${idPrefix}-tenant`, section: "body", type: "text", order: 30, visible: true,
      content: "{{tenant.name}}\n{{tenant.address}}",
      position: { x: 38, y: y0 + 18, width: 45, height: 18, zIndex: 20 },
      style: { fontFamily: "Arial", fontSize: 7, lineHeight: 1.15, fontWeight: "bold", textColor: NAVY },
    },
    {
      id: `${idPrefix}-title`, section: "body", type: "documentTitle", order: 40, visible: true,
      content: `${title}\n${passNoLabel}-{{document.number}}`,
      position: { x: 80, y: y0 + 17, width: 75, height: 22, zIndex: 20 },
      style: { align: "center", fontFamily: "Arial", fontSize: 12.5, lineHeight: 1.15, fontWeight: "bold", textColor: accent },
    },
    qrBlock(`${idPrefix}-qr`, "body", 166, y0 + 16, 28, "SCAN TO VERIFY"),
  ];

  if (kind === "GATE") {
    blocks.push(
      {
        id: `${idPrefix}-visitor`, section: "body", type: "textBox", order: 60, visible: true,
        content: "VISITOR INFORMATION\nName: {{request.representativeName}}\nPurpose: {{request.purpose}}\nContact: {{subject.contactNumber}}\nHost / Resident: {{subject.fullName}}",
        position: { x: 12, y: y0 + 48, width: 80, height: 43, zIndex: 20 },
        style: { fontFamily: "Arial", fontSize: 6.5, lineHeight: 1.25, textColor: INK, backgroundColor: LIGHT, borderColor: LINE, borderWidth: 0.7, radius: 2, padding: 3 },
      },
      {
        id: `${idPrefix}-vehicle`, section: "body", type: "textBox", order: 70, visible: true,
        content: "VEHICLE INFORMATION\n{{request.vehicleDetails}}\n\nDestination / Gate: {{request.destination}}",
        position: { x: 97, y: y0 + 48, width: 60, height: 43, zIndex: 20 },
        style: { fontFamily: "Arial", fontSize: 6.5, lineHeight: 1.25, textColor: INK, backgroundColor: LIGHT, borderColor: LINE, borderWidth: 0.7, radius: 2, padding: 3 },
      },
    );
  } else {
    blocks.push(
      {
        id: `${idPrefix}-resident`, section: "body", type: "textBox", order: 60, visible: true,
        content: "RESIDENT INFORMATION\nName: {{subject.fullName}}\nUnit / Address: {{property.address}}\nPhone: {{subject.contactNumber}}",
        position: { x: 12, y: y0 + 46, width: 59, height: 36, zIndex: 20 },
        style: { fontFamily: "Arial", fontSize: 6.2, lineHeight: 1.23, textColor: INK, backgroundColor: LIGHT, borderColor: LINE, borderWidth: 0.7, radius: 2, padding: 3 },
      },
      {
        id: `${idPrefix}-move-details`, section: "body", type: "textBox", order: 70, visible: true,
        content: `${kind === "MOVE_IN" ? "MOVE-IN" : "MOVE-OUT"} DETAILS\nDate: {{request.scheduledDate}}\nTime: {{request.startTime}} – {{request.endTime}}\nCoordinator: {{request.representativeName}}`,
        position: { x: 75, y: y0 + 46, width: 57, height: 36, zIndex: 20 },
        style: { fontFamily: "Arial", fontSize: 6.2, lineHeight: 1.23, textColor: INK, backgroundColor: LIGHT, borderColor: LINE, borderWidth: 0.7, radius: 2, padding: 3 },
      },
      {
        id: `${idPrefix}-conditions`, section: "body", type: "textBox", order: 80, visible: true,
        content: "CONDITIONS\n• Follow approved schedule\n• Use service elevator only\n• Protect floors and walls\n• No overnight parking\n{{request.remarks}}",
        position: { x: 136, y: y0 + 46, width: 58, height: 46, zIndex: 20 },
        style: { fontFamily: "Arial", fontSize: 5.9, lineHeight: 1.2, textColor: INK, backgroundColor: "#fffdf8", borderColor: GOLD, borderWidth: 0.7, radius: 2, padding: 3 },
      },
      {
        id: `${idPrefix}-mover`, section: "body", type: "textBox", order: 90, visible: true,
        content: "MOVER INFORMATION\nCompany / Provider: {{request.serviceProvider}}\nRepresentative: {{request.representativeName}}\nItems: {{request.itemsSummary}}",
        position: { x: 12, y: y0 + 86, width: 82, height: 31, zIndex: 20 },
        style: { fontFamily: "Arial", fontSize: 5.9, lineHeight: 1.18, textColor: INK, backgroundColor: LIGHT, borderColor: LINE, borderWidth: 0.7, radius: 2, padding: 3 },
      },
      {
        id: `${idPrefix}-move-vehicle`, section: "body", type: "textBox", order: 100, visible: true,
        content: "VEHICLE INFORMATION\n{{request.vehicleDetails}}",
        position: { x: 98, y: y0 + 86, width: 34, height: 31, zIndex: 20 },
        style: { fontFamily: "Arial", fontSize: 5.8, lineHeight: 1.18, textColor: INK, backgroundColor: LIGHT, borderColor: LINE, borderWidth: 0.7, radius: 2, padding: 3 },
      },
    );
  }

  blocks.push(
    {
      id: `${idPrefix}-validity`, section: "body", type: "textBox", order: 120, visible: true,
      content: `VALID ON: {{request.scheduledDate}}     •     VALID TIME: {{request.startTime}} – {{request.endTime}}     •     ONE-TIME ENTRY ONLY`,
      position: { x: 12, y: y0 + 122, width: 182, height: 9, zIndex: 20 },
      style: { align: "center", fontFamily: "Arial", fontSize: 6.2, fontWeight: "bold", textColor: accent, backgroundColor: "#ffffff", borderColor: LINE, borderWidth: 0.7, radius: 1, padding: 2 },
    },
  );

  return blocks;
}

function approvedPassTemplate(kind: PassKind): DocumentTemplateDefinition {
  const title = kind === "GATE" ? "GATE PASS" : kind === "MOVE_IN" ? "MOVE-IN PASS" : "MOVE-OUT PASS";
  const template = newTemplate(title);
  template.page.border = { enabled: false, style: "solid", width: 0.8, color: passAccent(kind) };
  template.page.guides = { horizontal: [{ positionMm: 148.5, label: "CUT LINE" }], vertical: [] };
  const body = [...passCopyBlocks(kind, 0), ...passCopyBlocks(kind, 1)];
  body.push({
    id: `${kind.toLowerCase()}-cut-line`, section: "body", type: "horizontalLine", order: 999, visible: true,
    position: { x: 7, y: 148, width: 196, height: 1, zIndex: 50 },
    style: { lineColor: passAccent(kind), lineWidth: 0.8, lineStyle: "dashed", opacity: 1 },
  });
  return finalizeTemplate(
    template,
    { header: [], body, footer: [] },
    `HOAHub Approved Professional Document Mockups Set 2 • ${title} Two-Copy A4 • Library v${FREE_DOCUMENT_LIBRARY_VERSION}`,
  );
}

function approvedWorkPermitTemplate(): DocumentTemplateDefinition {
  const template = newTemplate("WORK PERMIT");
  const header: DocumentTemplateBlock[] = [
    {
      id: "work-header-band", section: "header", type: "rectangle", order: 1, visible: true,
      position: { x: 8, y: 8, width: 194, height: 36, zIndex: 2 },
      style: { backgroundColor: NAVY, borderColor: GOLD, borderWidth: 1, radius: 2 },
    },
    { ...logoBlock("work-logo", 13, 14, 24, 24), order: 2 },
    {
      id: "work-tenant", section: "header", type: "text", order: 3, visible: true,
      content: "{{tenant.name}}\n{{tenant.address}}",
      position: { x: 41, y: 15, width: 45, height: 19, zIndex: 20 },
      style: { fontFamily: "Arial", fontSize: 7, lineHeight: 1.15, fontWeight: "bold", textColor: GOLD },
    },
    {
      id: "work-title", section: "header", type: "documentTitle", order: 4, visible: true,
      content: "WORK PERMIT\nPERMIT NO. {{document.number}}",
      position: { x: 84, y: 14, width: 75, height: 22, zIndex: 20 },
      style: { align: "center", fontFamily: "Georgia", fontSize: 14, lineHeight: 1.2, fontWeight: "bold", textColor: "#ffffff" },
    },
    {
      id: "work-approved", section: "header", type: "textBox", order: 5, visible: true,
      content: "APPROVED",
      position: { x: 165, y: 16, width: 31, height: 10, zIndex: 20 },
      style: { align: "center", fontFamily: "Arial", fontSize: 7.5, fontWeight: "bold", textColor: "#ffffff", backgroundColor: GREEN, borderColor: "#ffffff", borderWidth: 0.7, radius: 5, padding: 2 },
    },
  ];

  const body: DocumentTemplateBlock[] = [
    {
      id: "work-contractor", section: "body", type: "textBox", order: 10, visible: true,
      content: "CONTRACTOR / WORKER INFORMATION\nCompany / Lead: {{request.representativeName}}\nResident / Account: {{subject.fullName}} / {{property.accountNumber}}\nContact: {{subject.contactNumber}}\nVehicle / Access: {{request.vehicleDetails}}",
      position: { x: 12, y: 51, width: 88, height: 67, zIndex: 20 },
      style: { fontFamily: "Arial", fontSize: 7.2, lineHeight: 1.3, textColor: INK, backgroundColor: LIGHT, borderColor: LINE, borderWidth: 0.7, radius: 2, padding: 4 },
    },
    {
      id: "work-project", section: "body", type: "textBox", order: 20, visible: true,
      content: "PROJECT / SCOPE OF WORK\nLocation: {{request.destination}}\n\nDescription:\n{{request.purpose}}\n\nSpecial Instructions:\n{{request.remarks}}",
      position: { x: 105, y: 51, width: 64, height: 67, zIndex: 20 },
      style: { fontFamily: "Arial", fontSize: 7.2, lineHeight: 1.25, textColor: INK, backgroundColor: LIGHT, borderColor: LINE, borderWidth: 0.7, radius: 2, padding: 4 },
    },
    qrBlock("work-qr", "body", 174, 58, 25, "SCAN TO VERIFY"),
    {
      id: "work-date", section: "body", type: "text", order: 31, visible: true,
      content: "DATE ISSUED\n{{document.issueDate}}",
      position: { x: 174, y: 88, width: 25, height: 14, zIndex: 20 },
      style: { align: "center", fontFamily: "Arial", fontSize: 7, lineHeight: 1.15, fontWeight: "bold", textColor: NAVY },
    },
    {
      id: "work-schedule", section: "body", type: "textBox", order: 40, visible: true,
      content: "APPROVED WORK DATES & TIMES\nStart Date: {{request.scheduledDate}}\nEnd Date: {{document.validUntil}}\nWork Days / Time: {{request.startTime}} – {{request.endTime}}",
      position: { x: 12, y: 124, width: 88, height: 53, zIndex: 20 },
      style: { fontFamily: "Arial", fontSize: 7.2, lineHeight: 1.35, textColor: INK, backgroundColor: LIGHT, borderColor: LINE, borderWidth: 0.7, radius: 2, padding: 4 },
    },
    {
      id: "work-onsite", section: "body", type: "textBox", order: 50, visible: true,
      content: "ON-SITE CONTACT (RESIDENT)\nName: {{subject.fullName}}\nUnit / Property: {{property.address}}\nPhone: {{subject.contactNumber}}",
      position: { x: 105, y: 124, width: 94, height: 53, zIndex: 20 },
      style: { fontFamily: "Arial", fontSize: 7.2, lineHeight: 1.35, textColor: INK, backgroundColor: LIGHT, borderColor: LINE, borderWidth: 0.7, radius: 2, padding: 4 },
    },
    {
      id: "work-safety", section: "body", type: "textBox", order: 60, visible: true,
      content: "SAFETY REMINDERS\n• Follow all community rules and posted safety guidelines.\n• Wear appropriate PPE at all times.\n• Keep work areas clean and free of hazards.\n• Report incidents immediately to management.",
      position: { x: 12, y: 183, width: 110, height: 66, zIndex: 20 },
      style: { fontFamily: "Arial", fontSize: 7.2, lineHeight: 1.45, textColor: NAVY, backgroundColor: LIGHT, borderColor: LINE, borderWidth: 0.7, radius: 2, padding: 5 },
    },
    {
      id: "work-status", section: "body", type: "textBox", order: 70, visible: true,
      content: "PERMIT STATUS\nAPPROVED\n\nPermit valid for approved dates and times only.",
      position: { x: 128, y: 183, width: 71, height: 66, zIndex: 20 },
      style: { align: "center", fontFamily: "Arial", fontSize: 8.2, lineHeight: 1.35, fontWeight: "bold", textColor: GREEN, backgroundColor: "#f4fbf6", borderColor: GREEN, borderWidth: 0.8, radius: 3, padding: 7 },
    },
  ];

  const footer: DocumentTemplateBlock[] = [
    {
      id: "work-footer", section: "footer", type: "textBox", order: 10, visible: true,
      content: "This permit is non-transferable and may be revoked for violation of community rules.",
      position: { x: 8, y: 273, width: 194, height: 13, zIndex: 30 },
      style: { align: "center", fontFamily: "Arial", fontSize: 7, fontWeight: "bold", textColor: "#ffffff", backgroundColor: NAVY, borderColor: NAVY, borderWidth: 0.5, padding: 3 },
    },
  ];

  return finalizeTemplate(
    template,
    { header, body, footer },
    `HOAHub Approved Professional Document Mockups Set 2 • Work Permit • Library v${FREE_DOCUMENT_LIBRARY_VERSION}`,
  );
}

function blueprint(input: Omit<FreeDocumentTemplateBlueprint, "libraryVersion">): FreeDocumentTemplateBlueprint {
  return { ...input, libraryVersion: FREE_DOCUMENT_LIBRARY_VERSION };
}

const blueprints: FreeDocumentTemplateBlueprint[] = [
  blueprint({
    key: "certificate-of-residency",
    code: "CERTIFICATE_OF_RESIDENCY",
    displayName: "Certificate of Residency",
    category: "Certificate",
    description: "Approved Set 1 formal residency certificate with prominent resident identity, residence panel, official signatory, HOA seal treatment, and QR authenticity validation.",
    legacyType: DocumentType.CERTIFICATE_OF_RESIDENCY,
    numberingFormat: "COR-{YYYY}-{SEQUENCE:6}",
    validityDays: 90,
    maxCopies: 5,
    outstandingBalancePolicy: DocumentOutstandingBalancePolicy.IGNORE_BALANCE,
    workflow: { ...freeApprovalWorkflow },
    fields: purposeFields(),
    template: approvedCertificateTemplate("RESIDENCY"),
  }),
  blueprint({
    key: "certificate-of-indigency",
    code: "CERTIFICATE_OF_INDIGENCY",
    displayName: "Certificate of Indigency",
    category: "Certificate",
    description: "Approved Set 1 civic/legal indigency certificate with formal narrative, resident emphasis, validity panel, official signatory, and QR verification.",
    legacyType: null,
    numberingFormat: "COI-{YYYY}-{SEQUENCE:6}",
    validityDays: 90,
    maxCopies: 3,
    outstandingBalancePolicy: DocumentOutstandingBalancePolicy.IGNORE_BALANCE,
    workflow: { ...freeApprovalWorkflow },
    fields: purposeFields(),
    template: approvedCertificateTemplate("INDIGENCY"),
  }),
  blueprint({
    key: "certificate-of-good-standing",
    code: "CERTIFICATE_OF_GOOD_STANDING",
    displayName: "Certificate of Good Standing",
    category: "Certificate",
    description: "Approved Set 1 certificate with prominent GOOD STANDING banner, validity panel, account scope, official signatory, and QR verification.",
    legacyType: DocumentType.CERTIFICATE_OF_GOOD_STANDING,
    numberingFormat: "CGS-{YYYY}-{SEQUENCE:6}",
    validityDays: 30,
    maxCopies: 5,
    outstandingBalancePolicy: DocumentOutstandingBalancePolicy.BLOCK_DOWNLOAD,
    workflow: { ...freeApprovalWorkflow },
    fields: purposeFields(),
    template: approvedCertificateTemplate("GOOD_STANDING"),
  }),
  blueprint({
    key: "clearance-certificate",
    code: "CLEARANCE_CERTIFICATE",
    displayName: "Clearance Certificate",
    category: "Clearance",
    description: "Approved Set 1 clearance certificate with prominent CLEARED status panel, clearance-scope checklist, property/account panel, official signatory, and QR verification.",
    legacyType: DocumentType.CLEARANCE_CERTIFICATE,
    numberingFormat: "CLR-{YYYY}-{SEQUENCE:6}",
    validityDays: 30,
    maxCopies: 5,
    outstandingBalancePolicy: DocumentOutstandingBalancePolicy.BLOCK_DOWNLOAD,
    workflow: { ...freeApprovalWorkflow },
    fields: purposeFields(),
    template: approvedCertificateTemplate("CLEARANCE"),
  }),
  blueprint({
    key: "payment-certification",
    code: "PAYMENT_CERTIFICATION",
    displayName: "Payment Certification",
    category: "Finance Certificate",
    description: "Approved Set 1 payment certification with member/account information, certified payment detail area, total-certification panel, official signatory, and QR verification.",
    legacyType: DocumentType.PAYMENT_CERTIFICATION,
    numberingFormat: "PAYCERT-{YYYY}-{SEQUENCE:6}",
    validityDays: 30,
    maxCopies: 5,
    outstandingBalancePolicy: DocumentOutstandingBalancePolicy.IGNORE_BALANCE,
    workflow: { ...freeApprovalWorkflow },
    fields: paymentCertificationFields(),
    template: approvedCertificateTemplate("PAYMENT"),
  }),
  blueprint({
    key: "construction-bond-certification",
    code: "CONSTRUCTION_BOND_CERTIFICATION",
    displayName: "Construction Bond Certification",
    category: "Bond Certificate",
    description: "Approved Set 1 engineering/compliance certificate with separate project, contractor, and bond information panels plus QR validation.",
    legacyType: DocumentType.CONSTRUCTION_BOND_CERTIFICATION,
    numberingFormat: "CBOND-{YYYY}-{SEQUENCE:6}",
    validityDays: 30,
    maxCopies: 5,
    outstandingBalancePolicy: DocumentOutstandingBalancePolicy.IGNORE_BALANCE,
    workflow: { ...freeApprovalWorkflow },
    fields: bondCertificationFields(),
    template: approvedCertificateTemplate("CONSTRUCTION_BOND"),
  }),
  blueprint({
    key: "contractor-bond-certification",
    code: "CONTRACTOR_BOND_CERTIFICATION",
    displayName: "Contractor Bond Certification",
    category: "Bond Certificate",
    description: "Approved Set 2 contractor-focused compliance certificate with contractor information, active bond status panel, verification footer, and QR authenticity validation.",
    legacyType: DocumentType.CONTRACTOR_BOND_CERTIFICATION,
    numberingFormat: "CTBOND-{YYYY}-{SEQUENCE:6}",
    validityDays: 30,
    maxCopies: 5,
    outstandingBalancePolicy: DocumentOutstandingBalancePolicy.IGNORE_BALANCE,
    workflow: { ...freeApprovalWorkflow },
    fields: bondCertificationFields(),
    template: approvedCertificateTemplate("CONTRACTOR_BOND"),
  }),
  blueprint({
    key: "gate-pass",
    code: "GATE_PASS",
    displayName: "Gate Pass",
    category: "Pass",
    description: "Approved Set 2 professional two-copy A4 gate pass with holder/security copies, resident/visitor information, vehicle details, validity strip, and QR validation.",
    legacyType: DocumentType.GATE_PASS,
    numberingFormat: "GP-{YYYY}-{SEQUENCE:6}",
    validityDays: 1,
    maxCopies: 2,
    outstandingBalancePolicy: DocumentOutstandingBalancePolicy.IGNORE_BALANCE,
    workflow: { ...freeApprovalWorkflow, releaseRequired: true },
    fields: gatePassFields(),
    template: approvedPassTemplate("GATE"),
  }),
  blueprint({
    key: "move-in-pass",
    code: "MOVE_IN_PASS",
    displayName: "Move-In Pass",
    category: "Pass",
    description: "Approved Set 2 professional two-copy A4 move-in authorization pass with resident, mover, vehicle, schedule, conditions, and QR validation.",
    legacyType: null,
    numberingFormat: "MIP-{YYYY}-{SEQUENCE:6}",
    validityDays: 1,
    maxCopies: 2,
    outstandingBalancePolicy: DocumentOutstandingBalancePolicy.IGNORE_BALANCE,
    workflow: { ...freeApprovalWorkflow, releaseRequired: true },
    fields: movePassFields("MOVE_IN"),
    template: approvedPassTemplate("MOVE_IN"),
  }),
  blueprint({
    key: "move-out-pass",
    code: "MOVE_OUT_PASS",
    displayName: "Move-Out Pass",
    category: "Pass",
    description: "Approved Set 2 professional two-copy A4 move-out authorization pass with resident, mover, vehicle, schedule, conditions, and QR validation.",
    legacyType: null,
    numberingFormat: "MOP-{YYYY}-{SEQUENCE:6}",
    validityDays: 1,
    maxCopies: 2,
    outstandingBalancePolicy: DocumentOutstandingBalancePolicy.IGNORE_BALANCE,
    workflow: { ...freeApprovalWorkflow, releaseRequired: true },
    fields: movePassFields("MOVE_OUT"),
    template: approvedPassTemplate("MOVE_OUT"),
  }),
  blueprint({
    key: "work-permit",
    code: "WORK_PERMIT",
    displayName: "Work Permit",
    category: "Permit",
    description: "Approved Set 2 professional work permit with navy approval header, contractor/project panels, QR verification, schedule, on-site contact, safety reminders, and permit-status panel.",
    legacyType: null,
    numberingFormat: "WP-{YYYY}-{SEQUENCE:6}",
    validityDays: 1,
    maxCopies: 2,
    outstandingBalancePolicy: DocumentOutstandingBalancePolicy.IGNORE_BALANCE,
    workflow: { ...freeApprovalWorkflow, releaseRequired: true },
    fields: workPermitFields(),
    template: approvedWorkPermitTemplate(),
  }),
];

export const freeDocumentTemplateBlueprints: readonly FreeDocumentTemplateBlueprint[] = blueprints;

export function freeDocumentTemplateBlueprintByKey(key: string) {
  return freeDocumentTemplateBlueprints.find((item) => item.key === key) ?? null;
}

export function validateFreeDocumentTemplateCatalog() {
  const errors: string[] = [];
  const seenKeys = new Set<string>();
  const seenCodes = new Set<string>();
  for (const item of freeDocumentTemplateBlueprints) {
    if (seenKeys.has(item.key)) errors.push(`Duplicate library key: ${item.key}`);
    if (seenCodes.has(item.code)) errors.push(`Duplicate document code: ${item.code}`);
    seenKeys.add(item.key);
    seenCodes.add(item.code);
    if (item.workflow.paymentRequired || item.workflow.feeAmount !== 0) errors.push(`${item.displayName} must remain free in the free document library.`);
    if (!item.numberingFormat.includes("{SEQUENCE")) errors.push(`${item.displayName} must use a sequence-based document number for QR verification.`);
    const validation = validateTemplateDefinition(item.template);
    if (!validation.valid) errors.push(...validation.errors.map((error) => `${item.displayName}: ${error}`));
    const blocks = [...item.template.sections.header, ...item.template.sections.body, ...item.template.sections.footer];
    if (!blocks.some((block) => block.type === "qrVerification")) errors.push(`${item.displayName} is missing QR verification.`);
    if (item.template.meta.requiresSignatory === true) errors.push(`${item.displayName} cannot require a preconfigured signatory because the library must install safely for every tenant.`);
  }
  return { valid: errors.length === 0, errors };
}
