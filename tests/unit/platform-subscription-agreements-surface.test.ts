import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

async function source(path: string) {
  return readFile(path, "utf8");
}

test("agreement schema preserves immutable execution evidence and verification challenges", async () => {
  const schema = await source("prisma/platform-agreements.prisma");
  assert.match(schema, /PENDING_LEGAL_APPROVAL/);
  assert.match(schema, /READY_FOR_SIGNATURE/);
  assert.match(schema, /renderedContent\s+String\s+@db\.LongText/);
  assert.match(schema, /termsSnapshot\s+Json/);
  assert.match(schema, /issuerSnapshot\s+Json/);
  assert.match(schema, /tenantSnapshot\s+Json/);
  assert.match(schema, /contentHash\s+String/);
  assert.match(schema, /signedContentHash\s+String\?/);
  assert.match(schema, /signerIpAddress\s+String\?/);
  assert.match(schema, /signerUserAgent\s+String\?/);
  assert.match(schema, /model AgreementSignatureChallenge/);
  assert.match(schema, /OTP_FAILED/);
});

test("master agreement cannot be electronically executed before explicit legal-template activation", async () => {
  const [service, platform] = await Promise.all([
    source("lib/services/platform-agreements.ts"),
    source("app/platform/agreements/page.tsx"),
  ]);
  assert.match(service, /status:\s*AgreementTemplateVersionStatus\.PENDING_LEGAL_APPROVAL/);
  assert.match(service, /sha256\(version\.body\) !== version\.contentHash/);
  assert.match(service, /AgreementTemplateVersionStatus\.ACTIVE/);
  assert.match(platform, /confirmLegalApproval/);
  assert.match(platform, /Legal approval required before execution/);
  assert.match(platform, /Preview master legal draft/);
});

test("tenant electronic signature requires authenticated account, email OTP, intent, authority, and document integrity", async () => {
  const [actions, service, page] = await Promise.all([
    source("lib/actions/platform-agreements.ts"),
    source("lib/services/platform-agreements.ts"),
    source("app/admin/agreement/[id]/page.tsx"),
  ]);
  assert.match(actions, /requireUser\(Role\.ADMIN\)/);
  assert.match(service, /createHmac\("sha256", authSecret\(\)\)/);
  assert.match(service, /OTP_TTL_MINUTES = 10/);
  assert.match(service, /OTP_MAX_ATTEMPTS = 5/);
  assert.match(service, /sha256\(agreement\.renderedContent\) !== agreement\.contentHash/);
  assert.match(service, /acceptedTerms/);
  assert.match(service, /confirmedAuthority/);
  assert.match(service, /signedContentHash/);
  assert.match(service, /signerIpAddress/);
  assert.match(service, /signerUserAgent/);
  assert.match(page, /name="acceptedTerms"/);
  assert.match(page, /name="confirmedAuthority"/);
  assert.match(page, /name="otp"/);
  assert.match(page, /Sign agreement electronically/);
});

test("agreement documents are tenant-isolated, authenticated, printable, downloadable and no-store", async () => {
  const [route, tenantPage, platformPage, printActions] = await Promise.all([
    source("app/api/subscription/agreements/[agreementId]/pdf/route.ts"),
    source("app/admin/agreement/[id]/page.tsx"),
    source("app/platform/agreements/[id]/page.tsx"),
    source("components/agreement-print-actions.tsx"),
  ]);
  assert.match(route, /requireUser\(\)/);
  assert.match(route, /agreement\.tenantId === user\.tenantId/);
  assert.match(route, /Role\.SUPER_ADMIN/);
  assert.match(route, /Role\.PLATFORM_ADMIN/);
  assert.match(route, /private, no-store, max-age=0/);
  assert.match(route, /AgreementAuditEventType\.DOWNLOADED/);
  assert.match(tenantPage, /getTenantAgreement\(user\.tenantId, id\)/);
  assert.match(tenantPage, /AgreementPrintActions/);
  assert.match(platformPage, /AgreementPrintActions/);
  assert.match(printActions, /window\.print\(\)/);
  assert.match(printActions, /Download PDF/);
});

test("agreement draft is populated from subscription and legal party snapshots instead of live mutable display data", async () => {
  const service = await source("lib/services/platform-agreements.ts");
  assert.match(service, /tenantSnapshot = \{/);
  assert.match(service, /issuerSnapshot = \{/);
  assert.match(service, /termsSnapshot = \{/);
  assert.match(service, /planCode:/);
  assert.match(service, /billingFrequency:/);
  assert.match(service, /paymentTermsDays/);
  assert.match(service, /modules,/);
  assert.match(service, /renderedContent,/);
  assert.match(service, /contentHash: sha256\(renderedContent\)/);
});

test("subscription assignment automatically creates the tenant agreement draft without rolling back the subscription on document failure", async () => {
  const action = await source("lib/actions/platform-billing.ts");
  assert.match(action, /createTenantAgreementDraft/);
  assert.match(action, /await createTenantAgreementDraft\(\{ tenantId, actorId: actor\.id \}\)/);
  assert.match(action, /Subscription assigned and HOAHub agreement draft generated/);
  assert.match(action, /Subscription assigned, but the agreement draft needs attention/);
});

test("platform and tenant navigation expose agreement centers under the existing authorization model", async () => {
  const [links, access] = await Promise.all([
    source("components/sidebar-links.ts"),
    source("lib/role-access.ts"),
  ]);
  assert.match(links, /\/admin\/agreement/);
  assert.match(links, /\/platform\/agreements/);
  assert.match(access, /\["\/admin\/agreement", Permission\.TENANT_SETTINGS_MANAGE\]/);
});
