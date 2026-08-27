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
const timeout = 45_000;
const runToken = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const employeeNumber = `E2E-${runToken}`.slice(0, 40);
const employeeName = `E2E Employee ${runToken}`;
const originalEmail = `e2e-employee-${runToken}@example.invalid`;
const updatedPhone = "09179990002";
let createdEmployeeId = null;

async function pathExists(path) {
  if (!path) return false;
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function assertE2eDatabaseSafety() {
  const allowLocal = process.env.HOAHUB_E2E_ALLOW_LOCAL === "1";
  if (process.env.CI !== "true" && !allowLocal) {
    throw new Error(
      "Employee browser database operations are restricted to CI. Set HOAHUB_E2E_ALLOW_LOCAL=1 only for an explicit disposable local database run.",
    );
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for the employee browser suite.");
  const host = new URL(databaseUrl).hostname;
  if (!allowLocal && !["127.0.0.1", "localhost", "mysql"].includes(host)) {
    throw new Error(`Refusing employee browser database operations against non-disposable host: ${host}`);
  }
}

async function resolveBrowserExecutable() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_BIN,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate;
  }
  const packaged = await chromium.executablePath();
  if (await pathExists(packaged)) return packaged;
  throw new Error("No Chromium or Chrome executable is available for the employee browser suite.");
}

async function pageText(page) {
  return page.evaluate(() => document.body?.textContent || "");
}

async function expectText(page, text, label = text) {
  try {
    await page.waitForFunction(
      (expected) => (document.body?.textContent || "").includes(expected),
      { timeout },
      text,
    );
  } catch (error) {
    const body = (await pageText(page)).replace(/\s+/g, " ").trim();
    throw new Error(`Expected ${label} on ${page.url()}. Page text: ${body.slice(0, 2000)}`, { cause: error });
  }
}

async function clickByText(page, selector, matcher) {
  const elements = await page.$$(selector);
  for (const element of elements) {
    const text = (await element.evaluate((node) => node.textContent || "")).replace(/\s+/g, " ").trim();
    const matches = typeof matcher === "string" ? text.includes(matcher) : matcher.test(text);
    if (matches) {
      await element.click();
      return;
    }
  }
  throw new Error(`No ${selector} matched ${String(matcher)} on ${page.url()}`);
}

async function clearAndType(page, selector, value) {
  await page.waitForSelector(selector, { timeout });
  await page.$eval(selector, (element) => {
    element.value = "";
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  if (value) await page.type(selector, value);
}

async function clickAndWaitForNavigation(page, selector, matcher) {
  const navigation = page.waitForNavigation({ waitUntil: "networkidle2", timeout }).catch(() => null);
  await clickByText(page, selector, matcher);
  await navigation;
}

async function login(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle2", timeout });
  await page.waitForSelector("#identifier", { timeout });
  await page.type("#identifier", adminEmail);
  await page.type("#password", adminPassword);
  await clickByText(page, "button", "Sign in securely");
  await page.waitForFunction(() => window.location.pathname.startsWith("/admin/"), { timeout });
  await page.waitForNetworkIdle({ idleTime: 500, timeout }).catch(() => undefined);
}

async function createPage(context) {
  const page = await context.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  page.setDefaultTimeout(timeout);
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) console.log(`[browser:${message.type()}] ${message.text()}`);
  });
  page.on("pageerror", (error) => console.log(`[browser:pageerror] ${error.message}`));
  return page;
}

async function cleanupEmployee() {
  if (!createdEmployeeId) return;
  await prisma.employeeCompensation.deleteMany({ where: { employeeId: createdEmployeeId } });
  await prisma.employeeProfile.deleteMany({ where: { id: createdEmployeeId, tenantId: primaryTenantId } });
  await prisma.auditLog.deleteMany({
    where: {
      tenantId: primaryTenantId,
      entityType: "EmployeeProfile",
      entityId: createdEmployeeId,
    },
  }).catch(() => undefined);
}

async function runEmployeeCreateAndEdit(browser) {
  const context = await browser.createBrowserContext();
  const page = await createPage(context);
  try {
    await login(page);

    await page.goto(`${baseUrl}/admin/employees/new`, { waitUntil: "networkidle2", timeout });
    await expectText(page, "Add an employee");

    await clearAndType(page, "#employeeNumber", employeeNumber);
    await clearAndType(page, "#name", employeeName);
    await clearAndType(page, "#position", "E2E Quality Specialist");
    await clearAndType(page, "#phone", "09179990001");
    await clearAndType(page, "#email", originalEmail);
    await clearAndType(page, "#address", "E2E Employee Test Address");

    assert.equal(
      await page.$eval("input[name='createEmployeeLogin']", (element) => element.checked),
      false,
      "The browser regression intentionally creates an employee without a login account.",
    );

    await clickAndWaitForNavigation(page, "button[type='submit']", "Create employee");
    await page.waitForFunction(
      () => window.location.pathname === "/admin/employees" && new URL(window.location.href).searchParams.get("success") === "created",
      { timeout },
    );
    await expectText(page, employeeName, "newly created employee in the employee list");

    await clearAndType(page, "input[name='q']", employeeNumber);
    await clickAndWaitForNavigation(page, "button[type='submit']", "Search");
    await expectText(page, "Showing 1-1 of 1", "server-side employee search result count");
    await expectText(page, employeeName, "server-side employee search result");

    const created = await prisma.employeeProfile.findFirst({
      where: { tenantId: primaryTenantId, employeeNumber },
      include: { compensations: { orderBy: { effectiveFrom: "asc" } } },
    });
    assert.ok(created, "Expected the employee created through the Admin browser workflow to persist.");
    createdEmployeeId = created.id;
    assert.equal(created.email, originalEmail);
    assert.equal(created.compensations.length, 1, "New employee creation must persist exactly one initial compensation row.");
    assert.equal(Number(created.compensations[0].rate), 18000);
    assert.equal(Number(created.compensations[0].fixedAllowance), 0);
    assert.equal(Number(created.compensations[0].fixedDeduction), 0);

    await page.goto(`${baseUrl}/admin/employees/${created.id}`, { waitUntil: "networkidle2", timeout });
    await expectText(page, employeeName, "employee edit page");

    await clearAndType(page, "#email", "");
    await clearAndType(page, "#phone", updatedPhone);
    await clearAndType(page, "#address", "Updated E2E Employee Test Address");

    await clickAndWaitForNavigation(page, "button[type='submit']", "Save changes");
    await page.waitForFunction(
      () => window.location.pathname === "/admin/employees" && new URL(window.location.href).searchParams.get("success") === "saved",
      { timeout },
    );
    await expectText(page, employeeName, "updated employee in the employee list");

    const updated = await prisma.employeeProfile.findFirst({
      where: { id: created.id, tenantId: primaryTenantId },
      include: { compensations: { orderBy: { effectiveFrom: "asc" } } },
    });
    assert.ok(updated, "Expected the edited employee to remain tenant scoped.");
    assert.equal(updated.email, null, "Clearing optional employee email must persist as null.");
    assert.equal(updated.phone, updatedPhone);
    assert.equal(updated.address, "Updated E2E Employee Test Address");
    assert.equal(
      updated.compensations.length,
      1,
      "Editing identity-only fields must not create a duplicate payroll compensation version.",
    );
    assert.equal(Number(updated.compensations[0].fixedAllowance), 0, "Valid zero fixed allowance must be preserved.");
    assert.equal(Number(updated.compensations[0].fixedDeduction), 0, "Valid zero fixed deduction must be preserved.");
  } finally {
    await context.close();
  }
}

assertE2eDatabaseSafety();
const executablePath = await resolveBrowserExecutable();
const headlessMode = "shell";
const browser = await puppeteer.launch({
  executablePath,
  headless: headlessMode,
  args: await puppeteer.defaultArgs({ args: chromium.args, headless: headlessMode }),
});

try {
  await runEmployeeCreateAndEdit(browser);
  console.log("Employee browser regression suite passed:");
  console.log("- administrator employee creation persisted");
  console.log("- initial compensation persisted exactly once");
  console.log("- employee edit saved identity-only changes");
  console.log("- clearing optional email persisted as null");
  console.log("- valid zero payroll fields remained preserved");
  console.log("- identity-only edit did not create duplicate compensation history");
} catch (error) {
  console.error("Employee browser regression suite failed.");
  console.error(error);
  process.exitCode = 1;
} finally {
  await cleanupEmployee().catch((error) => console.error("Employee browser cleanup failed.", error));
  await browser.close();
  await prisma.$disconnect();
}
