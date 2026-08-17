import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const feature = readFileSync("lib/services/grievance-feature.ts", "utf8");
const actions = readFileSync("lib/actions/grievance.ts", "utf8");
const slaActions = readFileSync("lib/actions/grievance-sla.ts", "utf8");
const authorization = readFileSync("lib/services/grievance-authorization.ts", "utf8");
const anonymousService = readFileSync("lib/services/complaint-anonymous-session.ts", "utf8");

test("grievance workflow writes honor the tenant foundation switch", () => {
  assert.match(feature, /SELECT foundationEnabled/);
  assert.match(feature, /WHERE tenantId = \$\{tenantId\}/);
  assert.match(feature, /The grievance foundation is currently disabled for this HOA/);
  assert.match(actions, /assertGrievanceFoundationEnabled\(user\.tenantId\)/);
  assert.match(actions, /requireEnabledGrievanceActor/);
  assert.match(slaActions, /assertGrievanceFoundationEnabled\(user\.tenantId\)/);
});

test("anonymous messaging honors both foundation and messaging switches", () => {
  assert.match(anonymousService, /foundationEnabled/);
  assert.match(anonymousService, /anonymousMessagingEnabled/);
  assert.match(anonymousService, /Anonymous complaint conversation is currently unavailable/);
});

test("platform roles cannot inherit tenant grievance authority through a committee appointment", () => {
  assert.match(authorization, /Role\.SUPER_ADMIN/);
  assert.match(authorization, /Role\.PLATFORM_ADMIN/);
  assert.match(authorization, /userRoleAssignments/);
  assert.match(authorization, /Platform-role users cannot be appointed to a tenant Grievance Committee/);
  assert.match(actions, /assertCommitteeAppointmentTargetEligible/);
});

test("grievance configuration remains recoverable when the foundation is disabled", () => {
  const settingsAction = actions.slice(actions.indexOf("export async function saveGrievanceSettingAction"), actions.indexOf("export async function saveVerificationPolicyAction"));
  assert.match(settingsAction, /assertGrievanceAdminAuthority\(user\)/);
  assert.doesNotMatch(settingsAction, /assertGrievanceFoundationEnabled/);
});
