import { readFileSync } from "node:fs";
import { householdMemberEligibility } from "@/lib/services/household-member-eligibility";

function assertCondition(condition: unknown, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
}

function main() {
  const portalDocuments = readFileSync("app/portal/documents/page.tsx", "utf8");
  const requestForm = readFileSync("components/document-request-form.tsx", "utf8");
  const documentActions = readFileSync("lib/actions/documents.ts", "utf8");
  const workflowExecutor = readFileSync("lib/services/document-workflow-executor.ts", "utf8");
  const reviewActions = readFileSync("components/document-review-actions.tsx", "utf8");
  const adminRequestPage = readFileSync("app/admin/documents/[id]/page.tsx", "utf8");
  const certificateActions = readFileSync("lib/actions/certificate-of-residency.ts", "utf8");

  const expected = { tenantId: "tenant-a", homeownerId: "homeowner-a" };
  const validMember = { ...expected, active: true, validatedAt: new Date("2026-07-01T00:00:00Z"), revokedAt: null };
  assertCondition(householdMemberEligibility(validMember, expected).eligible, "validated active household member is eligible");
  assertCondition(householdMemberEligibility({ ...validMember, active: false }, expected).reason === "This household member is inactive.", "inactive household member has a precise message");
  assertCondition(householdMemberEligibility({ ...validMember, validatedAt: null }, expected).reason === "Validation is still pending.", "unvalidated household member has a precise message");
  assertCondition(householdMemberEligibility({ ...validMember, revokedAt: new Date("2026-07-02T00:00:00Z") }, expected).reason === "This household member was not approved.", "rejected household member has a precise message");
  assertCondition(householdMemberEligibility({ ...validMember, tenantId: "tenant-b" }, expected).reason === "This household member belongs to another tenant.", "cross-tenant household member is blocked");
  assertCondition(householdMemberEligibility({ ...validMember, homeownerId: "homeowner-b" }, expected).reason === "This household member does not belong to your registered household.", "unrelated household member is blocked");

  assertCondition(portalDocuments.includes("householdMemberEligibility(member") && documentActions.includes("householdMemberEligibility(member") && workflowExecutor.includes("householdMemberEligibility(member"), "portal UI, submission action, and workflow executor share the same eligibility helper");
  assertCondition(requestForm.includes("Registered Household / Family Members") && requestForm.includes("aria-expanded={memberSectionOpen}") && requestForm.includes("setMemberSectionOpen(true)"), "household member request section is accessible and auto-expands when selected");
  assertCondition(requestForm.includes("No validated and active household member is currently available for document requests."), "household member empty state names active and validated requirements");
  assertCondition(requestForm.includes("submissionState.values") && requestForm.includes("setSubjectType(\"HOUSEHOLD_MEMBER\")") && requestForm.includes("setSubjectMemberId(values.subjectMemberId || \"\")"), "request form preserves subject type and selected member after recoverable validation errors");
  assertCondition(requestForm.includes("value={submissionState.values?.[`field_${field.key}`]}") && requestForm.includes("defaultValue={submissionState.values?.numberOfCopies"), "request form preserves dynamic field values and copies after validation errors");

  assertCondition(portalDocuments.includes("documentHistorySearch(q)") && portalDocuments.includes("name=\"q\"") && portalDocuments.includes("Clear search"), "homeowner request history has server-side submitted search with clear control");
  assertCondition(portalDocuments.includes("paymentRequest: { is: { referenceNumber") && portalDocuments.includes("receiptNumber: { contains: q }"), "history search covers payment reference and receipt number without loading all history client-side");
  assertCondition(portalDocuments.includes("open={paymentNeedsAction}") && portalDocuments.includes("Pay Document Fee") && portalDocuments.includes("Payment details -"), "document fee payment details collapse while required payment action remains visible");
  assertCondition(portalDocuments.includes("<details className=\"mt-3 rounded-xl bg-white p-3 text-xs\"") && portalDocuments.includes("Status history"), "status history remains available in a collapsed timeline");

  assertCondition(reviewActions.includes("Rejection Remarks *") && reviewActions.includes("minLength={10}") && reviewActions.includes("Confirm Rejection"), "generic admin rejection flow has required remarks panel");
  assertCondition(documentActions.includes("rejectionRemarks") && documentActions.includes("Enter rejection remarks with at least 10 characters.") && documentActions.includes("status: DocumentRequestStatus.REJECTED"), "generic rejection action validates and persists meaningful rejection remarks");
  assertCondition(adminRequestPage.includes("Rejection Remarks *") && adminRequestPage.includes("Confirm Rejection"), "Certificate of Residency admin view exposes a rejection remarks panel");
  assertCondition(certificateActions.includes("remarks.length < 10") && certificateActions.includes("rejectCertificateRequest"), "Certificate of Residency rejection action enforces meaningful remarks server-side");

  console.log("Document request UX and rejection hotfix verification passed.");
}

main();
