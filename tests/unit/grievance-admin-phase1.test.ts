import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const complaintDetail = readFileSync("app/admin/complaints/[id]/page.tsx", "utf8");
const complaintSettings = readFileSync("app/admin/complaints/settings/page.tsx", "utf8");
const panel = readFileSync("components/grievance-foundation-panel.tsx", "utf8");
const slaControl = readFileSync("components/grievance-operational-sla-control.tsx", "utf8");
const settingsPanel = readFileSync("components/grievance-settings-panel.tsx", "utf8");
const actions = readFileSync("lib/actions/grievance.ts", "utf8");
const slaActions = readFileSync("lib/actions/grievance-sla.ts", "utf8");
const adminService = readFileSync("lib/services/grievance-admin.ts", "utf8");
const authorizationService = readFileSync("lib/services/grievance-authorization.ts", "utf8");
const foundationService = readFileSync("lib/services/grievance-foundation.ts", "utf8");
const slaService = readFileSync("lib/services/grievance-sla.ts", "utf8");

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
  assert.match(adminService, /ComplaintVerification[\s\S]*FOR UPDATE/);
  assert.match(adminService, /GrievanceCase[\s\S]*FOR UPDATE/);
  assert.match(adminService, /input\.status === "READY_FOR_FORMAL_PROCESS"/);
  assert.match(adminService, /verification\?\.status !== "PASSED"/);
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

test("platform roles are explicitly blocked from grievance actions and committee appointments", () => {
  assert.match(authorizationService, /Role\.SUPER_ADMIN, Role\.PLATFORM_ADMIN/);
  assert.match(authorizationService, /Platform roles do not receive tenant grievance authority/);
  assert.match(authorizationService, /userRoleAssignments/);
  assert.match(authorizationService, /Platform-role users cannot be appointed to a tenant Grievance Committee/);
  assert.match(actions, /assertGrievanceActorEligible\(user\)/);
  assert.match(actions, /assertGrievanceAdminAuthority\(user\)/);
  assert.match(actions, /assertCommitteeAppointmentTargetEligible\(user\.tenantId, targetUserId\)/);
  assert.match(slaActions, /assertGrievanceActorEligible\(user\)/);
});

test("legacy complaint access stays usable while grievance UI follows active committee permissions", () => {
  assert.match(complaintDetail, /requireComplaintAdmin\(\)/);
  assert.match(complaintDetail, /hasGrievancePermission/);
  assert.match(complaintDetail, /hasGrievancePermission\(user, "VIEW_GRIEVANCE"\)/);
  assert.match(complaintDetail, /hasGrievancePermission\(user, "TRIAGE_GRIEVANCE"\)/);
  assert.match(complaintDetail, /hasGrievancePermission\(user, "VERIFY_GRIEVANCE"\)/);
  assert.match(complaintDetail, /grievanceFoundation = canViewGrievance/);
  assert.doesNotMatch(complaintDetail, /\[Role\.ADMIN, Role\.HOA_ADMIN, Role\.SYSTEM_ADMIN\]/);
  assert.match(complaintSettings, /canManageGrievance/);
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

test("operational SLA pause and resume are explicit and cannot rewrite grievance deadlines", () => {
  assert.match(complaintDetail, /GrievanceOperationalSlaControl/);
  assert.match(slaControl, /Operational SLA pause/);
  assert.match(slaControl, /does not pause, extend, or rewrite a grievance process deadline/);
  assert.match(slaControl, /Pause operational SLA/);
  assert.match(slaControl, /Resume operational SLA/);
  assert.match(slaService, /operationalSlaPausedAt/);
  assert.match(slaService, /operationalSlaPauseReason/);
  assert.match(slaService, /reason\.length < 10/);
  assert.doesNotMatch(slaService, /UPDATE GrievanceDeadline|Complaint\.dueAt|complaint\.dueAt/);
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
