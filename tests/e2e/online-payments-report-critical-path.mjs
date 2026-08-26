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
const marker = "application/x-hoahub-paymongo";
const timeout = 45_000;
const runToken = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const referencePrefix = `E2E-ONLINE-${runToken}`;
const fixtureIds = [];
let settlementRequestId = null;
let foreignRequestId = null;

async function pathExists(path) {
  if (!path) return false;
  try { await access(path); return true; } catch { return false; }
}

function assertE2eDatabaseSafety() {
  const allowLocal = process.env.HOAHUB_E2E_ALLOW_LOCAL === "1";
  if (process.env.CI !== "true" && !allowLocal) {
    throw new Error("Online Payments browser database operations are restricted to CI. Set HOAHUB_E2E_ALLOW_LOCAL=1 only for an explicit disposable local database run.");
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for the Online Payments browser suite.");
  const host = new URL(databaseUrl).hostname;
  if (!allowLocal && !["127.0.0.1", "localhost", "mysql"].includes(host)) {
    throw new Error(`Refusing Online Payments browser database operations against non-disposable host: ${host}`);
  }
}

async function resolveBrowserExecutable() {
  const candidates = [process.env.PUPPETEER_EXECUTABLE_PATH, process.env.CHROME_BIN, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"].filter(Boolean);
  for (const candidate of candidates) if (await pathExists(candidate)) return candidate;
  const packaged = await chromium.executablePath();
  if (await pathExists(packaged)) return packaged;
  throw new Error("No Chromium or Chrome executable is available for the Online Payments browser suite.");
}

async function pageText(page) {
  return page.evaluate(() => document.body?.textContent || "");
}

async function expectText(page, text, label = text) {
  try {
    await page.waitForFunction((expected) => (document.body?.textContent || "").includes(expected), { timeout }, text);
  } catch (error) {
    const body = (await pageText(page)).replace(/\s+/g, " ").trim();
    throw new Error(`Expected ${label} on ${page.url()}. Page text: ${body.slice(0, 2200)}`, { cause: error });
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
    try { if (predicate(new URL(lastUrl))) return lastUrl; } catch {}
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

async function createFixtures() {
  const homeowner = await prisma.homeownerProfile.findFirstOrThrow({
    where: { tenantId: primaryTenantId, user: { email: homeownerEmail } },
    include: { user: true },
  });

  for (let index = 0; index < 26; index += 1) {
    const approved = index % 2 === 0;
    const row = await prisma.paymentRequest.create({
      data: {
        tenantId: primaryTenantId,
        type: "OTHER_COLLECTION",
        status: approved ? "APPROVED" : "PENDING_REVIEW",
        homeownerId: homeowner.id,
        description: `Disposable Online Payments regression row ${index + 1}`,
        amount: approved && index === 0 ? 1234.56 : 100 + index,
        paymentDate: new Date("2026-08-26T00:00:00.000Z"),
        method: "GCASH",
        referenceNumber: `${referencePrefix}-${String(index + 1).padStart(2, "0")}`,
        proofContentType: marker,
        reviewRemarks: approved ? "Verified PayMongo regression fixture." : "Awaiting PayMongo regression fixture.",
      },
      select: { id: true },
    });
    fixtureIds.push(row.id);
    if (index === 0) settlementRequestId = row.id;
  }

  assert.ok(settlementRequestId, "Expected a settlement fixture request id.");
  await prisma.auditLog.create({
    data: {
      tenantId: primaryTenantId,
      module: "PAYMENTS",
      action: "PAYMONGO_HOMEOWNER_PAYMENT_RECONCILED",
      entityType: "PaymentRequest",
      entityId: settlementRequestId,
      correlationId: `cs_e2e_${runToken}`,
      metadata: {
        checkoutId: `cs_e2e_${runToken}`,
        gatewayPaymentId: `pay_e2e_${runToken}`,
        hoaPrincipalAmount: 1234.56,
        platformConvenienceFeeAmount: 25,
        processingFeeAmount: 15,
        totalCustomerPaid: 1274.56,
        reconciliationSource: "E2E_DISPOSABLE_FIXTURE",
      },
    },
  });

  const foreign = await prisma.paymentRequest.create({
    data: {
      tenantId: secondaryTenantId,
      type: "OTHER_COLLECTION",
      status: "APPROVED",
      homeownerId: homeowner.id,
      description: "Disposable cross-tenant Online Payments negative fixture",
      amount: 9876.54,
      paymentDate: new Date("2026-08-26T00:00:00.000Z"),
      method: "GCASH",
      referenceNumber: `${referencePrefix}-FOREIGN`,
      proofContentType: marker,
      reviewRemarks: "Cross-tenant fixture; must never be exposed to the primary tenant.",
    },
    select: { id: true },
  });
  foreignRequestId = foreign.id;
  fixtureIds.push(foreign.id);

  return homeowner;
}

async function cleanup() {
  if (!fixtureIds.length) return;
  await prisma.auditLog.deleteMany({ where: { entityType: "PaymentRequest", entityId: { in: fixtureIds } } }).catch(() => undefined);
  await prisma.paymentRequest.deleteMany({ where: { id: { in: fixtureIds } } }).catch(() => undefined);
}

async function runOnlinePaymentsRegression(browser) {
  const homeowner = await createFixtures();
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  page.setDefaultTimeout(timeout);
  page.on("pageerror", (error) => console.log(`[browser:pageerror] ${error.message}`));

  try {
    await login(page);

    const reportUrl = new URL("/admin/payments/online", baseUrl);
    reportUrl.searchParams.set("q", referencePrefix);
    reportUrl.searchParams.set("pageSize", "25");
    await page.goto(reportUrl.toString(), { waitUntil: "networkidle2", timeout });
    await expectText(page, "Online payment status");
    await expectText(page, "Showing 1-25 of 26 matching attempt(s).", "server-paginated first page count");
    await expectText(page, homeowner.user.name, "tenant homeowner in report");
    await expectNoText(page, `${referencePrefix}-FOREIGN`, "secondary-tenant reference in report");

    await clickByText(page, "a", /^Next$/);
    await waitForUrl(page, (url) => url.searchParams.get("page") === "2", "Online Payments page 2");
    await expectText(page, "Showing 26-26 of 26 matching attempt(s).", "server-paginated second page count");
    await expectNoText(page, `${referencePrefix}-FOREIGN`, "secondary-tenant reference on page 2");

    const reconciledUrl = new URL("/admin/payments/online", baseUrl);
    reconciledUrl.searchParams.set("q", referencePrefix);
    reconciledUrl.searchParams.set("finance", "RECONCILED");
    await page.goto(reconciledUrl.toString(), { waitUntil: "networkidle2", timeout });
    await expectText(page, "Showing 1-13 of 13 matching attempt(s).", "reconciled finance filter count");
    await expectText(page, "Posted & reconciled", "reconciled finance label");

    const pendingUrl = new URL("/admin/payments/online", baseUrl);
    pendingUrl.searchParams.set("q", referencePrefix);
    pendingUrl.searchParams.set("finance", "NOT_POSTED");
    await page.goto(pendingUrl.toString(), { waitUntil: "networkidle2", timeout });
    await expectText(page, "Showing 1-13 of 13 matching attempt(s).", "not-posted finance filter count");
    await expectText(page, "Not posted", "not-posted finance label");

    const settlementReference = `${referencePrefix}-01`;
    const settlementSearch = new URL("/admin/payments/online", baseUrl);
    settlementSearch.searchParams.set("q", settlementReference);
    await page.goto(settlementSearch.toString(), { waitUntil: "networkidle2", timeout });
    await expectText(page, settlementReference, "settlement target reference");
    await clickByText(page, "a", "Trace settlement");
    await waitForUrl(page, (url) => url.pathname === `/admin/payments/online/${settlementRequestId}`, "tenant settlement detail");
    await expectText(page, "Settlement trace");
    await expectText(page, settlementReference, "settlement reference evidence");
    await expectText(page, "1,234.56", "HOA principal exact amount");
    await expectText(page, "25.00", "platform fee exact amount");
    await expectText(page, "15.00", "processing fee exact amount");
    await expectText(page, "1,274.56", "customer-paid exact amount");
    await expectText(page, `pay_e2e_${runToken}`, "gateway payment trace id");
    await expectText(page, "RECONCILED", "finance settlement status");

    assert.ok(foreignRequestId, "Expected a foreign tenant request id.");
    const foreignResponse = await page.goto(`${baseUrl}/admin/payments/online/${encodeURIComponent(foreignRequestId)}`, { waitUntil: "networkidle2", timeout });
    assert.equal(foreignResponse?.status(), 404, "Primary tenant must receive 404 for a secondary-tenant settlement identifier.");
    await expectNoText(page, `${referencePrefix}-FOREIGN`, "foreign settlement evidence");
  } finally {
    await context.close();
  }
}

assertE2eDatabaseSafety();
await cleanup();
const executablePath = await resolveBrowserExecutable();
const headlessMode = "shell";
const browser = await puppeteer.launch({ executablePath, headless: headlessMode, args: await puppeteer.defaultArgs({ args: chromium.args, headless: headlessMode }) });

try {
  await runOnlinePaymentsRegression(browser);
  console.log("Online Payments reporting and settlement regression passed:");
  console.log("- search and server pagination returned only the authenticated tenant fixtures");
  console.log("- finance status filters preserved existing production query semantics");
  console.log("- settlement trace exposed exact reference and amount evidence without changing money state");
  console.log("- forged cross-tenant settlement identifiers returned 404 with no evidence leakage");
} catch (error) {
  console.error("Online Payments reporting and settlement regression failed.");
  console.error(error);
  process.exitCode = 1;
} finally {
  await cleanup().catch((error) => console.error("Online Payments browser cleanup failed.", error));
  await browser.close();
  await prisma.$disconnect();
}
