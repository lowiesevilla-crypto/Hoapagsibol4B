import assert from "node:assert/strict";
import test from "node:test";
import { canHomeownerAccessRepositoryDocument } from "../../lib/document-repository/lifecycle";
import { evaluateRepositoryQuota } from "../../lib/document-repository/quota";
import { repositoryStorageInternals } from "../../lib/document-repository/storage";
import { validateRepositoryUpload } from "../../lib/document-repository/validation";

const tenantA = "tenant-a";
const tenantB = "tenant-b";

test("repository quota blocks writes that exceed a tenant plan limit", () => {
  const healthy = evaluateRepositoryQuota({ usedBytes: 700 * 1024 * 1024, maximumStorageMb: 1024, requestedBytes: 20 * 1024 * 1024 });
  assert.equal(healthy.canWrite, true);
  assert.equal(healthy.state, "HEALTHY");

  const warning = evaluateRepositoryQuota({ usedBytes: 850 * 1024 * 1024, maximumStorageMb: 1024, requestedBytes: 10 * 1024 * 1024 });
  assert.equal(warning.canWrite, true);
  assert.equal(warning.state, "WARNING");

  const blocked = evaluateRepositoryQuota({ usedBytes: 1000 * 1024 * 1024, maximumStorageMb: 1024, requestedBytes: 30 * 1024 * 1024 });
  assert.equal(blocked.canWrite, false);
  assert.equal(blocked.projectedBytes > (blocked.limitBytes ?? BigInt(0)), true);
});

test("repository quota does not infer deletion when a tenant is already over quota", () => {
  const result = evaluateRepositoryQuota({ usedBytes: 2 * 1024 * 1024 * 1024, maximumStorageMb: 1024, requestedBytes: 0 });
  assert.equal(result.state, "OVER_LIMIT");
  assert.equal(result.canWrite, false);
  assert.equal(result.usedBytes, BigInt(2 * 1024 * 1024 * 1024));
});

test("homeowner document access is same-tenant, published, tenant-public and effective", () => {
  const valid = {
    tenantId: tenantA,
    visibility: "TENANT_PUBLIC" as const,
    status: "PUBLISHED" as const,
    effectiveAt: new Date("2026-01-01T00:00:00.000Z"),
    expiresAt: new Date("2027-01-01T00:00:00.000Z"),
    malwareStatus: "PASSED" as const,
  };
  const now = new Date("2026-08-09T00:00:00.000Z");

  assert.equal(canHomeownerAccessRepositoryDocument({ document: valid, activeTenantId: tenantA, now }), true);
  assert.equal(canHomeownerAccessRepositoryDocument({ document: valid, activeTenantId: tenantB, now }), false);
  assert.equal(canHomeownerAccessRepositoryDocument({ document: { ...valid, visibility: "INTERNAL" }, activeTenantId: tenantA, now }), false);
  assert.equal(canHomeownerAccessRepositoryDocument({ document: { ...valid, status: "DRAFT" }, activeTenantId: tenantA, now }), false);
  assert.equal(canHomeownerAccessRepositoryDocument({ document: { ...valid, status: "ARCHIVED" }, activeTenantId: tenantA, now }), false);
  assert.equal(canHomeownerAccessRepositoryDocument({ document: { ...valid, effectiveAt: new Date("2026-09-01T00:00:00.000Z") }, activeTenantId: tenantA, now }), false);
  assert.equal(canHomeownerAccessRepositoryDocument({ document: { ...valid, expiresAt: new Date("2026-08-01T00:00:00.000Z") }, activeTenantId: tenantA, now }), false);
  assert.equal(canHomeownerAccessRepositoryDocument({ document: { ...valid, malwareStatus: "BLOCKED" }, activeTenantId: tenantA, now }), false);
});

test("repository upload validation returns a checksum for a valid PDF", () => {
  const data = new TextEncoder().encode("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF");
  const result = validateRepositoryUpload({
    originalFileName: "Board Resolution 2026-014.pdf",
    contentType: "application/pdf",
    size: data.byteLength,
    data,
  });

  assert.equal(result.extension, ".pdf");
  assert.match(result.checksumSha256 ?? "", /^[a-f0-9]{64}$/);
});

test("repository upload validation rejects dangerous types, MIME mismatch, bad signature and oversize files", () => {
  assert.throws(() => validateRepositoryUpload({ originalFileName: "payload.exe", contentType: "application/octet-stream", size: 10 }), /not allowed/i);
  assert.throws(() => validateRepositoryUpload({ originalFileName: "policy.pdf", contentType: "image/png", size: 10 }), /does not match/i);

  const fakePdf = new TextEncoder().encode("not a pdf");
  assert.throws(() => validateRepositoryUpload({ originalFileName: "policy.pdf", contentType: "application/pdf", size: fakePdf.byteLength, data: fakePdf }), /valid PDF signature/i);

  assert.throws(() => validateRepositoryUpload({ originalFileName: "policy.pdf", contentType: "application/pdf", size: 101, maxFileBytes: 100 }), /exceeds/i);
});

test("repository storage keys are randomized, tenant-prefixed and reject cross-tenant or traversal access", () => {
  const key = repositoryStorageInternals.storageKeyForUpload(tenantA, "Policy.pdf", new Date("2026-08-09T00:00:00.000Z"));
  assert.match(key, /^tenants\/tenant-a\/documents\/repository\/2026\/08\/[a-f0-9-]+\.pdf$/);
  assert.equal(repositoryStorageInternals.assertTenantStorageKey(tenantA, key), key);
  assert.throws(() => repositoryStorageInternals.assertTenantStorageKey(tenantB, key), /Cross-tenant/i);
  assert.throws(() => repositoryStorageInternals.assertTenantStorageKey(tenantA, "tenants/tenant-a/documents/repository/../../secrets.txt"), /Invalid repository storage key/i);
});
