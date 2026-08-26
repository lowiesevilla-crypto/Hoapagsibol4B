import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { Prisma, PrismaClient } from "@prisma/client";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const adminEmail = process.env.E2E_ADMIN_EMAIL || process.env.SEED_SYSTEM_ADMIN_EMAIL || "ci-system@example.invalid";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || process.env.SEED_SYSTEM_ADMIN_PASSWORD || "CI-Temporary-Password-2026!";
const primaryTenantId = "tenant_pagsibol4b_default";
const timeout = 45_000;
const runToken = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const originalPayee = `E2E Petty Payee ${runToken}`;
const originalParticular = `E2E Petty Cash ${runToken}`;
let voucherId = null;
let voucherNumber = null;

async function pathExists(path) {
  if (!path) return false;
  try { await access(path); return true; } catch { return false; }
}

function assertE2eDatabaseSafety() {
  const allowLocal = process.env.HOAHUB_E2E_ALLOW_LOCAL === "1";
  if (process.env.CI !== "true" && !allowLocal) {
    throw new Error("Petty Cash browser database operations are restricted to CI. Set HOAHUB_E2E_ALLOW_LOCAL=1 only for an explicit disposable local database run.");
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for the Petty Cash browser suite.");
  const host = new URL(databaseUrl).hostname;
  if (!allowLocal && !["127.0.0.1", "localhost", "mysql"].includes(host)) {
    throw new Error(`Refusing Petty Cash browser database operations against non-disposable host: ${host}`);
  }
}

async function resolveBrowserExecutable() {
  const candidates = [process.env.PUPPETEER_EXECUTABLE_PATH, process.env.CHROME_BIN, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"].filter(Boolean);
  for (const candidate of candidates) if (await pathExists(candidate)) return candidate;
  const packaged = await chromium.executablePath();
  if (await pathExists(packaged)) return packaged;
  throw new Error("No Chromium or Chrome executable is available for the Petty Cash browser suite.");
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

async function controlByLabel(page, labelText, control = "input") {
  const handle = await page.evaluateHandle(({ labelText, control }) => {
    const labels = Array.from(document.querySelectorAll("label"));
    const label = labels.find((item) => (item.textContent || "").replace(/\s+/g, " ").trim().startsWith(labelText));
    return label?.querySelector(control) || null;
  }, { labelText, control });
  const element = handle.asElement();
  if (!element) throw new Error(`Could not find ${control} for label ${labelText} on ${page.url()}`);
  return element;
}

async function clearAndTypeHandle(element, value) {
  await element.evaluate((node) => {
    node.value = "";
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
  });
  if (value) await element.type(value);
}

async function login(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle2", timeout });
  await page.type("#identifier", adminEmail);
  await page.type("#password", adminPassword);
  await clickByText(page, "button", "Sign in securely");
  await page.waitForFunction(() => window.location.pathname.startsWith("/admin/"), { timeout });
}

async function createPage(context) {
  const page = await context.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  page.setDefaultTimeout(timeout);
  page.on("pageerror", (error) => console.log(`[browser:pageerror] ${error.message}`));
  return page;
}

async function cleanup() {
  if (!voucherId && !voucherNumber) return;
  if (voucherId) {
    await prisma.$executeRaw(Prisma.sql`DELETE FROM PettyCashVoucherItem WHERE tenantId=${primaryTenantId} AND voucherId=${voucherId}`);
    await prisma.auditLog.deleteMany({ where: { tenantId: primaryTenantId, entityType: "PettyCashVoucher", entityId: voucherId } }).catch(() => undefined);
    await prisma.$executeRaw(Prisma.sql`DELETE FROM PettyCashVoucher WHERE tenantId=${primaryTenantId} AND id=${voucherId}`);
  }
  if (voucherNumber) await prisma.expense.deleteMany({ where: { tenantId: primaryTenantId, referenceNumber: voucherNumber } });
  await prisma.expenseCategory.deleteMany({ where: { tenantId: primaryTenantId, name: originalParticular } }).catch(() => undefined);
}

async function runPettyCashRegression(browser) {
  const employee = await prisma.employeeProfile.findFirst({ where: { tenantId: primaryTenantId, status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  assert.ok(employee, "Petty Cash search regression requires one active seeded employee in the disposable CI tenant.");

  const context = await browser.createBrowserContext();
  const page = await createPage(context);
  try {
    await login(page);
    await page.goto(`${baseUrl}/admin/petty-cash/new`, { waitUntil: "networkidle2", timeout });
    await expectText(page, "Create Petty Cash Voucher");

    await clickByText(page, "button", /^Other$/);
    const nameInput = await controlByLabel(page, "Name");
    await clearAndTypeHandle(nameInput, originalPayee);
    const addressInput = await controlByLabel(page, "Address");
    await clearAndTypeHandle(addressInput, "E2E Petty Cash Address");

    const particularSelect = await controlByLabel(page, "Particular 1", "select");
    await particularSelect.select("OTHER");
    const otherParticularInput = await controlByLabel(page, "Other particular");
    await clearAndTypeHandle(otherParticularInput, originalParticular);
    const amountInput = await controlByLabel(page, "Amount");
    await clearAndTypeHandle(amountInput, "1250.50");

    const navigation = page.waitForNavigation({ waitUntil: "networkidle2", timeout });
    await clickByText(page, "button[type='submit']", /Post|Save|Create/);
    await navigation;
    await page.waitForFunction(() => /^\/admin\/petty-cash\/[^/]+$/.test(window.location.pathname) && new URL(window.location.href).searchParams.get("success") === "created", { timeout });
    voucherId = page.url().match(/\/admin\/petty-cash\/([^?]+)/)?.[1] || null;
    assert.ok(voucherId, "Expected created Petty Cash voucher id in the detail URL.");

    const rows = await prisma.$queryRaw(Prisma.sql`SELECT voucherNumber, payeeName, totalAmount FROM PettyCashVoucher WHERE tenantId=${primaryTenantId} AND id=${voucherId} LIMIT 1`);
    assert.equal(rows.length, 1, "Expected one tenant-scoped Petty Cash voucher row.");
    voucherNumber = rows[0].voucherNumber;
    assert.equal(rows[0].payeeName, originalPayee);
    assert.equal(Number(rows[0].totalAmount), 1250.5);
    await expectText(page, voucherNumber, "created voucher number");
    await expectText(page, originalParticular, "created voucher particular");
    await expectText(page, "Print Half-A4 Voucher", "print action");
    assert.ok(await page.$(".petty-cash-print"), "Voucher detail must expose the Half-A4 print document container.");
    const printCss = await page.$eval("style", (node) => node.textContent || "");
    assert.match(printCss, /@page\s*\{\s*size:\s*A4 portrait/);

    await clickByText(page, "a", "Edit");
    await page.waitForFunction(() => window.location.pathname.endsWith("/edit"), { timeout });
    await expectText(page, "Save voucher changes");

    await clickByText(page, "button", /^Employee$/);
    await page.waitForSelector("#petty-edit-payee-search", { timeout });
    await page.type("#petty-edit-payee-search", employee.name);
    const editUrlBeforeEnter = page.url();
    await page.keyboard.press("Enter");
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal(page.url(), editUrlBeforeEnter, "Enter in Petty Cash payee search must not submit or navigate the form.");
    assert.equal(await page.$eval("input[name='payeeEntityId']", (node) => node.value), employee.id, "Enter must select the first matching tenant employee.");

    const editAmount = await controlByLabel(page, "Amount");
    await clearAndTypeHandle(editAmount, "1350.75");
    const updateNavigation = page.waitForNavigation({ waitUntil: "networkidle2", timeout });
    await clickByText(page, "button[type='submit']", "Save voucher changes");
    await updateNavigation;
    await page.waitForFunction(() => new URL(window.location.href).searchParams.get("success") === "updated", { timeout });

    const updatedRows = await prisma.$queryRaw(Prisma.sql`SELECT payeeType, payeeEntityId, payeeName, totalAmount FROM PettyCashVoucher WHERE tenantId=${primaryTenantId} AND id=${voucherId} LIMIT 1`);
    assert.equal(updatedRows.length, 1);
    assert.equal(updatedRows[0].payeeType, "EMPLOYEE");
    assert.equal(updatedRows[0].payeeEntityId, employee.id);
    assert.equal(updatedRows[0].payeeName, employee.name);
    assert.equal(Number(updatedRows[0].totalAmount), 1350.75);

    await page.goto(`${baseUrl}/admin/petty-cash`, { waitUntil: "networkidle2", timeout });
    await expectText(page, voucherNumber, "voucher in register");
    await expectText(page, employee.name, "edited payee in register");
  } finally {
    await context.close();
  }
}

assertE2eDatabaseSafety();
const executablePath = await resolveBrowserExecutable();
const headlessMode = "shell";
const browser = await puppeteer.launch({ executablePath, headless: headlessMode, args: await puppeteer.defaultArgs({ args: chromium.args, headless: headlessMode }) });

try {
  await runPettyCashRegression(browser);
  console.log("Petty Cash browser regression suite passed:");
  console.log("- voucher create persisted tenant-scoped expense evidence");
  console.log("- voucher detail exposed printable Half-A4 output");
  console.log("- edit search Enter selected a tenant employee without submitting");
  console.log("- explicit Save persisted edited payee and amount");
  console.log("- updated voucher remained visible in the register");
} catch (error) {
  console.error("Petty Cash browser regression suite failed.");
  console.error(error);
  process.exitCode = 1;
} finally {
  await cleanup().catch((error) => console.error("Petty Cash browser cleanup failed.", error));
  await browser.close();
  await prisma.$disconnect();
}
