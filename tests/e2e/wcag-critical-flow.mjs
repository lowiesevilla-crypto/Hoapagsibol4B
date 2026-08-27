import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const adminEmail = process.env.E2E_ADMIN_EMAIL || process.env.SEED_SYSTEM_ADMIN_EMAIL || "ci-system@example.invalid";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || process.env.SEED_SYSTEM_ADMIN_PASSWORD || "CI-Temporary-Password-2026!";
const homeownerEmail = process.env.E2E_HOMEOWNER_EMAIL || "ci-homeowner@example.invalid";
const homeownerPassword = process.env.E2E_HOMEOWNER_PASSWORD || "CI-Homeowner-Password-2026!";
const timeout = 45_000;

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
  throw new Error("No Chromium or Chrome executable is available for the WCAG critical-flow suite.");
}

async function clickNamedButton(page, name) {
  const clicked = await page.evaluate((expected) => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const button = buttons.find((node) => (node.textContent || "").replace(/\s+/g, " ").trim().includes(expected));
    if (!button) return false;
    button.click();
    return true;
  }, name);
  assert.ok(clicked, `Expected button containing ${name} on ${page.url()}`);
}

async function login(page, email, password, expectedPrefix) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle2", timeout });
  await assertAccessibilitySurface(page, "Login");
  await page.type("#identifier", email);
  await page.type("#password", password);
  await clickNamedButton(page, "Sign in securely");
  await page.waitForFunction((prefix) => window.location.pathname.startsWith(prefix), { timeout }, expectedPrefix);
  await page.waitForNetworkIdle({ idleTime: 300, timeout }).catch(() => undefined);
}

async function assertAccessibilitySurface(page, label) {
  const findings = await page.evaluate(() => {
    const visible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const normalized = (value) => (value || "").replace(/\s+/g, " ").trim();
    const ids = new Map();
    for (const element of document.querySelectorAll("[id]")) {
      if (!element.id) continue;
      ids.set(element.id, (ids.get(element.id) || 0) + 1);
    }
    const duplicateIds = [...ids.entries()].filter(([, count]) => count > 1).map(([id]) => id);

    const unnamedButtons = [...document.querySelectorAll("button")]
      .filter(visible)
      .filter((element) => !normalized(element.getAttribute("aria-label")) && !normalized(element.textContent))
      .map((element) => element.outerHTML.slice(0, 180));

    const unnamedLinks = [...document.querySelectorAll("a[href]")]
      .filter(visible)
      .filter((element) => !normalized(element.getAttribute("aria-label")) && !normalized(element.textContent))
      .map((element) => element.outerHTML.slice(0, 180));

    const unlabeledControls = [...document.querySelectorAll("input:not([type='hidden']), select, textarea")]
      .filter(visible)
      .filter((element) => {
        const id = element.id;
        const explicitLabel = id && document.querySelector(`label[for="${CSS.escape(id)}"]`);
        const wrappingLabel = element.closest("label");
        const ariaLabel = normalized(element.getAttribute("aria-label"));
        const ariaLabelledBy = normalized(element.getAttribute("aria-labelledby"));
        return !explicitLabel && !wrappingLabel && !ariaLabel && !ariaLabelledBy;
      })
      .map((element) => `${element.tagName.toLowerCase()}#${element.id || "(no-id)"}[name=${element.getAttribute("name") || ""}]`);

    const imagesMissingAlt = [...document.querySelectorAll("img")]
      .filter(visible)
      .filter((element) => !element.hasAttribute("alt"))
      .map((element) => element.getAttribute("src") || "(inline image)");

    const mainCount = document.querySelectorAll("main").length;
    const headingCount = document.querySelectorAll("h1, h2, h3, h4, h5, h6").length;
    return {
      title: normalized(document.title),
      duplicateIds,
      unnamedButtons,
      unnamedLinks,
      unlabeledControls,
      imagesMissingAlt,
      mainCount,
      headingCount,
    };
  });

  assert.ok(findings.title, `${label}: page must have a non-empty document title`);
  assert.equal(findings.duplicateIds.length, 0, `${label}: duplicate ids: ${findings.duplicateIds.join(", ")}`);
  assert.equal(findings.unnamedButtons.length, 0, `${label}: unnamed buttons: ${findings.unnamedButtons.join(" | ")}`);
  assert.equal(findings.unnamedLinks.length, 0, `${label}: unnamed links: ${findings.unnamedLinks.join(" | ")}`);
  assert.equal(findings.unlabeledControls.length, 0, `${label}: unlabeled controls: ${findings.unlabeledControls.join(", ")}`);
  assert.equal(findings.imagesMissingAlt.length, 0, `${label}: visible images without alt: ${findings.imagesMissingAlt.join(", ")}`);
  assert.ok(findings.mainCount >= 1, `${label}: expected a main landmark`);
  assert.ok(findings.headingCount >= 1, `${label}: expected at least one heading`);

  const keyboardTarget = await page.evaluate(() => {
    const selector = "a[href], button:not([disabled]), input:not([disabled]):not([type='hidden']), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
    const candidate = [...document.querySelectorAll(selector)].find((element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    });
    if (!candidate) return null;
    candidate.focus();
    return document.activeElement === candidate ? candidate.tagName : null;
  });
  assert.ok(keyboardTarget, `${label}: expected at least one keyboard-focusable control`);
}

async function visitAndCheck(page, path, label) {
  await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle2", timeout });
  assert.ok(!page.url().includes("/login"), `${label}: authenticated route unexpectedly redirected to login`);
  await assertAccessibilitySurface(page, label);
}

const executablePath = await resolveBrowserExecutable();
const headlessMode = "shell";
const browser = await puppeteer.launch({
  executablePath,
  headless: headlessMode,
  args: await puppeteer.defaultArgs({ args: chromium.args, headless: headlessMode }),
});

try {
  const adminContext = await browser.createBrowserContext();
  const adminPage = await adminContext.newPage();
  adminPage.setDefaultTimeout(timeout);
  await adminPage.setViewport({ width: 1440, height: 1000 });
  await login(adminPage, adminEmail, adminPassword, "/admin/");
  await visitAndCheck(adminPage, "/admin/homeowners", "Homeowner search");
  await visitAndCheck(adminPage, "/admin/billing", "Billing");
  await visitAndCheck(adminPage, "/admin/payments/record", "Record Payment");
  await visitAndCheck(adminPage, "/admin/documents", "Documents");
  await visitAndCheck(adminPage, "/admin/complaints", "Complaints");
  await adminContext.close();

  const homeownerContext = await browser.createBrowserContext();
  const homeownerPage = await homeownerContext.newPage();
  homeownerPage.setDefaultTimeout(timeout);
  await homeownerPage.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await login(homeownerPage, homeownerEmail, homeownerPassword, "/portal/");
  await visitAndCheck(homeownerPage, "/portal", "Homeowner mobile portal");
  await homeownerContext.close();

  console.log("WCAG critical-flow browser gate passed:");
  console.log("- named visible buttons and links");
  console.log("- labeled visible form controls");
  console.log("- no duplicate ids or visible images missing alt");
  console.log("- main landmark, heading, document title and keyboard-focusable control on each critical route");
} finally {
  await browser.close();
}
