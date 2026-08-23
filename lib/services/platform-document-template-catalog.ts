import {
  DocumentDeliveryMode,
  DocumentFieldType,
  DocumentOutstandingBalancePolicy,
  DocumentType,
} from "@prisma/client";
import gatePassPackage from "@/templates/pass-templates/gate-pass-two-copy-a4.json";
import moveInOutPackage from "@/templates/pass-templates/move-in-out-two-copy-a4.json";
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

type LegalVariant =
  | "RESIDENCY"
  | "INDIGENCY"
  | "GOOD_STANDING"
  | "CLEARANCE"
  | "PAYMENT"
  | "CONSTRUCTION_BOND"
  | "CONTRACTOR_BOND";

const NAVY = "#071f4f";
const NAVY_2 = "#0b2a63";
const GOLD = "#b88718";
const GOLD_SOFT = "#f5edd8";
const SLATE = "#475569";
const INK = "#111827";
const LIGHT = "#f8fafc";
const LINE = "#cbd5e1";
const GREEN = "#14532d";

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
  { key: "purpose", label: "Purpose of certification", fieldType: DocumentFieldType.TEXTAREA, required: true },
  { key: "remarks", label: "Project / contractor / bond details", fieldType: DocumentFieldType.TEXTAREA, required: false },
];

const workPermitFields = (): FreeDocumentTemplateField[] => [
  { key: "purpose", label: "Work scope / description", fieldType: DocumentFieldType.TEXTAREA, required: true },
  { key: "scheduledDate", label: "Approved work date", fieldType: DocumentFieldType.DATE, required: true },
  { key: "startTime", label: "Approved start time", fieldType: DocumentFieldType.TEXT, required: true },
  { key: "endTime", label: "Approved end time", fieldType: DocumentFieldType.TEXT, required: true },
  { key: "representativeName", label: "Contractor / work lead", fieldType: DocumentFieldType.TEXT, required: true },
  { key: "destination", label: "Work location / area", fieldType: DocumentFieldType.TEXT, required: true },
  { key: "vehicleDetails", label: "Vehicle details", fieldType: DocumentFieldType.TEXTAREA, required: false },
  { key: "itemsSummary", label: "Tools / materials summary", fieldType: DocumentFieldType.TEXTAREA, required: false },
  { key: "remarks", label: "Permit conditions / additional remarks", fieldType: DocumentFieldType.TEXTAREA, required: false },
];

function basePage(template: DocumentTemplateDefinition, watermarkText: string) {
  template.page.marginPreset = "custom";
  template.page.margins = { top: 9, right: 9, bottom: 9, left: 9 };
  template.page.border = { enabled: true, style: "solid", width: 1.2, color: NAVY };
  template.page.backgroundColor = "#ffffff";
  template.page.backgroundOpacity = 1;
  template.page.watermark = {
    enabled: true,
    text: watermarkText,
    opacity: 0.045,
    fontSize: 42,
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
  template.page.safeArea = {
    showBoundary: false,
    showNonPrintableArea: false,
    warnOnOverflow: true,
    minimumMarginMm: 9,
  };
}

function institutionalHeader(): DocumentTemplateBlock[] {
  return [
    {
      id: "library-logo",
      section: "header",
      type: "logo",
      binding: "tenant.logo",
      content: "{{tenant.logo}}",
      order: 10,
      visible: true,
      required: false,
      position: { x: 16, y: 12, width: 25, height: 25, zIndex: 20 },
      style: { align: "center", borderColor: GOLD, borderWidth: 1, radius: 12, padding: 2 },
      image: { fit: "contain", positionX: "center", positionY: "center", opacity: 1, lockAspectRatio: true },
    },
    {
      id: "library-tenant",
      section: "header",
      type: "tenantName",
      content: "{{tenant.name}}",
      order: 20,
      visible: true,
      position: { x: 45, y: 12, width: 118, height: 9, zIndex: 20 },
      style: { align: "center", fontFamily: "Georgia", fontSize: 16, fontWeight: "bold", textColor: NAVY },
    },
    {
      id: "library-address",
      section: "header",
      type: "address",
      content: "{{tenant.address}}",
      order: 30,
      visible: true,
      position: { x: 45, y: 22, width: 118, height: 7, zIndex: 20 },
      style: { align: "center", fontFamily: "Arial", fontSize: 8.5, textColor: SLATE },
    },
    {
      id: "library-registration",
      section: "header",
      type: "text",
      content: "SEC: {{tenant.secRegistration}}  •  TIN: {{tenant.tin}}",
      order: 40,
      visible: true,
      required: false,
      position: { x: 45, y: 30, width: 118, height: 6, zIndex: 20 },
      style: { align: "center", fontFamily: "Arial", fontSize: 7.5, textColor: SLATE },
    },
    {
      id: "library-contact",
      section: "header",
      type: "text",
      content: "{{tenant.contactNumber}}  •  {{tenant.email}}",
      order: 50,
      visible: true,
      required: false,
      position: { x: 45, y: 37, width: 118, height: 6, zIndex: 20 },
      style: { align: "center", fontFamily: "Arial", fontSize: 7.5, textColor: SLATE },
    },
    {
      id: "library-qr",
      section: "header",
      type: "qrVerification",
      binding: "verification.url",
      content: "{{verification.url}}",
      order: 60,
      visible: true,
      required: false,
      position: { x: 168, y: 12, width: 26, height: 26, zIndex: 30 },
      style: { align: "center", borderColor: LINE, borderWidth: 1, padding: 1 },
      qr: { ...defaultQrConfig, label: "SCAN TO VERIFY", instruction: "Verify this document online" },
    },
    {
      id: "library-verify-label",
      section: "header",
      type: "verificationText",
      content: "SCAN TO VERIFY",
      order: 70,
      visible: true,
      required: false,
      position: { x: 165, y: 39, width: 32, height: 5, zIndex: 30 },
      style: { align: "center", fontFamily: "Arial", fontSize: 7, fontWeight: "bold", textColor: NAVY },
    },
    {
      id: "library-header-line",
      section: "header",
      type: "horizontalLine",
      order: 80,
      visible: true,
      position: { x: 16, y: 48, width: 179, height: 1, zIndex: 18 },
      style: { lineColor: GOLD, lineWidth: 1.2, lineStyle: "solid", opacity: 1 },
    },
  ];
}

function legalVariantBlocks(variant: LegalVariant): DocumentTemplateBlock[] {
  if (variant === "RESIDENCY") return [
    {
      id: "legal-residency-panel",
      section: "body",
      type: "rectangle",
      order: 60,
      visible: true,
      position: { x: 24, y: 106, width: 162, height: 31, zIndex: 4 },
      style: { backgroundColor: LIGHT, borderColor: GOLD, borderWidth: 1, radius: 3 },
    },
    {
      id: "legal-resident-name",
      section: "body",
      type: "text",
      content: "{{subject.fullName}}",
      order: 61,
      visible: true,
      position: { x: 30, y: 110, width: 150, height: 9, zIndex: 10 },
      style: { align: "center", fontFamily: "Georgia", fontSize: 14, fontWeight: "bold", textColor: NAVY },
    },
    {
      id: "legal-residence-info",
      section: "body",
      type: "text",
      content: "RESIDENCE INFORMATION\n{{property.address}}\nAccount: {{property.accountNumber}}",
      order: 62,
      visible: true,
      position: { x: 30, y: 121, width: 150, height: 13, zIndex: 10 },
      style: { align: "center", fontFamily: "Arial", fontSize: 8.5, lineHeight: 1.25, textColor: INK },
    },
  ];

  if (variant === "INDIGENCY") return [
    {
      id: "legal-indigency-panel",
      section: "body",
      type: "rectangle",
      order: 60,
      visible: true,
      position: { x: 24, y: 106, width: 162, height: 31, zIndex: 4 },
      style: { backgroundColor: "#fffdf7", borderColor: LINE, borderWidth: 1, radius: 2 },
    },
    {
      id: "legal-indigency-caption",
      section: "body",
      type: "text",
      content: "TO WHOM IT MAY CONCERN:\n\nCertified Resident: {{subject.fullName}}\nResidence: {{property.address}}",
      order: 61,
      visible: true,
      position: { x: 30, y: 111, width: 150, height: 22, zIndex: 10 },
      style: { fontFamily: "Times New Roman", fontSize: 10.5, lineHeight: 1.25, textColor: INK },
    },
  ];

  if (variant === "GOOD_STANDING") return [
    {
      id: "legal-standing-banner",
      section: "body",
      type: "rectangle",
      order: 60,
      visible: true,
      position: { x: 24, y: 106, width: 162, height: 20, zIndex: 4 },
      style: { backgroundColor: NAVY, borderColor: GOLD, borderWidth: 1.2, radius: 2 },
    },
    {
      id: "legal-standing-text",
      section: "body",
      type: "text",
      content: "GOOD STANDING",
      order: 61,
      visible: true,
      position: { x: 30, y: 111, width: 150, height: 10, zIndex: 10 },
      style: { align: "center", fontFamily: "Georgia", fontSize: 15, fontWeight: "bold", textColor: "#ffffff" },
    },
    {
      id: "legal-standing-validity",
      section: "body",
      type: "text",
      content: "STATUS AS OF {{document.issueDate}}  •  VALID UNTIL {{document.validUntil}}",
      order: 62,
      visible: true,
      required: false,
      position: { x: 30, y: 129, width: 150, height: 7, zIndex: 10 },
      style: { align: "center", fontFamily: "Arial", fontSize: 8, fontWeight: "bold", textColor: NAVY_2 },
    },
  ];

  if (variant === "CLEARANCE") return [
    {
      id: "legal-clearance-banner",
      section: "body",
      type: "rectangle",
      order: 60,
      visible: true,
      position: { x: 24, y: 106, width: 162, height: 20, zIndex: 4 },
      style: { backgroundColor: GREEN, borderColor: GOLD, borderWidth: 1.2, radius: 2 },
    },
    {
      id: "legal-clearance-text",
      section: "body",
      type: "text",
      content: "CLEARED — AUTHORIZED ASSOCIATION CERTIFICATION",
      order: 61,
      visible: true,
      position: { x: 30, y: 111, width: 150, height: 10, zIndex: 10 },
      style: { align: "center", fontFamily: "Arial", fontSize: 11, fontWeight: "bold", textColor: "#ffffff" },
    },
    {
      id: "legal-clearance-scope",
      section: "body",
      type: "text",
      content: "PROPERTY / ACCOUNT: {{property.accountNumber}}  •  {{property.address}}",
      order: 62,
      visible: true,
      position: { x: 30, y: 129, width: 150, height: 7, zIndex: 10 },
      style: { align: "center", fontFamily: "Arial", fontSize: 8, fontWeight: "bold", textColor: NAVY },
    },
  ];

  if (variant === "PAYMENT") return [
    {
      id: "legal-payment-panel",
      section: "body",
      type: "rectangle",
      order: 60,
      visible: true,
      position: { x: 24, y: 106, width: 162, height: 31, zIndex: 4 },
      style: { backgroundColor: LIGHT, borderColor: NAVY, borderWidth: 1, radius: 2 },
    },
    {
      id: "legal-payment-account",
      section: "body",
      type: "text",
      content: "ACCOUNT / MEMBER INFORMATION\n{{subject.fullName}}  •  Account {{property.accountNumber}}\n{{property.address}}",
      order: 61,
      visible: true,
      position: { x: 30, y: 110, width: 150, height: 14, zIndex: 10 },
      style: { align: "center", fontFamily: "Arial", fontSize: 8.5, lineHeight: 1.25, fontWeight: "bold", textColor: NAVY },
    },
    {
      id: "legal-payment-details",
      section: "body",
      type: "text",
      content: "PAYMENT / RECEIPT DETAILS\n{{request.remarks}}",
      order: 62,
      visible: true,
      position: { x: 30, y: 125, width: 150, height: 10, zIndex: 10 },
      style: { align: "center", fontFamily: "Arial", fontSize: 8, lineHeight: 1.2, textColor: SLATE },
    },
  ];

  const contractorLabel = variant === "CONTRACTOR_BOND" ? "CONTRACTOR / BOND RECORD" : "PROJECT / CONSTRUCTION BOND RECORD";
  return [
    {
      id: "legal-bond-panel",
      section: "body",
      type: "rectangle",
      order: 60,
      visible: true,
      position: { x: 24, y: 106, width: 162, height: 31, zIndex: 4 },
      style: { backgroundColor: LIGHT, borderColor: NAVY, borderWidth: 1, radius: 2 },
    },
    {
      id: "legal-bond-account",
      section: "body",
      type: "text",
      content: `${contractorLabel}\nProperty: {{property.address}}  •  Account: {{property.accountNumber}}`,
      order: 61,
      visible: true,
      position: { x: 30, y: 110, width: 150, height: 11, zIndex: 10 },
      style: { align: "center", fontFamily: "Arial", fontSize: 8.5, lineHeight: 1.2, fontWeight: "bold", textColor: NAVY },
    },
    {
      id: "legal-bond-details",
      section: "body",
      type: "text",
      content: "APPROVED RECORD DETAILS\n{{request.remarks}}",
      order: 62,
      visible: true,
      position: { x: 30, y: 123, width: 150, height: 12, zIndex: 10 },
      style: { align: "center", fontFamily: "Arial", fontSize: 8, lineHeight: 1.2, textColor: SLATE },
    },
  ];
}

function professionalLegalCertificateTemplate(input: {
  title: string;
  eyebrow: string;
  body: string;
  supporting?: string;
  variant: LegalVariant;
}): DocumentTemplateDefinition {
  const template = defaultTemplateDefinition(input.title);
  basePage(template, input.variant.replaceAll("_", " "));
  const header = institutionalHeader();
  const body: DocumentTemplateBlock[] = [
    {
      id: "library-eyebrow",
      section: "body",
      type: "heading",
      content: input.eyebrow,
      order: 10,
      visible: true,
      position: { x: 24, y: 57, width: 162, height: 7, zIndex: 20 },
      style: { align: "center", fontFamily: "Arial", fontSize: 8.5, fontWeight: "bold", textColor: GOLD },
    },
    {
      id: "library-title",
      section: "body",
      type: "documentTitle",
      content: input.title,
      order: 20,
      visible: true,
      position: { x: 24, y: 65, width: 162, height: 14, zIndex: 20 },
      style: { align: "center", fontFamily: "Georgia", fontSize: 19.5, fontWeight: "bold", textColor: NAVY },
    },
    {
      id: "library-meta-panel",
      section: "body",
      type: "rectangle",
      order: 30,
      visible: true,
      position: { x: 24, y: 84, width: 162, height: 17, zIndex: 5 },
      style: { backgroundColor: "#fffdf8", borderColor: LINE, borderWidth: 1, radius: 2 },
    },
    {
      id: "library-doc-number",
      section: "body",
      type: "text",
      content: "DOCUMENT NO.\n{{document.number}}",
      order: 40,
      visible: true,
      position: { x: 30, y: 88, width: 72, height: 10, zIndex: 10 },
      style: { fontFamily: "Arial", fontSize: 8, lineHeight: 1.15, fontWeight: "bold", textColor: NAVY },
    },
    {
      id: "library-issue-date",
      section: "body",
      type: "text",
      content: "DATE ISSUED\n{{document.issueDate}}",
      order: 50,
      visible: true,
      position: { x: 108, y: 88, width: 72, height: 10, zIndex: 10 },
      style: { align: "right", fontFamily: "Arial", fontSize: 8, lineHeight: 1.15, fontWeight: "bold", textColor: NAVY },
    },
    ...legalVariantBlocks(input.variant),
    {
      id: "library-certifies",
      section: "body",
      type: "heading",
      content: "OFFICIAL CERTIFICATION",
      order: 70,
      visible: true,
      position: { x: 29, y: 143, width: 152, height: 7, zIndex: 20 },
      style: { align: "left", fontFamily: "Georgia", fontSize: 10.5, fontWeight: "bold", textColor: NAVY },
    },
    {
      id: "library-body",
      section: "body",
      type: "bodyText",
      content: input.body,
      order: 80,
      visible: true,
      position: { x: 29, y: 151, width: 152, height: 37, zIndex: 20 },
      style: { align: "justify", fontFamily: "Times New Roman", fontSize: 11, lineHeight: 1.45, textColor: INK },
    },
    {
      id: "library-supporting",
      section: "body",
      type: "paragraph",
      content: input.supporting || "This certification is issued upon request for {{request.purpose}} and is subject to the official records and policies of {{tenant.name}}.",
      order: 90,
      visible: true,
      position: { x: 29, y: 191, width: 152, height: 25, zIndex: 20 },
      style: { align: "justify", fontFamily: "Times New Roman", fontSize: 10.5, lineHeight: 1.4, textColor: INK },
    },
    {
      id: "library-issued",
      section: "body",
      type: "issueDate",
      content: "IN WITNESS WHEREOF, this document is issued on {{document.issueDate}} at {{document.issuePlace}}.",
      order: 100,
      visible: true,
      position: { x: 29, y: 218, width: 152, height: 10, zIndex: 20 },
      style: { fontFamily: "Times New Roman", fontSize: 10.5, lineHeight: 1.25, textColor: INK },
    },
    {
      id: "library-security-note",
      section: "body",
      type: "textBox",
      content: "SECURE DIGITAL DOCUMENT\nStatus: {{document.status}}\nVerification: {{verification.code}}",
      order: 110,
      visible: true,
      required: false,
      position: { x: 29, y: 236, width: 62, height: 28, zIndex: 20 },
      style: { fontFamily: "Arial", fontSize: 7.5, lineHeight: 1.3, textColor: SLATE, backgroundColor: LIGHT, borderColor: GOLD, borderWidth: 1, radius: 2, padding: 3 },
    },
    {
      id: "library-signatory-line",
      section: "body",
      type: "horizontalLine",
      order: 120,
      visible: true,
      required: false,
      position: { x: 113, y: 244, width: 62, height: 1, zIndex: 20 },
      style: { lineColor: NAVY, lineWidth: 0.8, lineStyle: "solid", opacity: 1 },
    },
    {
      id: "library-signatory",
      section: "body",
      type: "signatory",
      content: "{{signatory.name}}\n{{signatory.position}}\nAuthorized HOA Signatory",
      order: 130,
      visible: true,
      required: false,
      position: { x: 105, y: 247, width: 78, height: 20, zIndex: 20 },
      style: { align: "center", fontFamily: "Times New Roman", fontSize: 9.5, lineHeight: 1.15, fontWeight: "bold", textColor: NAVY },
    },
  ];
  const footer: DocumentTemplateBlock[] = [
    {
      id: "library-footer-line",
      section: "footer",
      type: "horizontalLine",
      order: 10,
      visible: true,
      position: { x: 16, y: 277, width: 179, height: 1, zIndex: 20 },
      style: { lineColor: LINE, lineWidth: 0.6, lineStyle: "solid", opacity: 1 },
    },
    {
      id: "library-footer",
      section: "footer",
      type: "footer",
      content: "SYSTEM-GENERATED OFFICIAL DOCUMENT • Validate authenticity using the QR code • {{tenant.name}}",
      order: 20,
      visible: true,
      position: { x: 20, y: 281, width: 170, height: 7, zIndex: 20 },
      style: { align: "center", fontFamily: "Arial", fontSize: 7.2, fontWeight: "bold", textColor: SLATE },
    },
  ];
  template.sections = { header, body, footer };
  template.blocks = [...header, ...body, ...footer];
  template.meta = {
    editor: "professional-document-editor",
    revisionNote: `HOAHub Free Professional Legal Library • ${input.title} • v${FREE_DOCUMENT_LIBRARY_VERSION}`,
    requiresSignatory: false,
  };
  return template;
}

function professionalWorkPermitTemplate(): DocumentTemplateDefinition {
  const template = defaultTemplateDefinition("WORK PERMIT");
  basePage(template, "WORK PERMIT");
  const header = institutionalHeader();
  const body: DocumentTemplateBlock[] = [
    {
      id: "permit-eyebrow",
      section: "body",
      type: "heading",
      content: "PROPERTY & SECURITY OPERATIONS",
      order: 10,
      visible: true,
      position: { x: 24, y: 55, width: 162, height: 7, zIndex: 20 },
      style: { align: "center", fontFamily: "Arial", fontSize: 8.5, fontWeight: "bold", textColor: GOLD },
    },
    {
      id: "permit-title",
      section: "body",
      type: "documentTitle",
      content: "WORK PERMIT",
      order: 20,
      visible: true,
      position: { x: 24, y: 63, width: 162, height: 14, zIndex: 20 },
      style: { align: "center", fontFamily: "Georgia", fontSize: 21, fontWeight: "bold", textColor: NAVY },
    },
    {
      id: "permit-meta",
      section: "body",
      type: "textBox",
      content: "PERMIT NO. {{document.number}}   •   ISSUE DATE {{document.issueDate}}",
      order: 30,
      visible: true,
      position: { x: 24, y: 79, width: 162, height: 10, zIndex: 20 },
      style: { align: "center", fontFamily: "Arial", fontSize: 8.5, fontWeight: "bold", textColor: NAVY, backgroundColor: LIGHT, borderColor: LINE, borderWidth: 1, radius: 2, padding: 2 },
    },
    {
      id: "permit-status-box",
      section: "body",
      type: "rectangle",
      order: 40,
      visible: true,
      position: { x: 24, y: 93, width: 162, height: 14, zIndex: 4 },
      style: { backgroundColor: NAVY, borderColor: GOLD, borderWidth: 1.2, radius: 2 },
    },
    {
      id: "permit-status",
      section: "body",
      type: "text",
      content: "APPROVED WORK AUTHORIZATION",
      order: 41,
      visible: true,
      position: { x: 30, y: 97, width: 150, height: 7, zIndex: 10 },
      style: { align: "center", fontFamily: "Arial", fontSize: 10.5, fontWeight: "bold", textColor: "#ffffff" },
    },
    {
      id: "permit-property-panel",
      section: "body",
      type: "rectangle",
      order: 50,
      visible: true,
      position: { x: 24, y: 111, width: 78, height: 30, zIndex: 4 },
      style: { backgroundColor: LIGHT, borderColor: LINE, borderWidth: 1, radius: 2 },
    },
    {
      id: "permit-property",
      section: "body",
      type: "text",
      content: "PROPERTY / REQUESTOR\n{{subject.fullName}}\n{{property.address}}\nAccount {{property.accountNumber}}",
      order: 51,
      visible: true,
      position: { x: 29, y: 115, width: 68, height: 22, zIndex: 10 },
      style: { fontFamily: "Arial", fontSize: 8, lineHeight: 1.25, textColor: INK },
    },
    {
      id: "permit-contractor-panel",
      section: "body",
      type: "rectangle",
      order: 52,
      visible: true,
      position: { x: 108, y: 111, width: 78, height: 30, zIndex: 4 },
      style: { backgroundColor: LIGHT, borderColor: LINE, borderWidth: 1, radius: 2 },
    },
    {
      id: "permit-contractor",
      section: "body",
      type: "text",
      content: "CONTRACTOR / WORK LEAD\n{{request.representativeName}}\nWork Area: {{request.destination}}",
      order: 53,
      visible: true,
      position: { x: 113, y: 115, width: 68, height: 22, zIndex: 10 },
      style: { fontFamily: "Arial", fontSize: 8, lineHeight: 1.3, textColor: INK },
    },
    {
      id: "permit-schedule",
      section: "body",
      type: "textBox",
      content: "APPROVED WORK SCHEDULE   •   {{request.scheduledDate}}   •   {{request.startTime}} – {{request.endTime}}",
      order: 60,
      visible: true,
      position: { x: 24, y: 145, width: 162, height: 12, zIndex: 20 },
      style: { align: "center", fontFamily: "Arial", fontSize: 8.5, fontWeight: "bold", textColor: NAVY, backgroundColor: GOLD_SOFT, borderColor: GOLD, borderWidth: 1, radius: 2, padding: 2 },
    },
    {
      id: "permit-scope-label",
      section: "body",
      type: "heading",
      content: "APPROVED SCOPE OF WORK",
      order: 70,
      visible: true,
      position: { x: 29, y: 162, width: 152, height: 7, zIndex: 20 },
      style: { fontFamily: "Arial", fontSize: 8.5, fontWeight: "bold", textColor: NAVY },
    },
    {
      id: "permit-scope",
      section: "body",
      type: "textBox",
      content: "{{request.purpose}}",
      order: 71,
      visible: true,
      position: { x: 24, y: 171, width: 162, height: 28, zIndex: 20 },
      style: { fontFamily: "Times New Roman", fontSize: 10.5, lineHeight: 1.35, textColor: INK, backgroundColor: "#ffffff", borderColor: LINE, borderWidth: 1, radius: 2, padding: 4 },
    },
    {
      id: "permit-logistics",
      section: "body",
      type: "textBox",
      content: "VEHICLE / ACCESS\n{{request.vehicleDetails}}\n\nTOOLS / MATERIALS\n{{request.itemsSummary}}",
      order: 80,
      visible: true,
      position: { x: 24, y: 203, width: 78, height: 34, zIndex: 20 },
      style: { fontFamily: "Arial", fontSize: 7.8, lineHeight: 1.22, textColor: INK, backgroundColor: LIGHT, borderColor: LINE, borderWidth: 1, radius: 2, padding: 3 },
    },
    {
      id: "permit-conditions",
      section: "body",
      type: "textBox",
      content: "PERMIT CONDITIONS\nValid only for the approved scope, location, date, and time. Security may verify this permit by QR and may stop work outside approved conditions. Tenant rules, safety requirements, access controls, and lawful site instructions remain applicable.\n{{request.remarks}}",
      order: 81,
      visible: true,
      position: { x: 108, y: 203, width: 78, height: 34, zIndex: 20 },
      style: { fontFamily: "Arial", fontSize: 7.5, lineHeight: 1.18, textColor: INK, backgroundColor: "#fffdf8", borderColor: GOLD, borderWidth: 1, radius: 2, padding: 3 },
    },
    {
      id: "permit-sign-line",
      section: "body",
      type: "horizontalLine",
      order: 90,
      visible: true,
      required: false,
      position: { x: 31, y: 254, width: 63, height: 1, zIndex: 20 },
      style: { lineColor: NAVY, lineWidth: 0.8, lineStyle: "solid", opacity: 1 },
    },
    {
      id: "permit-signatory",
      section: "body",
      type: "signatory",
      content: "{{signatory.name}}\n{{signatory.position}}\nAuthorized Approver",
      order: 91,
      visible: true,
      required: false,
      position: { x: 24, y: 257, width: 78, height: 18, zIndex: 20 },
      style: { align: "center", fontFamily: "Times New Roman", fontSize: 9, lineHeight: 1.15, fontWeight: "bold", textColor: NAVY },
    },
    {
      id: "permit-qr-bottom",
      section: "body",
      type: "qrVerification",
      binding: "verification.url",
      content: "{{verification.url}}",
      order: 92,
      visible: true,
      required: false,
      position: { x: 118, y: 245, width: 27, height: 27, zIndex: 30 },
      style: { align: "center", borderColor: LINE, borderWidth: 1, padding: 1 },
      qr: { ...defaultQrConfig, label: "VERIFY PERMIT", instruction: "Scan before allowing work" },
    },
    {
      id: "permit-verify",
      section: "body",
      type: "verificationText",
      content: "VERIFY PERMIT\n{{verification.code}}",
      order: 93,
      visible: true,
      required: false,
      position: { x: 148, y: 251, width: 37, height: 12, zIndex: 30 },
      style: { fontFamily: "Arial", fontSize: 7.2, lineHeight: 1.2, fontWeight: "bold", textColor: NAVY },
    },
  ];
  const footer: DocumentTemplateBlock[] = [
    {
      id: "permit-footer-line",
      section: "footer",
      type: "horizontalLine",
      order: 10,
      visible: true,
      position: { x: 16, y: 278, width: 179, height: 1, zIndex: 20 },
      style: { lineColor: LINE, lineWidth: 0.6, lineStyle: "solid", opacity: 1 },
    },
    {
      id: "permit-footer",
      section: "footer",
      type: "footer",
      content: "OFFICIAL HOA WORK PERMIT • Present to Security upon request • QR validation required for authenticity",
      order: 20,
      visible: true,
      position: { x: 20, y: 282, width: 170, height: 7, zIndex: 20 },
      style: { align: "center", fontFamily: "Arial", fontSize: 7.2, fontWeight: "bold", textColor: SLATE },
    },
  ];
  template.sections = { header, body, footer };
  template.blocks = [...header, ...body, ...footer];
  template.meta = {
    editor: "professional-document-editor",
    revisionNote: `HOAHub Free Professional Library • Work Permit • v${FREE_DOCUMENT_LIBRARY_VERSION}`,
    requiresSignatory: false,
  };
  return template;
}

function cloneTemplate(value: unknown): DocumentTemplateDefinition {
  return JSON.parse(JSON.stringify(value)) as DocumentTemplateDefinition;
}

function replaceStringsDeep(value: unknown, replacements: Array<[string, string]>): unknown {
  if (typeof value === "string") return replacements.reduce((text, [from, to]) => text.split(from).join(to), value);
  if (Array.isArray(value)) return value.map((item) => replaceStringsDeep(item, replacements));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, replaceStringsDeep(entry, replacements)]));
  return value;
}

function approvedPassTemplate(kind: "GATE" | "MOVE_IN" | "MOVE_OUT"): DocumentTemplateDefinition {
  const source = kind === "GATE"
    ? (gatePassPackage as { definition: unknown }).definition
    : (moveInOutPackage as { definition: unknown }).definition;
  const replacements: Array<[string, string]> = kind === "MOVE_IN"
    ? [["MOVE-IN / MOVE-OUT PASS", "MOVE-IN PASS"], ["MOVE-IN / MOVE-OUT", "MOVE-IN"]]
    : kind === "MOVE_OUT"
      ? [["MOVE-IN / MOVE-OUT PASS", "MOVE-OUT PASS"], ["MOVE-IN / MOVE-OUT", "MOVE-OUT"]]
      : [];
  const template = cloneTemplate(replaceStringsDeep(source, replacements));
  template.meta = {
    editor: "professional-document-editor",
    revisionNote: `HOAHub Free Professional Library • ${kind.replaceAll("_", " ")} • v${FREE_DOCUMENT_LIBRARY_VERSION}`,
    requiresSignatory: false,
  };
  template.blocks = [...template.sections.header, ...template.sections.body, ...template.sections.footer];
  return template;
}

function blueprint(input: Omit<FreeDocumentTemplateBlueprint, "libraryVersion">): FreeDocumentTemplateBlueprint {
  return { ...input, libraryVersion: FREE_DOCUMENT_LIBRARY_VERSION };
}

const blueprints: FreeDocumentTemplateBlueprint[] = [
  blueprint({
    key: "certificate-of-residency", code: "CERTIFICATE_OF_RESIDENCY", displayName: "Certificate of Residency", category: "Certificate",
    description: "Professional legal-format residency certification with institutional identity, residence panel, controlled approval, numbering, and QR authenticity validation.",
    legacyType: DocumentType.CERTIFICATE_OF_RESIDENCY, numberingFormat: "COR-{YYYY}-{SEQUENCE:6}", validityDays: 90, maxCopies: 5,
    outstandingBalancePolicy: DocumentOutstandingBalancePolicy.IGNORE_BALANCE, workflow: { ...freeApprovalWorkflow }, fields: purposeFields(),
    template: professionalLegalCertificateTemplate({ variant: "RESIDENCY", title: "CERTIFICATE OF RESIDENCY", eyebrow: "OFFICIAL RESIDENCY CERTIFICATION", body: "This is to certify that {{subject.fullName}} is recorded as a bona fide resident/homeowner of {{tenant.name}} with the residence/property identified above, based on the Association records reviewed as of the date of issuance." }),
  }),
  blueprint({
    key: "certificate-of-indigency", code: "CERTIFICATE_OF_INDIGENCY", displayName: "Certificate of Indigency", category: "Certificate",
    description: "Restrained civic/legal indigency certification with resident identity, formal declaration, tenant approval, and QR authenticity validation.",
    legacyType: null, numberingFormat: "COI-{YYYY}-{SEQUENCE:6}", validityDays: 90, maxCopies: 3,
    outstandingBalancePolicy: DocumentOutstandingBalancePolicy.IGNORE_BALANCE, workflow: { ...freeApprovalWorkflow }, fields: purposeFields(),
    template: professionalLegalCertificateTemplate({ variant: "INDIGENCY", title: "CERTIFICATE OF INDIGENCY", eyebrow: "OFFICIAL COMMUNITY CERTIFICATION", body: "After review by the authorized Association office, this is to certify that {{subject.fullName}}, residing at {{property.address}}, is the subject of an approved indigency certification based on the records and declarations presented through the configured tenant workflow.", supporting: "This certificate is issued for {{request.purpose}}. The receiving agency remains responsible for determining whether this certification satisfies its documentary requirements." }),
  }),
  blueprint({
    key: "certificate-of-good-standing", code: "CERTIFICATE_OF_GOOD_STANDING", displayName: "Certificate of Good Standing", category: "Certificate",
    description: "Formal good-standing certificate with prominent status banner, validity panel, balance-sensitive release policy, and QR verification.",
    legacyType: DocumentType.CERTIFICATE_OF_GOOD_STANDING, numberingFormat: "CGS-{YYYY}-{SEQUENCE:6}", validityDays: 30, maxCopies: 5,
    outstandingBalancePolicy: DocumentOutstandingBalancePolicy.BLOCK_DOWNLOAD, workflow: { ...freeApprovalWorkflow }, fields: purposeFields(),
    template: professionalLegalCertificateTemplate({ variant: "GOOD_STANDING", title: "CERTIFICATE OF GOOD STANDING", eyebrow: "ASSOCIATION ACCOUNT & MEMBERSHIP CERTIFICATION", body: "This is to certify that {{subject.fullName}}, associated with {{property.address}}, is recorded by {{tenant.name}} in good standing for the purpose of this certification as of {{document.issueDate}}, subject to the Association's configured account, membership, and release policies.", supporting: "This certification is issued for {{request.purpose}} and is valid only within the validity period stated on the issued document." }),
  }),
  blueprint({
    key: "clearance-certificate", code: "CLEARANCE_CERTIFICATE", displayName: "Clearance Certificate", category: "Clearance",
    description: "Formal legal-format HOA clearance with prominent cleared status, property/account scope, controlled approval, balance-aware release, and QR verification.",
    legacyType: DocumentType.CLEARANCE_CERTIFICATE, numberingFormat: "CLR-{YYYY}-{SEQUENCE:6}", validityDays: 30, maxCopies: 5,
    outstandingBalancePolicy: DocumentOutstandingBalancePolicy.BLOCK_DOWNLOAD, workflow: { ...freeApprovalWorkflow }, fields: purposeFields(),
    template: professionalLegalCertificateTemplate({ variant: "CLEARANCE", title: "CLEARANCE CERTIFICATE", eyebrow: "OFFICIAL ASSOCIATION CLEARANCE", body: "This is to certify that {{subject.fullName}}, associated with the property/account identified above, has been cleared for the approved purpose based on the Association records reviewed by {{tenant.name}} as of {{document.issueDate}} and subject to the tenant's configured clearance policies." }),
  }),
  blueprint({
    key: "payment-certification", code: "PAYMENT_CERTIFICATION", displayName: "Payment Certification", category: "Finance Certificate",
    description: "Professional financial/legal certification with account information, controlled payment-detail area, tenant finance review, and QR verification.",
    legacyType: DocumentType.PAYMENT_CERTIFICATION, numberingFormat: "PAYCERT-{YYYY}-{SEQUENCE:6}", validityDays: 30, maxCopies: 5,
    outstandingBalancePolicy: DocumentOutstandingBalancePolicy.IGNORE_BALANCE, workflow: { ...freeApprovalWorkflow }, fields: paymentCertificationFields(),
    template: professionalLegalCertificateTemplate({ variant: "PAYMENT", title: "PAYMENT CERTIFICATION", eyebrow: "OFFICIAL ASSOCIATION PAYMENT RECORD CERTIFICATION", body: "This is to certify that {{tenant.name}} maintains payment records for {{subject.fullName}} under the account and property identified above. The authorized Association office reviewed the applicable record before approval and issuance of this certification.", supporting: "This certification is issued for {{request.purpose}}. It certifies only the payment information approved for release and does not replace an Official Receipt or Statement of Account." }),
  }),
  blueprint({
    key: "construction-bond-certification", code: "CONSTRUCTION_BOND_CERTIFICATION", displayName: "Construction Bond Certification", category: "Bond Certificate",
    description: "Professional engineering/compliance legal certificate with structured property/project/bond detail area, controlled approval, and QR validation.",
    legacyType: DocumentType.CONSTRUCTION_BOND_CERTIFICATION, numberingFormat: "CBOND-{YYYY}-{SEQUENCE:6}", validityDays: 30, maxCopies: 5,
    outstandingBalancePolicy: DocumentOutstandingBalancePolicy.IGNORE_BALANCE, workflow: { ...freeApprovalWorkflow }, fields: bondCertificationFields(),
    template: professionalLegalCertificateTemplate({ variant: "CONSTRUCTION_BOND", title: "CONSTRUCTION BOND CERTIFICATION", eyebrow: "OFFICIAL CONSTRUCTION BOND RECORD", body: "This is to certify that {{tenant.name}} maintains an approved construction-bond record associated with {{subject.fullName}} and the property identified above. This certification is issued only after review by the authorized Association office and does not by itself authorize any bond refund, release, or forfeiture." }),
  }),
  blueprint({
    key: "contractor-bond-certification", code: "CONTRACTOR_BOND_CERTIFICATION", displayName: "Contractor Bond Certification", category: "Bond Certificate",
    description: "Professional contractor-focused bond certification with structured compliance panel, tenant approval, controlled release, and QR authenticity validation.",
    legacyType: DocumentType.CONTRACTOR_BOND_CERTIFICATION, numberingFormat: "CTBOND-{YYYY}-{SEQUENCE:6}", validityDays: 30, maxCopies: 5,
    outstandingBalancePolicy: DocumentOutstandingBalancePolicy.IGNORE_BALANCE, workflow: { ...freeApprovalWorkflow }, fields: bondCertificationFields(),
    template: professionalLegalCertificateTemplate({ variant: "CONTRACTOR_BOND", title: "CONTRACTOR BOND CERTIFICATION", eyebrow: "OFFICIAL CONTRACTOR BOND RECORD", body: "This is to certify that {{tenant.name}} maintains a contractor-bond record associated with the requesting property/account identified above. The authorized Association office reviewed the relevant record before approval and issuance of this certification.", supporting: "This certificate is issued for {{request.purpose}}. It does not independently authorize release, refund, or forfeiture of any bond amount." }),
  }),
  blueprint({
    key: "gate-pass", code: "GATE_PASS", displayName: "Gate Pass", category: "Pass",
    description: "Professional two-copy A4 operational gate pass with homeowner/property details, schedule/vehicle fields, security copy, holder copy, and QR validation.",
    legacyType: DocumentType.GATE_PASS, numberingFormat: "GP-{YYYY}-{SEQUENCE:6}", validityDays: 1, maxCopies: 2,
    outstandingBalancePolicy: DocumentOutstandingBalancePolicy.IGNORE_BALANCE, workflow: { ...freeApprovalWorkflow, releaseRequired: true },
    fields: [
      { key: "purpose", label: "Purpose / reason", fieldType: DocumentFieldType.TEXTAREA, required: true },
      { key: "scheduledDate", label: "Scheduled date", fieldType: DocumentFieldType.DATE, required: true },
      { key: "startTime", label: "Start time", fieldType: DocumentFieldType.TEXT, required: true },
      { key: "endTime", label: "End time", fieldType: DocumentFieldType.TEXT, required: true },
      { key: "driverName", label: "Driver / representative", fieldType: DocumentFieldType.TEXT, required: false },
      { key: "vehicleDetails", label: "Vehicle details", fieldType: DocumentFieldType.TEXTAREA, required: false },
      { key: "destination", label: "Destination / gate", fieldType: DocumentFieldType.TEXT, required: false },
      { key: "remarks", label: "Remarks", fieldType: DocumentFieldType.TEXTAREA, required: false },
    ],
    template: approvedPassTemplate("GATE"),
  }),
  blueprint({
    key: "move-in-pass", code: "MOVE_IN_PASS", displayName: "Move-In Pass", category: "Pass",
    description: "Professional two-copy A4 move-in authorization pass with service-provider, vehicle, item, schedule, holder/security copies, and QR validation.",
    legacyType: null, numberingFormat: "MIP-{YYYY}-{SEQUENCE:6}", validityDays: 1, maxCopies: 2,
    outstandingBalancePolicy: DocumentOutstandingBalancePolicy.IGNORE_BALANCE, workflow: { ...freeApprovalWorkflow, releaseRequired: true },
    fields: [
      { key: "passType", label: "Pass type", fieldType: DocumentFieldType.SELECT, required: true, options: ["MOVE_IN"], defaultValue: "MOVE_IN" },
      { key: "purpose", label: "Purpose / reason", fieldType: DocumentFieldType.TEXTAREA, required: true },
      { key: "scheduledDate", label: "Move-in date", fieldType: DocumentFieldType.DATE, required: true },
      { key: "startTime", label: "Start time", fieldType: DocumentFieldType.TEXT, required: true },
      { key: "endTime", label: "End time", fieldType: DocumentFieldType.TEXT, required: true },
      { key: "representativeName", label: "Representative", fieldType: DocumentFieldType.TEXT, required: false },
      { key: "movingCompany", label: "Moving company", fieldType: DocumentFieldType.TEXT, required: false },
      { key: "serviceProvider", label: "Service provider", fieldType: DocumentFieldType.TEXT, required: false },
      { key: "vehicleDetails", label: "Vehicle details", fieldType: DocumentFieldType.TEXTAREA, required: false },
      { key: "itemsSummary", label: "Items / materials summary", fieldType: DocumentFieldType.TEXTAREA, required: true },
      { key: "remarks", label: "Remarks", fieldType: DocumentFieldType.TEXTAREA, required: false },
    ],
    template: approvedPassTemplate("MOVE_IN"),
  }),
  blueprint({
    key: "move-out-pass", code: "MOVE_OUT_PASS", displayName: "Move-Out Pass", category: "Pass",
    description: "Professional two-copy A4 move-out authorization pass with service-provider, vehicle, item, schedule, holder/security copies, and QR validation.",
    legacyType: null, numberingFormat: "MOP-{YYYY}-{SEQUENCE:6}", validityDays: 1, maxCopies: 2,
    outstandingBalancePolicy: DocumentOutstandingBalancePolicy.IGNORE_BALANCE, workflow: { ...freeApprovalWorkflow, releaseRequired: true },
    fields: [
      { key: "passType", label: "Pass type", fieldType: DocumentFieldType.SELECT, required: true, options: ["MOVE_OUT"], defaultValue: "MOVE_OUT" },
      { key: "purpose", label: "Purpose / reason", fieldType: DocumentFieldType.TEXTAREA, required: true },
      { key: "scheduledDate", label: "Move-out date", fieldType: DocumentFieldType.DATE, required: true },
      { key: "startTime", label: "Start time", fieldType: DocumentFieldType.TEXT, required: true },
      { key: "endTime", label: "End time", fieldType: DocumentFieldType.TEXT, required: true },
      { key: "representativeName", label: "Representative", fieldType: DocumentFieldType.TEXT, required: false },
      { key: "movingCompany", label: "Moving company", fieldType: DocumentFieldType.TEXT, required: false },
      { key: "serviceProvider", label: "Service provider", fieldType: DocumentFieldType.TEXT, required: false },
      { key: "vehicleDetails", label: "Vehicle details", fieldType: DocumentFieldType.TEXTAREA, required: false },
      { key: "itemsSummary", label: "Items / materials summary", fieldType: DocumentFieldType.TEXTAREA, required: true },
      { key: "remarks", label: "Remarks", fieldType: DocumentFieldType.TEXTAREA, required: false },
    ],
    template: approvedPassTemplate("MOVE_OUT"),
  }),
  blueprint({
    key: "work-permit", code: "WORK_PERMIT", displayName: "Work Permit", category: "Permit",
    description: "Professional HOA work authorization permit with property/requestor identity, contractor/work lead, approved schedule and scope, security conditions, official numbering, and QR validation.",
    legacyType: null, numberingFormat: "WP-{YYYY}-{SEQUENCE:6}", validityDays: 1, maxCopies: 2,
    outstandingBalancePolicy: DocumentOutstandingBalancePolicy.IGNORE_BALANCE, workflow: { ...freeApprovalWorkflow, releaseRequired: true }, fields: workPermitFields(),
    template: professionalWorkPermitTemplate(),
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
