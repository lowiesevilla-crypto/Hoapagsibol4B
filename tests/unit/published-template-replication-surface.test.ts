import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { DocumentType, Role } from "@prisma/client";

import {
  canRunPublishedTemplateReplication,
  publishedTemplateReplicationRequests,
  publishedTemplateReplicationSourceTenantId,
  publishedTemplateReplicationTargetTenantId,
} from "@/lib/services/published-template-replication";

const targetTenantId = "cmrpruwma00063lnps4g7c335";

async function source(path: string) {
  return readFile(path, "utf8");
}

test("published template replication is fixed to the approved tenants and source versions", () => {
  assert.equal(publishedTemplateReplicationSourceTenantId, "tenant_pagsibol4b_default");
  assert.equal(publishedTemplateReplicationTargetTenantId, targetTenantId);
  assert.deepEqual(
    publishedTemplateReplicationRequests.map(({ type, sourceVersion }) => ({
      type,
      sourceVersion,
    })),
    [
      { type: DocumentType.GATE_PASS, sourceVersion: 2 },
      { type: DocumentType.MOVE_IN_OUT_PASS, sourceVersion: 1 },
      { type: DocumentType.CERTIFICATE_OF_RESIDENCY, sourceVersion: 2 },
    ],
  );
});

test("only target-tenant system or super admins can access the replication surface", () => {
  assert.equal(
    canRunPublishedTemplateReplication({
      tenantId: targetTenantId,
      role: Role.SYSTEM_ADMIN,
    }),
    true,
  );
  assert.equal(
    canRunPublishedTemplateReplication({
      tenantId: targetTenantId,
      role: Role.HOMEOWNER,
      roles: [Role.HOMEOWNER, Role.SUPER_ADMIN],
    }),
    true,
  );
  assert.equal(
    canRunPublishedTemplateReplication({
      tenantId: targetTenantId,
      role: Role.HOA_ADMIN,
    }),
    false,
  );
  assert.equal(
    canRunPublishedTemplateReplication({
      tenantId: "tenant_pagsibol4b_default",
      role: Role.SYSTEM_ADMIN,
    }),
    false,
  );
});

test("admin replication page and action keep tenant IDs server-controlled", async () => {
  const [page, action, service] = await Promise.all([
    source("app/admin/documents/operations/template-replication/page.tsx"),
    source("lib/actions/published-template-replication.ts"),
    source("lib/services/published-template-replication.ts"),
  ]);

  assert.match(page, /requireDocumentTemplateAdmin\(\)/);
  assert.match(page, /canRunPublishedTemplateReplication\(user\)/);
  assert.match(page, /previewPublishedTemplateReplication\(platformPrisma, user\.id\)/);
  assert.doesNotMatch(page, /searchParams[\s\S]{0,200}tenantId/);
  assert.doesNotMatch(action, /formData\.get\(["'](?:source|target)?tenantId["']\)/i);
  assert.match(action, /formData\.get\(["']planDigest["']\)/);
  assert.match(action, /formData\.get\(["']acknowledge["']\)/);
  assert.match(service, /publishedTemplateReplicationTargetTenantId/);
  assert.match(service, /userRoleAssignments/);
});

test("source versions may resolve across source-owned template sets and blank targets bootstrap safely", async () => {
  const [service, page] = await Promise.all([
    source("lib/services/published-template-replication.ts"),
    source("app/admin/documents/operations/template-replication/page.tsx"),
  ]);

  assert.match(service, /sourceTemplateSetIds/);
  assert.match(service, /templateSetId: \{ in: sourceTemplateSetIds \}/);
  assert.doesNotMatch(service, /source definition has no assigned template set to anchor version lookup/);
  assert.match(service, /BOOTSTRAP_TARGET_SET_AND_ASSIGN/);
  assert.match(service, /documentTemplateSet\.create/);
  assert.match(service, /targetTemplateSetWillBeCreated/);
  assert.match(service, /has template version history but no assigned published template/);
  assert.match(page, /No published template assigned/);
  assert.match(page, /Create tenant template set, publish, and assign/);
});

test("apply is digest-guarded, transactional, audited, and post-verified", async () => {
  const service = await source("lib/services/published-template-replication.ts");

  assert.match(service, /confirmDigest !== preview\.planDigest/);
  assert.match(service, /client\.\$transaction/);
  assert.match(service, /transactionDigest !== confirmDigest/);
  assert.match(service, /assignedTemplateVersionId: plan\.targetAssignedTemplateVersionId/);
  assert.match(service, /REPLICATE_PUBLISHED_DOCUMENT_TEMPLATE/);
  assert.match(service, /Post-apply verification failed/);
  assert.match(service, /status: "COMPLETED_AND_VERIFIED"/);
  assert.match(service, /hardcoded source-tenant identifier/);
  assert.match(service, /matchingDraft/);
});

test("legacy production script delegates to the same replication service and retains production guards", async () => {
  const script = await source("scripts/replicate-published-document-templates.ts");

  assert.match(script, /previewPublishedTemplateReplication/);
  assert.match(script, /applyPublishedTemplateReplication/);
  assert.match(script, /CONFIRM_HOSTINGER_TEMPLATE_REPLICATION/);
  assert.match(script, /EXPECTED_DATABASE_HOST/);
  assert.match(script, /EXPECTED_DATABASE_NAME/);
  assert.match(script, /--confirm-digest=/);
});

test("document operations links the replication surface only through the role-and-tenant guard", async () => {
  const operations = await source("app/admin/documents/operations/page.tsx");
  assert.match(operations, /canRunPublishedTemplateReplication\(user\)/);
  assert.match(operations, /canReplicatePublishedTemplates &&/);
  assert.match(operations, /\/admin\/documents\/operations\/template-replication/);
});
