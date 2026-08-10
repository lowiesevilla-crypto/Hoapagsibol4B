import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) { return readFile(path, "utf8"); }

test("homeowner library query is tenant-public, published, effective and malware-safe", async () => {
  const queries = await source("lib/document-repository/queries.ts");
  assert.match(queries, /Permission\.DOCUMENT_REPOSITORY_READ_PUBLIC/);
  assert.match(queries, /tenantId: input\.tenantId/);
  assert.match(queries, /status: "PUBLISHED"/);
  assert.match(queries, /visibility: "TENANT_PUBLIC"/);
  assert.match(queries, /notIn: \["PENDING", "FAILED", "BLOCKED"\]/);
  assert.match(queries, /effectiveAt: \{ lte: input\.now \}/);
  assert.match(queries, /expiresAt: \{ gt: input\.now \}/);
});

test("homeowner library delivery does not accept tenant authority from the browser", async () => {
  const [route, delivery] = await Promise.all([
    source("app/api/portal/document-library/[documentId]/download/route.ts"),
    source("lib/document-repository/delivery.ts"),
  ]);
  assert.match(route, /openRepositoryDocumentForHomeowner/);
  assert.match(route, /private, no-store/);
  assert.match(route, /X-Content-Type-Options/);
  assert.doesNotMatch(route, /tenantId\s*=/);
  assert.match(delivery, /assertHomeownerRepositoryDocumentAccess/);
  assert.match(delivery, /findActiveTenantDocument\(context\.tenantId, documentId\)/);
});

test("homeowner portal navigation is entitlement-aware and mobile discoverable", async () => {
  const [layout, more, page] = await Promise.all([
    source("app/portal/layout.tsx"),
    source("app/portal/more/page.tsx"),
    source("app/portal/document-library/page.tsx"),
  ]);
  assert.match(layout, /resolveDocumentManagementEntitlement/);
  assert.match(layout, /pathname\.startsWith\("\/portal\/document-library"\)/);
  assert.match(layout, /Document Library/);
  assert.match(more, /href: "\/portal\/document-library"/);
  assert.match(page, /Official documents your association has published for homeowners/);
  assert.match(page, /listRepositoryDocumentsForHomeowner/);
});
