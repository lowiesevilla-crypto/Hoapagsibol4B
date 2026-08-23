import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
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
];

test("free document catalog contains the ten requested professional document types", () => {
  assert.equal(freeDocumentTemplateBlueprints.length, expectedCodes.length);
  assert.deepEqual(freeDocumentTemplateBlueprints.map((item) => item.code), expectedCodes);
  const validation = validateFreeDocumentTemplateCatalog();
  assert.equal(validation.valid, true, validation.errors.join("\n"));
});

test("every free template defaults to no document fee, sequence numbering, QR validation, and safe tenant installation", () => {
  for (const blueprint of freeDocumentTemplateBlueprints) {
    assert.equal(blueprint.workflow.paymentRequired, false, blueprint.code);
    assert.equal(blueprint.workflow.feeAmount, 0, blueprint.code);
    assert.match(blueprint.numberingFormat, /\{SEQUENCE/);
    const blocks = [...blueprint.template.sections.header, ...blueprint.template.sections.body, ...blueprint.template.sections.footer];
    assert.ok(blocks.some((block) => block.type === "qrVerification"), `${blueprint.code} must have QR verification`);
    assert.notEqual(blueprint.template.meta.requiresSignatory, true, `${blueprint.code} must not fail installation when a tenant signatory is not configured yet`);
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
