import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("homeowner repository delivery and lifecycle stay explicitly tenant-scoped", async () => {
  const [delivery, lifecycle] = await Promise.all([
    readFile("lib/document-repository/delivery.ts", "utf8"),
    readFile("lib/document-repository/lifecycle.ts", "utf8"),
  ]);

  assert.match(delivery, /where:\s*\{\s*tenantId,\s*id\s*\}/);
  assert.match(delivery, /findActiveTenantDocument\(context\.tenantId, documentId\)/);
  assert.match(lifecycle, /document\.tenantId !== input\.activeTenantId/);
  assert.match(lifecycle, /document\.visibility !== "TENANT_PUBLIC"/);
  assert.match(lifecycle, /document\.status !== "PUBLISHED"/);
  assert.match(lifecycle, /BLOCKED|FAILED|PENDING/);
});
