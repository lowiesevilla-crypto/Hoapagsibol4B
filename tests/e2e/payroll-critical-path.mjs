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

async function expectNoText(page, text, label = text) {
  const body = await pageText(page);
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.ok(!new RegExp(`\\b${escaped}\\b`).test(body), `Did not expect ${label} on ${page.url()}`);
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

async function cleanup() {
  if (payrollId) {
    if (revisionId) {
      await prisma.auditLog.deleteMany({
        where: { tenantId: primaryTenantId, entityId: revisionId },
      }).catch(() => undefined);
    }
    await prisma.auditLog.deleteMany({
      where: { tenantId: primaryTenantId, entityId: payrollId },
    }).catch(() => undefined);
    await prisma.payrollCalculationRevision.deleteMany({ where: { tenantId: primaryTenantId, payrollId } });
    await prisma.payrollDeduction.deleteMany({ where: { tenantId: primaryTenantId, payrollId } });
    await prisma.payslip.deleteMany({ where: { tenantId: primaryTenantId, payrollId } });
    await prisma.payrollPeriod.deleteMany({ where: { tenantId: primaryTenantId, id: payrollId } });
  }
  if (employeeId) {
    await prisma.employeeCompensation.deleteMany({ where: { tenantId: primaryTenantId, employeeId } });
    await prisma.employeeProfile.deleteMany({ where: { tenantId: primaryTenantId, id: employeeId } });
  }
}

async function runPayrollFlow(browser, dates) {
  const context = await browser.createBrowserContext();
  const page = await createPage(context);
  try {
    await login(page);
    await page.goto(`${baseUrl}/admin/payroll/periods`, { waitUntil: "networkidle2", timeout });
    await expectText(page, "Calculate payroll period");
    await expectText(page, "Confidential payroll module");

    await clearAndType(page, "input[name='startDate']", inputDate(dates.startDate));
    await clearAndType(page, "input[name='endDate']", inputDate(dates.endDate));
    await clearAndType(page, "input[name='payDate']", inputDate(dates.payDate));
    await clickAndWaitForNavigation(page, "button[type='submit']", "Calculate payroll");
    await page.waitForFunction(
      () => new URL(window.location.href).searchParams.get("success") === "calculated",
      { timeout },
    );
    await expectText(page, employeeName, "calculated employee payslip row");
    await expectText(page, "Total payroll amount");

    let period = await prisma.payrollPeriod.findUnique({
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
    assert.ok(period, "Expected payroll period created through the Admin browser workflow.");
    payrollId = period.id;
    assert.equal(period.tenantId, primaryTenantId);
    assert.equal(period.status, "CALCULATED");
    assert.equal(period.statutoryRuleSetId, dates.statutoryRuleSetId);
    assert.equal(period.payslips.length, 1, "Expected exactly one payslip for the disposable payroll employee.");
    assert.equal(Number(period.payslips[0].basicPay), 10000, "Semi-monthly PHP 20,000 salary should produce PHP 10,000 basic pay.");
    assert.equal(Number(period.payslips[0].grossPay), 10000, "No allowance or OT should keep gross pay at PHP 10,000.");
    assert.ok(Number(period.payslips[0].netPay) > 0 && Number(period.payslips[0].netPay) <= 10000, "Net pay must be positive and no greater than gross pay.");
    assert.equal(period.revisions.length, 0, "Calculated payroll must not create immutable finalization evidence yet.");

    // Re-submit the same cutoff before finalization. The domain contract is to recalculate
    // the existing mutable period instead of creating a duplicate payroll run.
    await clearAndType(page, "input[name='startDate']", inputDate(dates.startDate));
    await clearAndType(page, "input[name='endDate']", inputDate(dates.endDate));
    await clearAndType(page, "input[name='payDate']", inputDate(dates.payDate));
    await clickAndWaitForNavigation(page, "button[type='submit']", "Calculate payroll");
    const duplicateCount = await prisma.payrollPeriod.count({
      where: { tenantId: primaryTenantId, startDate: dates.startDate, endDate: dates.endDate },
    });
    assert.equal(duplicateCount, 1, "Repeated calculation of the same mutable cutoff must not create a duplicate payroll period.");
    const payslipCount = await prisma.payslip.count({ where: { tenantId: primaryTenantId, payrollId, employeeId } });
    assert.equal(payslipCount, 1, "Repeated calculation must upsert rather than duplicate the employee payslip.");

    await clickAndWaitForNavigation(page, "button[type='submit']", "Finalize");
    await page.waitForFunction(
      () => new URL(window.location.href).searchParams.get("success") === "finalized",
      { timeout },
    );
    await expectText(page, "Finalized and ready to post.");
    await expectText(page, "Revision 1");
    await expectText(page, "Post to Financial Engine");
    await expectNoText(page, "Finalize", "finalize action after payroll is locked");

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
    assert.equal(period.revisions[0].payslips.filter((item) => item.employeeId === employeeId).length, 1, "Immutable revision must snapshot the disposable employee payslip.");

    const finalizedPayslip = period.payslips[0];
    assert.ok(finalizedPayslip?.statutorySnapshot, "Finalized payslip must retain statutory calculation evidence.");
    assert.ok(finalizedPayslip?.compensationSnapshot, "Finalized payslip must retain compensation calculation evidence.");
  } finally {
    await context.close();
  }
}

assertE2eDatabaseSafety();
const dates = await choosePayrollDates();
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
  console.log("- repeated calculation remained duplicate-safe");
  console.log("- finalization created immutable revision evidence");
  console.log("- finalized payroll exposed the controlled Financial Engine next step and removed the finalize action");
} catch (error) {
  console.error("Payroll critical browser regression suite failed.");
  console.error(error);
  process.exitCode = 1;
} finally {
  await cleanup().catch((error) => console.error("Payroll browser cleanup failed.", error));
  await browser.close();
  await prisma.$disconnect();
}