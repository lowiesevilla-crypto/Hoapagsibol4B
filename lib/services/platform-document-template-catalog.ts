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
export const FREE_DOCUMENT_LIBRARY_VERSION = 1;

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

const purposeFields = (): FreeDocumentTemplateField[] => [
  { key: "purpose", label: "Purpose", fieldType: DocumentFieldType.TEXTAREA, required: true },
  { key: "remarks", label: "Additional remarks", fieldType: DocumentFieldType.TEXTAREA, required: false },
];

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

function professionalCertificateTemplate(input: {
  title: string;
  eyebrow: string;
  body: string;
  supporting?: string;
}): DocumentTemplateDefinition {
  const template = defaultTemplateDefinition(input.title);
  const navy = "#071f4f";
  const gold = "#c79318";
  const slate = "#475569";

  template.page.marginPreset = "custom";
  template.page.margins = { top: 10, right: 10, bottom: 10, left: 10 };
  template.page.border = { enabled: true, style: "solid", width: 1.25, color: navy };
  template.page.backgroundColor = "#ffffff";
  template.page.backgroundOpacity = 1;
  template.page.watermark = {
    enabled: true,
    text: "OFFICIAL",
    opacity: 0.05,
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
    warnOnOverflow: false,
    minimumMarginMm: 10,
  };

  const header: DocumentTemplateBlock[] = [
    {
      id: "library-logo",
      section: "header",
      type: "logo",
      binding: "tenant.logo",
      content: "{{tenant.logo}}",
      order: 10,
      visible: true,
      required: false,
      position: { x: 16, y: 14, width: 27, height: 27, zIndex: 20 },
      style: { align: "center", borderColor: gold, borderWidth: 1, radius: 14, padding: 2 },
      image: { fit: "contain", positionX: "center", positionY: "center", opacity: 1, lockAspectRatio: true },
    },
    {
      id: "library-tenant",
      section: "header",
      type: "tenantName",
      content: "{{tenant.name}}",
      order: 20,
      visible: true,
      position: { x: 49, y: 13, width: 112, height: 9, zIndex: 20 },
      style: { align: "center", fontFamily: "Times New Roman", fontSize: 17, fontWeight: "bold", textColor: navy },
    },
    {
      id: "library-address",
      section: "header",
      type: "address",
      content: "{{tenant.address}}",
      order: 30,
      visible: true,
      position: { x: 49, y: 23, width: 112, height: 7, zIndex: 20 },
      style: { align: "center", fontFamily: "Arial", fontSize: 8.5, textColor: slate },
    },
    {
      id: "library-registration",
      section: "header",
      type: "text",
      content: "SEC: {{tenant.secRegistration}}  •  TIN: {{tenant.tin}}",
      order: 40,
      visible: true,
      required: false,
      position: { x: 49, y: 31, width: 112, height: 6, zIndex: 20 },
      style: { align: "center", fontFamily: "Arial", fontSize: 7.5, textColor: slate },
    },
    {
      id: "library-contact",
      section: "header",
      type: "text",
      content: "{{tenant.contactNumber}}  •  {{tenant.email}}",
      order: 50,
      visible: true,
      required: false,
      position: { x: 49, y: 38, width: 112, height: 6, zIndex: 20 },
      style: { align: "center", fontFamily: "Arial", fontSize: 7.5, textColor: slate },
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
      position: { x: 168, y: 13, width: 27, height: 27, zIndex: 30 },
      style: { align: "center", borderColor: "#cbd5e1", borderWidth: 1, padding: 1 },
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
      position: { x: 166, y: 41, width: 31, height: 5, zIndex: 30 },
      style: { align: "center", fontFamily: "Arial", fontSize: 6.5, fontWeight: "bold", textColor: navy },
    },
    {
      id: "library-header-line",
      section: "header",
      type: "horizontalLine",
      order: 80,
      visible: true,
      position: { x: 16, y: 50, width: 179, height: 1, zIndex: 18 },
      style: { lineColor: gold, lineWidth: 1.2, lineStyle: "solid", opacity: 1 },
    },
  ];

  const body: DocumentTemplateBlock[] = [
    {
      id: "library-eyebrow",
      section: "body",
      type: "heading",
      content: input.eyebrow,
      order: 10,
      visible: true,
      position: { x: 24, y: 62, width: 162, height: 7, zIndex: 20 },
      style: { align: "center", fontFamily: "Arial", fontSize: 8, fontWeight: "bold", textColor: gold },
    },
    {
      id: "library-title",
      section: "body",
      type: "documentTitle",
      content: input.title,
      order: 20,
      visible: true,
      position: { x: 24, y: 70, width: 162, height: 15, zIndex: 20 },
      style: { align: "center", fontFamily: "Times New Roman", fontSize: 20, fontWeight: "bold", textColor: navy },
    },
    {
      id: "library-meta-panel",
      section: "body",
      type: "rectangle",
      order: 30,
      visible: true,
      position: { x: 24, y: 89, width: 162, height: 18, zIndex: 5 },
      style: { backgroundColor: "#f8fafc", borderColor: "#cbd5e1", borderWidth: 1, radius: 3 },
    },
    {
      id: "library-doc-number",
      section: "body",
      type: "text",
      content: "DOCUMENT NO.\n{{document.number}}",
      order: 40,
      visible: true,
      position: { x: 29, y: 93, width: 72, height: 11, zIndex: 10 },
      style: { fontFamily: "Arial", fontSize: 7.5, lineHeight: 1.12, fontWeight: "bold", textColor: navy },
    },
    {
      id: "library-issue-date",
      section: "body",
      type: "text",
      content: "DATE ISSUED\n{{document.issueDate}}",
      order: 50,
      visible: true,
      position: { x: 111, y: 93, width: 70, height: 11, zIndex: 10 },
      style: { align: "right", fontFamily: "Arial", fontSize: 7.5, lineHeight: 1.12, fontWeight: "bold", textColor: navy },
    },
    {
      id: "library-certifies",
      section: "body",
      type: "heading",
      content: "TO WHOM IT MAY CONCERN:",
      order: 60,
      visible: true,
      position: { x: 29, y: 118, width: 152, height: 8, zIndex: 20 },
      style: { align: "left", fontFamily: "Times New Roman", fontSize: 11, fontWeight: "bold", textColor: navy },
    },
    {
      id: "library-body",
      section: "body",
      type: "bodyText",
      content: input.body,
      order: 70,
      visible: true,
      position: { x: 29, y: 130, width: 152, height: 47, zIndex: 20 },
      style: { align: "justify", fontFamily: "Times New Roman", fontSize: 11.5, lineHeight: 1.55, textColor: "#111827" },
    },
    {
      id: "library-supporting",
      section: "body",
      type: "paragraph",
      content: input.supporting || "This certification is issued upon request for {{request.purpose}} and is subject to the records and policies of {{tenant.name}}.",
      order: 80,
      visible: true,
      position: { x: 29, y: 181, width: 152, height: 28, zIndex: 20 },
      style: { align: "justify", fontFamily: "Times New Roman", fontSize: 11.5, lineHeight: 1.5, textColor: "#111827" },
    },
    {
      id: "library-issued",
      section: "body",
      type: "issueDate",
      content: "Issued on {{document.issueDate}} at {{document.issuePlace}}.",
      order: 90,
      visible: true,
      position: { x: 29, y: 211, width: 152, height: 9, zIndex: 20 },
      style: { fontFamily: "Times New Roman", fontSize: 11.5, textColor: "#111827" },
    },
    {
      id: "library-signatory-line",
      section: "body",
      type: "horizontalLine",
      order: 100,
      visible: true,
      required: false,
      position: { x: 112, y: 244, width: 64, height: 1, zIndex: 20 },
      style: { lineColor: navy, lineWidth: 0.8, lineStyle: "solid", opacity: 1 },
    },
    {
      id: "library-signatory",
      section: "body",
      type: "signatory",
      content: "{{signatory.name}}\n{{signatory.position}}\nAuthorized HOA Signatory",
      order: 110,
      visible: true,
      required: false,
      position: { x: 105, y: 246, width: 78, height: 25, zIndex: 20 },
      style: { align: "center", fontFamily: "Times New Roman", fontSize: 10, lineHeight: 1.15, fontWeight: "bold", textColor: navy },
    },
    {
      id: "library-security-note",
      section: "body",
      type: "textBox",
      content: "SECURE DIGITAL DOCUMENT\nQR status: {{document.status}}\nVerification code: {{verification.code}}",
      order: 120,
      visible: true,
      required: false,
      position: { x: 29, y: 230, width: 61, height: 29, zIndex: 20 },
      style: { fontFamily: "Arial", fontSize: 7, lineHeight: 1.3, textColor: slate, backgroundColor: "#f8fafc", borderColor: gold, borderWidth: 1, radius: 3, padding: 3 },
    },
  ];

  const footer: DocumentTemplateBlock[] = [
    {
      id: "library-footer-line",
      section: "footer",
      type: "horizontalLine",
      order: 10,
      visible: true,
      position: { x: 16, y: 278, width: 179, height: 1, zIndex: 20 },
      style: { lineColor: "#cbd5e1", lineWidth: 0.6, lineStyle: "solid", opacity: 1 },
    },
    {
      id: "library-footer",
      section: "footer",
      type: "footer",
      content: "Electronically generated by HOAHub • Validate authenticity using the QR code or {{verification.code}} • {{tenant.name}}",
      order: 20,
      visible: true,
      position: { x: 20, y: 281, width: 170, height: 7, zIndex: 20 },
      style: { align: "center", fontFamily: "Arial", fontSize: 6.8, textColor: slate },
    },
  ];

  template.sections = { header, body, footer };
  template.blocks = [...header, ...body, ...footer];
  template.meta = {
    editor: "professional-document-editor",
    revisionNote: `HOAHub Free Document Library • ${input.title} • v${FREE_DOCUMENT_LIBRARY_VERSION}`,
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
    revisionNote: `HOAHub Free Document Library • ${kind.replaceAll("_", " ")} • v${FREE_DOCUMENT_LIBRARY_VERSION}`,
    requiresSignatory: false,
  };
  template.blocks = [...template.sections.header, ...template.sections.body, ...template.sections.footer];
  return template;
}

const blueprints: FreeDocumentTemplateBlueprint[] = [
  {
    key: "certificate-of-residency", libraryVersion: 1, code: "CERTIFICATE_OF_RESIDENCY", displayName: "Certificate of Residency", category: "Certificate",
    description: "Professional residency certification with tenant identity, official numbering, approval workflow, and QR authenticity validation.",
    legacyType: DocumentType.CERTIFICATE_OF_RESIDENCY, numberingFormat: "COR-{YYYY}-{SEQUENCE:6}", validityDays: 90, maxCopies: 5,
    outstandingBalancePolicy: DocumentOutstandingBalancePolicy.IGNORE_BALANCE, workflow: { ...freeApprovalWorkflow }, fields: purposeFields(),
    template: professionalCertificateTemplate({ title: "CERTIFICATE OF RESIDENCY", eyebrow: "OFFICIAL RESIDENCY CERTIFICATION", body: "This is to certify that {{subject.fullName}} is recorded as a bona fide resident/homeowner of {{tenant.name}} with property/address at {{property.address}} (Block {{property.block}}, Lot {{property.lot}}), based on Association records available as of the date of issuance." }),
  },
  {
    key: "certificate-of-indigency", libraryVersion: 1, code: "CERTIFICATE_OF_INDIGENCY", displayName: "Certificate of Indigency", category: "Certificate",
    description: "Approval-controlled indigency certification template using tenant records/declarations and QR authenticity validation.",
    legacyType: null, numberingFormat: "COI-{YYYY}-{SEQUENCE:6}", validityDays: 90, maxCopies: 3,
    outstandingBalancePolicy: DocumentOutstandingBalancePolicy.IGNORE_BALANCE, workflow: { ...freeApprovalWorkflow }, fields: purposeFields(),
    template: professionalCertificateTemplate({ title: "CERTIFICATE OF INDIGENCY", eyebrow: "OFFICIAL COMMUNITY CERTIFICATION", body: "This is to certify that {{subject.fullName}}, residing at {{property.address}}, has been reviewed by the authorized Association office for purposes of an indigency certification. Based on the records and declarations presented to the Association and approved through the configured workflow, this certification is issued in the resident's name.", supporting: "This certificate is issued for {{request.purpose}}. The receiving agency remains responsible for determining whether this certification satisfies its own documentary requirements." }),
  },
  {
    key: "certificate-of-good-standing", libraryVersion: 1, code: "CERTIFICATE_OF_GOOD_STANDING", displayName: "Certificate of Good Standing", category: "Certificate",
    description: "Good-standing certification with balance-sensitive release policy, tenant approval, and QR verification.",
    legacyType: DocumentType.CERTIFICATE_OF_GOOD_STANDING, numberingFormat: "CGS-{YYYY}-{SEQUENCE:6}", validityDays: 30, maxCopies: 5,
    outstandingBalancePolicy: DocumentOutstandingBalancePolicy.BLOCK_DOWNLOAD, workflow: { ...freeApprovalWorkflow }, fields: purposeFields(),
    template: professionalCertificateTemplate({ title: "CERTIFICATE OF GOOD STANDING", eyebrow: "ASSOCIATION ACCOUNT & MEMBERSHIP CERTIFICATION", body: "This is to certify that {{subject.fullName}}, associated with {{property.address}}, is recorded by {{tenant.name}} in good standing for purposes of this certification as of {{document.issueDate}}, subject to the Association's configured account, membership, and release policies.", supporting: "This certification is issued for {{request.purpose}} and is valid only for the period stated on the document, if any." }),
  },
  {
    key: "clearance-certificate", libraryVersion: 1, code: "CLEARANCE_CERTIFICATE", displayName: "Clearance Certificate", category: "Clearance",
    description: "Formal HOA clearance certificate with controlled approval, balance-aware release, and QR verification.",
    legacyType: DocumentType.CLEARANCE_CERTIFICATE, numberingFormat: "CLR-{YYYY}-{SEQUENCE:6}", validityDays: 30, maxCopies: 5,
    outstandingBalancePolicy: DocumentOutstandingBalancePolicy.BLOCK_DOWNLOAD, workflow: { ...freeApprovalWorkflow }, fields: purposeFields(),
    template: professionalCertificateTemplate({ title: "CLEARANCE CERTIFICATE", eyebrow: "OFFICIAL ASSOCIATION CLEARANCE", body: "This is to certify that {{subject.fullName}}, associated with {{property.address}}, has been cleared for the purpose stated below based on the records reviewed by {{tenant.name}} as of {{document.issueDate}} and subject to the Association's configured clearance policies." }),
  },
  {
    key: "payment-certification", libraryVersion: 1, code: "PAYMENT_CERTIFICATION", displayName: "Payment Certification", category: "Finance Certificate",
    description: "Professional certification of HOA payment records with finance review workflow and QR verification.",
    legacyType: DocumentType.PAYMENT_CERTIFICATION, numberingFormat: "PAYCERT-{YYYY}-{SEQUENCE:6}", validityDays: 30, maxCopies: 5,
    outstandingBalancePolicy: DocumentOutstandingBalancePolicy.IGNORE_BALANCE, workflow: { ...freeApprovalWorkflow }, fields: purposeFields(),
    template: professionalCertificateTemplate({ title: "PAYMENT CERTIFICATION", eyebrow: "OFFICIAL ASSOCIATION PAYMENT RECORD CERTIFICATION", body: "This is to certify that the Association maintains payment records for {{subject.fullName}} under account {{property.accountNumber}} for {{property.address}}. The authorized HOA office has reviewed the applicable ledger information before approval of this certification.", supporting: "This certification is issued for {{request.purpose}}. It certifies only records approved for release by {{tenant.name}} and does not replace an official receipt or Statement of Account." }),
  },
  {
    key: "construction-bond-certification", libraryVersion: 1, code: "CONSTRUCTION_BOND_CERTIFICATION", displayName: "Construction Bond Certification", category: "Bond Certificate",
    description: "Construction bond record certification with approval workflow, official numbering, and QR validation.",
    legacyType: DocumentType.CONSTRUCTION_BOND_CERTIFICATION, numberingFormat: "CBOND-{YYYY}-{SEQUENCE:6}", validityDays: 30, maxCopies: 5,
    outstandingBalancePolicy: DocumentOutstandingBalancePolicy.IGNORE_BALANCE, workflow: { ...freeApprovalWorkflow }, fields: purposeFields(),
    template: professionalCertificateTemplate({ title: "CONSTRUCTION BOND CERTIFICATION", eyebrow: "OFFICIAL CONSTRUCTION BOND RECORD", body: "This is to certify that {{tenant.name}} maintains a construction-bond record associated with {{subject.fullName}} and {{property.address}}. The certification is issued only after review by the authorized Association office and does not by itself authorize a refund or forfeiture." }),
  },
  {
    key: "contractor-bond-certification", libraryVersion: 1, code: "CONTRACTOR_BOND_CERTIFICATION", displayName: "Contractor Bond Certification", category: "Bond Certificate",
    description: "Contractor bond certification with tenant approval, controlled release, and QR authenticity validation.",
    legacyType: DocumentType.CONTRACTOR_BOND_CERTIFICATION, numberingFormat: "CTBOND-{YYYY}-{SEQUENCE:6}", validityDays: 30, maxCopies: 5,
    outstandingBalancePolicy: DocumentOutstandingBalancePolicy.IGNORE_BALANCE, workflow: { ...freeApprovalWorkflow }, fields: purposeFields(),
    template: professionalCertificateTemplate({ title: "CONTRACTOR BOND CERTIFICATION", eyebrow: "OFFICIAL CONTRACTOR BOND RECORD", body: "This is to certify that {{tenant.name}} maintains a contractor-bond record connected with the requesting property/account at {{property.address}}. The authorized Association office reviewed the relevant record before approval of this certification.", supporting: "This certificate is issued for {{request.purpose}}. It does not independently authorize release, refund, or forfeiture of any bond amount." }),
  },
  {
    key: "gate-pass", libraryVersion: 1, code: "GATE_PASS", displayName: "Gate Pass", category: "Pass",
    description: "Approved professional two-copy A4 gate pass with homeowner/property details, schedule/vehicle fields, and QR validation.",
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
  },
  {
    key: "move-in-pass", libraryVersion: 1, code: "MOVE_IN_PASS", displayName: "Move-In Pass", category: "Pass",
    description: "Professional two-copy A4 move-in authorization pass with service-provider, vehicle, item, schedule, and QR validation fields.",
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
  },
  {
    key: "move-out-pass", libraryVersion: 1, code: "MOVE_OUT_PASS", displayName: "Move-Out Pass", category: "Pass",
    description: "Professional two-copy A4 move-out authorization pass with service-provider, vehicle, item, schedule, and QR validation fields.",
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
  },
];

export const freeDocumentTemplateBlueprints: readonly FreeDocumentTemplateBlueprint[] = blueprints;

export function freeDocumentTemplateBlueprintByKey(key: string) {
  return freeDocumentTemplateBlueprints.find((item) => item.key === key) ?? null;
}

export function validateFreeDocumentTemplateCatalog() {
  const errors: string[] = [];
  const seenKeys = new Set<string>();
  const seenCodes = new Set<string>();
  for (const blueprint of freeDocumentTemplateBlueprints) {
    if (seenKeys.has(blueprint.key)) errors.push(`Duplicate library key: ${blueprint.key}`);
    if (seenCodes.has(blueprint.code)) errors.push(`Duplicate document code: ${blueprint.code}`);
    seenKeys.add(blueprint.key);
    seenCodes.add(blueprint.code);
    if (blueprint.workflow.paymentRequired || blueprint.workflow.feeAmount !== 0) errors.push(`${blueprint.displayName} must remain free in the free document library.`);
    if (!blueprint.numberingFormat.includes("{SEQUENCE")) errors.push(`${blueprint.displayName} must use a sequence-based document number for QR verification.`);
    const validation = validateTemplateDefinition(blueprint.template);
    if (!validation.valid) errors.push(...validation.errors.map((error) => `${blueprint.displayName}: ${error}`));
    const blocks = [...blueprint.template.sections.header, ...blueprint.template.sections.body, ...blueprint.template.sections.footer];
    if (!blocks.some((block) => block.type === "qrVerification")) errors.push(`${blueprint.displayName} is missing QR verification.`);
    if (blueprint.template.meta.requiresSignatory === true) errors.push(`${blueprint.displayName} cannot require a preconfigured signatory because the library must install safely for every tenant.`);
  }
  return { valid: errors.length === 0, errors };
}
