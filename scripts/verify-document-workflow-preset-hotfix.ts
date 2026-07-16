import { DocumentDeliveryMode } from "@prisma/client";
import { workflowFieldsForPreset, workflowPresetForDeliveryMode } from "../lib/services/document-workflow-presets";

assertWorkflow("FREE_INSTANT", {
  deliveryMode: DocumentDeliveryMode.INSTANT_DOWNLOAD,
  paymentRequired: false,
  approvalRequired: false,
  paymentBeforeApproval: false,
  allowImmediateDownload: true,
  requiresAdminReview: false,
});
assertWorkflow("FREE_APPROVAL", {
  deliveryMode: DocumentDeliveryMode.APPROVAL_REQUIRED,
  paymentRequired: false,
  approvalRequired: true,
  paymentBeforeApproval: false,
  allowImmediateDownload: false,
  requiresAdminReview: true,
});
assertWorkflow("PAID_INSTANT", {
  deliveryMode: DocumentDeliveryMode.PAYMENT_REQUIRED,
  paymentRequired: true,
  approvalRequired: false,
  paymentBeforeApproval: true,
  allowImmediateDownload: false,
  requiresAdminReview: false,
});
assertWorkflow("PAID_APPROVAL", {
  deliveryMode: DocumentDeliveryMode.PAYMENT_AND_APPROVAL_REQUIRED,
  paymentRequired: true,
  approvalRequired: true,
  paymentBeforeApproval: true,
  allowImmediateDownload: false,
  requiresAdminReview: true,
});
assertWorkflow("REQUEST_ONLY", {
  deliveryMode: DocumentDeliveryMode.REQUEST_ONLY,
  paymentRequired: false,
  approvalRequired: true,
  paymentBeforeApproval: false,
  allowImmediateDownload: false,
  requiresAdminReview: true,
});

assert(workflowFieldsForPreset("NOT_A_WORKFLOW") === null, "Invalid workflow strings must be rejected.");
assert(workflowPresetForDeliveryMode(DocumentDeliveryMode.PAYMENT_REQUIRED) === "PAID_INSTANT", "Payment required delivery maps to paid instant preset.");
assert(workflowPresetForDeliveryMode(DocumentDeliveryMode.REQUEST_ONLY) === "REQUEST_ONLY", "Request only delivery maps to request only preset.");

console.log("PASS: document workflow preset mappings and invalid workflow rejection verified.");

function assertWorkflow(preset: string, expected: NonNullable<ReturnType<typeof workflowFieldsForPreset>>) {
  const actual = workflowFieldsForPreset(preset);
  assert(Boolean(actual), `${preset} should resolve to workflow fields.`);
  for (const [key, value] of Object.entries(expected)) {
    assert(actual![key as keyof typeof actual] === value, `${preset}.${key} expected ${String(value)} but got ${String(actual![key as keyof typeof actual])}.`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
