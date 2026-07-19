import { DocumentGenerationMode, DocumentOutputFormat, DocumentPlaceholderOwnership } from "@prisma/client";
import {
  allowedDocumentPlaceholders,
  defaultOfficerListConfig,
  defaultTemplateDefinition,
  normalizeTemplateDefinition,
  validateTemplateDefinition,
} from "../lib/services/document-template-builder";
import { htmlDocumentRenderer } from "../lib/services/document-renderers";
import { buildDocumentRenderModel } from "../lib/services/document-render-model";
import { certificateOfResidencyReferenceTemplateDefinition } from "../lib/services/certificate-of-residency";
import type { DocumentRenderModel } from "../lib/services/document-render-model";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
}

async function main() {
  const visual = defaultTemplateDefinition("Certificate of Residency");
  assert(validateTemplateDefinition(visual).valid, "default visual template validates");
  assert(visual.page.canvas.snapToGrid && visual.page.canvas.gridSize === 5, "visual page stores deterministic grid settings");
  assert(visual.blocks.filter((block) => block.visible).every((block) => Boolean(block.position)), "default visual elements have bounded positions");
  assert(visual.blocks.some((block) => block.type === "logo" && block.position), "tenant logo is a movable first-class element");

  const outOfBounds = normalizeTemplateDefinition({ ...visual, sections: { ...visual.sections, body: [{ ...visual.sections.body[0], position: { x: 205, y: 290, width: 20, height: 20, zIndex: 1 } }] } }, "Certificate");
  assert(!validateTemplateDefinition(outOfBounds).valid, "printable-boundary overflow blocks validation");

  const legacy = normalizeTemplateDefinition({ schemaVersion: 1, page: { format: "A4", orientation: "portrait" }, blocks: [{ id: "legacy", type: "text", section: "body", content: "Legacy {{subject.fullName}}", visible: true, order: 10 }] }, "Legacy");
  assert(validateTemplateDefinition(legacy).valid, "legacy flow templates remain readable");
  assert(!legacy.blocks.some((block) => block.position), "legacy definitions are not silently rewritten in memory");
  const custom = normalizeTemplateDefinition({ ...visual, sections: { ...visual.sections, body: [{ ...visual.sections.body[0], content: "{{tenant.customPermitCode}}" }] } }, "Custom");
  assert(validateTemplateDefinition(custom, { allowedPlaceholders: new Set([...allowedDocumentPlaceholders, "tenant.customPermitCode"]) }).valid, "tenant-defined placeholders validate through the allowlist");

  const model: DocumentRenderModel = {
    schemaVersion: 1,
    rendererVersion: "1.0.0",
    mode: DocumentGenerationMode.ISSUE,
    preview: false,
    metadata: { title: "Visual Certificate", documentNumber: "COR-2026-000001", issueDate: "July 19, 2026", validUntil: null, verificationUrl: null, locale: "en-PH" },
    page: visual.page,
    visualLayout: true,
    sections: { header: [], body: [{ ...visual.blocks.find((block) => block.type === "documentTitle")!, content: "Visual Certificate", visible: true }], footer: [] },
    unresolvedPlaceholders: [],
    unauthorizedPlaceholders: [],
    resolvedValues: {},
    warnings: [],
  };
  const rendered = await htmlDocumentRenderer.render(model);
  assert(rendered.outputFormat === DocumentOutputFormat.HTML, "visual renderer returns HTML output");
  assert(rendered.content.includes("visual-layout") && rendered.content.includes("position:absolute"), "issued HTML uses the visual schema layout");
  assert(rendered.content.includes("left:25mm"), "issued HTML preserves millimetre element positions");

  const reference = certificateOfResidencyReferenceTemplateDefinition();
  const officers = [
    { id: "officer-1", fullName: "Officer Alpha", position: "President", displayOrder: 2 },
    { id: "officer-2", fullName: "Officer Beta", position: "Vice President", displayOrder: 1 },
    { id: "officer-3", fullName: "Officer Gamma", position: "Treasurer", displayOrder: 3 },
  ];
  const referenceValidation = validateTemplateDefinition(reference, { officerPositions: officers.map((officer) => officer.position), activeOfficerCount: officers.length });
  assert(referenceValidation.valid, `certificate reference draft validates: ${referenceValidation.errors.join(" | ")}`);
  assert(reference.blocks.some((block) => block.type === "officerList" && block.officerList?.source === "TENANT_ORGANIZATION_OFFICERS"), "reference draft contains a first-class trusted officer list");
  assert(reference.blocks.some((block) => block.type === "verticalLine" && block.position), "reference draft stores the movable sidebar separator");
  assert(reference.blocks.some((block) => block.type === "qrVerification" && block.section === "header"), "reference draft keeps QR metadata in the header");

  const placeholderDefinitions = allowedDocumentPlaceholders.map((key) => ({ key, category: "test", displayName: key, description: key, dataType: "TEXT", sample: key, sensitivity: null, ownership: DocumentPlaceholderOwnership.PLATFORM }));
  const context = {
    tenantId: "tenant-a",
    tenant: { name: "Tenant A", address: "Address", logo: "/uploads/logo.png" },
    document: { number: "COR-2026-000001", issueDate: "July 19, 2026", issuePlace: "Tenant A Office", validUntil: "July 31, 2026" },
    subject: { fullName: "Resident A", address: "Block 1 Lot 1", age: 39, civilStatus: "Single", nationality: "Filipino", contactNumber: "0917", propertyType: "Residential", occupancyStatus: "Owner occupied" },
    property: { block: "1", lot: "1", address: "Block 1 Lot 1", phase: "Phase 1" },
    request: { purpose: "Official use", requestedAt: "July 18, 2026", remarks: "Approved" },
    verification: { url: "https://example.test/verify/token" },
    organization: { tenantId: "tenant-a", term: "CY 2025-2026", officers },
    permissions: new Set<string>(),
  };
  const officerModel = buildDocumentRenderModel({ templateDefinition: { ...reference, sections: { ...reference.sections, body: reference.sections.body.map((block) => block.type === "officerList" ? { ...block, officerList: { ...defaultOfficerListConfig, roleFilters: ["President", "Vice President"], maxOfficers: 2 } } : block) }, blocks: [] }, title: "Certificate of Residency", documentNumber: "COR-2026-000001", issueDate: "July 19, 2026", validUntil: "July 31, 2026", verificationUrl: "https://example.test/verify/token", mode: DocumentGenerationMode.ISSUE, placeholderContext: context, placeholderDefinitions });
  assert(officerModel.officerListValidationErrors?.length === 0 && officerModel.officerListSnapshot?.officers.length === 2, "same-tenant officer source resolves, filters, orders, and caps the list");
  assert(officerModel.officerListSnapshot?.officers[0]?.fullName === "Officer Beta", "officer list ordering follows the configured display order");
  const officerRendered = await htmlDocumentRenderer.render(officerModel);
  assert(officerRendered.content.includes("officer-list") && officerRendered.content.includes("Officer Beta") && officerRendered.content.includes("CY 2025-2026"), "renderer emits the resolved officer sidebar and current term");
  const snapshotName = officerModel.officerListSnapshot?.officers[0]?.fullName;
  context.organization.officers[0].fullName = "Changed After Issue";
  assert(officerModel.officerListSnapshot?.officers[0]?.fullName === snapshotName, "resolved officer snapshot remains immutable after organization changes");
  const crossTenant = buildDocumentRenderModel({ templateDefinition: reference, title: "Certificate of Residency", documentNumber: "PREVIEW", issueDate: "July 19, 2026", mode: DocumentGenerationMode.PREVIEW, placeholderContext: { ...context, tenantId: "tenant-b" }, placeholderDefinitions });
  assert(crossTenant.officerListValidationErrors?.some((message) => message.includes("authenticated tenant")) === true, "cross-tenant officer source is rejected");
  const invalidRole = validateTemplateDefinition({ ...reference, sections: { ...reference.sections, body: reference.sections.body.map((block) => block.type === "officerList" ? { ...block, officerList: { ...defaultOfficerListConfig, roleFilters: ["Secretary"] } } : block) }, blocks: [] }, { officerPositions: officers.map((officer) => officer.position), activeOfficerCount: officers.length });
  assert(invalidRole.errors.some((message) => message.includes("role filter")), "invalid officer role filters block validation");
  const duplicateList = normalizeTemplateDefinition({ ...reference, sections: { ...reference.sections, body: [...reference.sections.body, { ...reference.sections.body.find((block) => block.type === "officerList")!, id: "reference-officer-list-2" }] }, blocks: [] }, "Certificate of Residency");
  assert(validateTemplateDefinition(duplicateList, { officerPositions: officers.map((officer) => officer.position), activeOfficerCount: officers.length }).errors.some((message) => message.includes("Only one HOA officer list")), "duplicate officer-list elements are rejected");
  const overflow = normalizeTemplateDefinition({ ...reference, sections: { ...reference.sections, body: reference.sections.body.map((block) => block.type === "officerList" ? { ...block, position: { ...block.position!, height: 20 } } : block) }, blocks: [] }, "Certificate of Residency");
  assert(validateTemplateDefinition(overflow, { officerPositions: officers.map((officer) => officer.position), activeOfficerCount: officers.length }).errors.some((message) => message.includes("overflow")), "officer sidebar content overflow is detected");
  const overlap = normalizeTemplateDefinition({ ...reference, sections: { ...reference.sections, body: reference.sections.body.map((block) => block.type === "documentTitle" ? { ...block, position: { ...block.position!, x: 20 } } : block) }, blocks: [] }, "Certificate of Residency");
  assert(validateTemplateDefinition(overlap, { officerPositions: officers.map((officer) => officer.position), activeOfficerCount: officers.length }).errors.some((message) => message.includes("overlaps the HOA officer sidebar")), "body overlap with the officer sidebar is detected");
  assert(typeof defaultOfficerListConfig.maxOfficers === "number" && reference.page.canvas.snapToGrid, "officer schema parity preserves visual designer canvas settings");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
