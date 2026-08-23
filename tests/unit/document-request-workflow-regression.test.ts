import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

async function source(path: string) {
  return readFile(path, "utf8");
}

test("homeowner paid document requests remain payment-gated and auto-advance after confirmation", async () => {
  const executor = await source("lib/services/document-workflow-executor.ts");
  const paymentRequests = await source("lib/services/payment-requests.ts");

  assert.match(executor, /if \(request\.paymentRequiredSnapshot\)/);
  assert.match(executor, /action: "PAYMENT_REQUIRED"/);
  assert.match(executor, /ensureDocumentFeePaymentRequest/);
  assert.match(paymentRequests, /PaymentRequestType\.DOCUMENT_FEE/);
  assert.match(paymentRequests, /advanceDocumentWorkflowAfterPayment/);
  assert.match(paymentRequests, /gatewayConfirmed: Boolean\(options\?\.allowGatewayConfirmation\)/);
});

test("tenant admin office issuance bypasses resident approval and payment gates without losing the fee", async () => {
  const executor = await source("lib/services/document-workflow-executor.ts");
  const eligibility = await source("lib/services/document-generation-eligibility.ts");
  const workflows = await source("lib/services/document-workflows.ts");

  const directIssue = executor.indexOf("if (isAdminOfficeRequest(context, request))");
  const residentPaymentGate = executor.indexOf("if (request.paymentRequiredSnapshot)", directIssue + 1);
  assert.ok(directIssue >= 0, "admin direct issuance branch must exist");
  assert.ok(residentPaymentGate > directIssue, "admin direct issuance must run before the resident payment gate");
  assert.match(executor.slice(directIssue, residentPaymentGate), /ensureDocumentFeePaymentRequest/);
  assert.match(executor.slice(directIssue, residentPaymentGate), /issueOfficialDocument/);
  assert.match(executor, /action: "ADMIN_OFFICE_DIRECT_ISSUANCE"/);

  assert.match(eligibility, /const adminOfficeIssue = request\.origin === "ADMIN" && context\.role !== Role\.HOMEOWNER/);
  assert.match(eligibility, /!adminOfficeIssue && request\.paymentRequiredSnapshot/);
  assert.match(eligibility, /!adminOfficeIssue && request\.approvalRequiredSnapshot/);
  assert.match(workflows, /request\.origin === "ADMIN" && context\.role !== Role\.HOMEOWNER/);
  assert.match(workflows, /completed: true/);
});

test("document fee collection can be recorded after admin issuance while issued status is preserved", async () => {
  const paymentRequests = await source("lib/services/payment-requests.ts");
  const executor = await source("lib/services/document-workflow-executor.ts");

  assert.match(paymentRequests, /select: \{ id: true, origin: true, paymentRequiredSnapshot: true, feeAmountSnapshot: true, status: true \}/);
  assert.match(paymentRequests, /documentRequest\.origin !== "ADMIN" && issuedDocumentStatuses\.has\(documentRequest\.status\)/);
  assert.match(paymentRequests, /const preserveIssuedStatus = documentRequest\.origin === "ADMIN" && issuedDocumentStatuses\.has\(documentRequest\.status\)/);
  assert.match(paymentRequests, /description: "Document Fee"/);
  assert.match(paymentRequests, /financeClassification: "DOCUMENT_FEE"/);
  assert.match(executor, /issuedStatuses\.has\(request\.status\) \|\| request\.currentVersion > 0/);
});

test("custom workflow delivery mode keeps payment and approval switches synchronized", async () => {
  const controls = await source("components/document-definition-workflow-controls.tsx");

  assert.match(controls, /setCustomRules\(rulesForDeliveryMode\(event\.currentTarget\.value as DocumentDeliveryMode\)\)/);
  assert.match(controls, /function normalizeCustomRules/);
  assert.match(controls, /PAYMENT_AND_APPROVAL_REQUIRED/);
  assert.match(controls, /Changing delivery mode automatically applies a valid baseline/);
});

test("admin issuance form populates known homeowner values and stays editable", async () => {
  const form = await source("components/manual-document-form.tsx");

  assert.match(form, /Tenant Admin Document Issuance/);
  assert.match(form, /<SubmitButton>Issue Document<\/SubmitButton>/);
  assert.match(form, /homeownerFieldValue/);
  assert.match(form, /defaultValue=\{defaultText\}/);
  assert.match(form, /Direct issue - no request approval/);
  assert.match(form, /Document Fee collection/);
});
