import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(path, "utf8");
}

test("governed replacement is tenant-scoped, permissioned, quota-aware and revisioned", async () => {
  const replace = await source("lib/document-repository/replace.ts");
  assert.match(replace, /Permission\.DOCUMENT_REPOSITORY_REPLACE/);
  assert.match(replace, /where: \{ tenantId: context\.tenantId, id: documentId \}/);
  assert.match(replace, /document\.category\.governanceControlled \|\| document\.revisionPolicy === "KEEP_HISTORY"/);
  assert.match(replace, /A revision reason is required for governed documents/);
  assert.match(replace, /validation\.checksumSha256 === document\.checksumSha256/);
  assert.match(replace, /assertRepositoryQuota/);
  assert.match(replace, /repositoryDocumentRevision\.create/);
  assert.match(replace, /storageKey: retainOldBinary \? document\.storageKey : null/);
  assert.match(replace, /currentRevision: nextRevision/);
  assert.match(replace, /RepositoryAuditAction\.REVISION_CREATED/);
  assert.match(replace, /RepositoryAuditAction\.REPLACED/);
  assert.match(replace, /RepositoryAuditAction\.REVISION_BINARY_PURGED/);
  assert.match(replace, /repositoryStorage\.delete/);
  assert.match(replace, /Keep the database pointer intact so cleanup remains retryable/);
});

test("category management cannot cross tenants or delete protected/in-use taxonomy", async () => {
  const categories = await source("lib/document-repository/category-management.ts");
  assert.match(categories, /Permission\.DOCUMENT_REPOSITORY_MANAGE_CATEGORIES/);
  assert.match(categories, /where: \{ tenantId: context\.tenantId/);
  assert.match(categories, /A category with this code already exists in the active tenant/);
  assert.match(categories, /existing\.systemDefault\s*\?\s*existing\.governanceControlled/);
  assert.match(categories, /System default categories cannot be permanently deleted/);
  assert.match(categories, /category\._count\.documents > 0/);
  assert.match(categories, /Reclassify those documents or deactivate the category instead/);
  assert.match(categories, /RepositoryAuditAction\.CATEGORY_CREATED/);
  assert.match(categories, /RepositoryAuditAction\.CATEGORY_UPDATED/);
  assert.match(categories, /RepositoryAuditAction\.CATEGORY_DELETED/);
});

test("professional phase 2 UI exposes revision workflow and protected taxonomy controls", async () => {
  const [detail, categoryPage, replaceRoute] = await Promise.all([
    source("app/admin/document-management/[documentId]/page.tsx"),
    source("app/admin/document-management/categories/page.tsx"),
    source("app/api/admin/document-management/documents/[documentId]/replace/route.ts"),
  ]);
  assert.match(detail, /Replace file \/ new revision/);
  assert.match(detail, /Revision ledger/);
  assert.match(detail, /Historical binary retention follows the tenant’s subscribed Document Management plan/);
  assert.match(detail, /metadata only/i);
  assert.match(detail, /DOCUMENT_REPOSITORY_REPLACE/);
  assert.match(categoryPage, /Document categories/);
  assert.match(categoryPage, /System defaults are protected/);
  assert.match(categoryPage, /Governed revisions/);
  assert.match(categoryPage, /Type DELETE to confirm/);
  assert.match(replaceRoute, /replaceRepositoryDocument/);
  assert.doesNotMatch(replaceRoute, /tenantId\s*=/);
});

test("category navigation is permission-gated and hidden with a disabled repository entitlement", async () => {
  const [roleAccess, sidebar, adminLayout] = await Promise.all([
    source("lib/role-access.ts"),
    source("components/sidebar-links.ts"),
    source("app/admin/layout.tsx"),
  ]);
  assert.match(roleAccess, /"\/admin\/document-management\/categories", Permission\.DOCUMENT_REPOSITORY_MANAGE_CATEGORIES/);
  assert.match(sidebar, /href: "\/admin\/document-management\/categories", label: "Document Categories"/);
  assert.match(adminLayout, /!item\.href\.startsWith\("\/admin\/document-management"\)/);
});
