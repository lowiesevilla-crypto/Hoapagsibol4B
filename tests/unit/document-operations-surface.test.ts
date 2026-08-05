import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const files = {
  operations: "app/admin/documents/operations/page.tsx",
  exportRoute: "app/admin/documents/export/route.ts",
  adminGuide: "app/admin/documents/guide/page.tsx",
  homeownerGuide: "app/portal/documents/guide/page.tsx",
};

async function source(path: string) {
  return readFile(path, "utf8");
}

test("documentation operations queries are authenticated, tenant-scoped, and bounded", async () => {
  const operations = await source(files.operations);
  assert.match(operations, /requireDocumentTemplateAdmin\(\)/);
  assert.ok((operations.match(/tenantId: user\.tenantId/g) ?? []).length >= 6);
  assert.match(operations, /take:\s*20/);
  assert.match(operations, /take:\s*2000/);
  assert.doesNotMatch(operations, /searchParams[\s\S]{0,200}tenantId/);
  assert.doesNotMatch(operations, /url\.searchParams\.get\(["']tenantId["']\)/);
});

test("document export is tenant-scoped, bounded, no-store, and excludes sensitive fields", async () => {
  const route = await source(files.exportRoute);
  assert.match(route, /requireDocumentTemplateAdmin\(\)/);
  assert.match(route, /tenantId:\s*user\.tenantId/);
  assert.match(route, /const maxExportRows = 10_000/);
  assert.match(route, /take:\s*maxExportRows/);
  assert.match(route, /Cache-Control["']:\s*["']private, no-store, max-age=0/);
  assert.match(route, /safeCsvCell/);
  assert.doesNotMatch(route, /searchParams\.get\(["']tenantId["']\)/);
  assert.doesNotMatch(route, /passwordHash|tokenHash|verificationTokens|generatedContent|templateSnapshot|proofImageUrl|storagePath/);
});

test("administrator and homeowner guides enforce their respective server guards", async () => {
  const [adminGuide, homeownerGuide] = await Promise.all([
    source(files.adminGuide),
    source(files.homeownerGuide),
  ]);
  assert.match(adminGuide, /requireDocumentTemplateAdmin\(\)/);
  assert.match(homeownerGuide, /requireUser\(Role\.HOMEOWNER\)/);
  assert.match(adminGuide, /Operations Command Center|Operations dashboard/);
  assert.match(homeownerGuide, /Document Request Guide/);
});

test("document workspaces link to the new operations and guidance surfaces", async () => {
  const [adminWorkspace, homeownerWorkspace] = await Promise.all([
    source("app/admin/documents/page.tsx"),
    source("app/portal/documents/page.tsx"),
  ]);
  assert.match(adminWorkspace, /\/admin\/documents\/operations/);
  assert.match(adminWorkspace, /\/admin\/documents\/guide/);
  assert.match(homeownerWorkspace, /\/portal\/documents\/guide/);
});
