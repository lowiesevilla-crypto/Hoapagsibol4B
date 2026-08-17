import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const complaintDetail = readFileSync("app/admin/complaints/[id]/page.tsx", "utf8");
const complaintSettings = readFileSync("app/admin/complaints/settings/page.tsx", "utf8");
const panel = readFileSync("components/grievance-foundation-panel.tsx", "utf8");
const settingsPanel = readFileSync("components/grievance-settings-panel.tsx", "utf8");
const actions = readFileSync("lib/actions/grievance.ts", "utf8");
const adminService = readFileSync("lib/services/grievance-admin.ts", "utf8");
const foundationService = readFileSync("lib/services/grievance-foundation.ts", "utf8");

test("complaint admin detail preserves complaint state while rendering a separate grievance domain", () => {
  assert.match(complaintDetail, /GrievanceFoundationPanel/);
  assert.match(complaintDetail, /Operational complaint state remains separate from the formal grievance state/);
  assert.match(panel, /The complaint remains the intake\/operational case/);
  assert.match(panel, /Promote to formal grievance/);
  assert.match(panel, /Board review policy flag only/);
  assert.doesNotMatch(panel, /Board approved|Vote completed|Quorum satisfied/);
});

test("structured subject UI distinguishes allegation subject from incident location", () => {
  assert.match(panel, /Complaint subjects/);
  assert.match(panel, /Subject property\/person is separate from the incident location/);
  for (const type of ["HOMEOWNER", "PROPERTY", "VEHICLE", "COMMON_AREA", "UNKNOWN"]) {
    assert.ok(panel.includes(`value=\"${type}\"`));
  }
  assert.match(foundationService, /tenantId: user\.tenantId, id: input\.homeownerId/);
  assert.match(foundationService, /tenantId: user\.tenantId, id: input\.vehicleId/);
  assert.match(complaintDetail, /Incident location/);
});

test("verification gate is visible and enforced by the server before formal process", () => {
  assert.match(panel, /Independent verification/);
  assert.match(panel, /Formal enforcement gate is blocked/);
  assert.match(panel, /Ready for Formal Process/);
  assert.match(adminService, /assertComplaintEnforcementAllowed\(user\.tenantId, input\.complaintId\)/);
  assert.match(foundationService, /blocksEnforcement/);
  assert.match(foundationService, /verification\.status !== \"PASSED\"/);
  assert.doesNotMatch(foundationService, /ComplaintConfidentialIdentity|confidentialIdentity/);
});

test("grievance settings expose policy and tenant-scoped committee appointments without broad role grants", () => {
  assert.match(complaintSettings, /GrievanceSettingsPanel/);
  assert.match(settingsPanel, /Independent verification policy/);
  assert.match(settingsPanel, /Grievance Committee/);
  for (const position of ["CHAIR", "MEMBER", "SECRETARY", "MEDIATOR"]) assert.ok(settingsPanel.includes(`value=\"${position}\"`));
  assert.match(settingsPanel, /They do not grant finance, tenant-management, or platform authority/);
  assert.match(foundationService, /WHERE tenantId = \$\{tenantId\}/);
  assert.match(foundationService, /user\.roles/);
});

test("legacy complaint staff access does not fail merely because grievance permission is absent", () => {
  assert.match(complaintDetail, /canManageGrievance/);
  assert.match(complaintDetail, /grievanceData = canManageGrievance/);
  assert.match(complaintSettings, /canManageGrievance/);
  assert.match(complaintSettings, /grievanceData = canManageGrievance/);
  assert.match(complaintDetail, /Role\.ADMIN, Role\.HOA_ADMIN, Role\.SYSTEM_ADMIN/);
  assert.match(complaintSettings, /Role\.ADMIN, Role\.HOA_ADMIN, Role\.SYSTEM_ADMIN/);
});

test("process deadlines are explicit Manila dates and remain separate from Complaint.dueAt", () => {
  assert.match(panel, /Process deadlines/);
  assert.match(panel, /separate from the complaint operational SLA/);
  assert.match(panel, /Asia\/Manila/);
  assert.match(actions, /T00:00:00\+08:00/);
  assert.match(adminService, /GrievanceDeadline/);
  assert.match(adminService, /policySource/);
  assert.doesNotMatch(adminService, /Complaint\.dueAt|complaint\.dueAt/);
  assert.doesNotMatch(actions, /\b5\s*days?\b|\b7\s*days?\b/i);
});

test("admin message controls clearly distinguish public complainant updates and internal notes", () => {
  assert.match(complaintDetail, /Public update — complainant can read/);
  assert.match(complaintDetail, /Internal note — staff only/);
  assert.match(complaintDetail, /including an anonymous complainant using a valid tracking session/);
});

test("complaint category settings remain tenant-scoped when grievance settings are added", () => {
  assert.match(complaintSettings, /complaintCategory\.findFirst\(\{ where: \{ tenantId: admin\.tenantId, id \}/);
  assert.match(complaintSettings, /Board review flag is policy metadata only|Board review policy/);
});
