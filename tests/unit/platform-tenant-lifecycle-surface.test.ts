import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

async function source(path: string) {
  return readFile(path, "utf8");
}

test("Platform Admin tenant lifecycle separates deactivation from permanent deletion", async () => {
  const [service, actions, page, tabs] = await Promise.all([
    source("lib/services/platform-tenant-lifecycle.ts"),
    source("lib/actions/platform-tenant-lifecycle.ts"),
    source("app/platform/tenants/[id]/lifecycle/page.tsx"),
    source("components/platform-tenant-tabs.tsx"),
  ]);

  assert.match(service, /status: TenantStatus\.INACTIVE/);
  assert.match(service, /userSession\.updateMany/);
  assert.match(service, /dataRetention: "RETAIN_ALL"/);
  assert.match(service, /subscriptionStatusRetained: true/);
  assert.match(service, /tenantSuspensionRecord\.findFirst/);
  assert.match(service, /TenantStatus\.SUSPENDED/);
  assert.match(service, /commercialSuspensionRetained/);
  assert.match(service, /Deactivate the tenant before permanent deletion/);
  assert.match(service, /confirmationWord\.trim\(\)\.toUpperCase\(\) !== "DELETE"/);
  assert.match(service, /Prisma\.dmmf\.datamodel\.models/);
  assert.match(service, /field\.name === "tenantId"/);
  assert.match(service, /TENANT_HARD_DELETED/);
  assert.match(actions, /deleteTenantLifecycleAction/);
  assert.match(page, /Permanently delete tenant and all tenant data/);
  assert.match(page, /active commercial suspension remains enforced/);
  assert.match(page, /Deactivate the tenant first/);
  assert.match(tabs, /\/lifecycle/);
});

test("manual tenant payment recording uses an internal unique reference and keeps external reference as metadata", async () => {
  const [service, actions, availability, billingPage] = await Promise.all([
    source("lib/services/platform-manual-payment.ts"),
    source("lib/actions/platform-billing.ts"),
    source("components/platform-manual-payment-availability-panel.tsx"),
    source("app/platform/tenants/[id]/billing/page.tsx"),
  ]);

  assert.match(service, /paymentReference: internalPaymentReference\(paidAt\)/);
  assert.match(service, /externalReference/);
  assert.match(service, /platformInvoice\.updateMany/);
  assert.match(service, /claimedInvoice\.count !== 1/);
  assert.match(actions, /recordPlatformManualPaymentSafe/);
  assert.match(availability, /Manual payment recording needs an open invoice/);
  assert.match(availability, /Generate bill so payment can be recorded/);
  assert.match(billingPage, /Record external\/manual payment/);
});
