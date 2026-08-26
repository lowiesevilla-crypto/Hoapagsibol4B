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
const primaryPayer = `E2E Primary Refund ${runToken}`;
const secondaryPayer = `E2E Secondary Refund ${runToken}`;
const refundReference = `E2E-REF-${runToken}`;
let primaryCollectionId = null;
let secondaryCollectionId = null;
let refundId = null;

async function pathExists(path) {
  if (!path) return false;
  try { await access(path); return true; } catch { return false; }
}

function assertE2eDatabaseSafety() {
  const allowLocal = process.env.HOAHUB_E2E_ALLOW_LOCAL === "1";
  if (process.env.CI !== "true" && !allowLocal) {
    throw new Error("Bond Refund browser database operations are restricted to CI. Set HOAHUB_E2E_ALLOW_LOCAL=1 only for an explicit disposable local database run.");
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for the Bond Refund browser suite.");
  const host = new URL(databaseUrl).hostname;
  if (!allowLocal && !["127.0.0.1", "localhost", "mysql"].includes(host)) {
    throw new Error(`Refusing Bond Refund browser database operations against non-disposable host: ${host}`);
  }
}

async function resolveBrowserExecutable() {
  const candidates = [process.env.PUPPETEER_EXECUTABLE_PATH, process.env.CHROME_BIN, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"].filter(Boolean);
  for (const candidate of candidates) if (await pathExists(candidate)) return candidate;
  const packaged = await chromium.executablePath();
  if (await pathExists(packaged)) return packaged;
  throw new Error("No Chromium or Chrome executable is available for the Bond Refund browser suite.");
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

async function createFixtures() {
  const admin = await prisma.user.findFirstOrThrow({ where: { tenantId: primaryTenantId, email: adminEmail } });
  const common = {
    type: "CONSTRUCTION_BOND",
    payerType: "OTHER",
    amount: 2000,
    collectionDate: new Date("2026-08-26T00:00:00.000Z"),
    method: "CASH",
    refundable: true,
    refundStatus: "HELD",
    createdById: admin.id,
  };
  const [primary, secondary] = await Promise.all([
    prisma.collection.create({ data: { ...common, tenantId: primaryTenantId, payerName: primaryPayer, receiptNumber: `E2E-PRIMARY-${runToken}` } }),
    prisma.collection.create({ data: { ...common, tenantId: secondaryTenantId, payerName: secondaryPayer, receiptNumber: `E2E-SECONDARY-${runToken}` } }),
  ]);
  primaryCollectionId = primary.id;
  secondaryCollectionId = secondary.id;
}

async function cleanup() {
  if (refundId) {
    await prisma.auditLog.deleteMany({ where: { tenantId: primaryTenantId, entityType: "BondRefund", entityId: refundId } }).catch(() => undefined);
    await prisma.bondRefund.deleteMany({ where: { id: refundId, tenantId: primaryTenantId } }).catch(() => undefined);
  }
  const collectionIds = [primaryCollectionId, secondaryCollectionId].filter(Boolean);
  if (collectionIds.length) {
    await prisma.bondRefund.deleteMany({ where: { collectionId: { in: collectionIds } } }).catch(() => undefined);
    await prisma.collection.deleteMany({ where: { id: { in: collectionIds } } }).catch(() => undefined);
  }
}

async function refundForm(page) {
  for (const form of await page.$$("form")) {
    const text = (await form.evaluate((node) => node.textContent || "")).replace(/\s+/g, " ").trim();
    if (text.includes("Refund a bond")) return form;
  }
  throw new Error(`Refund form not found on ${page.url()}`);
}

async function fillRefundForm(page, collectionId, amount, reference) {
  const form = await refundForm(page);
  const select = await form.$("select[name='collectionId']");
  const amountInput = await form.$("input[name='amount']");
  const dateInput = await form.$("input[name='refundDate']");
  const method = await form.$("select[name='method']");
  const referenceInput = await form.$("input[name='referenceNumber']");
  const remarksInput = await form.$("input[name='remarks']");
  assert.ok(select && amountInput && dateInput && method && referenceInput && remarksInput, "Expected all Bond Refund controls.");
  await select.select(collectionId);
  await amountInput.type(String(amount));
  await dateInput.evaluate((node) => { node.value = "2026-08-26"; node.dispatchEvent(new Event("input", { bubbles: true })); node.dispatchEvent(new Event("change", { bubbles: true })); });
  await method.select("BANK_TRANSFER");
  await referenceInput.type(reference);
  await remarksInput.type("E2E clearance complete");
  return form;
}

async function runBondRefundRegression(browser) {
  await createFixtures();
  const context = await browser.createBrowserContext();
  const page = await createPage(context);
  try {
    await login(page);
    await page.goto(`${baseUrl}/admin/collections`, { waitUntil: "networkidle2", timeout });
    await expectText(page, "Refund a bond");
    await expectText(page, primaryPayer, "primary tenant refundable bond");
    await expectNoText(page, secondaryPayer, "secondary tenant bond");

    const form = await fillRefundForm(page, primaryCollectionId, 750.25, refundReference);
    const submit = await form.$("button[type='submit']");
    assert.ok(submit, "Expected Process refund submit button.");
    await submit.click();
    await waitForUrl(page, (url) => url.pathname === "/admin/collections" && url.searchParams.get("success") === "refunded", "successful bond refund redirect");

    const [primary, refund] = await Promise.all([
      prisma.collection.findFirstOrThrow({ where: { id: primaryCollectionId, tenantId: primaryTenantId } }),
      prisma.bondRefund.findFirstOrThrow({ where: { tenantId: primaryTenantId, collectionId: primaryCollectionId } }),
    ]);
    refundId = refund.id;
    assert.equal(Number(primary.amountRefunded), 750.25);
    assert.equal(primary.refundStatus, "PARTIALLY_REFUNDED");
    assert.equal(Number(refund.amount), 750.25);
    assert.equal(refund.referenceNumber, refundReference);
    const audit = await prisma.auditLog.findFirst({ where: { tenantId: primaryTenantId, action: "BOND_REFUND_PROCESSED", entityType: "BondRefund", entityId: refund.id } });
    assert.ok(audit, "Expected tenant-scoped bond refund audit evidence.");

    await page.goto(`${baseUrl}/admin/collections`, { waitUntil: "networkidle2", timeout });
    const forgedForm = await refundForm(page);
    await forgedForm.evaluate((node, forgedId) => {
      const select = node.querySelector("select[name='collectionId']");
      const option = document.createElement("option");
      option.value = forgedId;
      option.textContent = "Forged cross-tenant bond";
      select.appendChild(option);
      select.value = forgedId;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }, secondaryCollectionId);
    const forgedAmount = await forgedForm.$("input[name='amount']");
    const forgedDate = await forgedForm.$("input[name='refundDate']");
    assert.ok(forgedAmount && forgedDate, "Expected forged refund controls.");
    await forgedAmount.type("100");
    await forgedDate.evaluate((node) => { node.value = "2026-08-26"; node.dispatchEvent(new Event("input", { bubbles: true })); node.dispatchEvent(new Event("change", { bubbles: true })); });
    const forgedSubmit = await forgedForm.$("button[type='submit']");
    assert.ok(forgedSubmit, "Expected forged refund submit button.");
    const postResponse = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/admin/collections"), { timeout }).catch(() => null);
    await forgedSubmit.click();
    await postResponse;
    await new Promise((resolve) => setTimeout(resolve, 250));

    const secondary = await prisma.collection.findFirstOrThrow({ where: { id: secondaryCollectionId, tenantId: secondaryTenantId } });
    assert.equal(Number(secondary.amountRefunded), 0, "Cross-tenant forged refund must not mutate the secondary bond.");
    assert.equal(await prisma.bondRefund.count({ where: { tenantId: secondaryTenantId, collectionId: secondaryCollectionId } }), 0, "Cross-tenant forged refund must not create refund evidence.");
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
  await runBondRefundRegression(browser);
  console.log("Bond Refund browser regression suite passed:");
  console.log("- Collections page exposed only the authenticated tenant's refundable bonds");
  console.log("- authorized partial refund persisted tenant-scoped collection and refund evidence");
  console.log("- refund status and remaining liability were updated without changing finance authority");
  console.log("- BOND_REFUND_PROCESSED audit evidence remained tenant scoped");
  console.log("- forged cross-tenant collection id could not create or apply a refund");
} catch (error) {
  console.error("Bond Refund browser regression suite failed.");
  console.error(error);
  process.exitCode = 1;
} finally {
  await cleanup().catch((error) => console.error("Bond Refund browser cleanup failed.", error));
  await browser.close();
  await prisma.$disconnect();
}
