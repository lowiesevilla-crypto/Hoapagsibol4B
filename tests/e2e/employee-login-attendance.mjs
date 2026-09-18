import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { hash } from "bcryptjs";
import { PrismaClient, Role, TenantModule, TenantSubscriptionStatus } from "@prisma/client";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const primaryTenantId = "tenant_pagsibol4b_default";
const timeout = 45_000;
const runToken = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const sharedEmail = `employee-attendance-${runToken}@example.invalid`;
const password = "Employee-E2E-2026!";
const secondaryTenantSlug = `employee-e2e-${runToken}`.slice(0, 48);
const orphanEmail = `employee-orphan-${runToken}@example.invalid`;

let primaryUserId = null;
let primaryEmployeeId = null;
let secondaryTenantId = null;
let secondaryUserId = null;
let secondaryEmployeeId = null;
let orphanUserId = null;

function assertE2eDatabaseSafety() {
  const allowLocal = process.env.HOAHUB_E2E_ALLOW_LOCAL === "1";
  if (process.env.CI !== "true" && !allowLocal) {
    throw new Error("Employee login/attendance browser regression is restricted to CI/disposable local databases.");
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  const host = new URL(databaseUrl).hostname;
  if (!allowLocal && !["127.0.0.1", "localhost", "mysql"].includes(host)) {
    throw new Error(`Refusing employee login/attendance regression against non-disposable host: ${host}`);
  }
}

async function pathExists(path) {
  if (!path) return false;
  try { await access(path); return true; } catch { return false; }
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
  for (const candidate of candidates) if (await pathExists(candidate)) return candidate;
  const packaged = await chromium.executablePath();
  if (await pathExists(packaged)) return packaged;
  throw new Error("No Chromium or Chrome executable is available.");
}

async function clickByText(page, selector, matcher) {
  const elements = await page.$$(selector);
  for (const element of elements) {
    const value = (await element.evaluate((node) => node.textContent || "")).replace(/\s+/g, " ").trim();
    const matches = typeof matcher === "string" ? value.includes(matcher) : matcher.test(value);
    if (matches) {
      await element.click();
      return;
    }
  }
  throw new Error(`No ${selector} matched ${String(matcher)} on ${page.url()}`);
}

async function createPage(context) {
  const page = await context.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.setDefaultTimeout(timeout);
  page.on("pageerror", (error) => console.log(`[employee-attendance:pageerror] ${error.message}`));
  return page;
}

async function seedFixtures() {
  const passwordHash = await hash(password, 12);
  const primaryEntitlements = await prisma.tenantModuleEntitlement.findMany({
    where: {
      tenantId: primaryTenantId,
      module: { in: [TenantModule.PAYROLL, TenantModule.ATTENDANCE, TenantModule.CHAT] },
      enabled: true,
    },
    select: { module: true },
  });
  const enabled = new Set(primaryEntitlements.map((item) => item.module));
  for (const module of [TenantModule.PAYROLL, TenantModule.ATTENDANCE, TenantModule.CHAT]) {
    assert.ok(enabled.has(module), `Default CI tenant must enable ${module} for employee self-service regression.`);
  }

  const primaryUser = await prisma.user.create({
    data: {
      tenantId: primaryTenantId,
      name: `Primary Employee ${runToken}`,
      email: sharedEmail,
      passwordHash,
      role: Role.EMPLOYEE,
      active: true,
    },
  });
  primaryUserId = primaryUser.id;

  const primaryEmployee = await prisma.employeeProfile.create({
    data: {
      tenantId: primaryTenantId,
      userId: primaryUser.id,
      employeeNumber: `EL-${runToken}`.slice(0, 30),
      name: primaryUser.name,
      position: "Attendance E2E",
      email: sharedEmail,
      phone: "09179991001",
      address: "Primary tenant E2E employee",
      hireDate: new Date("2026-01-01T00:00:00.000Z"),
      salaryType: "MONTHLY",
      baseRate: 18000,
      standardWorkDays: 26,
      fixedAllowance: 0,
      fixedDeduction: 0,
      status: "ACTIVE",
    },
  });
  primaryEmployeeId = primaryEmployee.id;

  const isolationPlan = await prisma.subscriptionPlan.findFirst({
    where: {
      active: true,
      AND: [
        { modules: { some: { module: TenantModule.PAYROLL, enabled: true } } },
        { modules: { some: { module: TenantModule.ATTENDANCE, enabled: true } } },
        { modules: { some: { module: TenantModule.CHAT, enabled: true } } },
      ],
    },
    select: { id: true, code: true },
    orderBy: { updatedAt: "desc" },
  });
  assert.ok(isolationPlan, "CI must provide an active plan with PAYROLL, ATTENDANCE, and CHAT for the isolation tenant.");

  const secondaryTenant = await prisma.tenant.create({
    data: {
      name: `Employee Isolation Tenant ${runToken}`,
      shortName: `EIT-${runToken}`.slice(0, 30),
      slug: secondaryTenantSlug,
      status: "ACTIVE",
      subscriptionPlan: isolationPlan.code,
      subscriptionStatus: TenantSubscriptionStatus.ACTIVE,
      subscriptions: {
        create: {
          planId: isolationPlan.id,
          status: TenantSubscriptionStatus.ACTIVE,
        },
      },
      moduleEntitlements: {
        create: [
          { module: TenantModule.PAYROLL, enabled: true },
          { module: TenantModule.ATTENDANCE, enabled: true },
          { module: TenantModule.CHAT, enabled: true },
        ],
      },
    },
  });
  secondaryTenantId = secondaryTenant.id;

  const secondaryUser = await prisma.user.create({
    data: {
      tenantId: secondaryTenant.id,
      name: `Secondary Employee ${runToken}`,
      email: sharedEmail,
      passwordHash,
      role: Role.EMPLOYEE,
      active: true,
    },
  });
  secondaryUserId = secondaryUser.id;

  const secondaryEmployee = await prisma.employeeProfile.create({
    data: {
      tenantId: secondaryTenant.id,
      userId: secondaryUser.id,
      employeeNumber: `ES-${runToken}`.slice(0, 30),
      name: secondaryUser.name,
      position: "Attendance E2E",
      email: sharedEmail,
      phone: "09179991002",
      address: "Secondary tenant E2E employee",
      hireDate: new Date("2026-01-01T00:00:00.000Z"),
      salaryType: "MONTHLY",
      baseRate: 18000,
      standardWorkDays: 26,
      fixedAllowance: 0,
      fixedDeduction: 0,
      status: "ACTIVE",
    },
  });
  secondaryEmployeeId = secondaryEmployee.id;

  const orphan = await prisma.user.create({
    data: {
      tenantId: primaryTenantId,
      name: `Orphan Employee Login ${runToken}`,
      email: orphanEmail,
      passwordHash,
      role: Role.EMPLOYEE,
      active: true,
    },
  });
  orphanUserId = orphan.id;
}

async function loginAndSelectTenant(page, userId) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle2", timeout });
  await page.waitForSelector("#identifier", { timeout });
  await page.type("#identifier", sharedEmail);
  await page.type("#password", password);
  await clickByText(page, "button", "Sign in securely");

  await page.waitForSelector('input[name="selectedUserId"]', { timeout });
  await page.$eval(
    'input[name="selectedUserId"]',
    (first, targetUserId) => {
      const candidates = [...document.querySelectorAll('input[name="selectedUserId"]')];
      const target = candidates.find((node) => node.value === targetUserId);
      if (!target) throw new Error(`Tenant choice for user ${targetUserId} was not rendered.`);
      target.click();
    },
    userId,
  );
  await clickByText(page, "button", "Open selected account");
  await page.waitForFunction(() => window.location.pathname === "/employee/attendance", { timeout });
  await page.waitForNetworkIdle({ idleTime: 300, timeout }).catch(() => undefined);
}

async function expectPunchButton(page, label) {
  await page.waitForFunction(
    (expected) => [...document.querySelectorAll("form[data-employee-clock-ready=\"true\"] button")]
      .some((button) => !button.disabled && (button.textContent || "").includes(expected)),
    { timeout },
    label,
  );
}

async function clickPunchAndWait(page, label, successCode) {
  await clickByText(page, "button", label);
  try {
    await page.waitForFunction(
      (expected) => {
        const success = window.location.pathname === "/employee/attendance"
          && new URL(window.location.href).searchParams.get("success") === expected;
        const alert = document.querySelector('form[data-employee-clock-ready="true"] [role="alert"]');
        // Global success toasts also use role="alert". Only the punch form's
        // own alert represents a punch failure; otherwise wait for the
        // canonical success URL.
        return success || Boolean(alert?.textContent?.trim());
      },
      { timeout },
      successCode,
    );
  } catch (error) {
    const body = (await page.evaluate(() => document.body?.textContent || "")).replace(/\s+/g, " ").trim();
    throw new Error(`Punch ${label} did not complete on ${page.url()}. Page text: ${body.slice(0, 2400)}`, { cause: error });
  }

  const alertText = await page.$eval('form[data-employee-clock-ready="true"] [role="alert"]', (node) => node.textContent || "").catch(() => "");
  if (alertText.trim()) throw new Error(`Punch ${label} returned an error on ${page.url()}: ${alertText.trim()}`);

  const success = new URL(page.url()).searchParams.get("success");
  if (success !== successCode) {
    const statusText = await page.$eval('[role="status"]', (node) => node.textContent || "").catch(() => "");
    throw new Error(`Punch ${label} committed but navigation did not reach ${successCode}. Current URL: ${page.url()}. Status: ${statusText.trim()}`);
  }

  await page.waitForNetworkIdle({ idleTime: 250, timeout }).catch(() => undefined);
}

async function verifyPrimaryPunchLifecycle(browser) {
  const context = await browser.createBrowserContext();
  try {
    const first = await createPage(context);
    await loginAndSelectTenant(first, primaryUserId);
    await expectPunchButton(first, "Time In now");

    // A second already-rendered tab intentionally simulates a double-submit/retry
    // that arrives after the first punch committed.
    const staleRetry = await createPage(context);
    await staleRetry.goto(`${baseUrl}/employee/attendance`, { waitUntil: "networkidle2", timeout });
    await expectPunchButton(staleRetry, "Time In now");

    await clickPunchAndWait(first, "Time In now", "clocked-in");
    const afterClockIn = await prisma.attendance.findMany({
      where: { tenantId: primaryTenantId, employeeId: primaryEmployeeId },
      orderBy: { createdAt: "desc" },
    });
    assert.equal(afterClockIn.length, 1, "Primary tenant must contain exactly one attendance row after Time In.");
    assert.ok(afterClockIn[0].timeIn, "Time In must persist.");

    await clickPunchAndWait(staleRetry, "Time In now", "clocked-in");
    const afterRetry = await prisma.attendance.findMany({
      where: { tenantId: primaryTenantId, employeeId: primaryEmployeeId },
    });
    assert.equal(afterRetry.length, 1, "Retried Time In must reconcile to the existing row.");

    const clockInAudits = await prisma.auditLog.count({
      where: {
        tenantId: primaryTenantId,
        actorId: primaryUserId,
        action: "EMPLOYEE_CLOCK_IN",
        entityType: "Attendance",
      },
    });
    assert.equal(clockInAudits, 1, "Retried Time In must not duplicate the audit event.");

    await expectPunchButton(first, "Time Out now");
    await expectPunchButton(staleRetry, "Time Out now");

    await clickPunchAndWait(first, "Time Out now", "clocked-out");
    const completed = await prisma.attendance.findFirstOrThrow({
      where: { tenantId: primaryTenantId, employeeId: primaryEmployeeId },
    });
    assert.ok(completed.timeOut, "Time Out must persist.");
    const firstTimeOut = completed.timeOut;

    await clickPunchAndWait(staleRetry, "Time Out now", "clocked-out");
    const afterOutRetry = await prisma.attendance.findFirstOrThrow({
      where: { tenantId: primaryTenantId, employeeId: primaryEmployeeId },
    });
    assert.equal(afterOutRetry.timeOut, firstTimeOut, "Retried Time Out must not overwrite the first committed punch.");

    const clockOutAudits = await prisma.auditLog.count({
      where: {
        tenantId: primaryTenantId,
        actorId: primaryUserId,
        action: "EMPLOYEE_CLOCK_OUT",
        entityType: "Attendance",
      },
    });
    assert.equal(clockOutAudits, 1, "Retried Time Out must not duplicate the audit event.");
  } finally {
    await context.close();
  }
}

async function verifyTenantIsolation(browser) {
  const context = await browser.createBrowserContext();
  try {
    const page = await createPage(context);
    await loginAndSelectTenant(page, secondaryUserId);
    await expectPunchButton(page, "Time In now");
    await clickPunchAndWait(page, "Time In now", "clocked-in");

    const primaryRows = await prisma.attendance.findMany({
      where: { tenantId: primaryTenantId, employeeId: primaryEmployeeId },
    });
    const secondaryRows = await prisma.attendance.findMany({
      where: { tenantId: secondaryTenantId, employeeId: secondaryEmployeeId },
    });
    assert.equal(primaryRows.length, 1, "Primary employee attendance must remain isolated.");
    assert.equal(secondaryRows.length, 1, "Secondary tenant employee must receive only its own attendance row.");
    assert.equal(secondaryRows[0].tenantId, secondaryTenantId);
    assert.equal(secondaryRows[0].employeeId, secondaryEmployeeId);

    const impossibleCrossTenant = await prisma.attendance.count({
      where: { tenantId: primaryTenantId, employeeId: secondaryEmployeeId },
    });
    assert.equal(impossibleCrossTenant, 0, "Secondary employee punch must never be written into the primary tenant.");
  } finally {
    await context.close();
  }
}

async function verifyOrphanEmployeeLoginFailsClosed(browser) {
  const context = await browser.createBrowserContext();
  try {
    const page = await createPage(context);
    await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle2", timeout });
    await page.type("#identifier", orphanEmail);
    await page.type("#password", password);
    await clickByText(page, "button", "Sign in securely");
    await page.waitForFunction(
      () => window.location.pathname === "/login"
        && (document.body?.textContent || "").includes("Incorrect identifier or password."),
      { timeout },
    );
    assert.equal(
      await prisma.userSession.count({ where: { tenantId: primaryTenantId, userId: orphanUserId } }),
      0,
      "Employee identity without an active tenant-linked profile must not receive a session.",
    );
  } finally {
    await context.close();
  }
}

async function cleanup() {
  const employeeIds = [primaryEmployeeId, secondaryEmployeeId].filter(Boolean);
  const userIds = [primaryUserId, secondaryUserId, orphanUserId].filter(Boolean);

  if (employeeIds.length) {
    const attendance = await prisma.attendance.findMany({
      where: { employeeId: { in: employeeIds } },
      select: { id: true },
    });
    const attendanceIds = attendance.map((item) => item.id);
    if (attendanceIds.length) {
      await prisma.attendanceAdjustment.deleteMany({ where: { attendanceId: { in: attendanceIds } } }).catch(() => undefined);
      await prisma.overtimeRecord.deleteMany({ where: { attendanceId: { in: attendanceIds } } }).catch(() => undefined);
    }
    await prisma.attendance.deleteMany({ where: { employeeId: { in: employeeIds } } }).catch(() => undefined);
    await prisma.employeeSchedule.deleteMany({ where: { employeeId: { in: employeeIds } } }).catch(() => undefined);
    await prisma.employeeCompensation.deleteMany({ where: { employeeId: { in: employeeIds } } }).catch(() => undefined);
    await prisma.employeeProfile.deleteMany({ where: { id: { in: employeeIds } } }).catch(() => undefined);
  }

  if (userIds.length) {
    await prisma.userSession.deleteMany({ where: { userId: { in: userIds } } }).catch(() => undefined);
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } }).catch(() => undefined);
    await prisma.userRoleAssignment.deleteMany({ where: { userId: { in: userIds } } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => undefined);
  }

  if (secondaryTenantId) {
    await prisma.tenantSubscription.deleteMany({ where: { tenantId: secondaryTenantId } }).catch(() => undefined);
    await prisma.tenantModuleEntitlement.deleteMany({ where: { tenantId: secondaryTenantId } }).catch(() => undefined);
    await prisma.auditLog.deleteMany({ where: { tenantId: secondaryTenantId } }).catch(() => undefined);
    await prisma.tenant.deleteMany({ where: { id: secondaryTenantId } }).catch(() => undefined);
  }
}

assertE2eDatabaseSafety();
await seedFixtures();
const executablePath = await resolveBrowserExecutable();
const headlessMode = "shell";
const browser = await puppeteer.launch({
  executablePath,
  headless: headlessMode,
  args: await puppeteer.defaultArgs({ args: chromium.args, headless: headlessMode }),
});

try {
  await verifyPrimaryPunchLifecycle(browser);
  await verifyTenantIsolation(browser);
  await verifyOrphanEmployeeLoginFailsClosed(browser);
  console.log("Employee login/attendance production regression passed:");
  console.log("- universal employee login selected the intended tenant");
  console.log("- Time In and Time Out persisted end to end");
  console.log("- duplicate/retried punches reconciled without duplicate rows or audits");
  console.log("- same-email employee accounts remained isolated across tenants");
  console.log("- orphan employee login failed closed without issuing a session");
} catch (error) {
  console.error("Employee login/attendance production regression failed.");
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
  await cleanup();
  await prisma.$disconnect();
}
