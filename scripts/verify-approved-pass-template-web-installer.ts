import "./register-server-only-shim.cjs";

import fs from "node:fs";
import path from "node:path";
import { DocumentTemplateOwnership, DocumentTemplateVersionStatus, Role } from "@prisma/client";
import {
  approvedPassTemplateConfirmationPhrase,
  approvedPassTemplateInstallerEnabled,
  assertApprovedPassTemplateInstallerRole,
  assertInstallerConfirmation,
  assertTargetTenant,
  loadApprovedPassTemplatePackages,
  planApprovedPassTemplateFromState,
  sanitizePlanForDisplay,
  targetPassTemplates,
  targetTenantId,
  validateApprovedPassTemplatePackage,
  type ApprovedPassDefinitionState,
  type ApprovedPassTemplatePackage,
  type TargetPassTemplate,
} from "@/lib/services/approved-pass-template-installer";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
}

function assertThrows(fn: () => unknown, includes: string, message: string) {
  try {
    fn();
  } catch (error) {
    const value = error instanceof Error ? error.message : String(error);
    assert(value.includes(includes), message);
    return;
  }
  throw new Error(`FAIL: ${message}`);
}

const packages = loadApprovedPassTemplatePackages();
assert(packages.length === 2, "web installer statically loads both approved packages");
assert(!approvedPassTemplateInstallerEnabled({ ENABLE_APPROVED_PASS_TEMPLATE_INSTALLER: "false" }), "feature flag disabled blocks installer");
assert(approvedPassTemplateInstallerEnabled({ ENABLE_APPROVED_PASS_TEMPLATE_INSTALLER: "true" }), "feature flag enabled allows installer");
assertThrows(() => assertApprovedPassTemplateInstallerRole(Role.ADMIN), "System Administrator", "unauthorized document admin role is rejected");
assertApprovedPassTemplateInstallerRole(Role.SYSTEM_ADMIN);
assertThrows(() => assertTargetTenant("tenant_other"), "restricted", "wrong tenant is rejected");
assertTargetTenant(targetTenantId);
assertThrows(() => assertInstallerConfirmation({ phrase: "INSTALL", acknowledged: "on" }), "confirmation phrase", "invalid confirmation phrase is rejected");
assertThrows(() => assertInstallerConfirmation({ phrase: approvedPassTemplateConfirmationPhrase, acknowledged: null }), "Confirm", "missing checkbox confirmation is rejected");

for (const { target, pkg } of packages) {
  assert(pkg.contentHash === target.expectedContentHash, `${target.label} approved package hash matches pinned hash`);
  validateApprovedPassTemplatePackage(pkg, target);
  const invalid = { ...pkg, contentHash: "sha256:bad" } as ApprovedPassTemplatePackage;
  assertThrows(() => validateApprovedPassTemplatePackage(invalid, target), "approved hash", `${target.label} package hash mismatch is rejected`);
}

const [gate] = packages;
const createPlan = planApprovedPassTemplateFromState(gate.target, gate.pkg, state(gate.target, gate.pkg, [{ version: 2, status: DocumentTemplateVersionStatus.PUBLISHED, matchesPackage: false }]));
assert(createPlan.action === "CREATE_DRAFT", "no existing Draft plans CREATE_DRAFT");
assert(createPlan.nextVersion === 3, "next version uses MAX(existing version) + 1");
const maxPlan = planApprovedPassTemplateFromState(gate.target, gate.pkg, state(gate.target, gate.pkg, [
  { version: 2, status: DocumentTemplateVersionStatus.PUBLISHED, matchesPackage: false },
  { version: 9, status: DocumentTemplateVersionStatus.RETIRED, matchesPackage: false },
]));
assert(maxPlan.nextVersion === 10, "version calculation uses highest version across all statuses");
const blockedPlan = planApprovedPassTemplateFromState(gate.target, gate.pkg, state(gate.target, gate.pkg, [
  { version: 2, status: DocumentTemplateVersionStatus.PUBLISHED, matchesPackage: false },
  { version: 3, status: DocumentTemplateVersionStatus.DRAFT, matchesPackage: false },
]));
assert(blockedPlan.action === "BLOCKED" && blockedPlan.blockReason === "EXISTING PRODUCTION DRAFT REQUIRES REVIEW", "different existing Draft blocks installation");
const installedPlan = planApprovedPassTemplateFromState(gate.target, gate.pkg, state(gate.target, gate.pkg, [
  { version: 2, status: DocumentTemplateVersionStatus.PUBLISHED, matchesPackage: false },
  { version: 3, status: DocumentTemplateVersionStatus.DRAFT, matchesPackage: true },
]));
assert(installedPlan.action === "ALREADY_INSTALLED", "exact approved Draft is idempotent");
const publishedInstalledPlan = planApprovedPassTemplateFromState(gate.target, gate.pkg, state(gate.target, gate.pkg, [
  { version: 2, status: DocumentTemplateVersionStatus.PUBLISHED, matchesPackage: false },
  { version: 3, status: DocumentTemplateVersionStatus.PUBLISHED, matchesPackage: true },
]));
assert(publishedInstalledPlan.action === "ALREADY_INSTALLED", "exact approved published version is idempotent");
assertThrows(() => planApprovedPassTemplateFromState(gate.target, gate.pkg, state(gate.target, gate.pkg, [{ version: 5, status: DocumentTemplateVersionStatus.PUBLISHED, matchesPackage: false }])), "expected v2", "changed active published version blocks installation");

const safePlan = sanitizePlanForDisplay(createPlan);
const safeJson = JSON.stringify(safePlan);
assert(!safeJson.includes("definitionJson") && !safeJson.includes("sections") && !safeJson.includes("DATABASE_URL") && !safeJson.includes("mysql://"), "sanitized plan omits full JSON and credentials");

const serviceSource = fs.readFileSync(path.join(process.cwd(), "lib", "services", "approved-pass-template-installer.ts"), "utf8");
assert(serviceSource.includes("$transaction(async (tx)"), "apply uses one interactive Prisma transaction");
assert(serviceSource.indexOf("const blocked = plans.find") < serviceSource.indexOf("documentTemplateVersion.create"), "transaction validates both plans before creating Drafts");
assert(!/documentDefinition\.update/.test(serviceSource), "assigned published versions are not updated");
assert(!/status:\s*DocumentTemplateVersionStatus\.PUBLISHED/.test(serviceSource), "web installer never creates published template versions");
assert(!/publishedAt:\s*new Date|publishedById:\s*input\.actorUserId/.test(serviceSource), "web installer does not set publishedAt or publishedBy");

console.log("Approved pass template web installer verification passed.");

function state(target: TargetPassTemplate, pkg: ApprovedPassTemplatePackage, versions: Array<{ version: number; status: DocumentTemplateVersionStatus; matchesPackage: boolean }>): ApprovedPassDefinitionState {
  const templateSetId = `${target.key}-set`;
  const assignedVersion = versions.find((version) => version.version === target.expectedAssignedVersion && version.status === DocumentTemplateVersionStatus.PUBLISHED) ?? versions[0];
  return {
    id: target.definitionId,
    displayName: target.label,
    assignedTemplateVersionId: `${target.key}-v${assignedVersion.version}`,
    assignedTemplateVersion: versionState(target, pkg, templateSetId, assignedVersion),
    templateSets: [{
      id: templateSetId,
      definitionId: target.definitionId,
      editable: true,
      ownershipType: DocumentTemplateOwnership.TENANT,
      versions: versions.map((version) => versionState(target, pkg, templateSetId, version)),
    }],
  };
}

function versionState(target: TargetPassTemplate, pkg: ApprovedPassTemplatePackage, templateSetId: string, input: { version: number; status: DocumentTemplateVersionStatus; matchesPackage: boolean }) {
  return {
    id: `${target.key}-v${input.version}`,
    version: input.version,
    status: input.status,
    templateSetId,
    definitionJson: input.matchesPackage ? pkg.definition : { schemaVersion: 2, label: `${target.key}-legacy-${input.version}` },
  };
}
