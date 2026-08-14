import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const baseUrl = requireHttpsUrl(process.env.HOSTINGER_APP_URL, "HOSTINGER_APP_URL");
const identifier = requireSecret(process.env.PROD_E2E_LOGIN, "PROD_E2E_LOGIN");
const password = requireSecret(process.env.PROD_E2E_PASSWORD, "PROD_E2E_PASSWORD");
const tenantSlug = normalizeTenantSlug(process.env.PROD_E2E_TENANT_SLUG || "");
const expectedPathPrefix = normalizeExpectedPath(process.env.PROD_E2E_EXPECTED_PATH_PREFIX || "/portal/");
const timeout = 45_000;

function requireSecret(value, name) {
  if (!value?.trim()) throw new Error(`${name} is required for production login verification.`);
  return value;
}

function requireHttpsUrl(value, name) {
  if (!value?.trim()) throw new Error(`${name} is required for production login verification.`);
  const parsed = new URL(value);
  if (parsed.protocol !== "https:") throw new Error(`${name} must use HTTPS.`);
  return parsed.origin;
}

function normalizeTenantSlug(value) {
  const slug = value.trim();
  if (!slug) return "";
  if (!/^[a-z0-9-]+$/i.test(slug)) throw new Error("PROD_E2E_TENANT_SLUG contains unsupported characters.");
  return slug;
}

function normalizeExpectedPath(value) {
  const path = value.trim();
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error("PROD_E2E_EXPECTED_PATH_PREFIX must be a same-origin absolute path prefix.");
  }
  return path;
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
  const packaged = await chromium.executablePath();
  if (await pathExists(packaged)) return packaged;

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
  throw new Error("No Chromium or Chrome executable is available for production login verification.");
}

function loginUrl() {
  return tenantSlug ? `${baseUrl}/${tenantSlug}/login` : `${baseUrl}/login`;
}

async function createPage(browser, viewport) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport(viewport);
  page.setDefaultTimeout(timeout);
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      console.log(`[production-login:${message.type()}] ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => console.log(`[production-login:pageerror] ${error.message}`));
  return { context, page };
}

async function assertVisibleAnimatedLogo(page, selector, label) {
  await page.waitForSelector(selector, { visible: true, timeout });
  const details = await page.$eval(selector, (image) => {
    const wrapper = image.parentElement;
    if (!wrapper) return { visible: false, animations: 0, animationNames: [] };

    const rect = wrapper.getBoundingClientRect();
    const style = window.getComputedStyle(wrapper);
    const pseudoBefore = window.getComputedStyle(wrapper, "::before");
    const pseudoAfter = window.getComputedStyle(wrapper, "::after");
    const animations = wrapper.getAnimations({ subtree: true }).filter((animation) => animation.playState === "running").length;
    const animationNames = [style.animationName, pseudoBefore.animationName, pseudoAfter.animationName]
      .flatMap((entry) => entry.split(","))
      .map((entry) => entry.trim())
      .filter((entry) => entry && entry !== "none");

    return {
      visible: rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0,
      animations,
      animationNames,
    };
  });

  assert.equal(details.visible, true, `${label} logo/orbit wrapper must be visible.`);
  assert.ok(
    details.animations > 0 || details.animationNames.length > 0,
    `${label} secure orbit must have active CSS/Web Animations motion.`,
  );
}

async function delayAuthenticationPost(page) {
  let delayed = false;
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    if (!delayed && request.method() === "POST") {
      delayed = true;
      setTimeout(() => request.continue().catch(() => undefined), 900);
      return;
    }
    request.continue().catch(() => undefined);
  });
}

async function waitForText(page, text, label) {
  await page.waitForFunction(
    (expected) => (document.body?.textContent || "").includes(expected),
    { timeout },
    text,
  );
  const body = await page.evaluate(() => document.body?.textContent || "");
  assert.ok(body.includes(text), `Expected ${label}.`);
}

async function runLoginMotionFlow(browser, { label, viewport, logoSelector }) {
  const { context, page } = await createPage(browser, viewport);
  try {
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "no-preference" }]);
    await page.goto(loginUrl(), { waitUntil: "networkidle2", timeout });
    await assertVisibleAnimatedLogo(page, logoSelector, label);

    await page.waitForSelector("#identifier", { visible: true, timeout });
    await page.waitForSelector("#password", { visible: true, timeout });
    await page.type("#identifier", identifier);
    await page.type("#password", password);

    await delayAuthenticationPost(page);
    await page.click("button[type='submit']");
    await waitForText(page, "Verifying access…", `${label} pending verification state`);
    await waitForText(page, "Access verified", `${label} verified success state`);
    await waitForText(page, "Opening your HOAHub dashboard…", `${label} dashboard handoff copy`);

    await page.waitForFunction(
      (prefix) => window.location.pathname.startsWith(prefix),
      { timeout },
      expectedPathPrefix,
    );

    await page.waitForSelector('[data-login-handoff="active"]', { visible: true, timeout });
    const handoffAnimations = await page.$eval('[data-login-handoff="active"]', (element) =>
      element.getAnimations({ subtree: true }).filter((animation) => animation.playState === "running").length,
    );
    assert.ok(handoffAnimations > 0, `${label} post-login brand handoff must visibly animate.`);

    console.log(`PASS ${label}: secure orbit → Verifying access… → Access verified → dashboard → one-shot brand handoff.`);
  } finally {
    await context.close();
  }
}

const executablePath = await resolveBrowserExecutable();
const headlessMode = "shell";
const browser = await puppeteer.launch({
  executablePath,
  headless: headlessMode,
  args: await puppeteer.defaultArgs({ args: chromium.args, headless: headlessMode }),
});

try {
  await runLoginMotionFlow(browser, {
    label: "desktop/web",
    viewport: { width: 1440, height: 1000, deviceScaleFactor: 1 },
    logoSelector: "main > section:first-of-type img[alt$=' logo']",
  });

  await runLoginMotionFlow(browser, {
    label: "mobile/PWA viewport",
    viewport: { width: 390, height: 844, deviceScaleFactor: 1 },
    logoSelector: "main > section:nth-of-type(2) img[alt$=' logo']",
  });

  console.log("Production login motion verification passed for desktop/web and mobile/PWA viewports.");
} finally {
  await browser.close();
}
