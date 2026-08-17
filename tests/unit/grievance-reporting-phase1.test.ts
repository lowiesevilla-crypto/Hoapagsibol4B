import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const queue = readFileSync("app/admin/complaints/page.tsx", "utf8");
const reportPage = readFileSync("app/admin/complaints/grievance-report/page.tsx", "utf8");
const reporting = readFileSync("lib/services/grievance-reporting.ts", "utf8");

test("complaint queue exposes separate grievance and verification filters", () => {
  assert.match(queue, /name="grievanceStatus"/);
  assert.match(queue, /name="verificationStatus"/);
  assert.match(queue, /Complaint status remains the operational queue state/);
  assert.match(queue, /getGrievanceComplaintQueue/);
  assert.match(queue, /getGrievanceMetadataForComplaints/);
});

test("formal grievance queue filters are applied by SQL before its result cap", () => {
  assert.match(reporting, /export async function getGrievanceComplaintQueue/);
  const queueBlock = reporting.slice(reporting.indexOf("export async function getGrievanceComplaintQueue"), reporting.indexOf("export async function getGrievanceMetadataForComplaints"));
  const whereIndex = queueBlock.indexOf("WHERE ${where}");
  const limitIndex = queueBlock.indexOf("LIMIT 100");
  assert.ok(whereIndex >= 0 && limitIndex > whereIndex);
  assert.doesNotMatch(queue, /matchingIds/);
  assert.doesNotMatch(queue, /baseComplaints\.filter/);
});

test("grievance report can filter complaint and grievance domains without identity columns", () => {
  for (const field of ["status", "grievanceStatus", "verificationStatus", "privacyMode", "categoryId", "assignedToId", "dateFrom", "dateTo"]) {
    assert.ok(reportPage.includes(`name=\"${field}\"`));
  }
  assert.match(reportPage, /This report excludes complainant identity fields/);
  assert.match(reportPage, /Confidential identity access remains a separate/);
  assert.doesNotMatch(reporting, /ComplaintConfidentialIdentity|trackingCode|pinHash|email|phone|addressSnapshot/);
});

test("grievance reporting SQL is explicitly tenant-scoped", () => {
  assert.match(reporting, /c\.tenantId = \$\{user\.tenantId\}/);
  assert.match(reporting, /assertGrievanceActorEligible\(user\)/);
  assert.match(reporting, /requireGrievancePermission\(user, "VIEW_GRIEVANCE"\)/);
  assert.match(reporting, /LEFT JOIN GrievanceCase g/);
  assert.match(reporting, /LEFT JOIN ComplaintVerification v/);
});

test("reporting keeps complaint, grievance, and verification states distinct", () => {
  assert.match(reporting, /c\.status AS complaintStatus/);
  assert.match(reporting, /g\.status AS grievanceStatus/);
  assert.match(reporting, /v\.status AS verificationStatus/);
  assert.match(reportPage, /Complaint/);
  assert.match(reportPage, /Grievance/);
  assert.match(reportPage, /Verification/);
});
