import assert from "node:assert/strict";
import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const adminEmail = process.env.E2E_ADMIN_EMAIL || process.env.SEED_SYSTEM_ADMIN_EMAIL || "ci-system@example.invalid";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || process.env.SEED_SYSTEM_ADMIN_PASSWORD || "CI-Temporary-Password-2026!";
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

async function login(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle2", timeout });
  await page.waitForSelector("#identifier", { timeout });
  await page.type("#identifier", adminEmail);
  await page.type("#password", adminPassword);
  const buttons = await page.$$("button");
  let clicked = false;
  for (const button of buttons) {
    const text = await button.evaluate((node) => (node.textContent || "").replace(/\s+/g, " ").trim());
    if (text.includes("Sign in securely")) { await button.click(); clicked = true; break; }
  }
  assert.ok(clicked, "Expected login submit button");
  await page.waitForFunction(() => window.location.pathname.startsWith("/admin/"), { timeout });
  await page.waitForNetworkIdle({ idleTime: 500, timeout }).catch(() => undefined);
}

async function assertScopedAsides(page, route, expectedContentAsideCount = 1) {
  await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle2", timeout });
  assert.equal(new URL(page.url()).pathname, route, `${route} redirected unexpectedly to ${page.url()}`);

  const result = await page.evaluate(() => {
    const allAsides = Array.from(document.querySelectorAll("aside"));
    const appSidebar = allAsides.find((node) => node.classList.contains("lg:fixed"));
    const contentAsides = Array.from(document.querySelectorAll("main aside"));
    const summarize = (node) => {
      const style = getComputedStyle(node);
      return {
        className: node.className,
        width: node.getBoundingClientRect().width,
        backgroundImage: style.backgroundImage,
        backgroundColor: style.backgroundColor,
        boxShadow: style.boxShadow,
      };
    };
    return {
      appSidebar: appSidebar ? summarize(appSidebar) : null,
      contentAsides: contentAsides.map(summarize),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  assert.ok(result.appSidebar, `${route} should keep the real application sidebar`);
  assert.ok(result.appSidebar.width >= 295 && result.appSidebar.width <= 305, `${route} application sidebar should remain ~300px, received ${result.appSidebar.width}`);
  assert.match(result.appSidebar.backgroundImage, /linear-gradient/, `${route} application sidebar should retain the Canva gradient`);
  assert.ok(result.contentAsides.length >= expectedContentAsideCount, `${route} should expose at least ${expectedContentAsideCount} page-level aside for regression verification`);

  for (const aside of result.contentAsides) {
    assert.ok(!(aside.width >= 295 && aside.width <= 305), `${route} page-level aside was incorrectly forced to 300px`);
    assert.doesNotMatch(aside.backgroundImage, /rgb\(7,\s*31,\s*49\)|rgb\(6,\s*29,\s*45\)|rgb\(11,\s*46,\s*70\)/, `${route} page-level aside inherited the navigation gradient`);
  }

  assert.ok(result.overflow <= 1, `${route} has horizontal overflow: ${result.overflow}px`);
}

await mkdir(outputDir, { recursive: true });
const browser = await puppeteer.launch({ executablePath: await browserExecutable(), args: chromium.args, headless: true, defaultViewport: null });
const context = await browser.createBrowserContext();
const page = await context.newPage();
try {
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await login(page);

  await assertScopedAsides(page, "/admin/ai-copilot");
  await page.screenshot({ path: path.join(outputDir, "13-admin-ai-copilot-aside-scope.png"), fullPage: true });

  await assertScopedAsides(page, "/admin/ai-assistance");
  await page.screenshot({ path: path.join(outputDir, "14-admin-ai-assistance-aside-scope.png"), fullPage: true });

  console.log("AI page-level aside scope regression passed.");
} finally {
  await context.close();
  await browser.close();
}
