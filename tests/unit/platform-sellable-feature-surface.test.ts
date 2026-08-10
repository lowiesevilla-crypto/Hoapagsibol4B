import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { AI_ASSISTANCE_FEATURE_CODE, mergeAiCommercialConfiguration } from "@/lib/ai-assistance/commercial";

async function source(path: string) { return readFile(path, "utf8"); }

test("AI Assistance is independently sellable from Document Management", () => {
  assert.equal(AI_ASSISTANCE_FEATURE_CODE, "AI_ASSISTANCE");
  const configuration = mergeAiCommercialConfiguration(
    { monthlyRequestLimit: 1000, requestsPerMinute: 10, modelTier: "STANDARD", overagePolicy: "HARD_STOP" },
    { monthlyRequestLimit: 200, modelTier: "PREMIUM" },
  );
  assert.equal(configuration.monthlyRequestLimit, 200);
  assert.equal(configuration.requestsPerMinute, 10);
  assert.equal(configuration.modelTier, "PREMIUM");
});

test("plan create/edit and tenant controls expose independent sellable capability gates", async () => {
  const [plans, edit, actions, tenantFeatures] = await Promise.all([
    source("app/platform/plans/page.tsx"),
    source("app/platform/plans/[id]/page.tsx"),
    source("lib/actions/platform-commercial-plans.ts"),
    source("app/platform/tenants/[id]/features/page.tsx"),
  ]);
  for (const value of [plans, edit, actions, tenantFeatures]) {
    assert.match(value, /AI_ASSISTANCE|aiAssistance|AI Assistance/);
    assert.match(value, /DOCUMENT_MANAGEMENT|documentManagement|Document Management/);
  }
  assert.match(actions, /subscriptionPlanFeatureEntitlement/);
  assert.match(actions, /featureCode: AI_ASSISTANCE_FEATURE_CODE/);
  assert.match(actions, /featureCode: DOCUMENT_MANAGEMENT_FEATURE_CODE/);
  assert.match(tenantFeatures, /Inherit plan/);
  assert.match(tenantFeatures, /Privacy gate/);
});

test("generic entitlement schema supports feature-specific configuration without new module enums", async () => {
  const schema = await source("prisma/document-management.prisma");
  assert.match(schema, /configuration\s+Json\?/);
  assert.match(schema, /configurationOverride\s+Json\?/);
  assert.doesNotMatch(schema, /enum\s+AI_ASSISTANCE/);
});

test("platform repository usage reporting is metadata-only and quota aware", async () => {
  const [service, page] = await Promise.all([
    source("lib/document-repository/platform-usage.ts"),
    source("app/platform/document-management/page.tsx"),
  ]);
  assert.match(service, /groupBy/);
  assert.match(service, /fileSizeBytes/);
  assert.match(service, /DOCUMENT_MANAGEMENT_FEATURE_CODE/);
  assert.doesNotMatch(service, /originalFileName|storageKey:\s*true|title:\s*true|description:\s*true/);
  assert.match(page, /does not expose document titles, file paths, content/);
  assert.match(page, /Tenant repository consumption/);
});
