import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const adminEmail = process.env.E2E_ADMIN_EMAIL || process.env.SEED_SYSTEM_ADMIN_EMAIL || "ci-system@example.invalid";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || process.env.SEED_SYSTEM_ADMIN_PASSWORD || "CI-Temporary-Password-2026!";
const primaryTenantId = "tenant_pagsibol4b_default";
const secondaryTenantId = "tenant_e2e_browser_isolation";
const timeout = 45_000;
const runToken = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const marker = `E2E Financial Report ${runToken}`;
const fixtureIds = [];

async function pathExists(path) {
  if (!path) return false;
  try { await access(path); return true; } catch { return false; }
}

function assertE2eDatabaseSafety() {
  const allowLocal = process.env.HOAHUB_E2E_ALLOW_LOCAL === "1";
  if (process.env.CI !== "true" && !allowLocal) {
    throw new Error("Financial Reports browser database operations are restricted to CI. Set HOAHUB_E2E_ALLOW_LOCAL=1 only for an explicit disposable local database run.");
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for the Financial Reports browser suite.");
  const host = new URL(databaseUrl).hostname;
  if (!allowLocal && !["127.0.0.1", "localhost", "mysql"].includes(host)) {
    throw new Error(`Refusing Financial Reports browser database operations against non-disposable host: ${host}`);
  }
}

async function resolveBrowserExecutable() {
  const candidates = [process.env.PUPPETEER_EXECUTABLE_PATH, process.env.CHROME_BIN, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"].filter(Boolean);
  for (const candidate of candidates) if (await pathExists(candidate)) return candidate;
  const packaged = await chromium.executablePath();
  if (await pathExists(packaged)) return packaged;
  throw new Error("No Chromium or Chrome executable is available for the Financial Reports browser suite.");
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
  const admin = await prisma.user.findFirstOrThrow({ where: { tenantId: primaryTenantId, email: adminEmail } });
  const common = {
    type: "OTHER",
    payerType: "OTHER",
    method: "CASH",
    refundable: false,
    refundStatus: "NOT_APPLICABLE",
    createdById: admin.id,
  };
  const specs = [
    { tenantId: primaryTenantId, description: `${marker} FROM boundary`, amount: 111.11, collectionDate: new Date("2026-08-10T00:00:00.000Z") },
    { tenantId: primaryTenantId, description: `${marker} included`, amount: 1234.56, collectionDate: new Date("2026-08-15T12:00:00.000Z") },
    { tenantId: primaryTenantId, description: `${marker} TO boundary`, amount: 222.22, collectionDate: new Date("2026-08-20T23:59:59.999Z") },
    { tenantId: primaryTenantId, description: `${marker} excluded date`, amount: 4321.09, collectionDate: new Date("2026-08-09T23:59:59.999Z") },
    { tenantId: secondaryTenantId, description: `${marker} foreign tenant`, amount: 9876.54, collectionDate: new Date("2026-08-15T12:00:00.000Z") },
  ];
  for (const [index, spec] of specs.entries()) {
    const row = await prisma.collection.create({
      data: { ...common, ...spec, payerName: `${marker} payer ${index + 1}`, receiptNumber: `E2E-FIN-${runToken}-${index + 1}` },
      select: { id: true },
    });
    fixtureIds.push(row.id);
  }
}

async function cleanup() {
  if (!fixtureIds.length) return;
  await prisma.bondRefund.deleteMany({ where: { collectionId: { in: fixtureIds } } }).catch(() => undefined);
  await prisma.collection.deleteMany({ where: { id: { in: fixtureIds } } }).catch(() => undefined);
}

async function runFinancialReportsRegression(browser) {
  await createFixtures();
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  page.setDefaultTimeout(timeout);
  page.on("pageerror", (error) => console.log(`[browser:pageerror] ${error.message}`));

  try {
    await login(page);
    const reportUrl = `${baseUrl}/admin/reports?from=2026-08-10&to=2026-08-20`;
    await page.goto(reportUrl, { waitUntil: "networkidle2", timeout });
    await expectText(page, "HOA financial reports");
    await expectText(page, `${marker} FROM boundary`, "inclusive From boundary row");
    await expectText(page, "₱111.11", "exact From-boundary amount");
    await expectText(page, `${marker} included`, "in-range row");
    await expectText(page, "₱1,234.56", "exact in-range amount");
    await expectText(page, `${marker} TO boundary`, "inclusive To boundary row");
    await expectText(page, "₱222.22", "exact To-boundary amount");
    await expectNoText(page, `${marker} excluded date`, "out-of-range row");
    await expectNoText(page, `${marker} foreign tenant`, "cross-tenant row");

    const csvHref = await page.$eval("a.btn-secondary[href*='/admin/reports/export']", (node) => node.getAttribute("href"));
    assert.equal(csvHref, "/admin/reports/export?from=2026-08-10&to=2026-08-20", "CSV export must preserve the selected report range.");
    const csvResult = await page.evaluate(async (href) => {
      const response = await fetch(href, { credentials: "same-origin" });
      return { status: response.status, disposition: response.headers.get("content-disposition"), text: await response.text() };
    }, csvHref);
    assert.equal(csvResult.status, 200, "Authenticated tenant CSV export must succeed.");
    assert.match(csvResult.disposition || "", /2026-08-10-to-2026-08-20\.csv/);
    assert.ok(csvResult.text.includes(`${marker} FROM boundary`), "CSV must include the From boundary row.");
    assert.ok(csvResult.text.includes(`"111.11"`), "CSV must preserve the exact From-boundary amount.");
    assert.ok(csvResult.text.includes(`${marker} included`), "CSV must include the in-range row.");
    assert.ok(csvResult.text.includes(`"1234.56"`), "CSV must preserve the exact in-range amount.");
    assert.ok(csvResult.text.includes(`${marker} TO boundary`), "CSV must include the To boundary row.");
    assert.ok(csvResult.text.includes(`"222.22"`), "CSV must preserve the exact To-boundary amount.");
    assert.ok(!csvResult.text.includes(`${marker} excluded date`), "CSV must exclude the out-of-range row.");
    assert.ok(!csvResult.text.includes(`${marker} foreign tenant`), "CSV must exclude the cross-tenant row.");

    const invalid = await page.evaluate(async () => {
      const response = await fetch("/admin/reports/export?from=2026-08-21&to=2026-08-20", { credentials: "same-origin" });
      return { status: response.status, text: await response.text() };
    });
    assert.equal(invalid.status, 400, "Inverted CSV date ranges must be rejected.");
    assert.match(invalid.text, /start date must be on or before/i);
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
  await runFinancialReportsRegression(browser);
  console.log("Financial Reports regression passed:");
  console.log("- From/To boundaries and exact report amounts use existing production date semantics");
  console.log("- out-of-range and cross-tenant finance rows are excluded from browser output");
  console.log("- CSV preserves the selected range, exact scoped rows, and rejects inverted dates");
} catch (error) {
  console.error("Financial Reports regression failed.");
  console.error(error);
  process.exitCode = 1;
} finally {
  await cleanup().catch((error) => console.error("Financial Reports browser cleanup failed.", error));
  await browser.close();
  await prisma.$disconnect();
}
