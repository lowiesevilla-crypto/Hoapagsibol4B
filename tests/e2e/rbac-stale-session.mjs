import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { PrismaClient, Role } from "@prisma/client";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const tenantId = "tenant_pagsibol4b_default";
const restrictedUserId = "e2e_rbac_restricted_user";
const protectedTargetId = "e2e_rbac_protected_target";
const platformAdministratorEmail =
  process.env.E2E_PLATFORM_ADMIN_EMAIL || "ci-platform-admin@example.invalid";
const restrictedUserEmail =
  process.env.E2E_RESTRICTED_USER_EMAIL || "ci-restricted-staff@example.invalid";
const securityPassword =
  process.env.E2E_SECURITY_PASSWORD || "CI-Security-Password-2026!";
const timeout = 45_000;

function assertE2eDatabaseSafety() {
  const allowLocal = process.env.HOAHUB_E2E_ALLOW_LOCAL === "1";
  if (process.env.CI !== "true" && !allowLocal) {
    throw new Error(
      "The RBAC stale-session browser test is restricted to CI. Set HOAHUB_E2E_ALLOW_LOCAL=1 only for an explicit disposable local database run.",
    );
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for the RBAC stale-session browser test.");
  const host = new URL(databaseUrl).hostname;
  if (!allowLocal && !["127.0.0.1", "localhost", "mysql"].includes(host)) {
    throw new Error(`Refusing RBAC browser operations against non-disposable host: ${host}`);
  }
}

async function pathExists(path) {
  if (!path) return false;
  try {
    await access(path);
    return true;
  } catch {
    return false;
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
  throw new Error("No Chromium or Chrome executable is available for the RBAC browser suite.");
}

async function createPage(context) {
  const page = await context.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  page.setDefaultTimeout(timeout);
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      console.log(`[rbac-browser:${message.type()}] ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => console.log(`[rbac-browser:pageerror] ${error.message}`));
  return page;
}

async function pageText(page) {
  return page.evaluate(() => document.body?.textContent || "");
}

async function expectText(page, expected, label = expected) {
  try {
    await page.waitForFunction(
      (text) => (document.body?.textContent || "").includes(text),
      { timeout },
      expected,
    );
  } catch (error) {
    const body = (await pageText(page)).replace(/\s+/g, " ").trim();
    throw new Error(
      `Expected ${label} on ${page.url()}. Page text: ${body.slice(0, 2000)}`,
      { cause: error },
    );
  }
}

async function clickByText(page, selector, matcher) {
  const elements = await page.$$(selector);
  for (const element of elements) {
    const text = (await element.evaluate((node) => node.textContent || ""))
      .replace(/\s+/g, " ")
      .trim();
    const matches = typeof matcher === "string" ? text.includes(matcher) : matcher.test(text);
    if (matches) {
      await element.click();
      return;
    }
  }
  throw new Error(`No ${selector} matched ${String(matcher)} on ${page.url()}`);
}

async function clickAndWaitForNavigation(page, selector, matcher) {
  const navigation = page.waitForNavigation({ waitUntil: "networkidle2", timeout }).catch(() => null);
  await clickByText(page, selector, matcher);
  await navigation;
  await page.waitForNetworkIdle({ idleTime: 300, timeout }).catch(() => undefined);
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
  await page.waitForNetworkIdle({ idleTime: 300, timeout }).catch(() => undefined);
}

async function expectLoginPath(page, label) {
  await page.waitForFunction(
    () => window.location.pathname === "/login" || /\/login$/.test(window.location.pathname),
    { timeout },
  );
  assert.ok(
    page.url().includes("/login"),
    `Expected ${label} to be redirected to a login route, received ${page.url()}`,
  );
}

async function captureRoleAssignmentForm(page, userId) {
  return page.evaluate((expectedUserId) => {
    const forms = Array.from(document.querySelectorAll("form"));
    const form = forms.find((candidate) => {
      const userInput = candidate.querySelector("input[name='userId']");
      const roleCheckbox = candidate.querySelector("input[type='checkbox'][name='roles']");
      return userInput?.value === expectedUserId && Boolean(roleCheckbox);
    });
    if (!form) throw new Error(`Role assignment form for ${expectedUserId} was not found.`);
    return {
      action: form.action || window.location.href,
      method: form.method || "post",
      enctype: form.enctype || "application/x-www-form-urlencoded",
      entries: Array.from(new FormData(form).entries()).map(([name, value]) => [name, String(value)]),
    };
  }, userId);
}

async function submitCapturedForm(page, formSpec, overrides) {
  const navigation = page.waitForNavigation({ waitUntil: "networkidle2", timeout }).catch(() => null);
  await page.evaluate(
    ({ spec, replacementValues }) => {
      const form = document.createElement("form");
      form.action = spec.action;
      form.method = spec.method;
      form.enctype = spec.enctype;
      const overriddenNames = new Set(Object.keys(replacementValues));
      for (const [name, originalValue] of spec.entries) {
        if (overriddenNames.has(name)) continue;
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = originalValue;
        form.appendChild(input);
      }
      for (const [name, replacement] of Object.entries(replacementValues)) {
        const values = Array.isArray(replacement) ? replacement : [replacement];
        for (const value of values) {
          const input = document.createElement("input");
          input.type = "hidden";
          input.name = name;
          input.value = value;
          form.appendChild(input);
        }
      }
      document.body.appendChild(form);
      form.submit();
    },
    { spec: formSpec, replacementValues: overrides },
  );
  await navigation;
  await page.waitForNetworkIdle({ idleTime: 300, timeout }).catch(() => undefined);
}

async function selectOnlyRole(page, role) {
  await page.$$eval(
    "input[type='checkbox'][name='roles']",
    (inputs, selectedRole) => {
      for (const input of inputs) input.checked = input.value === selectedRole;
    },
    role,
  );
}

async function assertAllSessionsRevoked(userId, label) {
  const sessions = await prisma.userSession.findMany({
    where: { tenantId, userId },
    select: { revokedAt: true },
  });
  assert.ok(sessions.length > 0, `Expected at least one issued session for ${label}.`);
  assert.ok(
    sessions.every((session) => session.revokedAt),
    `Expected every issued session for ${label} to be revoked.`,
  );
}

async function run() {
  assertE2eDatabaseSafety();
  const executablePath = await resolveBrowserExecutable();
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox"],
    defaultViewport: null,
  });

  const platformContext = await browser.createBrowserContext();
  const restrictedContext = await browser.createBrowserContext();
  const platformPage = await createPage(platformContext);
  const restrictedPage = await createPage(restrictedContext);

  try {
    await login(platformPage, platformAdministratorEmail, securityPassword, "/platform/");
    await expectText(platformPage, "Tenant Management", "platform administrator landing page");

    await login(restrictedPage, restrictedUserEmail, securityPassword, "/admin/chat");
    await expectText(restrictedPage, "Chat", "restricted staff landing page");

    const initialActiveSessions = await prisma.userSession.count({
      where: { tenantId, userId: restrictedUserId, revokedAt: null },
    });
    assert.equal(initialActiveSessions, 1, "Expected one active restricted-user session before security changes.");

    await restrictedPage.goto(`${baseUrl}/platform/tenants`, {
      waitUntil: "networkidle2",
      timeout,
    });
    const deniedPlatformPath = new URL(restrictedPage.url()).pathname;
    assert.ok(
      deniedPlatformPath.startsWith("/admin/") && !deniedPlatformPath.startsWith("/platform/"),
      `Restricted staff should be denied platform pages, received ${restrictedPage.url()}`,
    );

    const protectedTargetUrl = `${baseUrl}/platform/tenants/${tenantId}/users/${protectedTargetId}`;
    await platformPage.goto(protectedTargetUrl, { waitUntil: "networkidle2", timeout });
    await expectText(platformPage, "E2E Protected Target");
    const protectedTargetForm = await captureRoleAssignmentForm(platformPage, protectedTargetId);

    await submitCapturedForm(restrictedPage, protectedTargetForm, {
      roles: [Role.SYSTEM_ADMIN],
    });
    assert.ok(
      new URL(restrictedPage.url()).pathname.startsWith("/admin/dashboard"),
      `Restricted server-action submission should be denied before mutation, received ${restrictedPage.url()}`,
    );

    const protectedTarget = await prisma.user.findFirst({
      where: { tenantId, id: protectedTargetId },
      select: {
        role: true,
        userRoleAssignments: { where: { active: true }, select: { role: true } },
      },
    });
    assert.equal(
      protectedTarget?.role,
      Role.STAFF,
      "A restricted session must not change another user's compatibility role through a captured platform action.",
    );
    assert.deepEqual(
      protectedTarget?.userRoleAssignments.map((assignment) => assignment.role) ?? [],
      [],
      "A restricted session must not create active role assignments through a captured platform action.",
    );
    assert.equal(
      await prisma.auditLog.count({
        where: {
          tenantId,
          entityId: protectedTargetId,
          action: "TENANT_USER_ROLES_REPLACED",
        },
      }),
      0,
      "Denied role mutation must not create a misleading success audit record.",
    );

    const restrictedUserUrl = `${baseUrl}/platform/tenants/${tenantId}/users/${restrictedUserId}`;
    await platformPage.goto(restrictedUserUrl, { waitUntil: "networkidle2", timeout });
    await expectText(platformPage, "E2E Restricted Staff");
    await selectOnlyRole(platformPage, Role.BILLING_MANAGER);
    await clickAndWaitForNavigation(platformPage, "button", "Save Role Assignments");

    const roleChangedUser = await prisma.user.findFirst({
      where: { tenantId, id: restrictedUserId },
      select: {
        role: true,
        active: true,
        userRoleAssignments: { where: { active: true }, select: { role: true } },
      },
    });
    assert.equal(roleChangedUser?.role, Role.BILLING_MANAGER);
    assert.equal(roleChangedUser?.active, true);
    assert.deepEqual(
      roleChangedUser?.userRoleAssignments.map((assignment) => assignment.role) ?? [],
      [Role.BILLING_MANAGER],
    );
    await assertAllSessionsRevoked(restrictedUserId, "the role-changed user");

    await restrictedPage.goto(`${baseUrl}/admin/chat`, {
      waitUntil: "networkidle2",
      timeout,
    });
    await expectLoginPath(restrictedPage, "the stale pre-role-change session");

    await restrictedContext.close();
    const billingContext = await browser.createBrowserContext();
    const billingPage = await createPage(billingContext);
    try {
      await login(billingPage, restrictedUserEmail, securityPassword, "/admin/billing");
      await expectText(billingPage, "Billing generation", "billing-manager landing page");

      assert.equal(
        await prisma.userSession.count({
          where: { tenantId, userId: restrictedUserId, revokedAt: null },
        }),
        1,
        "Expected one fresh billing-manager session before deactivation.",
      );

      await platformPage.goto(restrictedUserUrl, { waitUntil: "networkidle2", timeout });
      await clickAndWaitForNavigation(platformPage, "button", "Deactivate User");

      const deactivatedUser = await prisma.user.findFirst({
        where: { tenantId, id: restrictedUserId },
        select: { role: true, active: true },
      });
      assert.equal(deactivatedUser?.role, Role.BILLING_MANAGER);
      assert.equal(deactivatedUser?.active, false);
      await assertAllSessionsRevoked(restrictedUserId, "the deactivated user");

      await billingPage.goto(`${baseUrl}/admin/billing`, {
        waitUntil: "networkidle2",
        timeout,
      });
      await expectLoginPath(billingPage, "the stale pre-deactivation session");

      await billingPage.goto(`${baseUrl}/login`, { waitUntil: "networkidle2", timeout });
      await billingPage.type("#identifier", restrictedUserEmail);
      await billingPage.type("#password", securityPassword);
      await clickByText(billingPage, "button", "Sign in securely");
      await expectText(
        billingPage,
        "Incorrect identifier or password.",
        "inactive-account login denial",
      );

      const auditActions = await prisma.auditLog.findMany({
        where: {
          tenantId,
          entityId: restrictedUserId,
          action: { in: ["TENANT_USER_ROLES_REPLACED", "TENANT_USER_DEACTIVATED"] },
        },
        select: { action: true },
      });
      assert.deepEqual(
        new Set(auditActions.map((audit) => audit.action)),
        new Set(["TENANT_USER_ROLES_REPLACED", "TENANT_USER_DEACTIVATED"]),
        "Expected audit evidence for the legitimate role assignment replacement and deactivation.",
      );
    } finally {
      await billingContext.close();
    }

    console.log("RBAC and stale-session browser suite passed:");
    console.log("- restricted platform page access denial passed");
    console.log("- captured privileged role-assignment action denial passed");
    console.log("- denied assignment mutation and audit non-creation passed");
    console.log("- role assignment replacement revoked issued sessions passed");
    console.log("- stale pre-role-change session denial passed");
    console.log("- deactivation revoked issued sessions passed");
    console.log("- stale pre-deactivation session and inactive login denial passed");
    console.log("- legitimate security-change audit evidence passed");
  } finally {
    await Promise.allSettled([
      platformContext.close(),
      restrictedContext.close(),
    ]);
    await browser.close();
    await prisma.$disconnect();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
