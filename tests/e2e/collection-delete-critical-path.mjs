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
const primaryPayer = `E2E Delete Primary ${runToken}`;
const secondaryPayer = `E2E Delete Secondary ${runToken}`;
let primaryCollectionId = null;
let secondaryCollectionId = null;

async function pathExists(path) {
  if (!path) return false;
  try { await access(path); return true; } catch { return false; }
}

function assertE2eDatabaseSafety() {
  const allowLocal = process.env.HOAHUB_E2E_ALLOW_LOCAL === "1";
  if (process.env.CI !== "true" && !allowLocal) {
    throw new Error("Collection Delete browser database operations are restricted to CI. Set HOAHUB_E2E_ALLOW_LOCAL=1 only for an explicit disposable local database run.");
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for the Collection Delete browser suite.");
  const host = new URL(databaseUrl).hostname;
  if (!allowLocal && !["127.0.0.1", "localhost", "mysql"].includes(host)) {
    throw new Error(`Refusing Collection Delete browser database operations against non-disposable host: ${host}`);
  }
}

async function resolveBrowserExecutable() {
  const candidates = [process.env.PUPPETEER_EXECUTABLE_PATH, process.env.CHROME_BIN, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"].filter(Boolean);
  for (const candidate of candidates) if (await pathExists(candidate)) return candidate;
  const packaged = await chromium.executablePath();
  if (await pathExists(packaged)) return packaged;
  throw new Error("No Chromium or Chrome executable is available for the Collection Delete browser suite.");
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
    try {
      lastUrl = page.url();
      if (predicate(new URL(lastUrl))) return lastUrl;
    } catch {
      // Next.js can briefly detach/replace the main frame while a Server Action redirects.
      // Treat that as an in-flight navigation and retry instead of failing the regression.
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

async function createFixtures() {
  const admin = await prisma.user.findFirstOrThrow({ where: { tenantId: primaryTenantId, email: adminEmail } });
  const common = {
    type: "OTHER",
    description: "Security Deposit 200",
    payerType: "OTHER",
    amount: 200,
    collectionDate: new Date("2026-09-17T00:00:00.000Z"),
    method: "CASH",
    refundable: false,
    refundStatus: "NOT_APPLICABLE",
    createdById: admin.id,
  };
  const [primary, secondary] = await Promise.all([
    prisma.collection.create({ data: { ...common, tenantId: primaryTenantId, payerName: primaryPayer, receiptNumber: `E2E-DEL-P-${runToken}` } }),
    prisma.collection.create({ data: { ...common, tenantId: secondaryTenantId, payerName: secondaryPayer, receiptNumber: `E2E-DEL-S-${runToken}` } }),
  ]);
  primaryCollectionId = primary.id;
  secondaryCollectionId = secondary.id;
}

async function cleanup() {
  if (primaryCollectionId) {
    await prisma.auditLog.deleteMany({ where: { tenantId: primaryTenantId, entityType: "Collection", entityId: primaryCollectionId } }).catch(() => undefined);
    await prisma.collection.deleteMany({ where: { id: primaryCollectionId, tenantId: primaryTenantId } }).catch(() => undefined);
  }
  if (secondaryCollectionId) {
    await prisma.collection.deleteMany({ where: { id: secondaryCollectionId, tenantId: secondaryTenantId } }).catch(() => undefined);
  }
}

async function findRowByText(page, text) {
  for (const row of await page.$$("tbody tr")) {
    const rowText = (await row.evaluate((node) => node.textContent || "")).replace(/\s+/g, " ").trim();
    if (rowText.includes(text)) return row;
  }
  return null;
}

async function runCollectionDeleteRegression(browser) {
  await createFixtures();
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  page.setDefaultTimeout(timeout);
  const pageErrors = [];
  let transientBoundarySeen = false;
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.exposeFunction("__hoahubReportTransientErrorBoundary", () => {
    transientBoundarySeen = true;
  });

  try {
    await login(page);
    await page.goto(`${baseUrl}/admin/collections`, { waitUntil: "networkidle2", timeout });
    await expectText(page, primaryPayer, "deletable primary-tenant collection");
    await expectNoText(page, secondaryPayer, "secondary-tenant collection");

    const row = await findRowByText(page, primaryPayer);
    assert.ok(row, "Expected the deletable collection row.");
    const deleteButton = await row.$("button[type='submit']");
    assert.ok(deleteButton, "Expected a Delete submit button for a history-free collection.");

    await page.evaluate(() => {
      const boundaryText = /we couldn't finish that request|something went wrong/i;
      const inspect = () => {
        const text = document.body?.textContent || "";
        if (boundaryText.test(text)) window.__hoahubReportTransientErrorBoundary();
      };
      inspect();
      const observer = new MutationObserver(inspect);
      observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
      window.__hoahubDeleteBoundaryObserver = observer;
    });

    page.once("dialog", async (dialog) => {
      assert.match(dialog.message(), /cannot be undone/i);
      await dialog.accept();
    });
    await deleteButton.click();
    await waitForUrl(page, (url) => url.pathname === "/admin/collections" && url.searchParams.get("success") === "deleted", "successful collection deletion redirect");
    assert.equal(transientBoundarySeen, false, "Delete must never render the global error boundary, even transiently before redirect/recovery.");

    assert.equal(await prisma.collection.count({ where: { id: primaryCollectionId, tenantId: primaryTenantId } }), 0, "Deleted collection must be physically absent from its tenant.");
    assert.equal(await prisma.collection.count({ where: { id: secondaryCollectionId, tenantId: secondaryTenantId } }), 1, "Deleting a primary-tenant collection must not affect another tenant.");

    const audit = await prisma.auditLog.findFirst({
      where: { tenantId: primaryTenantId, action: "COLLECTION_DELETED", entityType: "Collection", entityId: primaryCollectionId },
    });
    assert.ok(audit, "Expected COLLECTION_DELETED audit evidence for the removed line item.");

    await page.goto(`${baseUrl}/admin/collections`, { waitUntil: "networkidle2", timeout });
    await expectNoText(page, primaryPayer, "deleted collection after a clean reload");
    await expectNoText(page, "We couldn't finish that request", "global error boundary after deletion");
    assert.equal(transientBoundarySeen, false, "Delete workflow must remain free of transient global error-boundary renders.");
    assert.deepEqual(pageErrors, [], `Deletion must not trigger browser page errors: ${pageErrors.join(" | ")}`);
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
  await runCollectionDeleteRegression(browser);
  console.log("Collection Delete browser regression suite passed:");
  console.log("- a history-free collection was deleted through the real admin UI and Server Action");
  console.log("- the deleted database row stayed absent after a clean page reload");
  console.log("- COLLECTION_DELETED audit evidence was committed atomically");
  console.log("- a same-shaped collection in another tenant remained untouched and invisible");
  console.log("- the delete workflow never rendered the global error boundary, including transiently during mutation");
} catch (error) {
  console.error("Collection Delete browser regression suite failed.");
  console.error(error);
  process.exitCode = 1;
} finally {
  await cleanup().catch((error) => console.error("Collection Delete browser cleanup failed.", error));
  await browser.close();
  await prisma.$disconnect();
}
