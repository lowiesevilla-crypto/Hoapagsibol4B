import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const script = readFileSync("scripts/authenticated-production-smoke.mjs", "utf8");
const workflow = readFileSync(".github/workflows/authenticated-production-uat.yml", "utf8");

const requiredRoutes = [
  "/admin/dashboard",
  "/admin/homeowners",
  "/admin/billing",
  "/admin/payments/history",
  "/admin/payments/online",
  "/admin/employees",
  "/admin/documents",
  "/admin/complaints",
  "/admin/reports",
];

test("authenticated production smoke covers the required read-only surfaces", () => {
  for (const route of requiredRoutes) assert.ok(script.includes(route), `Expected smoke coverage for ${route}`);
  assert.ok(script.includes("fresh login after logout"));
  assert.ok(script.includes("homeowner profile open"));
  assert.ok(script.includes("employee profile open"));
});

test("authenticated production smoke fails closed on business-data mutations", () => {
  assert.ok(script.includes('const safe = ["GET", "HEAD", "OPTIONS"].includes(method)'));
  assert.ok(script.includes('url.pathname === "/login" || url.pathname === "/api/auth/logout"'));
  assert.ok(script.includes('request.abort("blockedbyclient")'));
  assert.ok(script.includes("assert.deepEqual(blockedMutations, [],"));
});

test("production UAT workflow requires controlled production credentials and homeowner selector", () => {
  for (const variable of [
    "HOSTINGER_APP_URL",
    "HOAHUB_UAT_ADMIN_EMAIL",
    "HOAHUB_UAT_ADMIN_PASSWORD",
    "HOAHUB_UAT_HOMEOWNER_QUERY",
  ]) assert.ok(workflow.includes(variable), `Expected workflow configuration ${variable}`);
  assert.ok(workflow.includes("environment: production"));
  assert.ok(workflow.includes("scripts/authenticated-production-smoke.mjs"));
});
