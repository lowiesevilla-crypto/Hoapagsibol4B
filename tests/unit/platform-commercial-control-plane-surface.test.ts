import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

async function source(path: string) {
  return readFile(path, "utf8");
}

test("platform commercial ledger is separate from homeowner billing", async () => {
  const schema = await source("prisma/schema.prisma");
  for (const model of ["SubscriptionPlan", "TenantSubscription", "TenantBillingProfile", "PlatformInvoice", "PlatformPayment", "PlatformPaymentAllocation", "PlatformGatewayEvent", "TenantSuspensionRecord"]) {
    assert.match(schema, new RegExp(`model ${model} \\{`));
  }
  assert.match(schema, /subscription\s+TenantSubscription\s+@relation\(fields: \[tenantId, subscriptionId\]/);
  assert.match(schema, /payment\s+PlatformPayment\s+@relation\(fields: \[tenantId, paymentId\]/);
  assert.match(schema, /invoice\s+PlatformInvoice\s+@relation\(fields: \[tenantId, invoiceId\]/);
});

test("tenant portfolio and billing pages expose premium commercial controls", async () => {
  const [tenants, billing, plans, subscriptions, tabs] = await Promise.all([
    source("app/platform/tenants/page.tsx"),
    source("app/platform/tenants/[id]/billing/page.tsx"),
    source("app/platform/plans/page.tsx"),
    source("app/platform/subscriptions/page.tsx"),
    source("components/platform-tenant-tabs.tsx"),
  ]);
  assert.match(tenants, /Outstanding AR/);
  assert.match(tenants, /Next billing/);
  assert.match(tenants, /\/billing/);
  assert.match(billing, /Generate bill/);
  assert.match(billing, /Record external\/manual payment/);
  assert.match(billing, /Suspend tenant/);
  assert.match(billing, /Reinstate tenant/);
  assert.match(plans, /Subscription plan catalog/);
  assert.match(plans, /createSubscriptionPlanAction/);
  assert.match(subscriptions, /Tenant subscriptions/);
  assert.match(subscriptions, /Outstanding AR/);
  assert.match(tabs, /Subscription & Billing/);
});

test("PayMongo checkout uses V2 hosted checkout and webhook source of truth", async () => {
  const [gateway, webhook, middleware, paymentPage, env] = await Promise.all([
    source("lib/services/platform-paymongo.ts"),
    source("app/api/platform/billing/webhooks/paymongo/route.ts"),
    source("middleware.ts"),
    source("app/subscription/pay/[invoiceId]/page.tsx"),
    source(".env.example"),
  ]);
  assert.match(gateway, /https:\/\/api\.paymongo\.com\/v2\/checkout_sessions/);
  assert.match(gateway, /Idempotency-Key/);
  assert.match(gateway, /checkout_session\.payment\.paid/);
  assert.match(gateway, /PayMongo amount does not match/);
  assert.match(gateway, /createHmac\("sha256"/);
  assert.match(gateway, /timingSafeEqual/);
  assert.match(webhook, /request\.text\(\)/);
  assert.match(webhook, /paymongo-signature/);
  assert.match(middleware, /\/api\/platform\/billing\/webhooks\/paymongo/);
  assert.match(paymentPage, /Pay .* online/);
  assert.match(paymentPage, /verified gateway webhook/);
  assert.match(env, /PAYMONGO_SECRET_KEY/);
  assert.match(env, /PAYMONGO_WEBHOOK_SECRET/);
});

test("commercial suspension revokes sessions and supports eligible automatic reinstatement", async () => {
  const service = await source("lib/services/platform-billing.ts");
  assert.match(service, /TENANT_SUSPENDED/);
  assert.match(service, /userSession\.updateMany/);
  assert.match(service, /TenantSuspensionReason\.NON_PAYMENT/);
  assert.match(service, /autoReinstate: true/);
  assert.match(service, /TENANT_REINSTATED/);
});

test("public platform payment page uses defined HOAHub brand contrast", async () => {
  const paymentPage = await source("app/subscription/pay/[invoiceId]/page.tsx");
  assert.match(paymentPage, /from-pine-900 to-pine-600/);
  assert.match(paymentPage, /text-pine-900/);
  assert.doesNotMatch(paymentPage, /pine-950/);
  assert.match(paymentPage, /text-white sm:text-3xl/);
});

test("tenant administrators have a tenant-scoped HOAHub subscription center", async () => {
  const [page, links, access, db] = await Promise.all([
    source("app/admin/subscription/page.tsx"),
    source("components/sidebar-links.ts"),
    source("lib/role-access.ts"),
    source("lib/db.ts"),
  ]);
  assert.match(page, /HOAHub Subscription/);
  assert.match(page, /platformInvoice\.findMany/);
  assert.match(page, /platformPayment\.findMany/);
  assert.match(page, /platformInvoicePaymentUrl/);
  assert.match(page, /separate from homeowner dues/);
  assert.match(links, /\/admin\/subscription/);
  assert.match(access, /\["\/admin\/subscription", Permission\.TENANT_SETTINGS_MANAGE\]/);
  assert.match(db, /scoped\.where = scopeWhere\(scoped\.where, context\.tenantId\)/);
});

test("platform invoices email a signed view-and-pay link with HOAHub SMTP", async () => {
  const [mailer, actions, cron] = await Promise.all([
    source("lib/services/platform-invoice-email.ts"),
    source("lib/actions/platform-billing.ts"),
    source("app/api/cron/daily/route.ts"),
  ]);
  assert.match(mailer, /getMailConfiguration\(BOOTSTRAP_TENANT_ID\)/);
  assert.match(mailer, /platformInvoicePaymentUrl\(invoice\.id\)/);
  assert.match(mailer, /View &amp; Pay Invoice/);
  assert.match(mailer, /PLATFORM_INVOICE_EMAIL_/);
  assert.match(mailer, /billingProfile\?\.billingEmail/);
  assert.match(mailer, /secondaryBillingEmail/);
  assert.match(actions, /sendPlatformInvoiceEmail/);
  assert.match(actions, /Invoice is ready, but email was not sent/);
  assert.match(cron, /platformBilling\.invoiceIds/);
  assert.match(cron, /sendPlatformInvoiceEmail/);
});

test("professional platform invoice documents are printable, downloadable, and preserve issued notes", async () => {
  const [service, documentPage, pdfRoute, tenantPage, platformPage, links, billingService, env] = await Promise.all([
    source("lib/services/platform-invoice-document.ts"),
    source("app/subscription/invoice/[invoiceId]/page.tsx"),
    source("app/api/platform/billing/invoices/[invoiceId]/pdf/route.ts"),
    source("app/admin/subscription/page.tsx"),
    source("app/platform/invoices/page.tsx"),
    source("components/sidebar-links.ts"),
    source("lib/services/platform-billing.ts"),
    source(".env.example"),
  ]);
  assert.match(service, /hoahub-platform-invoice-document-v1/);
  assert.match(service, /renderPlatformInvoicePdf/);
  assert.match(service, /PDFDocument\.create/);
  assert.match(service, /function tinLine/);
  assert.match(service, /VAT status:/);
  assert.match(documentPage, /Print invoice/);
  assert.match(documentPage, /Download PDF/);
  assert.match(documentPage, /Invoice note/);
  assert.match(documentPage, /invoice\.notes/);
  assert.match(documentPage, /@page \{ size: A4; margin: 8mm; \}/);
  assert.match(documentPage, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(documentPage, /grid-template-columns: minmax\(0, 1fr\) 64mm/);
  assert.match(documentPage, /page-break-inside: avoid/);
  assert.match(documentPage, /vatStatusLine/);
  assert.match(pdfRoute, /Content-Disposition/);
  assert.match(pdfRoute, /application\/pdf/);
  assert.match(tenantPage, /platformInvoiceDocumentUrl/);
  assert.match(tenantPage, /platformInvoicePdfUrl/);
  assert.match(platformPage, /Platform Invoices/);
  assert.match(platformPage, /View \/ Print/);
  assert.match(platformPage, /Download PDF/);
  assert.match(links, /\/platform\/invoices/);
  assert.match(billingService, /notes: subscription\.tenant\.billingProfile\?\.invoiceNotes \|\| null/);
  assert.match(env, /PLATFORM_BILLING_LEGAL_NAME/);
  assert.match(env, /PLATFORM_BILLING_TIN/);
});
