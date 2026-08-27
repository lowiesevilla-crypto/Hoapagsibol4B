import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { PrismaClient, Role } from "@prisma/client";
import chromium from "@sparticuz/chromium";
import { hash } from "bcryptjs";
import puppeteer from "puppeteer-core";

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const timeout = 45_000;
const tenantId = "tenant_pagsibol4b_default";
const platformUserId = "e2e_auth_navigation_platform";
const platformEmail = "ci-auth-navigation-platform@example.invalid";
const platformPassword = "CI-Auth-Navigation-Platform-2026!";

const identities = [
  {
    label: "tenant admin",
    email: process.env.SEED_SYSTEM_ADMIN_EMAIL || "ci-system@example.invalid",
    password: process.env.SEED_SYSTEM_ADMIN_PASSWORD || "CI-Temporary-Password-2026!",
    expectedPrefix: "/admin/",
    homeRoute: "/admin/dashboard",
    secondRoute: "/admin/settings",
    logoutRoute: "/admin/dashboard",
  },
  {
    label: "platform admin",
    email: platformEmail,
    password: platformPassword,
    expectedPrefix: "/platform/",
    homeRoute: "/platform/tenants",
    secondRoute: "/platform/dashboard",
    logoutRoute: "/platform/dashboard",
  },
  {
    label: "homeowner",
    email: process.env.E2E_HOMEOWNER_EMAIL || "ci-homeowner@example.invalid",
    password: process.env.E2E_HOMEOWNER_PASSWORD || "CI-Homeowner-Password-2026!",
    expectedPrefix: "/portal/",
    homeRoute: "/portal/dashboard",
    secondRoute: "/portal/profile",
    logoutRoute: "/portal/profile",
  },
];

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

async function cleanupPlatformFixture() {
  await prisma.userSession.deleteMany({ where: { userId: platformUserId } });
  await prisma.auditLog.deleteMany({ where: { actorId: platformUserId } });
  await prisma.userRoleAssignment.deleteMany({ where: { userId: platformUserId } });
  await prisma.user.deleteMany({ where: { id: platformUserId } });
}

async function provisionPlatformFixture() {
  await cleanupPlatformFixture();
  await prisma.user.create({
    data: {
      id: platformUserId,
      tenantId,
      name: "CI Auth Navigation Platform",
      email: platformEmail,
      passwordHash: await hash(platformPassword, 12),
      role: Role.PLATFORM_ADMIN,
      active: true,
    },
  });
  await prisma.userRoleAssignment.create({
    data: {
      tenantId,
      userId: platformUserId,
      role: Role.PLATFORM_ADMIN,
      active: true,
      assignedBy: platformUserId,
    },
  });
}

async function login(page, identity) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle2", timeout });
  await page.waitForSelector("#identifier", { timeout });
  await page.type("#identifier", identity.email);
  await page.type("#password", identity.password);

  const buttons = await page.$$("button");
  let submitButton = null;
  for (const button of buttons) {
    const text = await button.evaluate((node) => (node.textContent || "").replace(/\s+/g, " ").trim());
    if (text.includes("Sign in securely")) { submitButton = button; break; }
  }
  assert.ok(submitButton, `${identity.label}: expected sign-in button`);
  await submitButton.click();
  await page.waitForFunction((prefix) => window.location.pathname.startsWith(prefix), { timeout }, identity.expectedPrefix);
  await page.waitForNetworkIdle({ idleTime: 500, timeout }).catch(() => undefined);
  await assertNoGlobalError(page, `${identity.label} login`);
}

async function assertNoGlobalError(page, label) {
  const body = await page.evaluate(() => document.body.textContent || "");
  assert.ok(!body.includes("We couldn't finish that request."), `${label}: global error boundary was rendered`);
  assert.ok(!body.includes("SOMETHING WENT WRONG"), `${label}: global error heading was rendered`);
}

async function exerciseAuthenticatedBack(page, identity) {
  await page.goto(`${baseUrl}${identity.homeRoute}`, { waitUntil: "networkidle2", timeout });
  assert.ok(new URL(page.url()).pathname.startsWith(identity.expectedPrefix), `${identity.label}: home route was not authorized`);
  await page.goto(`${baseUrl}${identity.secondRoute}`, { waitUntil: "networkidle2", timeout });
  assert.equal(new URL(page.url()).pathname, identity.secondRoute, `${identity.label}: second route did not load`);
  await assertNoGlobalError(page, `${identity.label} before Back`);

  await page.goBack({ waitUntil: "domcontentloaded", timeout }).catch(() => undefined);
  await page.waitForFunction((route) => window.location.pathname === route, { timeout }, identity.homeRoute);
  await page.waitForNetworkIdle({ idleTime: 300, timeout }).catch(() => undefined);
  await assertNoGlobalError(page, `${identity.label} Back`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function currentLogoutButton(page) {
  const selector = 'a[data-hoahub-logout-button="true"][data-hoahub-logout-scope="current"]';
  await page.waitForSelector(selector, { timeout });
  const buttons = await page.$$(selector);

  for (const button of buttons) {
    const renderable = await button.evaluate((node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none"
        && style.visibility !== "hidden"
        && Number(style.opacity || "1") > 0
        && rect.width > 0
        && rect.height > 0;
    });
    if (!renderable) continue;

    // Mobile pages can place a valid logout control close to the fixed bottom nav.
    // Center the control before using a real pointer click so Puppeteer cannot hit an
    // overlapping navigation item when the control is only partially in the viewport.
    await button.evaluate((node) => node.scrollIntoView({ block: "center", inline: "nearest" }));
    await sleep(100);

    // A fixed mobile bottom navigation can temporarily cover the geometric
    // center while scroll settling finishes. Puppeteer's real click below is
    // the authoritative actionability check; returning the rendered control
    // avoids rejecting a valid logout link because of a transient hit-test.
    return button;
  }
  return null;
}

function isLoginPath(pathname) {
  return pathname === "/login" || pathname.endsWith("/login");
}

function isLogoutDiagnosticPath(pathname) {
  return pathname === "/api/auth/logout" || pathname === "/api/auth/logout-transition";
}

function installLogoutDiagnostics(page, label) {
  page.on("request", (request) => {
    try {
      const url = new URL(request.url());
      if (isLogoutDiagnosticPath(url.pathname)) {
        console.log(`[auth-nav] ${label} request ${request.method()} ${url.pathname}`);
      }
    } catch {
      // Ignore non-URL browser requests.
    }
  });
  page.on("response", (response) => {
    try {
      const url = new URL(response.url());
      if (isLogoutDiagnosticPath(url.pathname)) {
        console.log(`[auth-nav] ${label} response ${response.status()} ${url.pathname}`);
      }
    } catch {
      // Ignore non-URL browser responses.
    }
  });
  page.on("pageerror", (error) => {
    if (page.url().includes("/api/auth/logout-transition")) {
      console.log(`[auth-nav] ${label} transition pageerror ${error.name}: ${error.message}`);
    }
  });
}

async function transitionDiagnosticState(page) {
  try {
    if (!new URL(page.url()).pathname.includes("/api/auth/logout-transition")) return "";
    const state = await page.evaluate(() => ({
      readyState: document.readyState,
      marker: document.documentElement.dataset.hoahubLogoutTransition || "none",
      retryPresent: Boolean(document.querySelector('[data-hoahub-logout-retry="true"]')),
      scriptCount: document.scripts.length,
    }));
    return `; transition=${JSON.stringify(state)}`;
  } catch {
    return "; transition=unavailable";
  }
}

async function waitForObservedUrl(page, predicate, label) {
  const deadline = Date.now() + timeout;
  let lastUrl = page.url();
  while (Date.now() < deadline) {
    lastUrl = page.url();
    try {
      const current = new URL(lastUrl);
      if (predicate(current)) return current;
    } catch {
      // A transient, not-yet-committed URL is not success; keep observing.
    }
    await sleep(100);
  }
  const diagnostic = await transitionDiagnosticState(page);
  assert.fail(`${label}: timed out waiting for safe navigation; current URL ${lastUrl}${diagnostic}`);
}

async function exerciseLogoutAndBack(page, identity) {
  await page.goto(`${baseUrl}${identity.logoutRoute}`, { waitUntil: "networkidle2", timeout });
  const logoutButton = await currentLogoutButton(page);
  assert.ok(logoutButton, `${identity.label}: actionable current-session logout control was not found`);

  // The protected React tree exposes only an ordinary same-origin navigation link.
  // That GET reaches a private/no-store transition document outside React. Its
  // nonce-scoped script sends the authoritative same-origin PUT, validates the 204
  // destination header, then replaces the protected history entry with the login page.
  await logoutButton.click();
  await waitForObservedUrl(page, (url) => isLoginPath(url.pathname), `${identity.label} logout`);
  await page.waitForNetworkIdle({ idleTime: 300, timeout }).catch(() => undefined);
  assert.ok(isLoginPath(new URL(page.url()).pathname), `${identity.label}: logout did not reach a login page`);
  await assertNoGlobalError(page, `${identity.label} logout`);

  // Browser Back must never revive an interactive protected document after logout.
  // The root recovery guard reloads any protected history/BFCache entry so server
  // session validation redirects it back to the correct login surface.
  await page.goBack({ waitUntil: "domcontentloaded", timeout }).catch(() => undefined);
  await waitForObservedUrl(page, (url) => isLoginPath(url.pathname), `${identity.label} Back after logout`);
  await page.waitForNetworkIdle({ idleTime: 300, timeout }).catch(() => undefined);
  assert.ok(isLoginPath(new URL(page.url()).pathname), `${identity.label}: Back after logout exposed a protected route`);
  await assertNoGlobalError(page, `${identity.label} Back after logout`);
}

await provisionPlatformFixture();
const browser = await puppeteer.launch({ executablePath: await browserExecutable(), args: chromium.args, headless: true, defaultViewport: null });
try {
  for (const identity of identities) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    try {
      installLogoutDiagnostics(page, identity.label);
      await page.setViewport(identity.label === "homeowner"
        ? { width: 390, height: 844, deviceScaleFactor: 1 }
        : { width: 1440, height: 1000, deviceScaleFactor: 1 });
      await login(page, identity);
      await exerciseAuthenticatedBack(page, identity);
      await exerciseLogoutAndBack(page, identity);
    } finally {
      await context.close();
    }
  }
  console.log("Auth navigation recovery passed for tenant admin, platform admin, and homeowner shells.");
} finally {
  await browser.close();
  await cleanupPlatformFixture().catch(() => undefined);
  await prisma.$disconnect();
}
