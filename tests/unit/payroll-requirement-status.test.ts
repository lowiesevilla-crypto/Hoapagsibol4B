import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

type Status = "NOT_STARTED" | "IN_PROGRESS" | "BLOCKED" | "IMPLEMENTED" | "VERIFIED" | "DEFERRED";
type Requirement = { id: string; status: Status };
type Task = { id: string; requirementIds: string[]; status: Status };
type FunctionEntry = { path: string; name: string; requirementIds: string[]; status: Status };
type Registry = {
  allowedStatuses: Status[];
  requirements: Requirement[];
  tasks: Task[];
  functions: FunctionEntry[];
};

const registryPath = resolve(process.cwd(), "docs/payroll/PAYROLL_IMPLEMENTATION_STATUS.json");
const registry = JSON.parse(readFileSync(registryPath, "utf8")) as Registry;

/**
 * @requirement PAY-REQ-001
 * @status IMPLEMENTED
 */
function assertControlledStatus(status: Status, context: string) {
  assert.ok(registry.allowedStatuses.includes(status), `${context} has unsupported status ${status}`);
}

/**
 * @requirement PAY-REQ-001
 * @status IMPLEMENTED
 */
function assertRequirementReferences(requirementIds: string[], knownRequirementIds: Set<string>, context: string) {
  assert.ok(requirementIds.length > 0, `${context} must reference at least one requirement`);
  for (const requirementId of requirementIds) {
    assert.ok(knownRequirementIds.has(requirementId), `${context} references unknown requirement ${requirementId}`);
  }
}

test("PAY-REQ-001: registry uses only the controlled status vocabulary and stable requirement references", () => {
  assert.deepEqual(
    registry.allowedStatuses,
    ["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "IMPLEMENTED", "VERIFIED", "DEFERRED"],
  );

  const requirementIds = new Set(registry.requirements.map((requirement) => requirement.id));
  assert.equal(requirementIds.size, registry.requirements.length, "Requirement IDs must be unique");

  for (const requirement of registry.requirements) assertControlledStatus(requirement.status, requirement.id);
  for (const task of registry.tasks) {
    assertControlledStatus(task.status, task.id);
    assertRequirementReferences(task.requirementIds, requirementIds, task.id);
  }
  for (const fn of registry.functions) {
    assertControlledStatus(fn.status, `${fn.path}#${fn.name}`);
    assertRequirementReferences(fn.requirementIds, requirementIds, `${fn.path}#${fn.name}`);
  }
});

test("PAY-REQ-001: every registered payroll function carries nearby requirement and status tags in source", () => {
  const sourceCache = new Map<string, string>();

  for (const fn of registry.functions) {
    const source = sourceCache.get(fn.path) ?? readFileSync(resolve(process.cwd(), fn.path), "utf8");
    sourceCache.set(fn.path, source);
    const functionIndex = source.indexOf(`function ${fn.name}`);
    assert.notEqual(functionIndex, -1, `${fn.path}#${fn.name} is registered but not present in source`);
    const nearbyContract = source.slice(Math.max(0, functionIndex - 700), functionIndex);
    assert.match(nearbyContract, /@requirement\s+PAY-/, `${fn.path}#${fn.name} is missing @requirement`);
    assert.match(nearbyContract, /@status\s+(NOT_STARTED|IN_PROGRESS|BLOCKED|IMPLEMENTED|VERIFIED|DEFERRED)/, `${fn.path}#${fn.name} is missing @status`);
  }
});
