import assert from "node:assert/strict";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const primaryTenantId = "e2e_onboarding_primary_tenant";
const secondaryTenantId = "e2e_onboarding_secondary_tenant";
const primaryTenantSlug = "ci-onboarding-primary";
const administratorEmail = process.env.E2E_ONBOARDING_ADMIN_EMAIL || "ci-onboarding-admin@example.invalid";
const restrictedEmail = process.env.E2E_ONBOARDING_RESTRICTED_EMAIL || "ci-onboarding-restricted@example.invalid";
const importedEmail = process.env.E2E_ONBOARDING_HOMEOWNER_EMAIL || "ci-onboarding-homeowner@example.invalid";
const password = process.env.E2E_ONBOARDING_PASSWORD || "CI-Onboarding-Password-2026!";
const timeout = 60_000;

function assertE2eDatabaseSafety() {
  const allowLocal = process.env.HOAHUB_E2E_ALLOW_LOCAL === "1";
  if (process.env.CI !== "true" && !allowLocal) {
    throw new Error(
      "The onboarding browser test is restricted to CI. Set HOAHUB_E2E_ALLOW_LOCAL=1 only for an explicit disposable local database run.",
    );
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for the onboarding browser test.");
  const host = new URL(databaseUrl).hostname;
  if (!allowLocal && !["127.0.0.1", "localhost", "mysql"].includes(host)) {
    throw new Error(`Refusing onboarding browser operations against non-disposable host: ${host}`);
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
  throw new Error("No Chromium or Chrome executable is available for the onboarding browser suite.");
}

async function createPage(context, viewport = { width: 1440, height: 1000 }) {
  const page = await context.newPage();
  await page.setViewport(viewport);
  page.setDefaultTimeout(timeout);
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      console.log(`[onboarding-browser:${message.type()}] ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => console.log(`[onboarding-browser:pageerror] ${error.message}`));
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
    throw new Error(`Expected ${label} on ${page.url()}. Page text: ${body.slice(0, 2500)}`, { cause: error });
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

async function login(page, email, expectedPathPrefix) {
  await page.goto(`${baseUrl}/${primaryTenantSlug}/login`, { waitUntil: "networkidle2", timeout });
  await page.waitForSelector("#identifier", { timeout });
  await page.type("#identifier", email);
  await page.type("#password", password);
  await clickByText(page, "button", "Sign in securely");
  await page.waitForFunction((prefix) => window.location.pathname.startsWith(prefix), { timeout }, expectedPathPrefix);
  await page.waitForNetworkIdle({ idleTime: 300, timeout }).catch(() => undefined);
}

async function setValue(page, selector, value) {
  await page.waitForSelector(selector, { timeout });
  await page.$eval(selector, (element, nextValue) => {
    const input = element;
    input.value = String(nextValue);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function check(page, selector) {
  await page.waitForSelector(selector, { timeout });
  await page.$eval(selector, (element) => {
    const input = element;
    input.checked = true;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function formWithButton(page, buttonText) {
  const forms = await page.$$("form");
  for (const form of forms) {
    const text = (await form.evaluate((node) => node.textContent || "")).replace(/\s+/g, " ").trim();
    if (text.includes(buttonText)) return form;
  }
  throw new Error(`No form containing ${buttonText} was found on ${page.url()}`);
}

async function submitForm(page, buttonText) {
  const form = await formWithButton(page, buttonText);
  const buttons = await form.$$("button[type='submit']");
  let target = null;
  for (const button of buttons) {
    const text = (await button.evaluate((node) => node.textContent || "")).replace(/\s+/g, " ").trim();
    if (text.includes(buttonText)) {
      target = button;
      break;
    }
  }
  if (!target) throw new Error(`Submit button ${buttonText} was not found on ${page.url()}`);
  const disabled = await target.evaluate((button) => button.disabled);
  assert.equal(disabled, false, `${buttonText} should be enabled.`);
  const navigation = page.waitForNavigation({ waitUntil: "networkidle2", timeout }).catch(() => null);
  await target.click();
  await navigation;
  await page.waitForNetworkIdle({ idleTime: 300, timeout }).catch(() => undefined);
}

async function uploadToForm(page, buttonText, path) {
  const form = await formWithButton(page, buttonText);
  const input = await form.$("input[type='file']");
  if (!input) throw new Error(`File input for ${buttonText} was not found.`);
  const disabled = await input.evaluate((element) => element.disabled);
  assert.equal(disabled, false, `File input for ${buttonText} should be enabled.`);
  await input.uploadFile(path);
}

async function run() {
  assertE2eDatabaseSafety();
  const fixtureTenant = await prisma.tenant.findUnique({ where: { id: primaryTenantId }, select: { id: true } });
  assert.ok(fixtureTenant, "Onboarding fixture tenant is missing. Run e2e:prepare first.");

  const temporaryDirectory = await mkdtemp(join(tmpdir(), "hoahub-onboarding-e2e-"));
  const csvPath = join(temporaryDirectory, "pilot-homeowners.csv");
  const csv = [
    "name,email,phone,address,block,lot,phase,propertyType,occupancyStatus,status,monthlyDuesAmount,accountNumber,openingBalance,openingBalanceAsOf",
    `E2E Imported Homeowner,${importedEmail},09171234567,7 Shared Street,7,9,Phase 1,HOUSE_AND_LOT,OWNER_OCCUPIED,ACTIVE,825.50,,1250.50,2026-07-31`,
  ].join("\n");
  await writeFile(csvPath, csv, "utf8");

  const executablePath = await resolveBrowserExecutable();
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox"],
    defaultViewport: null,
  });
  const administratorContext = await browser.createBrowserContext();
  const restrictedContext = await browser.createBrowserContext();
  const administratorPage = await createPage(administratorContext);
  const restrictedPage = await createPage(restrictedContext);

  try {
    await login(restrictedPage, restrictedEmail, "/admin/");
    await restrictedPage.goto(`${baseUrl}/admin/onboarding`, { waitUntil: "networkidle2", timeout });
    assert.notEqual(new URL(restrictedPage.url()).pathname, "/admin/onboarding", "Restricted staff must not access tenant onboarding.");

    await login(administratorPage, administratorEmail, "/admin/");
    await administratorPage.goto(`${baseUrl}/admin/onboarding`, { waitUntil: "networkidle2", timeout });
    await expectText(administratorPage, "Onboarding and first billing preview");
    await expectText(administratorPage, "Billing generation is always a separate authorized action");

    await setValue(administratorPage, "input[name='name']", "E2E Onboarding Primary HOA Updated");
    await setValue(administratorPage, "input[name='shortName']", "E2E-ONBOARD");
    await setValue(administratorPage, "input[name='supportEmail']", "support-onboarding@example.invalid");
    await setValue(administratorPage, "input[name='supportPhone']", "09175550000");
    await setValue(administratorPage, "input[name='timezone']", "Asia/Manila");
    await setValue(administratorPage, "input[name='currency']", "PHP");
    await setValue(administratorPage, "input[name='receiptPrefix']", "ON-OR");
    await setValue(administratorPage, "input[name='documentPrefix']", "ON-DOC");
    await setValue(administratorPage, "textarea[name='address']", "Updated E2E Onboarding Address");
    await submitForm(administratorPage, "Save profile defaults");
    await expectText(administratorPage, "Tenant profile and operational defaults saved");

    await check(administratorPage, "input[name='dataControllerAccepted']");
    await check(administratorPage, "input[name='secureHandlingAccepted']");
    await check(administratorPage, "input[name='importAuthorizationAccepted']");
    await submitForm(administratorPage, "Record acknowledgement");
    await expectText(administratorPage, "Privacy and import responsibilities acknowledged");

    await administratorPage.goto(`${baseUrl}/admin/dashboard`, { waitUntil: "networkidle2", timeout });
    await administratorPage.goto(`${baseUrl}/admin/onboarding`, { waitUntil: "networkidle2", timeout });
    const resumedTimezone = await administratorPage.$eval("input[name='timezone']", (element) => element.value);
    const resumedPrivacy = await administratorPage.$eval("input[name='dataControllerAccepted']", (element) => element.checked);
    assert.equal(resumedTimezone, "Asia/Manila", "Saved profile state should survive navigation.");
    assert.equal(resumedPrivacy, true, "Privacy acknowledgement should survive navigation.");

    await uploadToForm(administratorPage, "Validate without writing", csvPath);
    await submitForm(administratorPage, "Validate without writing");
    await expectText(administratorPage, "Dry run passed for 1 homeowner row");
    assert.equal(await prisma.user.count({ where: { tenantId: primaryTenantId, email: importedEmail } }), 0, "Dry run must not create a user.");

    const expectedFileHash = await administratorPage.$eval("input[name='expectedFileHash']", (element) => element.value);
    assert.match(expectedFileHash, /^[a-f0-9]{64}$/, "Successful validation should expose the exact file hash to the apply form.");
    await uploadToForm(administratorPage, "Apply import", csvPath);
    await check(administratorPage, "input[name='confirmApply']");
    await submitForm(administratorPage, "Apply import");
    await expectText(administratorPage, "1 homeowner record imported");

    const billCountAfterImport = await prisma.bill.count({ where: { tenantId: primaryTenantId } });
    assert.equal(billCountAfterImport, 1, "Opening balance import should create exactly one bill before preview.");

    await setValue(administratorPage, "input[name='monthlyAmount']", "825.50");
    await setValue(administratorPage, "input[name='dueDay']", "15");
    await setValue(administratorPage, "input[name='effectiveFrom']", "2026-09");
    await setValue(administratorPage, "textarea[name='description']", "E2E board-approved initial monthly dues rule.");
    await submitForm(administratorPage, "Save manual billing rule");
    await expectText(administratorPage, "No bills were generated");

    await setValue(administratorPage, "input[name='targetMonth']", "2026-09");
    await submitForm(administratorPage, "Run preview only");
    await expectText(administratorPage, "Preview complete");
    await expectText(administratorPage, "No bills were generated");
    assert.equal(await prisma.bill.count({ where: { tenantId: primaryTenantId } }), billCountAfterImport, "Preview must not persist bills.");

    await check(administratorPage, "input[name='confirmComplete']");
    await submitForm(administratorPage, "Complete onboarding");
    await expectText(administratorPage, "Tenant onboarding is complete");

    await administratorPage.setViewport({ width: 390, height: 844 });
    await administratorPage.reload({ waitUntil: "networkidle2", timeout });
    await expectText(administratorPage, "Onboarding and first billing preview");
    const overflow = await administratorPage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 2, `Onboarding page should not horizontally overflow a mobile viewport; overflow=${overflow}.`);

    const importedUser = await prisma.user.findFirstOrThrow({
      where: { tenantId: primaryTenantId, email: importedEmail },
      include: {
        homeownerProfile: true,
        userRoleAssignments: true,
        homeownerActivationCredentials: true,
        homeownerEmailVerificationTokens: true,
      },
    });
    assert.equal(importedUser.role, "HOMEOWNER");
    assert.equal(importedUser.homeownerProfile?.activationStatus, "INVITATION_SENT");
    assert.equal(importedUser.homeownerProfile?.emailStatus, "UNVERIFIED");
    assert.match(importedUser.homeownerProfile?.accountNumber ?? "", /^[1-9][0-9]{10}$/);
    assert.equal(importedUser.userRoleAssignments.some((assignment) => assignment.active && assignment.role === "HOMEOWNER"), true);
    assert.equal(importedUser.homeownerActivationCredentials.length, 1);
    assert.equal(importedUser.homeownerEmailVerificationTokens.length, 1);

    const onboardingSetting = await prisma.systemSetting.findFirstOrThrow({
      where: { tenantId: primaryTenantId, key: "TENANT_ONBOARDING_V1" },
      select: { value: true },
    });
    const onboardingState = JSON.parse(onboardingSetting.value ?? "{}");
    assert.ok(onboardingState.completedAt, "Onboarding state should record completion.");
    assert.equal(onboardingState.preview?.confirmationRequired, true);

    const auditActions = await prisma.auditLog.findMany({
      where: { tenantId: primaryTenantId, module: "ONBOARDING" },
      select: { action: true },
    });
    for (const action of [
      "TENANT_PROFILE_CONFIGURED",
      "PRIVACY_RESPONSIBILITIES_ACKNOWLEDGED",
      "HOMEOWNER_IMPORT_VALIDATED",
      "HOMEOWNER_IMPORT_APPLIED",
      "BILLING_RULE_CREATED",
      "FIRST_BILLING_PREVIEW_COMPLETED",
      "TENANT_ONBOARDING_COMPLETED",
    ]) {
      assert.equal(auditActions.some((entry) => entry.action === action), true, `Missing onboarding audit action ${action}.`);
    }

    assert.equal(await prisma.user.count({ where: { tenantId: secondaryTenantId, email: importedEmail } }), 1, "Secondary tenant fixture must remain intact.");
    assert.equal(await prisma.bill.count({ where: { tenantId: secondaryTenantId } }), 0, "Onboarding must not create secondary-tenant bills.");
    assert.equal(await prisma.systemSetting.count({ where: { tenantId: secondaryTenantId, key: "TENANT_ONBOARDING_V1" } }), 0, "Onboarding state must remain tenant-isolated.");

    console.log("Tenant onboarding browser workflow passed.");
  } finally {
    await administratorContext.close().catch(() => undefined);
    await restrictedContext.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
    await rm(temporaryDirectory, { recursive: true, force: true });
    await prisma.$disconnect();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
