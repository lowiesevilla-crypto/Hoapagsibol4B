import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const runtimePath = "lib/services/document-template-runtime.ts";

async function runtimeSource() {
  return readFile(runtimePath, "utf8");
}

test("generation prefers the definition's assigned published template before version fallback", async () => {
  const runtime = await runtimeSource();
  const effectiveStart = runtime.indexOf("export async function resolveEffectiveDocumentTemplate");
  const effectiveEnd = runtime.indexOf("export async function resolveDocumentTemplateForGeneration", effectiveStart);
  const effective = runtime.slice(effectiveStart, effectiveEnd);

  const capturedSnapshot = effective.indexOf("input.requestTemplateVersionId");
  const assignedLookup = effective.indexOf("definition.assignedTemplateVersionId");
  const fallbackLookup = effective.indexOf('orderBy: { version: "desc" }');

  assert.ok(capturedSnapshot >= 0, "captured request template snapshots must remain supported");
  assert.ok(assignedLookup > capturedSnapshot, "historical request snapshots must win over the current assignment");
  assert.ok(fallbackLookup > assignedLookup, "assigned published template must be checked before highest-version fallback");
  assert.match(effective, /id:\s*definition\.assignedTemplateVersionId/);
  assert.match(effective, /status:\s*DocumentTemplateVersionStatus\.PUBLISHED/);
  assert.match(effective, /templateSet:\s*\{\s*tenantId:\s*context\.tenantId,\s*definitionId:\s*input\.definitionId,\s*active:\s*true\s*\}/);
});

test("generation snapshots the resolved assignment only for requests without a captured version", async () => {
  const runtime = await runtimeSource();
  const effectiveStart = runtime.indexOf("export async function resolveEffectiveDocumentTemplate");
  const effectiveEnd = runtime.indexOf("export async function resolveDocumentTemplateForGeneration", effectiveStart);
  const effective = runtime.slice(effectiveStart, effectiveEnd);

  assert.match(effective, /templateVersionIdSnapshot:\s*null/);
  assert.match(effective, /templateVersionIdSnapshot:\s*active\.id/);
  assert.match(effective, /templateDefinitionSnapshot:\s*asJson\(active\.definitionJson\)/);
});
