import assert from "node:assert/strict";
import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { PrismaClient, Role } from "@prisma/client";
import chromium from "@sparticuz/chromium";
import { hash } from "bcryptjs";
import puppeteer from "puppeteer-core";

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const adminEmail = process.env.E2E_ADMIN_EMAIL || process.env.SEED_SYSTEM_ADMIN_EMAIL || "ci-system@example.invalid";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || process.env.SEED_SYSTEM_ADMIN_PASSWORD || "CI-Temporary-Password-2026!";
const homeownerEmail = process.env.E2E_HOMEOWNER_EMAIL || "ci-homeowner@example.invalid";
const homeownerPassword = process.env.E2E_HOMEOWNER_PASSWORD || "CI-Homeowner-Password-2026!";
const platformEmail = "ci-platform-parity@example.invalid";
const platformPassword = "CI-Platform-Parity-2026!";
const tenantId = "tenant_pagsibol4b_default";
const timeout = 45_000;
const outputDir = path.resolve("artifacts/ui-canva-parity");

async function pathExists(candidate) {
  if (!candidate) return false;
  try { await access(candidate); return true; } catch { return false; }
}

async function browserExecutable() {
  for (const candidate of [process.env.PUPPETEER_EXECUTABLE_PATH, process.env.CHROME_BIN, "/usr/bin/chromium", "/usr/bin/google-chrome"].filter(Boolean)) {
    if (await pathExists(candidate)) return candidate;
  }
  return chromium.executablePath();
}

async function login(page, email, password, expectedPrefix) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle2", timeout });
  await page.waitForSelector("#identifier", { timeout });
  await page.type("#identifier", email);
  await page.type("#password", password);
  const buttons = await page.$$("button");
  let clicked = false;
  for (const button of buttons) {
    const text = await button.evaluate((node) => (node.textContent || "").replace(/\s+/g, " ").trim());
    if (text.includes("Sign in securely")) { await button.click(); clicked = true; break; }
  }
  assert.ok(clicked, "Expected login submit button");
  await page.waitForFunction((prefix) => window.location.pathname.startsWith(prefix), { timeout }, expectedPrefix);
  await page.waitForNetworkIdle({ idleTime: 500, timeout }).catch(() => undefined);
}

async function provisionPlatformAdmin() {
  const existing = await prisma.user.findFirst({ where: { tenantId, email: platformEmail } });
  const user = existing
    ? await prisma.user.update({ where: { id: existing.id }, data: { role: Role.PLATFORM_ADMIN, active: true, passwordHash: await hash(platformPassword, 12) } })
    : await prisma.user.create({ data: { tenantId, name: "CI Platform Parity", email: platformEmail, passwordHash: await hash(platformPassword, 12), role: Role.PLATFORM_ADMIN, active: true } });
  await prisma.userRoleAssignment.upsert({
    where: { tenantId_userId_role: { tenantId, userId: user.id, role: Role.PLATFORM_ADMIN } },
    update: { active: true, assignedBy: user.id },
    create: { tenantId, userId: user.id, role: Role.PLATFORM_ADMIN, active: true, assignedBy: user.id },
  });
}

async function screenshot(page, fileName) {
  await page.screenshot({ path: path.join(outputDir, fileName), fullPage: true });
}

async function assertNoOverflow(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `${label} has horizontal overflow: ${overflow}px`);
}

async function assertDesktopShell(page, shellSelector, topbarSelector) {
  await page.waitForSelector(shellSelector, { timeout });
  await page.waitForSelector(topbarSelector, { timeout });
  const metrics = await page.evaluate(({ shellSelector, topbarSelector }) => {
    const shell = document.querySelector(shellSelector);
    const topbar = document.querySelector(topbarSelector);
    const sidebar = shell?.querySelector("aside");
    return {
      sidebarWidth: sidebar?.getBoundingClientRect().width || 0,
      topbarHeight: topbar?.getBoundingClientRect().height || 0,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  }, { shellSelector, topbarSelector });
  assert.ok(metrics.sidebarWidth >= 295 && metrics.sidebarWidth <= 305, `Expected ~300px sidebar, received ${metrics.sidebarWidth}`);
  assert.ok(metrics.topbarHeight >= 80, `Expected Canva command topbar height, received ${metrics.topbarHeight}`);
  assert.ok(metrics.overflow <= 1, `Unexpected horizontal overflow: ${metrics.overflow}px`);
}

async function captureRoute(page, route, expectedPrefix, fileName, shellSelector) {
  await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle2", timeout });
  assert.ok(new URL(page.url()).pathname.startsWith(expectedPrefix), `${route} redirected unexpectedly to ${page.url()}`);
  if (shellSelector) await page.waitForSelector(shellSelector, { timeout });
  await assertNoOverflow(page, route);
  await screenshot(page, fileName);
}

async function runAdmin(browser) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  try {
    await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
    await login(page, adminEmail, adminPassword, "/admin/");
    await page.goto(`${baseUrl}/admin/dashboard`, { waitUntil: "networkidle2", timeout });
    await assertDesktopShell(page, ".canva-tenant-shell", ".tenant-command-topbar");
    const body = await page.evaluate(() => document.body.textContent || "");
    for (const text of ["Community Intelligence", "Financial pulse", "HOAHub Intelligence", "Action Center", "Today at a glance"]) assert.ok(body.includes(text), `Admin dashboard missing ${text}`);
    const cardBarCount = await page.$$eval(".ui-metric-card > span.absolute", (nodes) => nodes.length);
    assert.equal(cardBarCount, 0, "Metric cards must not use the rejected colored side-strip treatment");
    await screenshot(page, "01-tenant-dashboard.png");

    // Desktop coverage spans every Premium Admin V2 implementation wave while
    // preserving the existing route-specific business logic and data fixtures.
    const desktopRoutes = [
      ["/admin/actions", "/admin/actions", "05-action-center.png"],
      ["/admin/settings", "/admin/settings", "06a-settings-account-center.png"],
      ["/admin/onboarding", "/admin/onboarding", "06b-guided-onboarding.png"],
      ["/admin/homeowners", "/admin/homeowners", "06c-homeowners-360.png"],
      ["/admin/billing", "/admin/billing", "07-finance-command-center.png"],
      ["/admin/payments/requests", "/admin/payments/requests", "07b-payment-review-workspace.png"],
      ["/admin/reports", "/admin/reports", "07c-reports-intelligence.png"],
      ["/admin/data", "/admin/data", "07d-data-management.png"],
      ["/admin/documents", "/admin/documents", "08-document-operations.png"],
      ["/admin/document-management", "/admin/document-management", "08b-document-repository.png"],
      ["/admin/complaints", "/admin/complaints", "08c-complaint-command-center.png"],
      ["/admin/chat", "/admin/chat", "08d-admin-chat.png"],
      ["/admin/workforce", "/admin/workforce", "09-workforce-command-center.png"],
    ];
    for (const [route, expected, fileName] of desktopRoutes) {
      await captureRoute(page, route, expected, fileName, ".canva-tenant-shell");
    }

    // Responsive parity checkpoints exercise high-density and workflow-heavy pages
    // at tablet/mobile sizes, where the approved design requires zero page overflow.
    await page.setViewport({ width: 900, height: 1100, deviceScaleFactor: 1 });
    await captureRoute(page, "/admin/homeowners", "/admin/homeowners", "20-tablet-homeowners.png", ".canva-tenant-shell");
    await captureRoute(page, "/admin/payments/requests", "/admin/payments/requests", "21-tablet-payment-review.png", ".canva-tenant-shell");
    await captureRoute(page, "/admin/documents", "/admin/documents", "22-tablet-documents.png", ".canva-tenant-shell");

    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await captureRoute(page, "/admin/onboarding", "/admin/onboarding", "23-mobile-onboarding.png", ".canva-tenant-shell");
    await captureRoute(page, "/admin/complaints", "/admin/complaints", "24-mobile-complaints.png", ".canva-tenant-shell");
  } finally { await context.close(); }
}

async function runPlatform(browser) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  try {
    await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
    await login(page, platformEmail, platformPassword, "/platform/");
    await page.goto(`${baseUrl}/platform/dashboard`, { waitUntil: "networkidle2", timeout });
    await assertDesktopShell(page, ".canva-platform-shell", ".platform-command-topbar");
    const body = await page.evaluate(() => document.body.textContent || "");
    for (const text of ["HOAHub Platform Command Center", "Portfolio intelligence", "Tenant health matrix", "Requires attention"]) assert.ok(body.includes(text), `Platform dashboard missing ${text}`);
    const topbarColor = await page.$eval(".platform-command-topbar", (node) => getComputedStyle(node).backgroundColor);
    assert.match(topbarColor, /7,\s*31,\s*49/, `Expected dark Canva platform topbar, received ${topbarColor}`);
    await screenshot(page, "02-platform-command-center.png");

    await page.goto(`${baseUrl}/platform/tenants/${tenantId}`, { waitUntil: "networkidle2", timeout });
    assert.equal(new URL(page.url()).pathname, `/platform/tenants/${tenantId}`);
    await assertNoOverflow(page, "Tenant 360");
    await screenshot(page, "03-tenant-360.png");

    await captureRoute(page, "/platform/tenants", "/platform/tenants", "10-platform-tenant-list.png", ".canva-platform-shell");
    await captureRoute(page, "/platform/audit", "/platform/audit", "11-platform-audit-security.png", ".canva-platform-shell");
  } finally { await context.close(); }
}

async function runHomeowner(browser) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  try {
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await login(page, homeownerEmail, homeownerPassword, "/portal/");
    await page.goto(`${baseUrl}/portal/dashboard`, { waitUntil: "networkidle2", timeout });
    await page.waitForSelector(".canva-portal-shell", { timeout });
    const headerBackground = await page.$eval(".canva-portal-shell > header", (node) => getComputedStyle(node).backgroundImage);
    assert.match(headerBackground, /8,\s*50,\s*79/, `Expected blue-teal Canva mobile header, received ${headerBackground}`);
    await assertNoOverflow(page, "Homeowner dashboard");
    const mobileBody = await page.evaluate(() => document.body.textContent || "");
    assert.ok(mobileBody.includes("Account Health"), "Homeowner dashboard should render the Canva Account Health hierarchy");
    assert.ok(mobileBody.includes("Resident Shortcuts"), "Homeowner dashboard should render compact Canva resident shortcuts");
    await screenshot(page, "04-homeowner-pwa-dashboard.png");

    await captureRoute(page, "/portal/pay", "/portal/pay", "12-homeowner-payment-center.png", ".canva-portal-shell");
    await captureRoute(page, "/portal/documents", "/portal/documents", "13-homeowner-documents.png", ".canva-portal-shell");
  } finally { await context.close(); }
}

await mkdir(outputDir, { recursive: true });
await provisionPlatformAdmin();
const browser = await puppeteer.launch({ executablePath: await browserExecutable(), args: chromium.args, headless: true, defaultViewport: null });
try {
  await runAdmin(browser);
  await runPlatform(browser);
  await runHomeowner(browser);
  console.log(`Canva visual-parity screenshots written to ${outputDir}`);
} finally {
  await browser.close();
  await prisma.$disconnect();
}
