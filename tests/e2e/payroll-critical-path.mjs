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
const employeeNumber = `PAY-E2E-${runToken}`.slice(0, 30);
const employeeName = `Payroll E2E Employee ${runToken}`;
let payrollId = null;
let employeeId = null;
let revisionId = null;
let testDates = null;

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
      "Payroll browser database operations are restricted to CI. Set HOAHUB_E2E_ALLOW_LOCAL=1 only for an explicit disposable local database run.",
    );
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for the payroll browser suite.");
  const host = new URL(databaseUrl).hostname;
  if (!allowLocal && !["127.0.0.1", "localhost", "mysql"].includes(host)) {
    throw new Error(`Refusing payroll browser database operations against non-disposable host: ${host}`);
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
  throw new Error("No Chromium or Chrome executable is available for the payroll browser suite.");
}

function addUtcDays(date, days) {
  const value = new Date(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value;
}

function inputDate(date) {
  return date.toISOString().slice(0, 10);
}

async function choosePayrollDates() {
  const rule = await prisma.payrollStatutoryRuleSet.findFirst({
    where: { active: true, jurisdiction: "PH" },
    orderBy: { effectiveFrom: "desc" },
  });
  assert.ok(rule, "Expected an active Philippine statutory rule set in the CI database.");

  for (let offset = 7; offset <= 1800; offset += 17) {
    const startDate = addUtcDays(rule.effectiveFrom, offset);
    const endDate = addUtcDays(startDate, 14);
    if (rule.effectiveTo && endDate > rule.effectiveTo) break;
    const existing = await prisma.payrollPeriod.findUnique({
      where: { tenantId_startDate_endDate: { tenantId: primaryTenantId, startDate, endDate } },
      select: { id: true },
    });
    if (!existing) return { startDate, endDate, payDate: endDate, statutoryRuleSetId: rule.id };
  }

  throw new Error("Could not find an unused payroll cutoff inside the active statutory rule range.");
}

async function pageText(page) {
  return page.evaluate(() => document.body?.textContent || "");
}

function checkpoint(label, page) {
  console.log(`[payroll-e2e] ${label}${page ? ` | ${page.url()}` : ""}`);
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
    throw new Error(`Expected ${label} on ${page.url()}. Page text: ${body.slice(0, 2500)}`, { cause: error });
  }
}

async function findExactSubmitButton(page, expectedText) {
  const buttons = await page.$$("button[type='submit']");
  for (const button of buttons) {
    const text = (await button.evaluate((node) => node.textContent || "")).replace(/\s+/g, " ").trim();
    if (text === expectedText) return button;
  }
  return null;
}

async function clickExactSubmitButton(page, expectedText) {
  const button = await findExactSubmitButton(page, expectedText);
  if (!button) {
    const body = (await pageText(page)).replace(/\s+/g, " ").trim();
    throw new Error(`No submit button exactly matched ${expectedText} on ${page.url()}. Page text: ${body.slice(0, 2500)}`);
  }
  await button.click();
}

async function expectNoExactSubmitButton(page, expectedText) {
  const button = await findExactSubmitButton(page, expectedText);
  assert.equal(button, null, `Did not expect an actionable ${expectedText} submit button on ${page.url()}`);
}

async function setDateInput(page, selector, value) {
  await page.waitForSelector(selector, { timeout });
  const state = await page.$eval(
    selector,
    (element, nextValue) => {
      element.value = nextValue;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return { value: element.value, badInput: element.validity.badInput, valid: element.validity.valid };
    },
    value,
  );
  assert.equal(state.value, value, `Expected ${selector} to contain canonical date value ${value}.`);
  assert.equal(state.badInput, false, `Expected ${selector} to reject browser bad-input state.`);
  assert.equal(state.valid, true, `Expected ${selector} to be valid before payroll submission.`);
}

async function waitForUrlParam(page, key, expectedValue, label) {
  try {
    await page.waitForFunction(
      (paramKey, value) => new URL(window.location.href).searchParams.get(paramKey) === value,
      { timeout },
      key,
      expectedValue,
    );
  } catch (error) {
    const body = (await pageText(page)).replace(/\s+/g, " ").trim();
    throw new Error(`Timed out waiting for ${label} on ${page.url()}. Page text: ${body.slice(0, 2500)}`, { cause: error });
  }
}

async function waitForDatabase(predicate, label) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeout) {
    try {
      if (await predicate()) return;
      lastError = null;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for database evidence: ${label}`, lastError ? { cause: lastError } : undefined);
}

async function login(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle2", timeout });
  await page.waitForSelector("#identifier", { timeout });
  await page.type("#identifier", adminEmail);
  await page.type("#password", adminPassword);
  const buttons = await page.$$("button");
  let signedIn = false;
  for (const button of buttons) {
    const text = (await button.evaluate((node) => node.textContent || "")).replace(/\s+/g, " ").trim();
    if (text.includes("Sign in securely")) {
      await button.click();
      signedIn = true;
      break;
    }
  }
  assert.ok(signedIn, "Expected the secure sign-in button.");
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

async function provisionEmployee(dates) {
  const administrator = await prisma.user.findFirst({
    where: { tenantId: primaryTenantId, email: adminEmail },
    select: { id: true },
  });
  assert.ok(administrator, "Expected the seeded CI administrator before provisioning payroll data.");

  const hireDate = addUtcDays(dates.startDate, -30);
  const employee = await prisma.employeeProfile.create({
    data: {
      tenantId: primaryTenantId,
      employeeNumber,
      name: employeeName,
      position: "Payroll Browser Regression",
      phone: "09178880001",
      address: "Payroll E2E Test Address",
      hireDate,
      salaryType: "MONTHLY",
      baseRate: 20000,
      standardWorkDays: 26,
      fixedAllowance: 0,
      fixedDeduction: 0,
      status: "ACTIVE",
      compensations: {
        create: {
          tenantId: primaryTenantId,
          effectiveFrom: hireDate,
          compensationBasis: "MONTHLY",
          payFrequency: "SEMI_MONTHLY",
          attendancePolicy: "NOT_REQUIRED",
          rate: 20000,
          standardWorkDays: 26,
          standardHoursPerDay: 8,
          fixedAllowance: 0,
          fixedDeduction: 0,
          createdById: administrator.id,
        },
      },
    },
  });
  employeeId = employee.id;
}

async function resolveCleanupPayrollId() {
  if (payrollId) return payrollId;
  if (!testDates) return null;
  const period = await prisma.payrollPeriod.findUnique({
    where: {
      tenantId_startDate_endDate: {
        tenantId: primaryTenantId,
        startDate: testDates.startDate,
        endDate: testDates.endDate,
      },
    },
    select: { id: true },
  });
  return period?.id ?? null;
}

async function cleanup() {
  const targetPayrollId = await resolveCleanupPayrollId();
  if (targetPayrollId) {
    const revisions = await prisma.payrollCalculationRevision.findMany({
      where: { tenantId: primaryTenantId, payrollId: targetPayrollId },
      select: { id: true },
    });
    const revisionIds = revisions.map((item) => item.id);
    if (revisionIds.length) {
      await prisma.auditLog.deleteMany({
        where: { tenantId: primaryTenantId, entityId: { in: revisionIds } },
      });
    }
    await prisma.auditLog.deleteMany({
      where: { tenantId: primaryTenantId, entityId: targetPayrollId },
    });
    await prisma.payrollCalculationRevision.deleteMany({ where: { tenantId: primaryTenantId, payrollId: targetPayrollId } });
    await prisma.payrollDeduction.deleteMany({ where: { tenantId: primaryTenantId, payrollId: targetPayrollId } });
    await prisma.payslip.deleteMany({ where: { tenantId: primaryTenantId, payrollId: targetPayrollId } });
    await prisma.payrollPeriod.deleteMany({ where: { tenantId: primaryTenantId, id: targetPayrollId } });
  }
  if (employeeId) {
    await prisma.employeeCompensation.deleteMany({ where: { tenantId: primaryTenantId, employeeId } });
    await prisma.employeeProfile.deleteMany({ where: { tenantId: primaryTenantId, id: employeeId } });
  }
}

async function fetchPeriod(dates) {
  return prisma.payrollPeriod.findUnique({
    where: {
      tenantId_startDate_endDate: {
        tenantId: primaryTenantId,
        startDate: dates.startDate,
        endDate: dates.endDate,
      },
    },
    include: {
      payslips: { where: { employeeId }, include: { employee: true } },
      revisions: true,
    },
  });
}

async function runPayrollFlow(browser, dates) {
  const context = await browser.createBrowserContext();
  const page = await createPage(context);
  try {
    checkpoint("login", page);
    await login(page);
    await page.goto(`${baseUrl}/admin/payroll/periods`, { waitUntil: "networkidle2", timeout });
    await expectText(page, "Calculate payroll period");
    await expectText(page, "Confidential payroll module");

    checkpoint("calculate payroll", page);
    await setDateInput(page, "input[name='startDate']", inputDate(dates.startDate));
    await setDateInput(page, "input[name='endDate']", inputDate(dates.endDate));
    await setDateInput(page, "input[name='payDate']", inputDate(dates.payDate));
    await clickExactSubmitButton(page, "Calculate payroll");
    await waitForUrlParam(page, "success", "calculated", "successful payroll calculation redirect");

    let period = await fetchPeriod(dates);
    assert.ok(period, "Expected payroll period created through the Admin browser workflow.");
    payrollId = period.id;

    await expectText(page, employeeName, "calculated employee payslip row");
    await expectText(page, "Total payroll amount");
    assert.equal(period.tenantId, primaryTenantId);
    assert.equal(period.status, "CALCULATED");
    assert.equal(period.statutoryRuleSetId, dates.statutoryRuleSetId);
    assert.equal(period.payslips.length, 1, "Expected exactly one payslip for the disposable payroll employee.");
    assert.equal(Number(period.payslips[0].basicPay), 10000, "Semi-monthly PHP 20,000 salary should produce PHP 10,000 basic pay.");
    assert.equal(Number(period.payslips[0].grossPay), 10000, "No allowance or OT should keep gross pay at PHP 10,000.");
    assert.ok(Number(period.payslips[0].netPay) > 0 && Number(period.payslips[0].netPay) <= 10000, "Net pay must be positive and no greater than gross pay.");
    assert.equal(period.revisions.length, 0, "Calculated payroll must not create immutable finalization evidence yet.");

    checkpoint("verify duplicate-safe recalculation", page);
    const generateAuditCountBefore = await prisma.auditLog.count({
      where: { tenantId: primaryTenantId, entityId: payrollId, action: "GENERATE_PAYROLL" },
    });
    await setDateInput(page, "input[name='startDate']", inputDate(dates.startDate));
    await setDateInput(page, "input[name='endDate']", inputDate(dates.endDate));
    await setDateInput(page, "input[name='payDate']", inputDate(dates.payDate));
    await clickExactSubmitButton(page, "Calculate payroll");
    await waitForDatabase(
      async () => (await prisma.auditLog.count({ where: { tenantId: primaryTenantId, entityId: payrollId, action: "GENERATE_PAYROLL" } })) > generateAuditCountBefore,
      "second payroll generation audit entry",
    );
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 5_000 }).catch(() => undefined);

    const duplicateCount = await prisma.payrollPeriod.count({
      where: { tenantId: primaryTenantId, startDate: dates.startDate, endDate: dates.endDate },
    });
    assert.equal(duplicateCount, 1, "Repeated calculation of the same mutable cutoff must not create a duplicate payroll period.");
    const payslipCount = await prisma.payslip.count({ where: { tenantId: primaryTenantId, payrollId, employeeId } });
    assert.equal(payslipCount, 1, "Repeated calculation must upsert rather than duplicate the employee payslip.");

    checkpoint("finalize payroll", page);
    await clickExactSubmitButton(page, "Finalize");
    await waitForUrlParam(page, "success", "finalized", "successful payroll finalization redirect");
    await expectText(page, "Finalized and ready to post.");
    await expectText(page, "Revision 1");
    await expectText(page, "Post to Financial Engine");
    await expectNoExactSubmitButton(page, "Finalize");

    checkpoint("verify immutable finalization evidence", page);
    period = await prisma.payrollPeriod.findFirst({
      where: { id: payrollId, tenantId: primaryTenantId },
      include: {
        revisions: { include: { payslips: true }, orderBy: { revisionNumber: "asc" } },
        payslips: { where: { employeeId } },
      },
    });
    assert.ok(period, "Expected finalized payroll period to remain tenant scoped.");
    assert.equal(period.status, "FINALIZED");
    assert.equal(period.revisions.length, 1, "Finalization must create exactly one immutable revision.");
    revisionId = period.revisions[0].id;
    assert.equal(period.revisions[0].revisionNumber, 1);
    assert.equal(period.revisions[0].revisionType, "INITIAL");
    assert.equal(period.revisions[0].lifecycleStatus, "FINALIZED");
    assert.equal(
      period.revisions[0].payslips.filter((item) => item.employeeId === employeeId).length,
      1,
      "Immutable revision must snapshot the disposable employee payslip.",
    );

    const finalizedPayslip = period.payslips[0];
    assert.ok(finalizedPayslip?.statutorySnapshot, "Finalized payslip must retain statutory calculation evidence.");
    assert.ok(finalizedPayslip?.compensationSnapshot, "Finalized payslip must retain compensation calculation evidence.");
    checkpoint("payroll lifecycle verified", page);
  } finally {
    await context.close();
  }
}

assertE2eDatabaseSafety();
const dates = await choosePayrollDates();
testDates = dates;
await provisionEmployee(dates);
const executablePath = await resolveBrowserExecutable();
const headlessMode = "shell";
const browser = await puppeteer.launch({
  executablePath,
  headless: headlessMode,
  args: await puppeteer.defaultArgs({ args: chromium.args, headless: headlessMode }),
});

try {
  await runPayrollFlow(browser, dates);
  console.log("Payroll critical browser regression suite passed:");
  console.log("- authorized payroll module access passed");
  console.log("- payroll calculation created the tenant-scoped cutoff and payslip");
  console.log("- deterministic semi-monthly basic/gross pay assertions passed");
  console.log("- repeated calculation completed and remained duplicate-safe");
  console.log("- finalization created immutable revision evidence");
  console.log("- finalized payroll exposed the controlled Financial Engine next step and removed the finalize action");
} catch (error) {
  console.error("Payroll critical browser regression suite failed.");
  console.error(error);
  process.exitCode = 1;
} finally {
  try {
    await cleanup();
  } catch (error) {
    console.error("Payroll browser cleanup failed.", error);
    process.exitCode = 1;
  }
  await browser.close();
  await prisma.$disconnect();
}
