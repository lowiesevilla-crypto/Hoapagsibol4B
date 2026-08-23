import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  FREE_DOCUMENT_LIBRARY_VERSION,
  freeDocumentTemplateBlueprints,
  validateFreeDocumentTemplateCatalog,
} from "@/lib/services/platform-document-template-catalog";

const servicePath = new URL("../../lib/services/platform-document-template-library.ts", import.meta.url);
const pagePath = new URL("../../app/platform/document-management/templates/page.tsx", import.meta.url);

const expectedCodes = [
  "CERTIFICATE_OF_RESIDENCY",
  "CERTIFICATE_OF_INDIGENCY",
  "CERTIFICATE_OF_GOOD_STANDING",
  "CLEARANCE_CERTIFICATE",
  "PAYMENT_CERTIFICATION",
  "CONSTRUCTION_BOND_CERTIFICATION",
  "CONTRACTOR_BOND_CERTIFICATION",
  "GATE_PASS",
  "MOVE_IN_PASS",
  "MOVE_OUT_PASS",
  "WORK_PERMIT",
];

const approvedLegalCodes = new Set([
  "CERTIFICATE_OF_RESIDENCY",
  "CERTIFICATE_OF_INDIGENCY",
  "CERTIFICATE_OF_GOOD_STANDING",
  "CLEARANCE_CERTIFICATE",
  "PAYMENT_CERTIFICATION",
  "CONSTRUCTION_BOND_CERTIFICATION",
  "CONTRACTOR_BOND_CERTIFICATION",
  "WORK_PERMIT",
]);

test("free document catalog contains the eleven approved professional document types", () => {
  assert.equal(freeDocumentTemplateBlueprints.length, expectedCodes.length);
  assert.deepEqual(freeDocumentTemplateBlueprints.map((item) => item.code), expectedCodes);
  assert.equal(FREE_DOCUMENT_LIBRARY_VERSION, 2);
  const validation = validateFreeDocumentTemplateCatalog();
  assert.equal(validation.valid, true, validation.errors.join("\n"));
});

test("every free template defaults to no document fee, sequence numbering, QR validation, and safe tenant installation", () => {
  for (const blueprint of freeDocumentTemplateBlueprints) {
    assert.equal(blueprint.libraryVersion, FREE_DOCUMENT_LIBRARY_VERSION, blueprint.code);
    assert.equal(blueprint.workflow.paymentRequired, false, blueprint.code);
    assert.equal(blueprint.workflow.feeAmount, 0, blueprint.code);
    assert.match(blueprint.numberingFormat, /\{SEQUENCE/);
    const blocks = [...blueprint.template.sections.header, ...blueprint.template.sections.body, ...blueprint.template.sections.footer];
    assert.ok(blocks.some((block) => block.type === "qrVerification"), `${blueprint.code} must have QR verification`);
    assert.notEqual(blueprint.template.meta.requiresSignatory, true, `${blueprint.code} must not fail installation when a tenant signatory is not configured yet`);
  }
});

test("approved legal certificates and work permit use readable professional typography", () => {
  for (const blueprint of freeDocumentTemplateBlueprints.filter((item) => approvedLegalCodes.has(item.code))) {
    const blocks = [...blueprint.template.sections.header, ...blueprint.template.sections.body, ...blueprint.template.sections.footer];
    const textBlocks = blocks.filter((block) => block.visible && block.type !== "rectangle" && block.type !== "horizontalLine" && block.type !== "verticalLine" && block.type !== "qrVerification" && typeof block.style?.fontSize === "number");
    assert.ok(textBlocks.length >= 5, `${blueprint.code} must have structured readable text blocks`);
    for (const block of textBlocks) {
      assert.ok((block.style?.fontSize ?? 0) >= 7, `${blueprint.code}:${block.id} font is below the 7pt readability floor`);
    }
    assert.ok(blocks.some((block) => block.style?.fontFamily === "Georgia" || block.style?.fontFamily === "Times New Roman"), `${blueprint.code} must retain formal legal typography`);
  }
});

test("work permit is approval controlled and operationally complete", () => {
  const permit = freeDocumentTemplateBlueprints.find((item) => item.code === "WORK_PERMIT");
  assert.ok(permit);
  assert.equal(permit.workflow.approvalRequired, true);
  assert.equal(permit.workflow.releaseRequired, true);
  assert.equal(permit.validityDays, 1);
  assert.match(permit.numberingFormat, /^WP-/);
  const keys = new Set(permit.fields.map((field) => field.key));
  for (const key of ["purpose", "scheduledDate", "startTime", "endTime", "representativeName", "destination", "vehicleDetails", "items", "remarks"]) assert.ok(keys.has(key), `WORK_PERMIT missing ${key}`);
});

test("gate and move pass library fields map to the existing generation runtime", () => {
  const gate = freeDocumentTemplateBlueprints.find((item) => item.code === "GATE_PASS");
  const moveIn = freeDocumentTemplateBlueprints.find((item) => item.code === "MOVE_IN_PASS");
  const moveOut = freeDocumentTemplateBlueprints.find((item) => item.code === "MOVE_OUT_PASS");
  assert.ok(gate && moveIn && moveOut);
  assert.ok(gate.fields.some((field) => field.key === "representativeName"));
  for (const pass of [moveIn, moveOut]) {
    const keys = new Set(pass.fields.map((field) => field.key));
    assert.ok(keys.has("contractorDetails"), `${pass.code} must collect service-provider data through the runtime-supported contractorDetails field`);
    assert.ok(keys.has("items"), `${pass.code} must collect item rows through the runtime-supported items field`);
  }
});

test("assignment creates tenant-editable versions, retires the previously assigned published version, and preserves tenant customization controls", async () => {
  const [service, page] = await Promise.all([readFile(servicePath, "utf8"), readFile(pagePath, "utf8")]);
  assert.match(service, /ownershipType: DocumentTemplateOwnership\.TENANT/);
  assert.match(service, /editable: true/);
  assert.match(service, /DocumentTemplateVersionStatus\.PUBLISHED/);
  assert.match(service, /DocumentTemplateVersionStatus\.RETIRED/);
  assert.match(service, /Prisma\.TransactionIsolationLevel\.Serializable/);
  assert.match(service, /preservedExistingFields: true/);
  assert.match(service, /applyRecommendedWorkflow/);
  assert.match(service, /"PRESERVED" as const/);
  assert.doesNotMatch(service, /documentRequest\.updateMany/);
  assert.doesNotMatch(service, /documentVersion\.updateMany/);
  assert.match(page, /Tenant remains in control/);
  assert.match(page, /Tenant administrators can still change the document definition/);
  assert.match(page, /Clear to preserve an existing tenant workflow/);
});

test("free template assignment validates the stored template payload instead of trusting preview metadata alone", async () => {
  const service = await readFile(servicePath, "utf8");
  assert.match(service, /definitionJson: asJson\(blueprint\.template\)/);
  assert.match(service, /hashDefinition\(definition\.assignedTemplateVersion\.definitionJson\)/);
  assert.match(service, /hashDefinition\(assigned\.definitionJson\)/);
  assert.match(service, /assignedContentHash === contentHash/);
  assert.match(service, /repairedContentMismatch: repairingContentMismatch/);
});
