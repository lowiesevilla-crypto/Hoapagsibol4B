import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const adminEmail = process.env.E2E_ADMIN_EMAIL || process.env.SEED_SYSTEM_ADMIN_EMAIL || "ci-system@example.invalid";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || process.env.SEED_SYSTEM_ADMIN_PASSWORD || "CI-Temporary-Password-2026!";
const tenantId = "tenant_pagsibol4b_default";
const timeout = 45_000;
const runToken = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const prefix = `CRUD-${runToken}`.slice(0, 22);
const targetEmployeeNumber = `${prefix}-11`.slice(0, 30);
const targetEmployeeName = `CRUD Employee ${runToken}`;
const seededIds = [];
let targetEmployeeId = null;

function assertE2eDatabaseSafety() {
  const allowLocal = process.env.HOAHUB_E2E_ALLOW_LOCAL === "1";
  if (process.env.CI !== "true" && !allowLocal) {
    throw new Error("Employee CRUD browser regression is restricted to CI/disposable local databases.");
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  const host = new URL(databaseUrl).hostname;
  if (!allowLocal && !["127.0.0.1", "localhost", "mysql"].includes(host)) {
    throw new Error(`Refusing employee CRUD regression against non-disposable host: ${host}`);
  }
}

async function pathExists(path) {
  if (!path) return false;
  try { await access(path); return true; } catch { return false; }
}

async function resolveBrowserExecutable() {
  const candidates = [process.env.PUPPETEER_EXECUTABLE_PATH, process.env.CHROME_BIN, "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean);
  for (const candidate of candidates) if (await pathExists(candidate)) return candidate;
  const packaged = await chromium.executablePath();
  if (await pathExists(packaged)) return packaged;
  throw new Error("No Chromium or Chrome executable is available.");
}

async function seedTenExistingEmployees() {
  for (let index = 1; index <= 10; index += 1) {
    const employee = await prisma.employeeProfile.create({
      data: {
        tenantId,
        employeeNumber: `${prefix}-${String(index).padStart(2, "0")}`.slice(0, 30),
        name: `Existing Employee ${index} ${runToken}`,
        position: "Regression Fixture",
        email: null,
        phone: `0917000${String(index).padStart(4, "0")}`,
        address: "Disposable E2E fixture",
        hireDate: new Date("2026-01-01T00:00:00.000Z"),
        salaryType: "MONTHLY",
        baseRate: 18000,
        standardWorkDays: 26,
        fixedAllowance: 0,
        fixedDeduction: 0,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    seededIds.push(employee.id);
  }
}

async function cleanup() {
  const ids = [...seededIds, ...(targetEmployeeId ? [targetEmployeeId] : [])];
  if (!ids.length) return;
  await prisma.employeeCompensation.deleteMany({ where: { employeeId: { in: ids } } }).catch(() => undefined);
  await prisma.auditLog.deleteMany({ where: { tenantId, entityType: "EmployeeProfile", entityId: { in: ids } } }).catch(() => undefined);
  await prisma.employeeProfile.deleteMany({ where: { tenantId, id: { in: ids } } }).catch(() => undefined);
}

async function clickByText(page, selector, text) {
  const elements = await page.$$(selector);
  for (const element of elements) {
    const value = (await element.evaluate((node) => node.textContent || "")).replace(/\s+/g, " ").trim();
    if (value.includes(text)) { await element.click(); return; }
  }
  throw new Error(`Could not find ${selector} containing ${text} on ${page.url()}`);
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

async function login(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle2", timeout });
  await page.type("#identifier", adminEmail);
  await page.type("#password", adminPassword);
  await clickByText(page, "button", "Sign in securely");
  await page.waitForFunction(() => window.location.pathname.startsWith("/admin/"), { timeout });
}

assertE2eDatabaseSafety();
await seedTenExistingEmployees();
const executablePath = await resolveBrowserExecutable();
const headlessMode = "shell";
const browser = await puppeteer.launch({
  executablePath,
  headless: headlessMode,
  args: await puppeteer.defaultArgs({ args: chromium.args, headless: headlessMode }),
});

try {
  const page = await browser.newPage();
  page.setDefaultTimeout(timeout);
  page.on("dialog", async (dialog) => dialog.accept());
  await login(page);

  await page.goto(`${baseUrl}/admin/employees/new`, { waitUntil: "networkidle2", timeout });
  await page.waitForFunction(() => (document.body?.textContent || "").includes("Add an employee"), { timeout });
  await clearAndType(page, "#employeeNumber", targetEmployeeNumber);
  await clearAndType(page, "#name", targetEmployeeName);
  await clearAndType(page, "#position", "E2E CRUD Specialist");
  await clearAndType(page, "#phone", "09179990011");
  await clearAndType(page, "#address", "E2E CRUD Test Address");
  await clickByText(page, "button[type='submit']", "Create employee");
  await page.waitForFunction(
    () => window.location.pathname === "/admin/employees" && new URL(window.location.href).searchParams.get("success") === "created",
    { timeout },
  );

  const created = await prisma.employeeProfile.findFirst({ where: { tenantId, employeeNumber: targetEmployeeNumber } });
  assert.ok(created, "The 11th employee must be creatable after ten existing employees.");
  targetEmployeeId = created.id;

  await page.goto(`${baseUrl}/admin/employees/${targetEmployeeId}`, { waitUntil: "networkidle2", timeout });
  await page.waitForFunction((name) => (document.body?.textContent || "").includes(name), { timeout }, targetEmployeeName);
  await clearAndType(page, "#phone", "09179990012");
  await clickByText(page, "button[type='submit']", "Save changes");
  await page.waitForFunction(
    () => window.location.pathname === "/admin/employees" && new URL(window.location.href).searchParams.get("success") === "saved",
    { timeout },
  );

  const updated = await prisma.employeeProfile.findFirst({ where: { id: targetEmployeeId, tenantId } });
  assert.equal(updated?.phone, "09179990012", "Employee edit must persist after the directory contains more than ten employees.");

  await page.goto(`${baseUrl}/admin/employees/${targetEmployeeId}`, { waitUntil: "networkidle2", timeout });
  await clickByText(page, "button[type='submit']", "Delete employee");
  await page.waitForFunction(
    () => window.location.pathname === "/admin/employees" && new URL(window.location.href).searchParams.get("success") === "deleted",
    { timeout },
  );

  const deleted = await prisma.employeeProfile.findFirst({ where: { id: targetEmployeeId, tenantId } });
  assert.equal(deleted, null, "Employee with no attendance/payroll history must be deletable.");
  targetEmployeeId = null;

  console.log("Employee CRUD regression passed:");
  console.log("- 11th employee creation passed with ten existing employee records");
  console.log("- employee edit persisted");
  console.log("- history-free employee delete persisted");
} finally {
  await browser.close();
  await cleanup();
  await prisma.$disconnect();
}
