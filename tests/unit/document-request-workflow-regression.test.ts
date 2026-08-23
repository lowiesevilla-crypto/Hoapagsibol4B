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
  assert.match(executor.slice(directIssue, residentPaymentGate), /persistAdminOfficeApprovalBypass/);
  assert.match(executor.slice(directIssue, residentPaymentGate), /issueOfficialDocument/);
  assert.match(executor, /approvalRequiredSnapshot: false/);
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

test("admin can print an office-issued document before fee posting while homeowner access stays gated", async () => {
  const access = await source("lib/services/document-balance-policy.ts");
  const adminPage = await source("app/admin/documents/[id]/page.tsx");

  assert.match(access, /const staffWalkIn = request\.origin === "ADMIN"/);
  assert.match(access, /const paymentLocked = !staffWalkIn && request\.paymentRequiredSnapshot/);
  assert.match(access, /const balanceLocked = !staffWalkIn && hasBalance/);
  assert.match(adminPage, /viewerRole: user\.role/);
  assert.match(adminPage, />Print document<\/a>/);
  assert.match(adminPage, /No homeowner approval is required/);
});

test("admin records the actual document fee method, date, reference and returns to the issued document", async () => {
  const adminPage = await source("app/admin/documents/[id]/page.tsx");
  const actions = await source("lib/actions/payment-requests.ts");

  assert.match(adminPage, /Record Document Fee Payment/);
  assert.match(adminPage, /name="paymentDate"/);
  assert.match(adminPage, /name="paymentMethod"/);
  assert.match(adminPage, /name="referenceNumber"/);
  assert.match(adminPage, /Record Payment & Generate Receipt/);
  assert.match(adminPage, /Collection type/);
  assert.match(adminPage, /value="Document Fee"/);
  assert.match(actions, /normalizePaymentReference/);
  assert.match(actions, /Select a valid payment method/);
  assert.match(actions, /Payment could not be recorded/);
  assert.match(actions, /Document Fee payment recorded\. Collection and official receipt were generated/);
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
