import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const adminEmail = process.env.E2E_ADMIN_EMAIL || process.env.SEED_SYSTEM_ADMIN_EMAIL || "ci-system@example.invalid";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || process.env.SEED_SYSTEM_ADMIN_PASSWORD || "CI-Temporary-Password-2026!";
const homeownerEmail = process.env.E2E_HOMEOWNER_EMAIL || "ci-homeowner@example.invalid";
const primaryTenantId = "tenant_pagsibol4b_default";
const secondaryTenantId = "tenant_e2e_browser_isolation";
const coverageYear = 2099;
const coverageMonth = 12;
const timeout = 45_000;
const voidReason = `E2E payment void regression ${Date.now()}`;
let billId = null;
let paymentId = null;
let archiveId = null;
let receiptNumber = null;

async function pathExists(path) {
  if (!path) return false;
  try { await access(path); return true; } catch { return false; }
}

function assertE2eDatabaseSafety() {
  const allowLocal = process.env.HOAHUB_E2E_ALLOW_LOCAL === "1";
  if (process.env.CI !== "true" && !allowLocal) {
    throw new Error("Payment Void browser database operations are restricted to CI. Set HOAHUB_E2E_ALLOW_LOCAL=1 only for an explicit disposable local database run.");
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for the Payment Void browser suite.");
  const host = new URL(databaseUrl).hostname;
  if (!allowLocal && !["127.0.0.1", "localhost", "mysql"].includes(host)) {
    throw new Error(`Refusing Payment Void browser database operations against non-disposable host: ${host}`);
  }
}

async function resolveBrowserExecutable() {
  const candidates = [process.env.PUPPETEER_EXECUTABLE_PATH, process.env.CHROME_BIN, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"].filter(Boolean);
  for (const candidate of candidates) if (await pathExists(candidate)) return candidate;
  const packaged = await chromium.executablePath();
  if (await pathExists(packaged)) return packaged;
  throw new Error("No Chromium or Chrome executable is available for the Payment Void browser suite.");
}

async function pageText(page) {
  return page.evaluate(() => document.body?.textContent || "");
}

async function expectText(page, text, label = text) {
  try {
    await page.waitForFunction((expected) => (document.body?.textContent || "").includes(expected), { timeout }, text);
  } catch (error) {
    const body = (await pageText(page)).replace(/\s+/g, " ").trim();
    throw new Error(`Expected ${label} on ${page.url()}. Page text: ${body.slice(0, 2000)}`, { cause: error });
  }
}

async function expectNoText(page, text, label = text) {
  const body = await pageText(page);
  assert.ok(!body.includes(text), `Did not expect ${label} on ${page.url()}`);
}

async function clickByText(page, selector, matcher) {
  for (const element of await page.$$(selector)) {
    const text = (await element.evaluate((node) => node.textContent || "")).replace(/\s+/g, " ").trim();
    if ((typeof matcher === "string" && text.includes(matcher)) || (matcher instanceof RegExp && matcher.test(text))) {
      await element.click();
      return;
    }
  }
  throw new Error(`No ${selector} matched ${String(matcher)} on ${page.url()}`);
}

async function waitForUrl(page, predicate, label) {
  const deadline = Date.now() + timeout;
  let lastUrl = page.url();
  while (Date.now() < deadline) {
    lastUrl = page.url();
    try {
      if (predicate(new URL(lastUrl))) return lastUrl;
    } catch {
      // Next.js can briefly replace the frame during server-action redirects.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${label}. Last URL: ${lastUrl}`);
}

async function login(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle2", timeout });
  await page.type("#identifier", adminEmail);
  await page.type("#password", adminPassword);
  await clickByText(page, "button", "Sign in securely");
  await waitForUrl(page, (url) => url.pathname.startsWith("/admin/"), "administrator redirect after login");
}

async function createPage(context) {
  const page = await context.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  page.setDefaultTimeout(timeout);
  page.on("pageerror", (error) => console.log(`[browser:pageerror] ${error.message}`));
  return page;
}

async function findHomeowner() {
  return prisma.homeownerProfile.findFirstOrThrow({
    where: { tenantId: primaryTenantId, user: { email: homeownerEmail } },
    include: { user: true },
  });
}

async function cleanFixture() {
  const homeowner = await prisma.homeownerProfile.findFirst({
    where: { tenantId: primaryTenantId, user: { email: homeownerEmail } },
  }).catch(() => null);
  if (!homeowner) return;

  const bills = await prisma.bill.findMany({
    where: { tenantId: primaryTenantId, homeownerId: homeowner.id, coverageYear, coverageMonth },
    select: { id: true },
  });
  const billIds = [...new Set([billId, ...bills.map((bill) => bill.id)].filter(Boolean))];
  const payments = await prisma.payment.findMany({
    where: {
      tenantId: primaryTenantId,
      OR: [
        ...(paymentId ? [{ id: paymentId }] : []),
        ...(billIds.length ? [{ allocations: { some: { billId: { in: billIds } } } }, { billId: { in: billIds } }] : []),
      ],
    },
    select: { id: true },
  });
  const paymentIds = [...new Set([paymentId, ...payments.map((payment) => payment.id)].filter(Boolean))];

  if (paymentIds.length) {
    const archives = await prisma.paymentArchive.findMany({
      where: { tenantId: primaryTenantId, originalPaymentId: { in: paymentIds } },
      select: { id: true },
    });
    const archiveIds = [...new Set([archiveId, ...archives.map((archive) => archive.id)].filter(Boolean))];
    await prisma.auditLog.deleteMany({
      where: {
        tenantId: primaryTenantId,
        OR: [
          { entityType: "Payment", entityId: { in: paymentIds } },
          ...(archiveIds.length ? [{ entityType: "PaymentArchive", entityId: { in: archiveIds } }] : []),
        ],
      },
    }).catch(() => undefined);
    await prisma.paymentArchive.deleteMany({ where: { tenantId: primaryTenantId, originalPaymentId: { in: paymentIds } } });
    await prisma.paymentAllocation.deleteMany({ where: { tenantId: primaryTenantId, paymentId: { in: paymentIds } } });
    await prisma.paymentRequest.updateMany({ where: { tenantId: primaryTenantId, paymentId: { in: paymentIds } }, data: { paymentId: null } }).catch(() => undefined);
    await prisma.payment.deleteMany({ where: { tenantId: primaryTenantId, id: { in: paymentIds } } });
  }
  if (billIds.length) await prisma.bill.deleteMany({ where: { tenantId: primaryTenantId, id: { in: billIds } } });
}

async function runPaymentVoidRegression(browser) {
  const homeowner = await findHomeowner();
  const context = await browser.createBrowserContext();
  const page = await createPage(context);
  try {
    await login(page);

    const billingUrl = new URL("/admin/billing", baseUrl);
    billingUrl.searchParams.set("preview", "1");
    billingUrl.searchParams.set("coverageYear", String(coverageYear));
    billingUrl.searchParams.set("coverageMonth", String(coverageMonth));
    billingUrl.searchParams.set("scope", "ALL");
    await page.goto(billingUrl.toString(), { waitUntil: "networkidle2", timeout });
    await expectText(page, "Billing generation");
    await clickByText(page, "button", "Generate for Eligible Homeowners");
    await waitForUrl(page, (url) => url.searchParams.get("billingGenerated") === "1", "billing generation completion");

    const bill = await prisma.bill.findFirstOrThrow({
      where: { tenantId: primaryTenantId, homeownerId: homeowner.id, coverageYear, coverageMonth },
      orderBy: { createdAt: "desc" },
    });
    billId = bill.id;
    assert.equal(Number(bill.amountPaid), 0);
    assert.ok(Number(bill.balance) > 0, "Expected the disposable bill to have an open balance before payment.");

    const paymentSearch = new URL("/admin/payments/record", baseUrl);
    paymentSearch.searchParams.set("q", bill.id);
    await page.goto(paymentSearch.toString(), { waitUntil: "networkidle2", timeout });
    await expectText(page, homeowner.user.name, "tenant homeowner for disposable payment");
    await clickByText(page, "button[type='button']", homeowner.user.name);
    await page.waitForFunction(() => Number(document.querySelector("input[name='amount']")?.value || 0) > 0, { timeout });
    await page.select("select[name='method']", "CASH");
    await clickByText(page, "button[type='submit']", /Record payment/i);
    await waitForUrl(page, (url) => /^\/receipts\/payment\/[^/]+$/.test(url.pathname), "payment receipt redirect");
    paymentId = new URL(page.url()).pathname.split("/").pop() || null;
    assert.ok(paymentId, "Expected a payment id from the official receipt redirect.");

    const payment = await prisma.payment.findFirstOrThrow({
      where: { tenantId: primaryTenantId, id: paymentId, status: "ACTIVE" },
      include: { allocations: true },
    });
    receiptNumber = payment.receiptNumber;
    assert.ok(receiptNumber, "Expected an official receipt number for the disposable payment.");
    assert.ok(payment.allocations.some((allocation) => allocation.billId === billId), "Expected the payment to allocate to the disposable tenant bill.");
    assert.equal(await prisma.payment.count({ where: { tenantId: secondaryTenantId, id: paymentId } }), 0, "Payment must not exist in the secondary tenant.");

    const activeUrl = new URL("/admin/payments/active", baseUrl);
    activeUrl.searchParams.set("q", receiptNumber);
    await page.goto(activeUrl.toString(), { waitUntil: "networkidle2", timeout });
    await expectText(page, receiptNumber, "active payment receipt");
    await clickByText(page, "button[type='button']", /^Void$/);
    const reasonInput = await page.$(`input[name='reason']`);
    assert.ok(reasonInput, "Expected the audited void reason input after opening the void control.");
    await reasonInput.type(voidReason);
    page.once("dialog", async (dialog) => dialog.accept());
    await clickByText(page, "button[type='submit']", "Confirm void");
    await waitForUrl(page, (url) => url.pathname === "/admin/payments/active" && url.searchParams.get("success") === "deleted", "successful payment void redirect");
    await expectText(page, "Payment voided, archived, and billing totals recalculated.", "void success message");

    const [voidedPayment, archive, recalculatedBill, audit] = await Promise.all([
      prisma.payment.findFirstOrThrow({ where: { tenantId: primaryTenantId, id: paymentId } }),
      prisma.paymentArchive.findFirstOrThrow({ where: { tenantId: primaryTenantId, originalPaymentId: paymentId } }),
      prisma.bill.findFirstOrThrow({ where: { tenantId: primaryTenantId, id: billId } }),
      prisma.auditLog.findFirst({ where: { tenantId: primaryTenantId, action: "VOID_PAYMENT_TRANSACTION", OR: [{ entityId: paymentId }, { metadata: { path: ["originalPaymentId"], equals: paymentId } }] } }),
    ]);
    archiveId = archive.id;
    assert.equal(voidedPayment.status, "VOIDED");
    assert.ok(voidedPayment.voidedAt, "Expected a void timestamp.");
    assert.equal(voidedPayment.voidReason, voidReason);
    assert.equal(archive.voidReason, voidReason);
    assert.equal(Number(recalculatedBill.amountPaid), 0);
    assert.equal(Number(recalculatedBill.balance), Number(recalculatedBill.totalAmount));
    assert.ok(audit, "Expected tenant-scoped VOID_PAYMENT_TRANSACTION audit evidence.");
    assert.equal(await prisma.paymentArchive.count({ where: { tenantId: secondaryTenantId, originalPaymentId: paymentId } }), 0, "Payment archive must remain tenant isolated.");

    const activeAfter = new URL("/admin/payments/active", baseUrl);
    activeAfter.searchParams.set("q", receiptNumber);
    await page.goto(activeAfter.toString(), { waitUntil: "networkidle2", timeout });
    await expectNoText(page, receiptNumber, "voided receipt in active payments");

    const historyUrl = new URL("/admin/payments/history", baseUrl);
    historyUrl.searchParams.set("q", receiptNumber);
    await page.goto(historyUrl.toString(), { waitUntil: "networkidle2", timeout });
    await expectText(page, receiptNumber, "voided receipt retained in transaction history");
    await expectText(page, "VOID", "void status in transaction history");
    await expectText(page, voidReason, "audited void reason in transaction history");
  } finally {
    await context.close();
  }
}

assertE2eDatabaseSafety();
await cleanFixture();
const executablePath = await resolveBrowserExecutable();
const headlessMode = "shell";
const browser = await puppeteer.launch({ executablePath, headless: headlessMode, args: await puppeteer.defaultArgs({ args: chromium.args, headless: headlessMode }) });

try {
  await runPaymentVoidRegression(browser);
  console.log("Payment Void browser regression suite passed:");
  console.log("- created an official tenant-scoped payment through the existing browser flow");
  console.log("- PAYMENTS_VOID browser action removed the payment from active totals");
  console.log("- payment remained VOIDED with an audit archive and explicit reason");
  console.log("- affected bill balance was recalculated from active payments only");
  console.log("- voided receipt remained traceable in transaction history");
} catch (error) {
  console.error("Payment Void browser regression suite failed.");
  console.error(error);
  process.exitCode = 1;
} finally {
  await cleanFixture().catch((error) => console.error("Payment Void browser cleanup failed.", error));
  await browser.close();
  await prisma.$disconnect();
}
