import "server-only";

import {
  DocumentDefinitionStatus,
  DocumentDeliveryMode,
  DocumentFieldType,
  DocumentPolicySeverity,
  DocumentPolicyType,
  DocumentSequenceScope,
  DocumentTemplateOwnership,
  DocumentTemplateVersionStatus,
  DocumentType,
  DocumentWorkflowApprovalMode,
  DocumentWorkflowStepType,
  Prisma,
} from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import { CERTIFIED_TEMPLATE_TENANT_ID } from "@/lib/services/document-template-ownership";
import { defaultOfficerListConfig, type DocumentTemplateBlockType, type DocumentTemplateDefinition } from "@/lib/services/document-template-builder";
import type { DocumentExecutionContext } from "@/lib/services/document-runtime-context";
import { requireDocumentPermission } from "@/lib/services/document-runtime-context";
import { writeDocumentAudit } from "@/lib/services/document-runtime-audit";

export const CERTIFICATE_OF_RESIDENCY_CODE = "CERTIFICATE_OF_RESIDENCY";
export const CERTIFICATE_OF_RESIDENCY_CERTIFIED_KEY = "HOAHUB:CERTIFICATE_OF_RESIDENCY";
export const CERTIFICATE_OF_RESIDENCY_WORKFLOW_CODE = "COR_STANDARD_APPROVAL";
export const CERTIFICATE_OF_RESIDENCY_REFERENCE_TEMPLATE_NAME = "Certificate of Residency - Visual Reference";

export function certificateOfResidencyTemplateDefinition(): DocumentTemplateDefinition {
  const definition: DocumentTemplateDefinition = {
    schemaVersion: 2,
    page: {
      format: "A4",
      orientation: "portrait",
      marginPreset: "custom",
      margins: { top: 20, right: 20, bottom: 20, left: 20 },
      headerDistance: 10,
      footerDistance: 10,
      columns: { count: 1, gap: 10 },
      border: { enabled: true, style: "solid", width: 1, color: "#166534" },
      backgroundColor: "#ffffff",
      watermark: { enabled: false, text: "", opacity: 0.08 },
      canvas: { gridSize: 5, snapToGrid: true, showGrid: true },
    },
    sections: {
      header: [
        block("cor-logo", "logo", "header", 10, "{{tenant.logo}}", false, { align: "center", width: 72, height: 72 }),
        block("cor-association", "tenantName", "header", 20, "{{tenant.name}}", true, { align: "center", fontFamily: "Times New Roman", fontSize: 17, fontWeight: "bold" }),
        block("cor-address", "address", "header", 30, "{{tenant.address}}", true, { align: "center", fontFamily: "Arial", fontSize: 10 }),
        block("cor-sec", "text", "header", 40, "SEC Registration: {{tenant.secRegistration}}", false, { align: "center", fontFamily: "Arial", fontSize: 9 }),
        block("cor-tin", "text", "header", 50, "TIN: {{tenant.tin}}", false, { align: "center", fontFamily: "Arial", fontSize: 9 }),
        block("cor-contact", "text", "header", 60, "{{tenant.contactNumber}} | {{tenant.email}}", false, { align: "center", fontFamily: "Arial", fontSize: 9 }),
        block("cor-divider", "horizontalLine", "header", 70, "", false, { margin: 10 }),
      ],
      body: [
        block("cor-title", "documentTitle", "body", 10, "CERTIFICATE OF RESIDENCY", true, { align: "center", fontFamily: "Times New Roman", fontSize: 20, fontWeight: "bold", paragraphSpacing: 18 }),
        block("cor-body", "bodyText", "body", 20, "This is to certify that {{subject.fullName}} is a bona fide resident of {{property.address}}, located within {{tenant.name}}.", true, { align: "justify", fontFamily: "Times New Roman", fontSize: 12, lineHeight: 1.7, paragraphSpacing: 12 }),
        block("cor-property", "propertyInfo", "body", 30, "Property identification: Block {{property.block}}, Lot {{property.lot}}.", true, { align: "justify", fontFamily: "Times New Roman", fontSize: 12, lineHeight: 1.6 }),
        block("cor-status", "subjectInfo", "body", 40, "Residency status: {{subject.status}}.", false, { align: "justify", fontFamily: "Times New Roman", fontSize: 12 }),
        block("cor-residency-date", "subjectInfo", "body", 50, "Residency start date: {{subject.residencyStartDate}}.", false, { align: "justify", fontFamily: "Times New Roman", fontSize: 12 }),
        block("cor-purpose", "purpose", "body", 60, "This certification is issued upon the request of the above-named resident for {{request.purpose}}.", true, { align: "justify", fontFamily: "Times New Roman", fontSize: 12, lineHeight: 1.7, paragraphSpacing: 12 }),
        block("cor-issuance", "issueDate", "body", 70, "Issued on {{document.issueDate}} at {{document.issuePlace}}. Official document number: {{document.number}}.", true, { align: "justify", fontFamily: "Times New Roman", fontSize: 12, lineHeight: 1.6, paragraphSpacing: 20 }),
        block("cor-signature-space", "spacer", "body", 80, "", false, { height: 36 }),
        block("cor-signatory", "signatory", "body", 90, "{{signatory.name}}\n{{signatory.position}}\nAuthorized HOA Signatory", true, { align: "right", fontFamily: "Times New Roman", fontSize: 12, fontWeight: "bold" }),
        block("cor-qr", "qrVerification", "body", 100, "Scan to verify {{document.number}}", true, { align: "left", width: 112, height: 112, margin: 12 }),
      ],
      footer: [
        block("cor-footer", "footer", "footer", 10, "This document was electronically generated by HOAHub and may be verified using the QR code shown above.", true, { align: "center", fontFamily: "Arial", fontSize: 8, textColor: "#475569" }),
      ],
    },
    blocks: [],
    meta: {
      editor: "professional-document-editor",
      revisionNote: "HOAHub Certificate of Residency certified reference template v1.0.",
      requiresSignatory: true,
    },
  };
  definition.blocks = [...definition.sections.header, ...definition.sections.body, ...definition.sections.footer];
  return definition;
}

export function certificateOfResidencyReferenceTemplateDefinition(): DocumentTemplateDefinition {
  const header = [
    referenceBlock("reference-logo", "logo", "header", 10, "{{tenant.logo}}", { x: 7, y: 8, width: 32, height: 30, zIndex: 10 }, { align: "center" }, { required: false, image: { alt: "Tenant logo", width: 120, height: 120 } }),
    referenceBlock("reference-tenant-name", "tenantName", "header", 20, "{{tenant.name}}", { x: 43, y: 9, width: 88, height: 9, zIndex: 11 }, { fontFamily: "Arial", fontSize: 16, fontWeight: "bold", textColor: "#0b2a63" }),
    referenceBlock("reference-address", "address", "header", 30, "{{tenant.address}}", { x: 43, y: 19, width: 88, height: 7, zIndex: 11 }, { fontFamily: "Arial", fontSize: 9 }),
    referenceBlock("reference-contact", "text", "header", 40, "{{tenant.contactNumber}} | {{tenant.email}}", { x: 43, y: 27, width: 88, height: 7, zIndex: 11 }, { fontFamily: "Arial", fontSize: 8 }, { required: false }),
    referenceBlock("reference-sec", "text", "header", 50, "SEC Registration No.: {{tenant.secRegistration}}", { x: 43, y: 35, width: 88, height: 7, zIndex: 11 }, { fontFamily: "Arial", fontSize: 8 }, { required: false }),
    referenceBlock("reference-tin", "tin", "header", 55, "TIN: {{tenant.tin}}", { x: 43, y: 43, width: 88, height: 6, zIndex: 11 }, { fontFamily: "Arial", fontSize: 8 }, { required: false }),
    referenceBlock("reference-metadata-rule", "verticalLine", "header", 60, "", { x: 135, y: 8, width: 1, height: 38, zIndex: 12 }, { backgroundColor: "#cbd5e1" }),
    referenceBlock("reference-document-label", "text", "header", 70, "DOCUMENT NO.", { x: 139, y: 10, width: 30, height: 5, zIndex: 13 }, { fontSize: 7, fontWeight: "bold", textColor: "#0b2a63" }),
    referenceBlock("reference-document-number", "documentNumber", "header", 80, "{{document.number}}", { x: 139, y: 15, width: 31, height: 7, zIndex: 13 }, { fontSize: 9, fontWeight: "bold", textColor: "#dc2626" }),
    referenceBlock("reference-issued-label", "text", "header", 90, "DATE ISSUED", { x: 139, y: 25, width: 31, height: 5, zIndex: 13 }, { fontSize: 7, fontWeight: "bold", textColor: "#0b2a63" }),
    referenceBlock("reference-issued-date", "issueDate", "header", 100, "{{document.issueDate}}", { x: 139, y: 30, width: 31, height: 7, zIndex: 13 }, { fontSize: 9, fontWeight: "bold" }),
    referenceBlock("reference-valid-label", "text", "header", 110, "VALID UNTIL", { x: 139, y: 39, width: 31, height: 5, zIndex: 13 }, { fontSize: 7, fontWeight: "bold", textColor: "#0b2a63" }),
    referenceBlock("reference-valid-date", "validityDate", "header", 120, "{{document.validUntil}}", { x: 139, y: 44, width: 31, height: 7, zIndex: 13 }, { fontSize: 9, fontWeight: "bold" }, { required: false }),
    referenceBlock("reference-qr", "qrVerification", "header", 130, "SCAN TO VERIFY", { x: 173, y: 7, width: 30, height: 37, zIndex: 13 }, { align: "center", fontSize: 7 }, { required: false }),
    referenceBlock("reference-qr-label", "verificationText", "header", 140, "SCAN TO VERIFY", { x: 171, y: 45, width: 34, height: 5, zIndex: 13 }, { align: "center", fontSize: 6, fontWeight: "bold", textColor: "#0b2a63" }, { required: false }),
    referenceBlock("reference-header-rule", "horizontalLine", "header", 150, "", { x: 7, y: 51, width: 198, height: 1, zIndex: 14 }, { backgroundColor: "#166534", borderColor: "#0b2a63", borderWidth: 1 }),
  ];
  const body = [
    referenceBlock("reference-officer-list", "officerList", "body", 10, "", { x: 7, y: 66, width: 37, height: 169, zIndex: 20 }, { fontFamily: "Arial", fontSize: 8, textColor: "#0b2a63", padding: 0, borderColor: "#0b2a63", borderWidth: 1 }, { officerList: { ...defaultOfficerListConfig, maxOfficers: 8 } }),
    referenceBlock("reference-body-divider", "verticalLine", "body", 20, "", { x: 46, y: 66, width: 1, height: 169, zIndex: 21 }, { backgroundColor: "#0b2a63" }),
    referenceBlock("reference-title", "documentTitle", "body", 30, "CERTIFICATE OF RESIDENCY", { x: 51, y: 67, width: 153, height: 14, zIndex: 30 }, { align: "center", fontFamily: "Times New Roman", fontSize: 20, fontWeight: "bold", textColor: "#0b2a63" }),
    referenceBlock("reference-salutation", "heading", "body", 40, "~ TOWHOMITMAYCONCERN: ~", { x: 51, y: 82, width: 153, height: 9, zIndex: 30 }, { align: "center", fontFamily: "Times New Roman", fontSize: 11, fontWeight: "bold", textColor: "#0b2a63" }),
    referenceBlock("reference-intro", "paragraph", "body", 50, "This is to certify that", { x: 56, y: 96, width: 145, height: 8, zIndex: 30 }, { fontFamily: "Arial", fontSize: 11 }),
    referenceBlock("reference-homeowner", "heading", "body", 60, "{{subject.fullName}}", { x: 56, y: 104, width: 145, height: 10, zIndex: 31 }, { fontFamily: "Arial", fontSize: 17, fontWeight: "bold", textColor: "#0b2a63" }),
    referenceBlock("reference-residency", "paragraph", "body", 70, "is a bona fide resident of {{tenant.name}}, {{property.address}}, and is currently residing at the address indicated below.", { x: 56, y: 118, width: 145, height: 22, zIndex: 30 }, { fontFamily: "Arial", fontSize: 11, lineHeight: 1.35 }),
    referenceBlock("reference-purpose", "paragraph", "body", 80, "This certification is based on the records and information on file in this office and is being issued upon the request of the above-named individual for {{request.purpose}}.", { x: 56, y: 143, width: 145, height: 22, zIndex: 30 }, { fontFamily: "Arial", fontSize: 11, lineHeight: 1.35 }),
    referenceBlock("reference-issue", "paragraph", "body", 90, "Issued this day of {{document.issueDate}} at {{document.issuePlace}}.", { x: 56, y: 168, width: 145, height: 11, zIndex: 30 }, { fontFamily: "Arial", fontSize: 11 }),
    referenceBlock("reference-watermark", "watermark", "body", 95, "HOAHub", { x: 74, y: 120, width: 90, height: 45, zIndex: 2 }, { align: "center", fontFamily: "Arial", fontSize: 32, fontWeight: "bold", textColor: "#e2e8f0" }, { required: false }),
    referenceBlock("reference-info-panel", "rectangle", "body", 100, "", { x: 48, y: 181, width: 157, height: 54, zIndex: 25 }, { backgroundColor: "#fbfdfb", borderColor: "#6b9f55", borderWidth: 1 }),
    referenceBlock("reference-personal-heading", "heading", "body", 110, "PERSONAL INFORMATION", { x: 51, y: 184, width: 72, height: 6, zIndex: 30 }, { align: "center", fontSize: 8, fontWeight: "bold", textColor: "#0b2a63" }),
    referenceBlock("reference-property-heading", "heading", "body", 120, "PROPERTY INFORMATION", { x: 130, y: 184, width: 72, height: 6, zIndex: 30 }, { align: "center", fontSize: 8, fontWeight: "bold", textColor: "#237a24" }),
    referenceBlock("reference-info-divider", "verticalLine", "body", 130, "", { x: 126, y: 185, width: 1, height: 45, zIndex: 30 }, { backgroundColor: "#aab8b0" }),
    ...infoPair("reference-full-name", "Full Name", "{{subject.fullName}}", 193, 51, 74),
    ...infoPair("reference-age", "Age", "{{subject.age}}", 201, 51, 74, false),
    ...infoPair("reference-civil-status", "Civil Status", "{{subject.civilStatus}}", 209, 51, 74, false),
    ...infoPair("reference-citizenship", "Citizenship", "{{subject.nationality}}", 217, 51, 74, false),
    ...infoPair("reference-contact", "Contact Number", "{{subject.contactNumber}}", 225, 51, 74, false),
    ...infoPair("reference-phase", "Phase", "{{property.phase}}", 193, 130, 202, false),
    ...infoPair("reference-block-lot", "Block & Lot", "Block {{property.block}} - Lot {{property.lot}}", 201, 130, 202),
    ...infoPair("reference-address", "Property Address", "{{property.address}}", 209, 130, 202),
    ...infoPair("reference-type", "Type", "{{subject.propertyType}}", 217, 130, 202, false),
    ...infoPair("reference-status", "Status", "{{subject.occupancyStatus}}", 225, 130, 202, false),
  ];
  const footer = [
    referenceBlock("reference-footer-rule", "horizontalLine", "footer", 10, "", { x: 7, y: 240, width: 198, height: 1, zIndex: 40 }, { backgroundColor: "#0b2a63" }),
    referenceBlock("reference-requested-label", "text", "footer", 20, "DATE REQUESTED", { x: 10, y: 245, width: 27, height: 5, zIndex: 41 }, { fontSize: 7, fontWeight: "bold", textColor: "#0b2a63" }),
    referenceBlock("reference-requested-value", "text", "footer", 30, ":   {{request.requestedAt}}", { x: 39, y: 245, width: 33, height: 5, zIndex: 41 }, { fontSize: 8 }),
    referenceBlock("reference-issued-footer-label", "text", "footer", 40, "DATE ISSUED", { x: 10, y: 253, width: 27, height: 5, zIndex: 41 }, { fontSize: 7, fontWeight: "bold", textColor: "#0b2a63" }),
    referenceBlock("reference-issued-footer-value", "text", "footer", 50, ":   {{document.issueDate}}", { x: 39, y: 253, width: 33, height: 5, zIndex: 41 }, { fontSize: 8 }),
    referenceBlock("reference-valid-footer-label", "text", "footer", 60, "VALID UNTIL", { x: 10, y: 261, width: 27, height: 5, zIndex: 41 }, { fontSize: 7, fontWeight: "bold", textColor: "#0b2a63" }),
    referenceBlock("reference-valid-footer-value", "text", "footer", 70, ":   {{document.validUntil}}", { x: 39, y: 261, width: 33, height: 5, zIndex: 41 }, { fontSize: 8 }, { required: false }),
    referenceBlock("reference-footer-purpose", "paragraph", "footer", 80, "This certificate is issued upon the request of the above-named individual for whatever legal purpose it may serve.", { x: 77, y: 245, width: 125, height: 16, zIndex: 41 }, { fontSize: 8, lineHeight: 1.2 }),
    referenceBlock("reference-remarks-label", "text", "footer", 90, "REMARKS", { x: 77, y: 264, width: 30, height: 5, zIndex: 41 }, { fontSize: 7, fontWeight: "bold", textColor: "#0b2a63" }),
    referenceBlock("reference-remarks", "text", "footer", 100, "{{request.remarks}}", { x: 77, y: 270, width: 125, height: 7, zIndex: 41 }, { fontSize: 8 }, { required: false }),
    referenceBlock("reference-notes-box", "rectangle", "footer", 110, "", { x: 7, y: 270, width: 198, height: 22, zIndex: 42 }, { backgroundColor: "#ffffff", borderColor: "#cbd5e1", borderWidth: 1 }),
    referenceBlock("reference-notes-left", "text", "footer", 120, "This is a system-generated document.\nNo signature required.\nScan QR Code to verify authenticity.", { x: 10, y: 273, width: 87, height: 16, zIndex: 43 }, { fontSize: 7, fontWeight: "bold", lineHeight: 1.35 }),
    referenceBlock("reference-notes-right", "text", "footer", 130, "NOTE:\nThis certificate is valid only within the validity date indicated.\nAny erasure, alteration, or tampering hereon shall invalidate this document.", { x: 112, y: 273, width: 88, height: 16, zIndex: 43 }, { fontSize: 7, lineHeight: 1.35, textColor: "#334155" }),
  ];
  const sections = { header, body, footer };
  return {
    schemaVersion: 2,
    page: { format: "A4", orientation: "portrait", marginPreset: "custom", margins: { top: 6, right: 6, bottom: 5, left: 6 }, headerDistance: 0, footerDistance: 0, columns: { count: 1, gap: 0 }, border: { enabled: false, style: "solid", width: 0, color: "#ffffff" }, backgroundColor: "#ffffff", watermark: { enabled: false, text: "", opacity: 0.08 }, canvas: { gridSize: 5, snapToGrid: true, showGrid: true } },
    sections,
    blocks: [...header, ...body, ...footer],
    meta: { editor: "professional-document-editor", revisionNote: "Tenant draft reference layout based on the supplied Certificate of Residency PDF. Published certified templates remain unchanged.", requiresSignatory: false },
  };
}

export async function ensureCertifiedCertificateOfResidencyTemplate() {
  const host = await platformPrisma.tenant.findUnique({ where: { id: CERTIFIED_TEMPLATE_TENANT_ID }, select: { id: true } });
  if (!host) throw new Error("The configured certified-template host tenant does not exist.");

  return platformPrisma.$transaction(async (tx) => {
    let definition = await tx.documentDefinition.findFirst({
      where: { tenantId: host.id, code: CERTIFICATE_OF_RESIDENCY_CODE },
      select: { id: true },
    });
    if (!definition) {
      definition = await tx.documentDefinition.create({
        data: {
          tenantId: host.id,
          code: CERTIFICATE_OF_RESIDENCY_CODE,
          displayName: "Certificate of Residency",
          description: "Official HOA certification of a verified resident and property relationship.",
          category: "Official HOA Certification",
          systemKey: CERTIFICATE_OF_RESIDENCY_CODE,
          legacyType: DocumentType.CERTIFICATE_OF_RESIDENCY,
          status: DocumentDefinitionStatus.INACTIVE,
          active: false,
          walkInEnabled: true,
          qrEnabled: true,
          releaseRequired: true,
          numberingFormat: "COR-{YYYY}-{SEQUENCE:6}",
        },
        select: { id: true },
      });
    }

    const existing = await tx.documentTemplateSet.findFirst({
      where: { tenantId: host.id, certifiedKey: CERTIFICATE_OF_RESIDENCY_CERTIFIED_KEY, ownershipType: DocumentTemplateOwnership.CERTIFIED },
      include: { versions: { where: { status: DocumentTemplateVersionStatus.PUBLISHED }, orderBy: { version: "desc" }, take: 1 } },
    });
    if (existing?.versions[0]) return { created: false, set: existing, version: existing.versions[0] };

    const set = existing ?? await tx.documentTemplateSet.create({
      data: {
        tenantId: host.id,
        definitionId: definition.id,
        name: "HOAHub Certified Certificate of Residency",
        description: "Read-only certified reference template. Tenants customize cloned copies only.",
        active: true,
        ownershipType: DocumentTemplateOwnership.CERTIFIED,
        certifiedKey: CERTIFICATE_OF_RESIDENCY_CERTIFIED_KEY,
        upgradeCompatible: true,
        restorable: true,
        editable: false,
      },
    });
    const version = await tx.documentTemplateVersion.create({
      data: {
        tenantId: host.id,
        templateSetId: set.id,
        version: 1,
        status: DocumentTemplateVersionStatus.PUBLISHED,
        ownershipType: DocumentTemplateOwnership.CERTIFIED,
        schemaVersion: 2,
        definitionJson: asJson(certificateOfResidencyTemplateDefinition()),
        previewMetadata: asJson({ certifiedKey: CERTIFICATE_OF_RESIDENCY_CERTIFIED_KEY, release: "1.0" }),
        publishedAt: new Date(),
        upgradeCompatible: true,
        restorable: true,
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId: host.id,
        module: "DOCUMENTS",
        action: "SEED_CERTIFIED_CERTIFICATE_TEMPLATE",
        entityType: "DocumentTemplateVersion",
        entityId: version.id,
        metadata: asJson({ certifiedKey: CERTIFICATE_OF_RESIDENCY_CERTIFIED_KEY, version: 1 }),
      },
    });
    return { created: true, set: { ...set, versions: [version] }, version };
  });
}

export async function createCertificateOfResidencyReferenceDraft(context: DocumentExecutionContext, certifiedVersionId: string) {
  requireDocumentPermission(context, "MANAGE_TENANT_TEMPLATES");
  const actor = await platformPrisma.user.findFirst({ where: { id: context.authenticatedUserId, tenantId: context.tenantId, active: true }, select: { id: true } });
  if (!actor) throw new Error("Reference-draft actor does not belong to the target tenant.");
  const [definition, certified] = await Promise.all([
    platformPrisma.documentDefinition.findFirst({ where: { tenantId: context.tenantId, code: CERTIFICATE_OF_RESIDENCY_CODE }, select: { id: true, displayName: true } }),
    platformPrisma.documentTemplateVersion.findFirst({ where: { id: certifiedVersionId, tenantId: CERTIFIED_TEMPLATE_TENANT_ID, ownershipType: DocumentTemplateOwnership.CERTIFIED, status: DocumentTemplateVersionStatus.PUBLISHED, templateSet: { tenantId: CERTIFIED_TEMPLATE_TENANT_ID, ownershipType: DocumentTemplateOwnership.CERTIFIED, active: true } }, select: { id: true, templateSetId: true, version: true, schemaVersion: true } }),
  ]);
  if (!definition) throw new Error("Certificate of Residency definition was not found for the authenticated tenant.");
  if (!certified) throw new Error("Certified Certificate of Residency template was not found or is not published.");
  const existing = await platformPrisma.documentTemplateSet.findFirst({ where: { tenantId: context.tenantId, definitionId: definition.id, name: CERTIFICATE_OF_RESIDENCY_REFERENCE_TEMPLATE_NAME, ownershipType: DocumentTemplateOwnership.TENANT }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
  if (existing?.versions[0]) return { created: false, set: existing, draft: existing.versions[0] };
  return platformPrisma.$transaction(async (tx) => {
    const set = await tx.documentTemplateSet.create({ data: { tenantId: context.tenantId, definitionId: definition.id, name: CERTIFICATE_OF_RESIDENCY_REFERENCE_TEMPLATE_NAME, description: "Tenant-owned visual draft based on the supplied Certificate of Residency reference layout.", active: true, ownershipType: DocumentTemplateOwnership.TENANT, sourceTemplateSetId: certified.templateSetId, sourceTemplateVersionId: certified.id, upgradeCompatible: false, restorable: true, editable: true, createdById: actor.id, updatedById: actor.id } });
    const draft = await tx.documentTemplateVersion.create({ data: { tenantId: context.tenantId, templateSetId: set.id, version: 1, status: DocumentTemplateVersionStatus.DRAFT, ownershipType: DocumentTemplateOwnership.TENANT, schemaVersion: certified.schemaVersion, definitionJson: asJson(certificateOfResidencyReferenceTemplateDefinition()), previewMetadata: asJson({ source: "certificate-residency-reference-pdf", certifiedVersionId: certified.id, certifiedVersion: certified.version, draftOnly: true }), createdById: actor.id, sourceVersionId: certified.id, cloneSourceVersion: certified.version, clonedAt: new Date(), upgradeCompatible: false, restorable: true } });
    await tx.auditLog.create({ data: { tenantId: context.tenantId, actorId: actor.id, module: "DOCUMENTS", action: "CREATE_CERTIFICATE_REFERENCE_DRAFT", entityType: "DocumentTemplateVersion", entityId: draft.id, metadata: asJson({ definitionId: definition.id, certifiedVersionId: certified.id, templateSetId: set.id, draftOnly: true }) } });
    return { created: true, set, draft };
  });
}

export async function provisionCertificateOfResidencyForTenant(context: DocumentExecutionContext) {
  requireDocumentPermission(context, "MANAGE_DEFINITIONS");
  const actor = await platformPrisma.user.findFirst({
    where: { id: context.authenticatedUserId, tenantId: context.tenantId, active: true },
    select: { id: true },
  });
  if (!actor) throw new Error("Provisioning actor does not belong to the target tenant.");
  const certified = await ensureCertifiedCertificateOfResidencyTemplate();

  return platformPrisma.$transaction(async (tx) => {
    let definition = await tx.documentDefinition.findFirst({
      where: { tenantId: context.tenantId, code: CERTIFICATE_OF_RESIDENCY_CODE },
      include: { assignedTemplateVersion: { include: { templateSet: true } } },
    });
    const createdDefinition = !definition;
    if (!definition) {
      definition = await tx.documentDefinition.create({
        data: {
          tenantId: context.tenantId,
          code: CERTIFICATE_OF_RESIDENCY_CODE,
          displayName: "Certificate of Residency",
          description: "Certifies that a named homeowner or authorized resident resides at a property within the association.",
          category: "Official HOA Certification",
          status: DocumentDefinitionStatus.ACTIVE,
          active: true,
          systemKey: CERTIFICATE_OF_RESIDENCY_CODE,
          legacyType: DocumentType.CERTIFICATE_OF_RESIDENCY,
          deliveryMode: DocumentDeliveryMode.APPROVAL_REQUIRED,
          approvalRequired: true,
          paymentRequired: false,
          allowImmediateDownload: false,
          requiresAdminReview: true,
          releaseRequired: true,
          homeownerDownloadEnabled: true,
          walkInEnabled: true,
          householdMemberEnabled: true,
          allowRegeneration: true,
          feeAmount: new Prisma.Decimal(0),
          numberingFormat: "COR-{YYYY}-{SEQUENCE:6}",
          sequenceScope: DocumentSequenceScope.ANNUAL,
          maxCopies: 1,
          qrEnabled: true,
          createdById: actor.id,
          updatedById: actor.id,
        },
        include: { assignedTemplateVersion: { include: { templateSet: true } } },
      });
    }

    const fields = [
      { key: "purpose", label: "Purpose", fieldType: DocumentFieldType.TEXTAREA, required: true, displayOrder: 10, validation: { minLength: 3, maxLength: 500 } },
      { key: "intendedRecipient", label: "Intended recipient", fieldType: DocumentFieldType.TEXT, required: false, displayOrder: 20, validation: { maxLength: 150 } },
      { key: "remarks", label: "Additional remarks", fieldType: DocumentFieldType.TEXTAREA, required: false, displayOrder: 30, validation: { maxLength: 1000 } },
    ] as const;
    for (const field of fields) {
      await tx.documentDefinitionField.upsert({
        where: { tenantId_definitionId_key: { tenantId: context.tenantId, definitionId: definition.id, key: field.key } },
        create: { tenantId: context.tenantId, definitionId: definition.id, ...field, validation: asJson(field.validation) },
        update: {},
      });
    }

    let workflow = await tx.documentWorkflowDefinition.findFirst({ where: { tenantId: context.tenantId, code: CERTIFICATE_OF_RESIDENCY_WORKFLOW_CODE } });
    if (!workflow) {
      workflow = await tx.documentWorkflowDefinition.create({
        data: {
          tenantId: context.tenantId,
          code: CERTIFICATE_OF_RESIDENCY_WORKFLOW_CODE,
          name: "Certificate of Residency Approval",
          description: "One authorized tenant approval before official issuance.",
          approvalMode: DocumentWorkflowApprovalMode.SEQUENTIAL,
          createdById: actor.id,
          updatedById: actor.id,
        },
      });
      await tx.documentWorkflowStep.create({
        data: {
          tenantId: context.tenantId,
          workflowId: workflow.id,
          stepOrder: 1,
          stepType: DocumentWorkflowStepType.APPROVAL,
          approvalMode: DocumentWorkflowApprovalMode.SEQUENTIAL,
          required: true,
          overrideEligible: true,
          mandatoryOverrideRemarks: true,
          createdById: actor.id,
          updatedById: actor.id,
        },
      });
    }
    if (!definition.workflowDefinitionId) {
      await tx.documentDefinition.update({ where: { id: definition.id }, data: { workflowDefinitionId: workflow.id, version: { increment: 1 }, updatedById: actor.id } });
    }

    const policies = [
      { code: "COR_ACTIVE_RESIDENT", name: "Active resident", type: DocumentPolicyType.ACTIVE_RESIDENT, severity: DocumentPolicySeverity.BLOCKING, blocking: true, enabled: true, order: 10, required: true },
      { code: "COR_PROPERTY_RELATIONSHIP", name: "Property ownership or authorized occupancy", type: DocumentPolicyType.PROPERTY_OWNERSHIP, severity: DocumentPolicySeverity.BLOCKING, blocking: true, enabled: true, order: 20, required: true },
      { code: "COR_OUTSTANDING_BALANCE", name: "Outstanding balance", type: DocumentPolicyType.OUTSTANDING_BALANCE, severity: DocumentPolicySeverity.WARNING, blocking: false, enabled: true, order: 30, required: false },
      { code: "COR_VIOLATION_STATUS", name: "Violation status", type: DocumentPolicyType.VIOLATION_STATUS, severity: DocumentPolicySeverity.WARNING, blocking: false, enabled: false, order: 40, required: false },
    ] as const;
    for (const item of policies) {
      let policy = await tx.documentPolicy.findFirst({ where: { tenantId: context.tenantId, code: item.code }, select: { id: true } });
      if (!policy) {
        policy = await tx.documentPolicy.create({
          data: {
            tenantId: context.tenantId,
            code: item.code,
            name: item.name,
            type: item.type,
            severity: item.severity,
            blocking: item.blocking,
            enabled: item.enabled,
            parameters: item.type === DocumentPolicyType.OUTSTANDING_BALANCE ? asJson({ threshold: 0 }) : undefined,
            createdById: actor.id,
            updatedById: actor.id,
          },
          select: { id: true },
        });
      }
      await tx.documentDefinitionPolicyAssignment.upsert({
        where: { tenantId_definitionId_policyId: { tenantId: context.tenantId, definitionId: definition.id, policyId: policy.id } },
        create: { tenantId: context.tenantId, definitionId: definition.id, policyId: policy.id, evaluationOrder: item.order, required: item.required, enabled: true },
        update: {},
      });
    }

    await tx.documentNumberingConfiguration.upsert({
      where: { tenantId_definitionId: { tenantId: context.tenantId, definitionId: definition.id } },
      create: {
        tenantId: context.tenantId,
        definitionId: definition.id,
        prefix: "COR",
        yearFormat: "YYYY",
        sequenceLength: 6,
        resetRule: DocumentSequenceScope.ANNUAL,
        separator: "-",
        createdById: actor.id,
        updatedById: actor.id,
      },
      update: {},
    });

    let assignedTemplateVersionId = definition.assignedTemplateVersionId;
    const assignedIsUsable = definition.assignedTemplateVersion?.tenantId === context.tenantId
      && definition.assignedTemplateVersion.status === DocumentTemplateVersionStatus.PUBLISHED
      && definition.assignedTemplateVersion.templateSet.active;
    if (!assignedIsUsable) {
      const existingPublished = await tx.documentTemplateVersion.findFirst({
        where: {
          tenantId: context.tenantId,
          status: DocumentTemplateVersionStatus.PUBLISHED,
          templateSet: { definitionId: definition.id, active: true, ownershipType: { in: [DocumentTemplateOwnership.TENANT, DocumentTemplateOwnership.CUSTOM] } },
        },
        orderBy: [{ publishedAt: "desc" }, { version: "desc" }],
      });
      if (existingPublished) {
        assignedTemplateVersionId = existingPublished.id;
      } else {
        const set = await tx.documentTemplateSet.create({
          data: {
            tenantId: context.tenantId,
            definitionId: definition.id,
            name: "Certificate of Residency Template",
            description: "Tenant-owned published baseline cloned from the HOAHub certified template.",
            active: true,
            ownershipType: DocumentTemplateOwnership.TENANT,
            sourceTemplateSetId: certified.set.id,
            sourceTemplateVersionId: certified.version.id,
            upgradeCompatible: true,
            restorable: true,
            editable: true,
            createdById: actor.id,
            updatedById: actor.id,
          },
        });
        const version = await tx.documentTemplateVersion.create({
          data: {
            tenantId: context.tenantId,
            templateSetId: set.id,
            version: 1,
            status: DocumentTemplateVersionStatus.PUBLISHED,
            ownershipType: DocumentTemplateOwnership.TENANT,
            schemaVersion: certified.version.schemaVersion,
            definitionJson: asJson(certified.version.definitionJson),
            previewMetadata: asJson({ inheritedFromCertified: true, certifiedKey: CERTIFICATE_OF_RESIDENCY_CERTIFIED_KEY }),
            publishedAt: new Date(),
            publishedById: actor.id,
            createdById: actor.id,
            sourceVersionId: certified.version.id,
            cloneSourceVersion: certified.version.version,
            clonedAt: new Date(),
            upgradeCompatible: true,
            restorable: true,
          },
        });
        assignedTemplateVersionId = version.id;
      }
      await tx.documentDefinition.update({
        where: { id: definition.id },
        data: { assignedTemplateVersionId, version: { increment: 1 }, updatedById: actor.id },
      });
    }

    await writeDocumentAudit({
      context,
      action: "PROVISION_CERTIFICATE_OF_RESIDENCY",
      entityType: "DocumentDefinition",
      entityId: definition.id,
      after: { createdDefinition, workflowId: workflow.id, assignedTemplateVersionId },
      client: tx,
    });
    return { definitionId: definition.id, createdDefinition, assignedTemplateVersionId, certifiedVersionId: certified.version.id };
  });
}

function block(
  id: string,
  type: Parameters<typeof typedBlock>[0],
  section: Parameters<typeof typedBlock>[1],
  order: number,
  content: string,
  required: boolean,
  style: NonNullable<ReturnType<typeof typedBlock>["style"]> = {},
) {
  return typedBlock(type, section, { id, order, content, required, style });
}

function referenceBlock(id: string, type: DocumentTemplateBlockType, section: "header" | "body" | "footer", order: number, content: string, position: NonNullable<DocumentTemplateDefinition["blocks"][number]["position"]>, style: NonNullable<DocumentTemplateDefinition["blocks"][number]["style"]>, extra: Partial<DocumentTemplateDefinition["blocks"][number]> = {}) {
  return { id, type, section, order, content, visible: true, position, style, ...extra };
}

function infoPair(id: string, label: string, value: string, y: number, startX: number, endX: number, required = true) {
  const valueX = startX + 28;
  return [
    referenceBlock(`${id}-label`, "text", "body", y * 10, label, { x: startX, y, width: 26, height: 5, zIndex: 31 }, { fontSize: 7, fontWeight: "bold", textColor: "#0b2a63" }, { required }),
    referenceBlock(`${id}-value`, "text", "body", y * 10 + 1, `:   ${value}`, { x: valueX, y, width: endX - valueX, height: 5, zIndex: 31 }, { fontSize: 7 }, { required }),
  ];
}

function typedBlock(
  type: DocumentTemplateDefinition["sections"]["body"][number]["type"],
  section: DocumentTemplateDefinition["sections"]["body"][number]["section"],
  value: Omit<DocumentTemplateDefinition["sections"]["body"][number], "type" | "section" | "visible">,
) {
  return { ...value, type, section, visible: true };
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
