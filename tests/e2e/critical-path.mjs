import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access } from "node:fs/promises";
import {
  HomeownerActivationStatus,
  HomeownerEmailVerificationStatus,
  PrismaClient,
  Role,
} from "@prisma/client";
import chromium from "@sparticuz/chromium";
import { hash } from "bcryptjs";
import puppeteer from "puppeteer-core";

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const adminEmail = process.env.E2E_ADMIN_EMAIL || process.env.SEED_SYSTEM_ADMIN_EMAIL || "ci-system@example.invalid";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || process.env.SEED_SYSTEM_ADMIN_PASSWORD || "CI-Temporary-Password-2026!";
const homeownerEmail = process.env.E2E_HOMEOWNER_EMAIL || "ci-homeowner@example.invalid";
const otherHomeownerEmail = process.env.E2E_OTHER_HOMEOWNER_EMAIL || "ci-other-homeowner@example.invalid";
const registeredHomeownerEmail = process.env.E2E_REGISTERED_HOMEOWNER_EMAIL || "ci-registered-homeowner@example.invalid";
const homeownerPassword = process.env.E2E_HOMEOWNER_PASSWORD || "CI-Homeowner-Password-2026!";
const registeredHomeownerPassword = process.env.E2E_REGISTERED_HOMEOWNER_PASSWORD || "CI-Registered-2026!";
const registeredTemporaryPassword = process.env.E2E_REGISTERED_TEMPORARY_PASSWORD || "E2ETemporary2026";
const registeredVerificationToken = process.env.E2E_REGISTERED_VERIFICATION_TOKEN || "e2e-browser-homeowner-registration-verification-token-2026";
const announcementTitle = process.env.E2E_ANNOUNCEMENT_TITLE || "E2E Tenant Visibility Notice";
const coverageYear = Number(process.env.E2E_COVERAGE_YEAR || 2099);
const coverageMonth = Number(process.env.E2E_COVERAGE_MONTH || 1);
const primaryTenantId = "tenant_pagsibol4b_default";
const secondaryTenantId = "tenant_e2e_browser_isolation";
const homeownerName = "E2E Browser Homeowner";
const registeredHomeownerName = "E2E Registered Homeowner";
const documentPurpose = "E2E browser document request";
const timeout = 45_000;

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
    throw new Error("Critical browser database operations are restricted to CI. Set HOAHUB_E2E_ALLOW_LOCAL=1 only for an explicit disposable local database run.");
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for the critical browser suite.");
  const host = new URL(databaseUrl).hostname;
  if (!allowLocal && !["127.0.0.1", "localhost", "mysql"].includes(host)) {
    throw new Error(`Refusing browser database operations against non-disposable host: ${host}`);
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
  throw new Error("No Chromium or Chrome executable is available for the critical browser suite.");
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
  const body = await pageText(page);
  assert.ok(body.includes(text), `Expected ${label} on ${page.url()}`);
}

async function expectNoText(page, text, label = text) {
  const body = await pageText(page);
  assert.ok(!body.includes(text), `Did not expect ${label} on ${page.url()}`);
}

async function clickByText(page, selector, matcher) {
  const elements = await page.$$(selector);
  for (const element of elements) {
    const text = (await element.evaluate((node) => node.textContent || "")).replace(/\s+/g, " ").trim();
    const matches = typeof matcher === "string" ? text.includes(matcher) : matcher.test(text);
    if (matches) {
      await element.click();
      return text;
    }
  }
  throw new Error(`No ${selector} matched ${String(matcher)} on ${page.url()}`);
}

async function clickAndWaitForNavigation(page, selector, matcher) {
  const navigation = page.waitForNavigation({ waitUntil: "networkidle2", timeout }).catch(() => null);
  const clicked = await clickByText(page, selector, matcher);
  await navigation;
  return clicked;
}

async function clearAndType(page, selector, value) {
  await page.waitForSelector(selector, { timeout });
  await page.$eval(selector, (element) => {
    element.value = "";
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.type(selector, value);
}

async function login(page, email, password, expectedPathPrefix) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle2", timeout });
  await page.waitForSelector("#identifier", { timeout });
  await page.type("#identifier", email);
  await page.type("#password", password);
  await clickByText(page, "button", "Sign in securely");
  await page.waitForFunction(
    (prefix) => window.location.pathname.startsWith(prefix),
    { timeout },
    expectedPathPrefix,
  );
  await page.waitForNetworkIdle({ idleTime: 500, timeout }).catch(() => undefined);
}

async function createPage(context, viewport) {
  const page = await context.newPage();
  await page.setViewport(viewport);
  page.setDefaultTimeout(timeout);
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) console.log(`[browser:${message.type()}] ${message.text()}`);
  });
  page.on("pageerror", (error) => console.log(`[browser:pageerror] ${error.message}`));
  return page;
}

async function runAdminFlow(browser) {
  const context = await browser.createBrowserContext();
  const page = await createPage(context, { width: 1440, height: 1000 });
  try {
    await login(page, adminEmail, adminPassword, "/admin/");
    await expectText(page, "Settings", "administrator landing page");

    const billingPreview = new URL("/admin/billing", baseUrl);
    billingPreview.searchParams.set("preview", "1");
    billingPreview.searchParams.set("coverageYear", String(coverageYear));
    billingPreview.searchParams.set("coverageMonth", String(coverageMonth));
    billingPreview.searchParams.set("scope", "ALL");
    await page.goto(billingPreview.toString(), { waitUntil: "networkidle2", timeout });
    await expectText(page, "Billing generation");
    await expectText(page, "Projected new bills");
    await clickAndWaitForNavigation(page, "button", "Generate for Eligible Homeowners");
    await page.waitForFunction(() => new URL(window.location.href).searchParams.get("billingGenerated") === "1", { timeout });
    await expectText(page, homeownerName);
    await expectText(page, "E2E-RES-2099-001", "billing resolution reference");

    const paymentSearch = new URL("/admin/payments/record", baseUrl);
    paymentSearch.searchParams.set("q", homeownerName);
    await page.goto(paymentSearch.toString(), { waitUntil: "networkidle2", timeout });
    await expectText(page, homeownerName);
    await clickByText(page, "button[type='button']", homeownerName);
    await page.waitForFunction(() => Number(document.querySelector("input[name='amount']")?.value || 0) > 0, { timeout });
    await page.select("select[name='method']", "CASH");
    await clickAndWaitForNavigation(page, "button[type='submit']", /Record payment/i);
    assert.ok(new URL(page.url()).pathname.startsWith("/receipts/payment/"), `Expected payment receipt redirect, received ${page.url()}`);
    await expectText(page, homeownerName);
    const receiptBody = await pageText(page);
    const receiptNumber = receiptBody.match(/AR-MD-\d{4}-\d{7}/)?.[0];
    assert.ok(receiptNumber, `Expected an official monthly-dues receipt number on ${page.url()}`);

    await page.goto(`${baseUrl}/admin/announcements`, { waitUntil: "networkidle2", timeout });
    await page.type("input[name='title']", announcementTitle);
    await page.type("textarea[name='content']", "Published by the critical browser suite and visible only to the authenticated HOA tenant.");
    await page.select("select[name='status']", "PUBLISHED");
    await clickAndWaitForNavigation(page, "button[type='submit']", "Create announcement");
    await expectText(page, announcementTitle);

    const documentSearch = new URL("/admin/documents", baseUrl);
    documentSearch.searchParams.set("section", "requests");
    documentSearch.searchParams.set("view", "all");
    documentSearch.searchParams.set("q", homeownerName);
    await page.goto(documentSearch.toString(), { waitUntil: "networkidle2", timeout });
    await expectText(page, homeownerName);
    await expectText(page, "Clearance Certificate");

    return { receiptNumber };
  } finally {
    await context.close();
  }
}

async function runPrimaryHomeownerFlow(browser, receiptNumber) {
  const context = await browser.createBrowserContext();
  const page = await createPage(context, { width: 390, height: 844, deviceScaleFactor: 1 });
  try {
    await login(page, homeownerEmail, homeownerPassword, "/portal/");
    await expectText(page, "Welcome", "homeowner dashboard");

    await page.goto(`${baseUrl}/portal/soa`, { waitUntil: "networkidle2", timeout });
    await expectText(page, "Statement of Account");
    await expectText(page, receiptNumber, "official receipt in homeowner SOA");
    await expectText(page, "Outstanding balance");

    await page.goto(`${baseUrl}/portal/documents`, { waitUntil: "networkidle2", timeout });
    await expectText(page, "Document requests");
    await expectText(page, documentPurpose);
    await expectText(page, "Clearance Certificate");

    await page.goto(`${baseUrl}/portal/announcements`, { waitUntil: "networkidle2", timeout });
    await expectText(page, announcementTitle, "published tenant announcement");
  } finally {
    await context.close();
  }
}

async function runOtherTenantIsolationFlow(browser) {
  const context = await browser.createBrowserContext();
  const page = await createPage(context, { width: 390, height: 844, deviceScaleFactor: 1 });
  try {
    await login(page, otherHomeownerEmail, homeownerPassword, "/portal/");
    await page.goto(`${baseUrl}/portal/announcements`, { waitUntil: "networkidle2", timeout });
    await expectNoText(page, announcementTitle, "another tenant's announcement");
  } finally {
    await context.close();
  }
}

async function provisionRegistrationInvitation() {
  assertE2eDatabaseSafety();
  const profile = await prisma.homeownerProfile.findFirst({
    where: {
      tenantId: primaryTenantId,
      user: { email: registeredHomeownerEmail, role: Role.HOMEOWNER, active: true },
    },
    include: { user: true },
  });
  assert.ok(profile, "Expected the administrator UI to create the reserved homeowner account.");
  assert.match(profile.accountNumber || "", /^\d{11}$/, "Expected the registration flow to allocate an 11-digit account number.");

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  await prisma.$transaction([
    prisma.homeownerActivationCredential.updateMany({
      where: { tenantId: primaryTenantId, userId: profile.userId, usedAt: null, revokedAt: null },
      data: { revokedAt: now },
    }),
    prisma.homeownerEmailVerificationToken.updateMany({
      where: { tenantId: primaryTenantId, userId: profile.userId, usedAt: null },
      data: { usedAt: now },
    }),
    prisma.homeownerActivationCredential.create({
      data: {
        tenantId: primaryTenantId,
        userId: profile.userId,
        credentialHash: await hash(registeredTemporaryPassword, 12),
        expiresAt,
      },
    }),
    prisma.homeownerEmailVerificationToken.create({
      data: {
        tenantId: primaryTenantId,
        userId: profile.userId,
        tokenHash: createHash("sha256").update(registeredVerificationToken).digest("hex"),
        expiresAt,
      },
    }),
    prisma.homeownerProfile.update({
      where: { tenantId_id: { tenantId: primaryTenantId, id: profile.id } },
      data: {
        activationStatus: HomeownerActivationStatus.INVITATION_SENT,
        emailStatus: HomeownerEmailVerificationStatus.UNVERIFIED,
        activationSentAt: now,
        emailVerifiedAt: null,
        activatedAt: null,
      },
    }),
  ]);

  return profile.accountNumber;
}

async function assertRegisteredHomeownerState() {
  const profile = await prisma.homeownerProfile.findFirst({
    where: { tenantId: primaryTenantId, user: { email: registeredHomeownerEmail } },
    include: { user: true },
  });
  assert.ok(profile, "Expected the activated homeowner profile to remain tenant scoped.");
  assert.equal(profile.user.role, Role.HOMEOWNER);
  assert.equal(profile.activationStatus, HomeownerActivationStatus.ACTIVE);
  assert.equal(profile.emailStatus, HomeownerEmailVerificationStatus.VERIFIED);
  assert.ok(profile.activatedAt, "Expected activation timestamp after permanent-password creation.");
  assert.equal(
    await prisma.homeownerProfile.count({
      where: { tenantId: secondaryTenantId, user: { email: registeredHomeownerEmail } },
    }),
    0,
    "The newly registered homeowner must not exist in the secondary tenant.",
  );
}

async function runHomeownerRegistrationFlow(browser) {
  const administratorContext = await browser.createBrowserContext();
  const administratorPage = await createPage(administratorContext, { width: 1440, height: 1000 });
  try {
    await login(administratorPage, adminEmail, adminPassword, "/admin/");
    await administratorPage.goto(`${baseUrl}/admin/homeowners/new`, { waitUntil: "networkidle2", timeout });
    await expectText(administratorPage, "Add a homeowner");
    await clearAndType(administratorPage, "#name", registeredHomeownerName);
    await clearAndType(administratorPage, "#email", registeredHomeownerEmail);
    await clearAndType(administratorPage, "#phone", "09170000001");
    await clearAndType(administratorPage, "#address", "Block E2E-R Lot 001 Registration Test Street");
    await clearAndType(administratorPage, "#block", "E2E-R");
    await clearAndType(administratorPage, "#lot", "001");
    await clearAndType(administratorPage, "#monthlyDuesAmount", "1300");
    await clickAndWaitForNavigation(administratorPage, "button[type='submit']", "Create homeowner");
    await administratorPage.waitForFunction(
      () => window.location.pathname === "/admin/homeowners" && new URL(window.location.href).searchParams.get("success") === "created",
      { timeout },
    );
    await expectText(administratorPage, registeredHomeownerName);
  } finally {
    await administratorContext.close();
  }

  const accountNumber = await provisionRegistrationInvitation();

  const activationContext = await browser.createBrowserContext();
  const activationPage = await createPage(activationContext, { width: 390, height: 844, deviceScaleFactor: 1 });
  try {
    const verificationUrl = new URL("/activate/verify", baseUrl);
    verificationUrl.searchParams.set("token", registeredVerificationToken);
    await activationPage.goto(verificationUrl.toString(), { waitUntil: "networkidle2", timeout });
    await activationPage.waitForFunction(
      () => window.location.pathname === "/activate" && new URL(window.location.href).searchParams.get("verified") === "email",
      { timeout },
    );
    await expectText(activationPage, "Registered email verified");
    assert.equal(await activationPage.$eval("#accountNumber", (element) => element.value), accountNumber);
    assert.equal(await activationPage.$eval("#email", (element) => element.value), registeredHomeownerEmail);
    assert.equal(await activationPage.$eval("#accountNumber", (element) => element.readOnly), true);
    assert.equal(await activationPage.$eval("#email", (element) => element.readOnly), true);
    assert.equal(await activationPage.$("#temporaryPassword"), null, "secure handoff must not expose the temporary password field");
    await clearAndType(activationPage, "#password", registeredHomeownerPassword);
    await clearAndType(activationPage, "#confirmPassword", registeredHomeownerPassword);
    await clickByText(activationPage, "button[type='submit']", "Create permanent password");
    await activationPage.waitForFunction(() => window.location.pathname.startsWith("/portal/dashboard"), { timeout });
    await activationPage.reload({ waitUntil: "networkidle2", timeout });
    await expectText(activationPage, "Active Requests", "activated homeowner dashboard");
  } finally {
    await activationContext.close();
  }

  const loginContext = await browser.createBrowserContext();
  const loginPage = await createPage(loginContext, { width: 390, height: 844, deviceScaleFactor: 1 });
  try {
    await login(loginPage, registeredHomeownerEmail, registeredHomeownerPassword, "/portal/");
    await expectText(loginPage, "Welcome", "fresh homeowner login after activation");
  } finally {
    await loginContext.close();
  }

  await assertRegisteredHomeownerState();
}

const executablePath = await resolveBrowserExecutable();
const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: [...new Set([...(chromium.args || []), "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"])],
});

try {
  const { receiptNumber } = await runAdminFlow(browser);
  await runPrimaryHomeownerFlow(browser, receiptNumber);
  await runOtherTenantIsolationFlow(browser);
  await runHomeownerRegistrationFlow(browser);
  console.log("Critical browser end-to-end suite passed:");
  console.log("- administrator authentication passed");
  console.log("- billing preview and generation passed");
  console.log("- payment recording and official receipt passed");
  console.log("- homeowner mobile authentication and SOA passed");
  console.log("- document request visibility passed");
  console.log("- announcement publication and cross-tenant visibility passed");
  console.log("- administrator homeowner registration passed");
  console.log("- homeowner email verification, activation, and fresh login passed");
  console.log("- registered homeowner tenant ownership passed");
} catch (error) {
  console.error("Critical browser end-to-end suite failed.");
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
  await prisma.$disconnect();
}
