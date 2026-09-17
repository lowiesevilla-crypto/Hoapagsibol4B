import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const adminEmail = process.env.E2E_ADMIN_EMAIL || process.env.SEED_SYSTEM_ADMIN_EMAIL || "ci-system@example.invalid";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || process.env.SEED_SYSTEM_ADMIN_PASSWORD || "CI-Temporary-Password-2026!";
const otherHomeownerEmail = process.env.E2E_OTHER_HOMEOWNER_EMAIL || "ci-other-homeowner@example.invalid";
const homeownerPassword = process.env.E2E_HOMEOWNER_PASSWORD || "CI-Homeowner-Password-2026!";
const primaryTenantId = "tenant_pagsibol4b_default";
const secondaryTenantId = "tenant_e2e_browser_isolation";
const homeownerName = "E2E Browser Homeowner";
const timeout = 45_000;

async function pathExists(path) {
  if (!path) return false;
  try { await access(path); return true; } catch { return false; }
}

function assertE2eDatabaseSafety() {
  const allowLocal = process.env.HOAHUB_E2E_ALLOW_LOCAL === "1";
  if (process.env.CI !== "true" && !allowLocal) {
    throw new Error("Payment Receipt browser database operations are restricted to CI. Set HOAHUB_E2E_ALLOW_LOCAL=1 only for an explicit disposable local database run.");
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for the Payment Receipt browser suite.");
  const host = new URL(databaseUrl).hostname;
  if (!allowLocal && !["127.0.0.1", "localhost", "mysql"].includes(host)) {
    throw new Error(`Refusing Payment Receipt browser database operations against non-disposable host: ${host}`);
  }
}

async function resolveBrowserExecutable() {
  const candidates = [process.env.PUPPETEER_EXECUTABLE_PATH, process.env.CHROME_BIN, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"].filter(Boolean);
  for (const candidate of candidates) if (await pathExists(candidate)) return candidate;
  const packaged = await chromium.executablePath();
  if (await pathExists(packaged)) return packaged;
  throw new Error("No Chromium or Chrome executable is available for the Payment Receipt browser suite.");
}

async function pageText(page) {
  return page.evaluate(() => document.body?.textContent || "");
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

async function login(page, email, password, expectedPrefix) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle2", timeout });
  await page.type("#identifier", email);
  await page.type("#password", password);
  await clickByText(page, "button", "Sign in securely");
  await page.waitForFunction((prefix) => window.location.pathname.startsWith(prefix), { timeout }, expectedPrefix);
}

async function recordOnePaymentWithRapidDoubleClick(browser) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  page.setDefaultTimeout(timeout);

  try {
    await login(page, adminEmail, adminPassword, "/admin/");
    const paymentSearch = new URL("/admin/payments/record", baseUrl);
    paymentSearch.searchParams.set("q", homeownerName);
    await page.goto(paymentSearch.toString(), { waitUntil: "networkidle2", timeout });
    await clickByText(page, "button[type='button']", homeownerName);
    await page.waitForFunction(() => document.querySelector("input[name='homeownerId']")?.value, { timeout });
    await page.select("select[name='method']", "CASH");
    await page.$eval("input[name='amount']", (element) => {
      element.value = "1.00";
      element.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForFunction(() => !document.querySelector("button[type='submit']")?.disabled, { timeout });

    const idempotencyKey = await page.$eval("input[name='idempotencyKey']", (element) => element.value);
    assert.ok(idempotencyKey, "Record Payment must render a non-empty idempotency key.");
    assert.equal(await prisma.payment.count({ where: { tenantId: primaryTenantId, idempotencyKey } }), 0, "The fresh submission token must not already identify a payment.");

    await page.evaluate(() => {
      const button = [...document.querySelectorAll("button[type='submit']")].find((node) => /record payment/i.test(node.textContent || ""));
      if (!(button instanceof HTMLButtonElement)) throw new Error("Record payment submit button was not found.");
      button.click();
      button.click();
    });

    await page.waitForFunction(() => /^\/receipts\/payment\/[^/]+$/.test(window.location.pathname), { timeout });
    const route = new URL(page.url());
    const paymentId = route.pathname.split("/").pop();
    assert.ok(paymentId, `Expected persisted payment id in receipt route, received ${page.url()}`);

    const payments = await prisma.payment.findMany({
      where: { tenantId: primaryTenantId, idempotencyKey },
      include: { homeowner: { include: { user: true } } },
    });
    assert.equal(payments.length, 1, "Rapid repeated clicks must persist exactly one payment for the submission token.");
    assert.equal(payments[0].id, paymentId, "The receipt route must use the exact persisted payment id returned by the successful posting.");
    assert.equal(payments[0].tenantId, primaryTenantId, "The recorded payment must remain scoped to the authenticated tenant.");
    assert.equal(payments[0].homeowner.user.name, homeownerName, "The persisted payment must belong to the selected homeowner.");

    await page.waitForFunction(() => (document.body?.textContent || "").includes("Receipt No."), { timeout });
    const receiptBody = await pageText(page);
    assert.ok(receiptBody.includes(payments[0].receiptNumber), "The opened receipt must display the persisted payment receipt number.");

    assert.equal(
      await prisma.payment.count({ where: { tenantId: secondaryTenantId, id: paymentId } }),
      0,
      "The payment id must not resolve as a secondary-tenant payment.",
    );

    return { paymentId, receiptNumber: payments[0].receiptNumber };
  } finally {
    await context.close();
  }
}

async function assertCrossTenantReceiptIsolation(browser, paymentId, receiptNumber) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 390, height: 844 });
  page.setDefaultTimeout(timeout);
  try {
    await login(page, otherHomeownerEmail, homeownerPassword, "/portal/");
    await page.goto(`${baseUrl}/receipts/payment/${paymentId}`, { waitUntil: "networkidle2", timeout });
    const body = await pageText(page);
    assert.ok(!body.includes(receiptNumber), "A user from another tenant must not be able to render the payment receipt.");
    assert.ok(!body.includes("Official Acknowledgement Receipt") || !body.includes(receiptNumber), "Cross-tenant receipt access must not expose receipt content.");
  } finally {
    await context.close();
  }
}

assertE2eDatabaseSafety();
const executablePath = await resolveBrowserExecutable();
const headlessMode = "shell";
const browser = await puppeteer.launch({ executablePath, headless: headlessMode, args: await puppeteer.defaultArgs({ args: chromium.args, headless: headlessMode }) });

try {
  const result = await recordOnePaymentWithRapidDoubleClick(browser);
  await assertCrossTenantReceiptIsolation(browser, result.paymentId, result.receiptNumber);
  console.log("Payment Receipt browser regression suite passed:");
  console.log("- Record Payment persisted exactly one payment under rapid repeated clicks");
  console.log("- successful posting opened /receipts/payment/<exact persisted payment id>");
  console.log("- opened receipt displayed the persisted official receipt number");
  console.log("- payment and receipt remained tenant scoped");
} catch (error) {
  console.error("Payment Receipt browser regression suite failed.");
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
  await prisma.$disconnect();
}
