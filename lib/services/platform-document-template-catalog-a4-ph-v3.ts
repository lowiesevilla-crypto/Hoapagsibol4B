import {
  FREE_DOCUMENT_LIBRARY_SOURCE as BASE_LIBRARY_SOURCE,
  freeDocumentTemplateBlueprints as baseBlueprints,
  type FreeDocumentTemplateBlueprint,
  type FreeDocumentTemplateField,
} from "@/lib/services/platform-document-template-catalog-approved";
import {
  defaultQrConfig,
  defaultTemplateDefinition,
  validateTemplateDefinition,
  type DocumentTemplateBlock,
  type DocumentTemplateDefinition,
  type DocumentTemplateSectionName,
} from "@/lib/services/document-template-builder";

export const FREE_DOCUMENT_LIBRARY_SOURCE = BASE_LIBRARY_SOURCE;
export const FREE_DOCUMENT_LIBRARY_VERSION = 3;
export type { FreeDocumentTemplateBlueprint, FreeDocumentTemplateField };

type CertificateVariant =
  | "RESIDENCY"
  | "INDIGENCY"
  | "GOOD_STANDING"
  | "CLEARANCE"
  | "PAYMENT"
  | "CONSTRUCTION_BOND"
  | "CONTRACTOR_BOND";

type PassKind = "GATE" | "MOVE_IN" | "MOVE_OUT" | "WORK_PERMIT";

const NAVY = "#071f4f";
const NAVY_2 = "#0b2a63";
const GOLD = "#b88718";
const GOLD_SOFT = "#f5edd8";
const INK = "#111827";
const SLATE = "#475569";
const LINE = "#cbd5e1";
const LIGHT = "#f8fafc";
const GREEN = "#17663a";
const RED = "#8b1e1e";
const WHITE = "#ffffff";

function cloneTemplate(value: DocumentTemplateDefinition): DocumentTemplateDefinition {
  return JSON.parse(JSON.stringify(value)) as DocumentTemplateDefinition;
}

function newA4(title: string, watermarkText = ""): DocumentTemplateDefinition {
  const template = cloneTemplate(defaultTemplateDefinition(title));
  template.page.format = "A4";
  template.page.orientation = "portrait";
  template.page.widthMm = 210;
  template.page.heightMm = 297;
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
  template.page.backgroundColor = WHITE;
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
    showCenterGuides: false,
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

function finalize(
  template: DocumentTemplateDefinition,
  sections: Record<DocumentTemplateSectionName, DocumentTemplateBlock[]>,
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

function rect(
  id: string,
  section: DocumentTemplateSectionName,
  x: number,
  y: number,
  width: number,
  height: number,
  backgroundColor: string,
  borderColor = LINE,
  borderWidth = 0.7,
  radius = 2,
  order = 10,
): DocumentTemplateBlock {
  return {
    id,
    section,
    type: "rectangle",
    order,
    visible: true,
    position: { x, y, width, height, zIndex: 2 },
    style: { backgroundColor, borderColor, borderWidth, radius },
  };
}

function line(
  id: string,
  section: DocumentTemplateSectionName,
  x: number,
  y: number,
  width: number,
  lineColor = LINE,
  lineWidth = 0.7,
  lineStyle: "solid" | "dashed" | "dotted" = "solid",
  order = 20,
): DocumentTemplateBlock {
  return {
    id,
    section,
    type: "horizontalLine",
    order,
    visible: true,
    position: { x, y, width, height: 1, zIndex: 5 },
    style: { lineColor, lineWidth, lineStyle, opacity: 1 },
  };
}

function txt(
  id: string,
  section: DocumentTemplateSectionName,
  content: string,
  x: number,
  y: number,
  width: number,
  height: number,
  options: {
    fontFamily?: "Arial" | "Inter" | "Times New Roman" | "Georgia" | "Calibri";
    fontSize?: number;
    fontWeight?: "normal" | "bold";
    textColor?: string;
    align?: "left" | "center" | "right" | "justify";
    lineHeight?: number;
    backgroundColor?: string;
    borderColor?: string;
    borderWidth?: number;
    radius?: number;
    padding?: number;
    italic?: boolean;
    type?: DocumentTemplateBlock["type"];
    order?: number;
  } = {},
): DocumentTemplateBlock {
  return {
    id,
    section,
    type: options.type ?? "text",
    content,
    order: options.order ?? 30,
    visible: true,
    position: { x, y, width, height, zIndex: 20 },
    style: {
      fontFamily: options.fontFamily ?? "Arial",
      fontSize: options.fontSize ?? 8,
      fontWeight: options.fontWeight ?? "normal",
      textColor: options.textColor ?? INK,
      align: options.align ?? "left",
      lineHeight: options.lineHeight ?? 1.2,
      backgroundColor: options.backgroundColor,
      borderColor: options.borderColor,
      borderWidth: options.borderWidth,
      radius: options.radius,
      padding: options.padding,
      italic: options.italic,
    },
  };
}

function logo(
  id: string,
  section: DocumentTemplateSectionName,
  x: number,
  y: number,
  width: number,
  height: number,
  order = 40,
): DocumentTemplateBlock {
  return {
    id,
    section,
    type: "logo",
    binding: "tenant.logo",
    content: "{{tenant.logo}}",
    order,
    visible: true,
    required: false,
    position: { x, y, width, height, zIndex: 30 },
    style: { align: "center", borderColor: GOLD, borderWidth: 0.8, radius: 3, padding: 1 },
    image: {
      fit: "contain",
      positionX: "center",
      positionY: "center",
      opacity: 1,
      lockAspectRatio: true,
    },
  };
}

function qr(
  id: string,
  section: DocumentTemplateSectionName,
  x: number,
  y: number,
  size: number,
  label = "SCAN TO VERIFY",
  order = 900,
): DocumentTemplateBlock {
  return {
    id,
    section,
    type: "qrVerification",
    binding: "verification.url",
    content: "{{verification.url}}",
    order,
    visible: true,
    required: false,
    position: { x, y, width: size, height: size, zIndex: 40 },
    style: { align: "center", borderColor: LINE, borderWidth: 0.7, padding: 1 },
    qr: {
      ...defaultQrConfig,
      label,
      instruction: "Verify authenticity online",
      showLabel: true,
      showInstruction: true,
    },
  };
}

function certificateHeader(metaLabel = "CERTIFICATE NO."): DocumentTemplateBlock[] {
  return [
    logo("a4-tenant-logo", "header", 10, 9, 27, 27),
    txt(
      "a4-tenant-name",
      "header",
      "{{tenant.name}} HOMEOWNERS' ASSOCIATION, INC.",
      42,
      10,
      112,
      7,
      { fontFamily: "Georgia", fontSize: 10.5, fontWeight: "bold", textColor: NAVY, align: "center" },
    ),
    txt("a4-tenant-address", "header", "{{tenant.address}}, Philippines", 42, 18, 112, 6, {
      fontSize: 7.5,
      textColor: SLATE,
      align: "center",
    }),
    txt(
      "a4-tenant-registration",
      "header",
      "TIN: {{tenant.tin}}  •  DHSUD/SEC Registration No.: {{tenant.secRegistration}}",
      42,
      25,
      112,
      6,
      { fontSize: 7.2, fontWeight: "bold", textColor: NAVY_2, align: "center" },
    ),
    rect("a4-meta-panel", "header", 160, 8, 40, 31, LIGHT, GOLD, 0.8, 2),
    txt(
      "a4-meta",
      "header",
      `${metaLabel}\n{{document.number}}\nDATE ISSUED\n{{document.issueDate}}`,
      164,
      11,
      32,
      24,
      { fontSize: 7.2, lineHeight: 1.3, fontWeight: "bold", textColor: NAVY, align: "center" },
    ),
    line("a4-header-gold-rule", "header", 10, 43, 190, GOLD, 1.1),
  ];
}

function sealAndVerification(signatoryLabel: string): DocumentTemplateBlock[] {
  return [
    rect("a4-seal-circle", "body", 24, 238, 26, 26, GOLD_SOFT, GOLD, 1.2, 13, 200),
    txt("a4-seal-text", "body", "ASSOCIATION\nSEAL", 27, 245, 20, 11, {
      fontFamily: "Georgia",
      fontSize: 7.2,
      fontWeight: "bold",
      textColor: GOLD,
      align: "center",
      lineHeight: 1.05,
      order: 210,
    }),
    line("a4-sign-line", "body", 80, 249, 70, NAVY, 0.8, "solid", 220),
    txt(
      "a4-signatory",
      "body",
      `{{signatory.name}}\n{{signatory.position}}\n${signatoryLabel}`,
      77,
      252,
      76,
      18,
      {
        fontFamily: "Times New Roman",
        fontSize: 8.5,
        fontWeight: "bold",
        textColor: NAVY,
        align: "center",
        lineHeight: 1.12,
        order: 230,
        type: "signatory",
      },
    ),
    qr("a4-certificate-qr", "body", 163, 238, 27, "SCAN TO VERIFY", 240),
    txt("a4-verification-code", "body", "VERIFY ONLINE\n{{verification.code}}", 158, 266, 37, 8, {
      fontSize: 7,
      fontWeight: "bold",
      textColor: NAVY,
      align: "center",
      lineHeight: 1.05,
      order: 250,
      type: "verificationText",
    }),
  ];
}

function certificateFooter(text: string): DocumentTemplateBlock[] {
  return [
    rect("a4-footer-bar", "footer", 6, 280, 198, 9, NAVY, NAVY, 0.5, 0, 10),
    txt("a4-footer-text", "footer", text, 10, 282, 190, 5, {
      fontSize: 7,
      fontWeight: "bold",
      textColor: WHITE,
      align: "center",
      order: 20,
      type: "footer",
    }),
  ];
}

function certificateTemplate(variant: CertificateVariant): DocumentTemplateDefinition {
  const titles: Record<CertificateVariant, string> = {
    RESIDENCY: "CERTIFICATE OF RESIDENCY",
    INDIGENCY: "CERTIFICATE OF INDIGENCY",
    GOOD_STANDING: "CERTIFICATE OF GOOD STANDING",
    CLEARANCE: "CLEARANCE CERTIFICATE",
    PAYMENT: "PAYMENT CERTIFICATION",
    CONSTRUCTION_BOND: "CONSTRUCTION BOND CERTIFICATION",
    CONTRACTOR_BOND: "CONTRACTOR BOND CERTIFICATION",
  };
  const subtitles: Record<CertificateVariant, string> = {
    RESIDENCY: "Association Certification • For Lawful Purposes",
    INDIGENCY: "Association Certification of Financial Hardship",
    GOOD_STANDING: "Membership and Account Status Certification",
    CLEARANCE: "Association Account and Administrative Clearance",
    PAYMENT: "Certification of Association Payment Records",
    CONSTRUCTION_BOND: "Construction Security / Performance Bond Record",
    CONTRACTOR_BOND: "Contractor Compliance and Security Certification",
  };
  const metaLabels: Record<CertificateVariant, string> = {
    RESIDENCY: "CERTIFICATE NO.",
    INDIGENCY: "CERTIFICATE NO.",
    GOOD_STANDING: "CERTIFICATE NO.",
    CLEARANCE: "CLEARANCE NO.",
    PAYMENT: "CERTIFICATE NO.",
    CONSTRUCTION_BOND: "CERTIFICATE NO.",
    CONTRACTOR_BOND: "CERTIFICATE NO.",
  };
  const template = newA4(titles[variant], variant.replaceAll("_", " "));
  const header = certificateHeader(metaLabels[variant]);
  const body: DocumentTemplateBlock[] = [
    txt("a4-subtitle", "body", subtitles[variant], 18, 49, 174, 7, {
      fontSize: 8,
      fontWeight: "bold",
      textColor: GOLD,
      align: "center",
      order: 10,
      type: "heading",
    }),
    txt("a4-title", "body", titles[variant], 15, 57, 180, 12, {
      fontFamily: "Georgia",
      fontSize: variant === "CONSTRUCTION_BOND" || variant === "CONTRACTOR_BOND" ? 16.5 : 18.5,
      fontWeight: "bold",
      textColor: NAVY,
      align: "center",
      order: 20,
      type: "documentTitle",
    }),
  ];

  if (variant === "RESIDENCY") {
    body.push(
      txt(
        "a4-legal-body",
        "body",
        "TO WHOM IT MAY CONCERN:\n\nThis is to certify that, based on the membership and occupancy records maintained by {{tenant.name}}, {{subject.fullName}} is presently recorded as a {{subject.relationship}} / resident / authorized occupant of the property located at {{property.address}}, Philippines.\n\nThis certification is issued upon the request of the above-named person for {{request.purpose}} or such other lawful purpose for which proof of community residence may be accepted.",
        20,
        77,
        170,
        67,
        { fontFamily: "Times New Roman", fontSize: 10.2, lineHeight: 1.34, align: "justify", order: 30, type: "bodyText" },
      ),
      rect("a4-residency-card", "body", 22, 150, 166, 37, LIGHT, GOLD, 0.8, 2, 40),
      txt("a4-residency-card-title", "body", "ASSOCIATION RECORD DETAILS", 26, 154, 158, 6, {
        fontSize: 7.5,
        fontWeight: "bold",
        textColor: NAVY,
        align: "center",
        order: 41,
      }),
      txt(
        "a4-residency-record",
        "body",
        "MEMBER / OCCUPANT\n{{subject.fullName}}  •  Member / Account No. {{property.accountNumber}}\n\nPROPERTY / UNIT\n{{property.address}}  •  Status: {{subject.status}}",
        29,
        162,
        152,
        20,
        { fontSize: 8.2, lineHeight: 1.25, textColor: INK, order: 42 },
      ),
      txt(
        "a4-residency-witness",
        "body",
        "IN WITNESS WHEREOF, this Certificate has been issued this {{document.issueDayOrdinal}} day of {{document.issueMonthYear}} at {{document.issuePlace}}, Philippines.",
        24,
        193,
        162,
        15,
        { fontFamily: "Times New Roman", fontSize: 9.4, lineHeight: 1.3, align: "justify", order: 50 },
      ),
      txt(
        "a4-residency-limitation",
        "body",
        "IMPORTANT: This is a private association certification based on HOA records and does not, by itself, replace a Barangay Certificate of Residency or any certification required from a government agency when the receiving institution specifically requires such official document.",
        24,
        211,
        162,
        20,
        { fontSize: 7.5, lineHeight: 1.2, textColor: SLATE, align: "justify", order: 60 },
      ),
      ...sealAndVerification("Association President / Authorized Officer"),
    );
  }

  if (variant === "INDIGENCY") {
    body.push(
      txt(
        "a4-legal-body",
        "body",
        "TO WHOM IT MAY CONCERN:\n\nThis is to certify that {{subject.fullName}}, of legal age, is recorded in the Association's membership / occupancy records as a resident of {{property.address}}.\n\nBased solely on the information and declaration submitted to the Association, together with such community records as are available to it, the above-named person has represented that they are presently experiencing financial hardship and has requested this private association certification for a lawful purpose.",
        20,
        77,
        170,
        68,
        { fontFamily: "Times New Roman", fontSize: 10.1, lineHeight: 1.32, align: "justify", order: 30, type: "bodyText" },
      ),
      rect("a4-indigency-card", "body", 22, 151, 166, 35, LIGHT, GOLD, 0.8, 2, 40),
      txt("a4-indigency-card-title", "body", "RECORD BASIS", 27, 155, 156, 6, {
        fontSize: 7.5,
        fontWeight: "bold",
        textColor: NAVY,
        align: "center",
        order: 41,
      }),
      txt(
        "a4-indigency-record",
        "body",
        "Resident / Member: {{subject.fullName}}\nProperty: {{property.address}}\nAssociation Record Status: {{subject.status}}\nPurpose stated by requester: {{request.purpose}}",
        29,
        163,
        152,
        19,
        { fontSize: 8.1, lineHeight: 1.22, order: 42 },
      ),
      txt(
        "a4-indigency-witness",
        "body",
        "IN WITNESS WHEREOF, this certification is issued upon request this {{document.issueDayOrdinal}} day of {{document.issueMonthYear}} at {{document.issuePlace}}, Philippines.",
        24,
        191,
        162,
        15,
        { fontFamily: "Times New Roman", fontSize: 9.3, lineHeight: 1.28, align: "justify", order: 50 },
      ),
      txt(
        "a4-indigency-limitation",
        "body",
        "LEGAL LIMITATION: This private HOA certification is not a substitute for a Barangay Certificate of Indigency, DSWD certification, or any other government-issued proof of indigency when such document is required by law, regulation, or the receiving agency.",
        24,
        210,
        162,
        21,
        { fontSize: 7.5, lineHeight: 1.2, textColor: SLATE, align: "justify", order: 60 },
      ),
      ...sealAndVerification("Association President / Authorized Officer"),
    );
  }

  if (variant === "GOOD_STANDING") {
    body.push(
      txt(
        "a4-legal-body",
        "body",
        "TO WHOM IT MAY CONCERN:\n\nThis is to certify that {{subject.fullName}}, represented in the Association's records as the member / registered owner or authorized account holder for {{property.address}}, is, as of the date of this Certificate, in good standing with the Association.\n\nFor purposes of this certification, good standing means that the Association's books do not presently reflect any past-due regular association dues, approved assessments, penalties, or other charges that are due and demandable as of the date hereof, subject to reconciliation and posting of pending transactions.",
        20,
        76,
        170,
        73,
        { fontFamily: "Times New Roman", fontSize: 9.9, lineHeight: 1.3, align: "justify", order: 30, type: "bodyText" },
      ),
      rect("a4-standing-banner", "body", 22, 153, 166, 17, NAVY, GOLD, 1.0, 2, 40),
      txt("a4-standing-status", "body", "✓  MEMBER IN GOOD STANDING", 27, 158, 156, 7, {
        fontFamily: "Georgia",
        fontSize: 12,
        fontWeight: "bold",
        textColor: WHITE,
        align: "center",
        order: 41,
      }),
      rect("a4-standing-card", "body", 22, 174, 166, 31, LIGHT, LINE, 0.8, 2, 42),
      txt(
        "a4-standing-record",
        "body",
        "MEMBERSHIP\nMember / Account No.: {{property.accountNumber}}  •  Property: {{property.address}}\n\nVALIDITY\nValid through: {{document.validUntil}}  •  Subject to continued compliance with Association obligations.",
        29,
        178,
        152,
        23,
        { fontSize: 8.1, lineHeight: 1.2, order: 43 },
      ),
      txt(
        "a4-standing-limitation",
        "body",
        "SCOPE: This certification relates only to the member's status in the Association. It is not a certification of land title, ownership, tax clearance, or absence of obligations to any government agency or third party.",
        24,
        210,
        162,
        20,
        { fontSize: 7.5, lineHeight: 1.2, textColor: SLATE, align: "justify", order: 60 },
      ),
      ...sealAndVerification("Association Treasurer / Authorized Officer"),
    );
  }

  if (variant === "CLEARANCE") {
    body.push(
      txt(
        "a4-legal-body",
        "body",
        "TO WHOM IT MAY CONCERN:\n\nThis is to certify that {{subject.fullName}}, with Association Account No. {{property.accountNumber}} for {{property.address}}, has been reviewed against the Association's available account and administrative records.\n\nAs of the date hereof, there are no outstanding amounts presently due and demandable in the categories stated below, subject to final audit, unposted transactions, subsequently assessed charges, and obligations arising after the issuance of this Certificate.",
        20,
        76,
        170,
        66,
        { fontFamily: "Times New Roman", fontSize: 9.9, lineHeight: 1.31, align: "justify", order: 30, type: "bodyText" },
      ),
      rect("a4-clearance-banner", "body", 22, 147, 166, 17, GREEN, GOLD, 1.0, 2, 40),
      txt("a4-clearance-status", "body", "✓  CLEARED — NO POSTED OUTSTANDING OBLIGATIONS", 27, 152, 156, 7, {
        fontSize: 10.5,
        fontWeight: "bold",
        textColor: WHITE,
        align: "center",
        order: 41,
      }),
      rect("a4-clearance-account", "body", 22, 168, 79, 37, LIGHT, LINE, 0.8, 2, 42),
      txt(
        "a4-clearance-account-text",
        "body",
        "PROPERTY / ACCOUNT\n{{property.address}}\nAccount No. {{property.accountNumber}}\nClearance Date: {{document.issueDate}}",
        27,
        173,
        69,
        28,
        { fontSize: 8, lineHeight: 1.25, order: 43 },
      ),
      rect("a4-clearance-scope", "body", 109, 168, 79, 37, LIGHT, GOLD, 0.8, 2, 44),
      txt(
        "a4-clearance-scope-text",
        "body",
        "CLEARANCE SCOPE\n✓ Regular Association Dues\n✓ Approved Assessments\n✓ Penalties / Fines\n✓ Facility / Service Charges\n✓ Administrative Accountabilities",
        114,
        173,
        69,
        29,
        { fontSize: 7.5, lineHeight: 1.14, order: 45 },
      ),
      txt(
        "a4-clearance-limitation",
        "body",
        "RESERVATION: This clearance does not waive, extinguish, or release obligations not yet posted, not yet due, under audit, disputed, or subsequently determined to be owing under the Association's governing documents or applicable law.",
        24,
        210,
        162,
        20,
        { fontSize: 7.5, lineHeight: 1.2, textColor: SLATE, align: "justify", order: 60 },
      ),
      ...sealAndVerification("Association Treasurer / Authorized Officer"),
    );
  }

  if (variant === "PAYMENT") {
    body.push(
      txt(
        "a4-payment-intro",
        "body",
        "This is to certify that the payments described below are reflected in the accounting records of {{tenant.name}} under the account of {{subject.fullName}}, subject to reconciliation, bank/payment-channel settlement, and the Association's official books.",
        22,
        76,
        166,
        29,
        { fontFamily: "Times New Roman", fontSize: 9.8, lineHeight: 1.32, align: "justify", order: 30, type: "bodyText" },
      ),
      rect("a4-payment-account-bar", "body", 22, 110, 166, 9, NAVY, NAVY, 0.5, 0, 40),
      txt("a4-payment-account-title", "body", "MEMBER / ACCOUNT INFORMATION", 27, 112, 156, 5, {
        fontSize: 7.5,
        fontWeight: "bold",
        textColor: WHITE,
        align: "center",
        order: 41,
      }),
      txt(
        "a4-payment-account",
        "body",
        "Account Name: {{subject.fullName}}  •  Account No.: {{property.accountNumber}}\nProperty: {{property.address}}",
        26,
        122,
        158,
        16,
        { fontSize: 8.2, lineHeight: 1.3, order: 42 },
      ),
      rect("a4-payment-details-bar", "body", 22, 141, 166, 9, NAVY, NAVY, 0.5, 0, 43),
      txt("a4-payment-details-title", "body", "PAYMENT / RECEIPT DETAILS", 27, 143, 156, 5, {
        fontSize: 7.5,
        fontWeight: "bold",
        textColor: WHITE,
        align: "center",
        order: 44,
      }),
      txt(
        "a4-payment-details",
        "body",
        "{{request.remarks}}",
        26,
        153,
        158,
        42,
        {
          fontFamily: "Calibri",
          fontSize: 8.2,
          lineHeight: 1.24,
          backgroundColor: LIGHT,
          borderColor: LINE,
          borderWidth: 0.8,
          radius: 1,
          padding: 3,
          order: 45,
          type: "textBox",
        },
      ),
      txt(
        "a4-payment-certification",
        "body",
        "CERTIFICATION STATEMENT: The foregoing entries are certified as appearing in the Association's records as of the date of issue, without prejudice to bank reversals, chargebacks, posting corrections, or subsequent audit adjustments.",
        24,
        199,
        162,
        16,
        { fontSize: 7.6, lineHeight: 1.18, align: "justify", order: 50 },
      ),
      txt(
        "a4-payment-tax-note",
        "body",
        "TAX-DOCUMENT NOTE: This Payment Certification is a summary of Association records and does not replace any tax invoice, official receipt, acknowledgment receipt, or other source document required under applicable BIR rules.",
        24,
        217,
        162,
        15,
        { fontSize: 7.2, lineHeight: 1.16, textColor: SLATE, align: "justify", order: 60 },
      ),
      ...sealAndVerification("Treasurer / Finance Officer"),
    );
  }

  if (variant === "CONSTRUCTION_BOND") {
    body.push(
      txt(
        "a4-bond-intro",
        "body",
        "This is to certify that, based on the records of {{tenant.name}}, the construction project identified below has a construction / performance bond or security deposit on file with the Association in accordance with its governing documents, construction guidelines, and approved project requirements.",
        22,
        76,
        166,
        30,
        { fontFamily: "Times New Roman", fontSize: 9.7, lineHeight: 1.3, align: "justify", order: 30, type: "bodyText" },
      ),
      rect("a4-project-card", "body", 20, 112, 53, 70, LIGHT, LINE, 0.8, 2, 40),
      txt(
        "a4-project-text",
        "body",
        "PROJECT INFORMATION\n\nProject / Purpose\n{{request.purpose}}\n\nLocation\n{{request.destination}}\n\nProperty\n{{property.address}}",
        24,
        117,
        45,
        61,
        { fontSize: 7.8, lineHeight: 1.2, order: 41 },
      ),
      rect("a4-contractor-card", "body", 79, 112, 53, 70, LIGHT, LINE, 0.8, 2, 42),
      txt(
        "a4-contractor-text",
        "body",
        "CONTRACTOR INFORMATION\n\nRepresentative\n{{request.representativeName}}\n\nMember / Host\n{{subject.fullName}}\n\nAccount\n{{property.accountNumber}}",
        83,
        117,
        45,
        61,
        { fontSize: 7.8, lineHeight: 1.2, order: 43 },
      ),
      rect("a4-bond-card", "body", 138, 112, 52, 70, GOLD_SOFT, GOLD, 0.9, 2, 44),
      txt(
        "a4-bond-text",
        "body",
        "BOND INFORMATION\n\n{{request.remarks}}\n\nSTATUS\n✓ BOND / SECURITY ON FILE",
        142,
        117,
        44,
        61,
        { fontSize: 7.7, lineHeight: 1.2, order: 45 },
      ),
      txt(
        "a4-bond-witness",
        "body",
        "IN WITNESS WHEREOF, this certification is issued upon request for Association compliance and project administration purposes.",
        24,
        188,
        162,
        13,
        { fontFamily: "Times New Roman", fontSize: 9.1, lineHeight: 1.25, align: "justify", order: 50 },
      ),
      txt(
        "a4-bond-limitation",
        "body",
        "LIMITATION: This certificate does not constitute a building permit, occupancy permit, engineering approval, or authority from the Local Government Unit, Office of the Building Official, or any other government agency. All required governmental permits remain independently required.",
        24,
        205,
        162,
        25,
        { fontSize: 7.4, lineHeight: 1.18, textColor: SLATE, align: "justify", order: 60 },
      ),
      ...sealAndVerification("Property / Compliance Officer"),
    );
  }

  if (variant === "CONTRACTOR_BOND") {
    body.push(
      txt(
        "a4-contractor-intro",
        "body",
        "This is to certify that {{request.representativeName}}, through its authorized representative, is recorded by the Association as a contractor / service provider engaged for approved work within the community and has submitted the contractor bond / surety / insurance documents required by the Association for the project stated below.",
        22,
        76,
        166,
        32,
        { fontFamily: "Times New Roman", fontSize: 9.6, lineHeight: 1.3, align: "justify", order: 30, type: "bodyText" },
      ),
      rect("a4-contractor-info", "body", 22, 113, 78, 66, LIGHT, LINE, 0.8, 2, 40),
      txt(
        "a4-contractor-info-text",
        "body",
        "CONTRACTOR INFORMATION\n\nContractor / Representative\n{{request.representativeName}}\n\nProject / Purpose\n{{request.purpose}}\n\nProject Location\n{{request.destination}}",
        27,
        118,
        68,
        56,
        { fontSize: 7.8, lineHeight: 1.2, order: 41 },
      ),
      rect("a4-contractor-bond-info", "body", 108, 113, 80, 66, GOLD_SOFT, GOLD, 0.9, 2, 42),
      txt(
        "a4-contractor-bond-text",
        "body",
        "BOND / INSURANCE STATUS\n\n✓ ACTIVE / ON FILE\n\n{{request.remarks}}\n\nValid only for the approved project and period.",
        113,
        118,
        70,
        56,
        { fontSize: 7.8, lineHeight: 1.2, order: 43 },
      ),
      txt(
        "a4-contractor-scope",
        "body",
        "This certification is issued for Association access, compliance, and project-administration purposes and is valid only for the project and period indicated above.",
        24,
        185,
        162,
        13,
        { fontFamily: "Times New Roman", fontSize: 9.1, lineHeight: 1.23, align: "justify", order: 50 },
      ),
      txt(
        "a4-contractor-limitation",
        "body",
        "LIMITATION: HOA verification of submitted bond / insurance documents is not a representation that the contractor is licensed, accredited, or in good standing with PCAB, DTI, SEC, LGU, or any other regulator. The contractor remains responsible for all licenses, permits, taxes, safety rules, and legal requirements.",
        24,
        202,
        162,
        29,
        { fontSize: 7.35, lineHeight: 1.17, textColor: SLATE, align: "justify", order: 60 },
      ),
      ...sealAndVerification("Property / Compliance Officer"),
    );
  }

  const footerText: Record<CertificateVariant, string> = {
    RESIDENCY: "SYSTEM-GENERATED • QR-VERIFIABLE • VALID SUBJECT TO ONLINE VERIFICATION AND ASSOCIATION RECORDS",
    INDIGENCY: "PRIVATE ASSOCIATION CERTIFICATION • SYSTEM-GENERATED • VERIFY AUTHENTICITY THROUGH QR CODE",
    GOOD_STANDING: "VALID AS OF DATE OF ISSUE • SUBJECT TO ASSOCIATION BOOKS AND SUBSEQUENT POSTINGS • QR-VERIFIABLE",
    CLEARANCE: "ASSOCIATION CLEARANCE ONLY • SUBJECT TO FINAL AUDIT AND UNPOSTED TRANSACTIONS • QR-VERIFIABLE",
    PAYMENT: "FINANCIAL RECORD CERTIFICATION • SUBJECT TO RECONCILIATION AND AUDIT • QR-VERIFIABLE",
    CONSTRUCTION_BOND: "ASSOCIATION CONSTRUCTION COMPLIANCE RECORD • GOVERNMENT PERMITS REMAIN SEPARATELY REQUIRED",
    CONTRACTOR_BOND: "CONTRACTOR ACCESS / COMPLIANCE CERTIFICATION • VALID ONLY FOR THE APPROVED PROJECT AND PERIOD",
  };

  return finalize(
    template,
    { header, body, footer: certificateFooter(footerText[variant]) },
    `HOAHub Approved Philippine A4 Legal Mockup • ${titles[variant]} • v${FREE_DOCUMENT_LIBRARY_VERSION}`,
  );
}

function copyHeader(
  prefix: string,
  y: number,
  color: string,
  copyLabel: string,
  title: string,
  status?: string,
): DocumentTemplateBlock[] {
  const blocks: DocumentTemplateBlock[] = [
    rect(`${prefix}-copy-bar`, "body", 8, y, 194, 8, color, color, 0.5, 0, 10),
    txt(`${prefix}-copy-label`, "body", copyLabel, 12, y + 2, 104, 4, {
      fontSize: 7,
      fontWeight: "bold",
      textColor: WHITE,
      order: 11,
    }),
    txt(`${prefix}-issued`, "body", "ISSUED: {{document.issueDate}}", 125, y + 2, 73, 4, {
      fontSize: 7,
      fontWeight: "bold",
      textColor: WHITE,
      align: "right",
      order: 12,
    }),
    logo(`${prefix}-logo`, "body", 12, y + 12, 20, 20, 13),
    txt(`${prefix}-tenant`, "body", "{{tenant.name}} HOMEOWNERS' ASSOCIATION, INC.", 36, y + 11, 77, 6, {
      fontSize: 7.5,
      fontWeight: "bold",
      textColor: NAVY,
      order: 14,
    }),
    txt(`${prefix}-tenant-address`, "body", "{{tenant.address}}", 36, y + 18, 77, 5, {
      fontSize: 7,
      textColor: SLATE,
      order: 15,
    }),
    txt(
      `${prefix}-tenant-reg`,
      "body",
      "TIN {{tenant.tin}} • DHSUD/SEC Reg. {{tenant.secRegistration}}",
      36,
      y + 24,
      77,
      5,
      { fontSize: 7, fontWeight: "bold", textColor: NAVY_2, order: 16 },
    ),
    txt(`${prefix}-title`, "body", title, 88, y + 12, 72, 8, {
      fontFamily: "Georgia",
      fontSize: 12.5,
      fontWeight: "bold",
      textColor: color,
      align: "center",
      order: 17,
      type: "documentTitle",
    }),
    txt(`${prefix}-number`, "body", "{{document.number}}", 88, y + 21, 72, 7, {
      fontSize: 10.5,
      fontWeight: "bold",
      textColor: color,
      align: "center",
      order: 18,
      type: "documentNumber",
    }),
    qr(`${prefix}-qr`, "body", 169, y + 10, 25, "SCAN TO VERIFY", 19),
  ];
  if (status) {
    blocks.push(
      rect(`${prefix}-status-pill`, "body", 141, y + 11, 23, 7, GREEN, GREEN, 0.5, 4, 20),
      txt(`${prefix}-status-text`, "body", status, 143, y + 12.5, 19, 4, {
        fontSize: 7,
        fontWeight: "bold",
        textColor: WHITE,
        align: "center",
        order: 21,
      }),
    );
  }
  return blocks;
}

function gateCopy(prefix: string, y: number, copyLabel: string, securityCopy: boolean): DocumentTemplateBlock[] {
  return [
    ...copyHeader(prefix, y, NAVY, copyLabel, "GATE PASS"),
    rect(`${prefix}-visitor-card`, "body", 12, y + 39, 88, 48, LIGHT, LINE, 0.8, 2, 30),
    txt(`${prefix}-visitor-title`, "body", "VISITOR / AUTHORIZED PERSON", 16, y + 43, 80, 5, {
      fontSize: 7,
      fontWeight: "bold",
      textColor: NAVY,
      order: 31,
    }),
    txt(
      `${prefix}-visitor-info`,
      "body",
      securityCopy
        ? "Name: {{request.representativeName}}\nPurpose: {{request.purpose}}\nHost / Resident: {{subject.fullName}}\nProperty: {{property.address}}"
        : "Name: {{request.representativeName}}\nPurpose: {{request.purpose}}\nContact: {{subject.contactNumber}}\nHost / Resident: {{subject.fullName}}\nProperty: {{property.address}}",
      16,
      y + 50,
      80,
      31,
      { fontSize: 7.4, lineHeight: 1.22, order: 32 },
    ),
    rect(`${prefix}-vehicle-card`, "body", 106, y + 39, 88, 48, LIGHT, LINE, 0.8, 2, 33),
    txt(`${prefix}-vehicle-title`, "body", "VEHICLE / ACCESS DETAILS", 110, y + 43, 80, 5, {
      fontSize: 7,
      fontWeight: "bold",
      textColor: NAVY,
      order: 34,
    }),
    txt(
      `${prefix}-vehicle-info`,
      "body",
      "Vehicle / Plate: {{request.vehicleDetails}}\nDestination / Gate: {{request.destination}}\nScheduled Date: {{request.scheduledDate}}\nAuthorized Time: {{request.startTime}}–{{request.endTime}}",
      110,
      y + 50,
      80,
      31,
      { fontSize: 7.4, lineHeight: 1.22, order: 35 },
    ),
    txt(
      `${prefix}-legal-note`,
      "body",
      securityCopy
        ? "SECURITY RECORD • VERIFY QR AND VALID ID BEFORE ENTRY • VOID IF ALTERED, EXPIRED, OR REVOKED"
        : "NON-TRANSFERABLE • SUBJECT TO ID CHECK, SECURITY SCREENING, HOUSE RULES, AND REVOCATION BY AUTHORIZED ASSOCIATION PERSONNEL",
      14,
      y + 92,
      182,
      13,
      { fontSize: 7.1, fontWeight: "bold", textColor: SLATE, align: "center", lineHeight: 1.16, order: 40 },
    ),
    rect(`${prefix}-validity`, "body", 12, y + 109, 182, 11, WHITE, LINE, 0.8, 1, 41),
    txt(
      `${prefix}-validity-text`,
      "body",
      "VALID DATE: {{request.scheduledDate}}    •    VALID TIME: {{request.startTime}}–{{request.endTime}}    •    ONE-TIME ENTRY ONLY",
      16,
      y + 112,
      174,
      5,
      { fontSize: 7.2, fontWeight: "bold", textColor: NAVY, align: "center", order: 42 },
    ),
  ];
}

function moveCopy(
  prefix: string,
  y: number,
  kind: "MOVE_IN" | "MOVE_OUT",
  copyLabel: string,
  securityCopy: boolean,
): DocumentTemplateBlock[] {
  const title = kind === "MOVE_IN" ? "MOVE-IN PASS" : "MOVE-OUT PASS";
  const color = kind === "MOVE_IN" ? GREEN : RED;
  const action = kind === "MOVE_IN" ? "MOVE-IN" : "MOVE-OUT";
  const clearanceText =
    kind === "MOVE_OUT"
      ? "ASSOCIATION CLEARANCE\n✓ CLEARED\nSubject to final inspection and unposted charges."
      : "CONDITIONS\n✓ Use service access only\n✓ Protect lifts / common areas\n✓ Observe scheduled window";
  return [
    ...copyHeader(prefix, y, color, copyLabel, title),
    rect(`${prefix}-resident-card`, "body", 12, y + 39, 58, 49, LIGHT, LINE, 0.8, 2, 30),
    txt(`${prefix}-resident-title`, "body", "RESIDENT INFORMATION", 16, y + 43, 50, 5, {
      fontSize: 7,
      fontWeight: "bold",
      textColor: color,
      order: 31,
    }),
    txt(
      `${prefix}-resident-info`,
      "body",
      "Name: {{subject.fullName}}\nProperty: {{property.address}}\nContact: {{subject.contactNumber}}\nAccount: {{property.accountNumber}}",
      16,
      y + 50,
      50,
      31,
      { fontSize: 7.2, lineHeight: 1.2, order: 32 },
    ),
    rect(`${prefix}-schedule-card`, "body", 76, y + 39, 56, 49, LIGHT, LINE, 0.8, 2, 33),
    txt(`${prefix}-schedule-title`, "body", `${action} SCHEDULE`, 80, y + 43, 48, 5, {
      fontSize: 7,
      fontWeight: "bold",
      textColor: color,
      order: 34,
    }),
    txt(
      `${prefix}-schedule-info`,
      "body",
      `Date: {{request.scheduledDate}}\nTime: {{request.startTime}}–{{request.endTime}}\nCoordinator: {{request.representativeName}}\nPurpose: {{request.purpose}}`,
      80,
      y + 50,
      48,
      31,
      { fontSize: 7.1, lineHeight: 1.2, order: 35 },
    ),
    rect(`${prefix}-condition-card`, "body", 138, y + 39, 56, 49, kind === "MOVE_OUT" ? "#fff8f8" : "#f6fbf7", color, 0.8, 2, 36),
    txt(`${prefix}-condition-text`, "body", securityCopy ? "SECURITY CHECK\n□ ID Verified\n□ Vehicle Logged\n□ Rules / Clearance Checked\n□ Entry / Exit Time Recorded" : clearanceText, 142, y + 44, 48, 36, {
      fontSize: 7,
      lineHeight: 1.15,
      textColor: INK,
      order: 37,
    }),
    txt(
      `${prefix}-mover`,
      "body",
      securityCopy
        ? "SECURITY RECORD • VOID IF ALTERED OR USED OUTSIDE APPROVED DATE/TIME • SUBJECT TO COMMUNITY RULES"
        : `MOVING / SERVICE PROVIDER: {{request.serviceProvider}}  •  VEHICLE: {{request.vehicleDetails}}\n${kind === "MOVE_OUT" ? "MOVE-OUT AUTHORIZATION DOES NOT EXTINGUISH UNPOSTED, UNDER-AUDIT, OR SUBSEQUENTLY DISCOVERED ASSOCIATION OBLIGATIONS" : "AUTHORIZATION IS LIMITED TO THE APPROVED MOVE-IN SCHEDULE AND DOES NOT WAIVE ANY ASSOCIATION RULE, FEE, DEPOSIT, OR DAMAGE LIABILITY"}`,
      14,
      y + 93,
      182,
      13,
      { fontSize: 7.05, fontWeight: "bold", textColor: SLATE, align: "center", lineHeight: 1.13, order: 40 },
    ),
    rect(`${prefix}-validity`, "body", 12, y + 109, 182, 11, WHITE, LINE, 0.8, 1, 41),
    txt(
      `${prefix}-validity-text`,
      "body",
      `VALID DATE: {{request.scheduledDate}}    •    VALID TIME: {{request.startTime}}–{{request.endTime}}    •    ${action} AUTHORIZATION`,
      16,
      y + 112,
      174,
      5,
      { fontSize: 7.2, fontWeight: "bold", textColor: color, align: "center", order: 42 },
    ),
  ];
}

function workPermitCopy(prefix: string, y: number, copyLabel: string, securityCopy: boolean): DocumentTemplateBlock[] {
  return [
    ...copyHeader(prefix, y, NAVY, copyLabel, "WORK PERMIT", "APPROVED"),
    rect(`${prefix}-contractor-card`, "body", 12, y + 39, 58, 49, LIGHT, LINE, 0.8, 2, 30),
    txt(`${prefix}-contractor-title`, "body", securityCopy ? "CONTRACTOR / WORKER" : "CONTRACTOR / WORKER INFORMATION", 16, y + 43, 50, 5, {
      fontSize: 7,
      fontWeight: "bold",
      textColor: NAVY,
      order: 31,
    }),
    txt(
      `${prefix}-contractor-info`,
      "body",
      "Work Lead: {{request.representativeName}}\nCompany / Provider: {{request.serviceProvider}}\nContact / Vehicle: {{request.vehicleDetails}}\nHost / Owner: {{subject.fullName}}",
      16,
      y + 50,
      50,
      31,
      { fontSize: 7.05, lineHeight: 1.18, order: 32 },
    ),
    rect(`${prefix}-scope-card`, "body", 76, y + 39, 56, 49, LIGHT, LINE, 0.8, 2, 33),
    txt(`${prefix}-scope-title`, "body", "PROJECT / AUTHORIZED SCOPE", 80, y + 43, 48, 5, {
      fontSize: 7,
      fontWeight: "bold",
      textColor: NAVY,
      order: 34,
    }),
    txt(
      `${prefix}-scope-info`,
      "body",
      "Location: {{request.destination}}\nScope: {{request.purpose}}\nDate: {{request.scheduledDate}}\nHours: {{request.startTime}}–{{request.endTime}}",
      80,
      y + 50,
      48,
      31,
      { fontSize: 7.05, lineHeight: 1.18, order: 35 },
    ),
    rect(`${prefix}-rules-card`, "body", 138, y + 39, 56, 49, "#fffdf7", GOLD, 0.8, 2, 36),
    txt(
      `${prefix}-rules-text`,
      "body",
      securityCopy
        ? "SECURITY / ADMIN CHECKS\n□ ID / worker list verified\n□ Tools / materials logged\n□ Government permits checked if applicable\n□ Entry / exit time recorded"
        : "PERMIT CONDITIONS\n✓ Work only within approved scope and hours\n✓ Observe PPE, safety, noise and waste rules\n✓ Protect common areas and lifts\n✓ No hot work / structural change unless separately approved",
      142,
      y + 44,
      48,
      37,
      { fontSize: 7, lineHeight: 1.12, order: 37 },
    ),
    txt(
      `${prefix}-authority`,
      "body",
      securityCopy
        ? "RESTRICTIONS: No structural alteration, hot work, hazardous work, or work outside approved hours unless separately authorized. Association may stop work for safety or rule violations."
        : "ASSOCIATION AUTHORITY: This permit is an HOA access / work authorization only. It may be suspended or revoked for violation of Association rules or permit conditions.",
      14,
      y + 92,
      88,
      15,
      { fontSize: 7, lineHeight: 1.14, textColor: SLATE, align: "justify", order: 40 },
    ),
    txt(
      `${prefix}-government-note`,
      "body",
      securityCopy
        ? "STATUS: ✓ APPROVED — Valid only for approved scope, dates and persons."
        : "GOVERNMENT PERMIT REMINDER: This permit does not replace any building, electrical, plumbing, sanitary, fire-safety, barangay, or LGU permit that may be required by law.",
      108,
      y + 92,
      86,
      15,
      { fontSize: 7, lineHeight: 1.14, textColor: securityCopy ? GREEN : RED, fontWeight: "bold", align: "justify", order: 41 },
    ),
    line(`${prefix}-approver-line`, "body", 18, y + 113, 64, NAVY, 0.8, "solid", 42),
    txt(`${prefix}-approver`, "body", "{{signatory.name}}\n{{signatory.position}}", 16, y + 116, 68, 12, {
      fontFamily: "Times New Roman",
      fontSize: 7.2,
      fontWeight: "bold",
      textColor: NAVY,
      align: "center",
      lineHeight: 1.08,
      type: "signatory",
      order: 43,
    }),
    txt(
      `${prefix}-record-label`,
      "body",
      securityCopy ? "SECURITY / ADMIN — ENTRY / EXIT RECORD" : "CONTRACTOR / RESIDENT — ACKNOWLEDGMENT",
      98,
      y + 117,
      95,
      8,
      { fontSize: 7, fontWeight: "bold", textColor: NAVY, align: "right", order: 44 },
    ),
  ];
}

function twoCopyTemplate(kind: PassKind): DocumentTemplateDefinition {
  const title = kind === "GATE" ? "GATE PASS" : kind === "MOVE_IN" ? "MOVE-IN PASS" : kind === "MOVE_OUT" ? "MOVE-OUT PASS" : "WORK PERMIT";
  const template = newA4(title);
  template.page.guides = { horizontal: [{ positionMm: 148, label: "Cut / Copy Divider" }], vertical: [] };
  const body: DocumentTemplateBlock[] = [];
  if (kind === "GATE") {
    body.push(...gateCopy("holder", 7, "HOLDER COPY — PRESENT TO SECURITY", false));
    body.push(line("cut-line", "body", 8, 148, 194, SLATE, 0.7, "dashed", 500));
    body.push(txt("cut-label", "body", "✂  CUT HERE / SEPARATE COPIES", 74, 145, 62, 6, {
      fontSize: 7,
      fontWeight: "bold",
      textColor: SLATE,
      align: "center",
      backgroundColor: WHITE,
      order: 501,
    }));
    body.push(...gateCopy("security", 157, "SECURITY COPY — RETAIN", true));
  } else if (kind === "MOVE_IN" || kind === "MOVE_OUT") {
    body.push(...moveCopy("holder", 7, kind, "RESIDENT / HOLDER COPY — PRESENT TO SECURITY", false));
    body.push(line("cut-line", "body", 8, 148, 194, SLATE, 0.7, "dashed", 500));
    body.push(txt("cut-label", "body", "✂  CUT HERE / SEPARATE COPIES", 74, 145, 62, 6, {
      fontSize: 7,
      fontWeight: "bold",
      textColor: SLATE,
      align: "center",
      backgroundColor: WHITE,
      order: 501,
    }));
    body.push(...moveCopy("security", 157, kind, "SECURITY / ADMIN COPY — RETAIN", true));
  } else {
    body.push(...workPermitCopy("contractor", 7, "CONTRACTOR / RESIDENT COPY — PRESENT TO SECURITY", false));
    body.push(line("cut-line", "body", 8, 148, 194, SLATE, 0.7, "dashed", 500));
    body.push(txt("cut-label", "body", "✂  CUT HERE / SEPARATE COPIES", 74, 145, 62, 6, {
      fontSize: 7,
      fontWeight: "bold",
      textColor: SLATE,
      align: "center",
      backgroundColor: WHITE,
      order: 501,
    }));
    body.push(...workPermitCopy("security", 157, "SECURITY / ADMIN COPY — RETAIN", true));
  }
  return finalize(
    template,
    { header: [], body, footer: [] },
    `HOAHub Approved Philippine A4 Two-Copy Mockup • ${title} • v${FREE_DOCUMENT_LIBRARY_VERSION}`,
  );
}

function templateForCode(code: string, fallback: DocumentTemplateDefinition): DocumentTemplateDefinition {
  switch (code) {
    case "CERTIFICATE_OF_RESIDENCY":
      return certificateTemplate("RESIDENCY");
    case "CERTIFICATE_OF_INDIGENCY":
      return certificateTemplate("INDIGENCY");
    case "CERTIFICATE_OF_GOOD_STANDING":
      return certificateTemplate("GOOD_STANDING");
    case "CLEARANCE_CERTIFICATE":
      return certificateTemplate("CLEARANCE");
    case "PAYMENT_CERTIFICATION":
      return certificateTemplate("PAYMENT");
    case "CONSTRUCTION_BOND_CERTIFICATION":
      return certificateTemplate("CONSTRUCTION_BOND");
    case "CONTRACTOR_BOND_CERTIFICATION":
      return certificateTemplate("CONTRACTOR_BOND");
    case "GATE_PASS":
      return twoCopyTemplate("GATE");
    case "MOVE_IN_PASS":
      return twoCopyTemplate("MOVE_IN");
    case "MOVE_OUT_PASS":
      return twoCopyTemplate("MOVE_OUT");
    case "WORK_PERMIT":
      return twoCopyTemplate("WORK_PERMIT");
    default:
      return cloneTemplate(fallback);
  }
}

export const freeDocumentTemplateBlueprints: readonly FreeDocumentTemplateBlueprint[] = baseBlueprints.map((item) => ({
  ...item,
  libraryVersion: FREE_DOCUMENT_LIBRARY_VERSION,
  description: `${item.description} Philippine A4 legal/professional mockup v${FREE_DOCUMENT_LIBRARY_VERSION}.`,
  template: templateForCode(item.code, item.template),
}));

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
    if (item.libraryVersion !== FREE_DOCUMENT_LIBRARY_VERSION) errors.push(`${item.displayName} has an invalid library version.`);
    if (item.workflow.paymentRequired || item.workflow.feeAmount !== 0) errors.push(`${item.displayName} must remain free in the free document library.`);
    if (!item.numberingFormat.includes("{SEQUENCE")) errors.push(`${item.displayName} must use a sequence-based document number for QR verification.`);
    const validation = validateTemplateDefinition(item.template);
    if (!validation.valid) errors.push(...validation.errors.map((error) => `${item.displayName}: ${error}`));
    const blocks = [...item.template.sections.header, ...item.template.sections.body, ...item.template.sections.footer];
    if (item.template.page.format !== "A4" || item.template.page.orientation !== "portrait" || item.template.page.widthMm !== 210 || item.template.page.heightMm !== 297) {
      errors.push(`${item.displayName} must use the approved A4 portrait page geometry.`);
    }
    for (const requiredBinding of ["tenant.logo", "tenant.name", "tenant.address", "tenant.tin", "tenant.secRegistration"]) {
      const bindingFound = blocks.some((block) => block.binding === requiredBinding || String(block.content || "").includes(`{{${requiredBinding}}}`));
      if (!bindingFound) errors.push(`${item.displayName} is missing ${requiredBinding}.`);
    }
    if (!blocks.some((block) => block.type === "qrVerification")) errors.push(`${item.displayName} is missing QR verification.`);
    if (item.template.meta.requiresSignatory === true) errors.push(`${item.displayName} cannot require a preconfigured signatory because the library must install safely for every tenant.`);
  }
  return { valid: errors.length === 0, errors };
}
