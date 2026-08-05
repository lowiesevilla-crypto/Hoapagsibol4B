import assert from "node:assert/strict";
import { test } from "node:test";
import {
  averageDocumentTurnaroundDays,
  documentRequestAgeBand,
  evaluateDocumentationReadiness,
  isStaleDocumentGenerationAttempt,
  safeCsvCell,
  type DocumentReadinessDefinition,
} from "@/lib/services/document-operations";

const readyDefinition: DocumentReadinessDefinition = {
  id: "definition-1",
  code: "CERTIFICATE_OF_RESIDENCY",
  displayName: "Certificate of Residency",
  status: "ACTIVE",
  active: true,
  archivedAt: null,
  approvalRequired: true,
  paymentRequired: true,
  feeAmount: 100,
  receiptRequired: true,
  releaseRequired: true,
  homeownerDownloadEnabled: true,
  numberingFormat: "COR-{YYYY}-{SEQUENCE:6}",
  assignedTemplateVersionId: "version-1",
  workflowDefinitionId: "workflow-1",
  signatoryOfficerId: "officer-1",
  fields: [{ active: true }],
  assignedTemplateVersion: { status: "PUBLISHED" },
  workflowDefinition: {
    steps: [{ required: true, stepType: "APPROVAL", approverRole: "HOA_ADMIN" }],
  },
  signatoryOfficer: { active: true, archivedAt: null },
};

const payment = {
  gcashAccountName: "HOA",
  gcashMobileNumber: "09123456789",
  gcashQrImageUrl: "/uploads/payment/qr.png",
  paymentInstructions: "Pay the exact saved fee.",
};

test("fully configured document catalog is production-ready", () => {
  const result = evaluateDocumentationReadiness([readyDefinition], payment);
  assert.equal(result.productionReady, true);
  assert.equal(result.blockingCount, 0);
  assert.equal(result.definitions[0]?.severity, "ready");
});

test("readiness blocks missing template, signatory, numbering, fee, and payment setup", () => {
  const result = evaluateDocumentationReadiness([{
    ...readyDefinition,
    assignedTemplateVersionId: null,
    assignedTemplateVersion: null,
    signatoryOfficerId: null,
    signatoryOfficer: null,
    numberingFormat: "CERT-{YYYY}",
    feeAmount: 0,
  }], {});
  assert.equal(result.productionReady, false);
  assert.ok(result.blockingCount >= 5);
  const keys = result.definitions[0]?.checks.filter((item) => item.severity === "blocking").map((item) => item.key) ?? [];
  assert.ok(keys.includes("definition-1:template"));
  assert.ok(keys.includes("definition-1:signatory"));
  assert.ok(keys.includes("definition-1:numbering"));
  assert.ok(keys.includes("definition-1:fee"));
  assert.ok(keys.includes("definition-1:payment-settings"));
});

test("request aging uses stable SLA bands", () => {
  const now = new Date("2026-08-05T12:00:00.000Z");
  assert.deepEqual(documentRequestAgeBand(new Date("2026-08-05T00:00:00.000Z"), now), { key: "fresh", label: "0–1 day", days: 0 });
  assert.equal(documentRequestAgeBand(new Date("2026-08-02T00:00:00.000Z"), now).key, "watch");
  assert.equal(documentRequestAgeBand(new Date("2026-07-30T00:00:00.000Z"), now).key, "attention");
  assert.equal(documentRequestAgeBand(new Date("2026-07-20T00:00:00.000Z"), now).key, "critical");
});

test("only active generation states older than the threshold are stale", () => {
  const now = new Date("2026-08-05T12:00:00.000Z");
  assert.equal(isStaleDocumentGenerationAttempt("RENDERING", new Date("2026-08-05T11:54:59.000Z"), now), true);
  assert.equal(isStaleDocumentGenerationAttempt("RENDERING", new Date("2026-08-05T11:59:00.000Z"), now), false);
  assert.equal(isStaleDocumentGenerationAttempt("FAILED", new Date("2026-08-05T10:00:00.000Z"), now), false);
});

test("turnaround metric averages completed requests and ignores incomplete work", () => {
  const result = averageDocumentTurnaroundDays([
    { requestedAt: new Date("2026-08-01T00:00:00.000Z"), issuedAt: new Date("2026-08-03T00:00:00.000Z") },
    { requestedAt: new Date("2026-08-01T00:00:00.000Z"), generatedAt: new Date("2026-08-04T00:00:00.000Z") },
    { requestedAt: new Date("2026-08-01T00:00:00.000Z") },
  ]);
  assert.equal(result, 2.5);
});

test("CSV cells prevent spreadsheet formula execution and escape quotes", () => {
  assert.equal(safeCsvCell("=HYPERLINK(\"bad\")"), '"\'=HYPERLINK(""bad"")"');
  assert.equal(safeCsvCell('Resident "A"'), '"Resident ""A"""');
});
