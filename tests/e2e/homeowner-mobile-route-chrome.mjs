import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const timeout = 45_000;
const homeownerEmail = process.env.E2E_HOMEOWNER_EMAIL || "ci-homeowner@example.invalid";
const homeownerPassword = process.env.E2E_HOMEOWNER_PASSWORD || "CI-Homeowner-Password-2026!";

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

function expectedPhilippineGreeting(date = new Date()) {
  const hourPart = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).find((part) => part.type === "hour")?.value;
  const hour = Number(hourPart);
  if (hour >= 5 && hour < 12) return "GOOD MORNING";
  if (hour >= 12 && hour < 18) return "GOOD AFTERNOON";
  return "GOOD EVENING";
}

async function login(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle2", timeout });
  await page.waitForSelector("#identifier", { timeout });
  await page.type("#identifier", homeownerEmail);
  await page.type("#password", homeownerPassword);

  const buttons = await page.$$("button");
  let submitButton = null;
  for (const button of buttons) {
    const text = await button.evaluate((node) => (node.textContent || "").replace(/\s+/g, " ").trim());
    if (text.includes("Sign in securely")) { submitButton = button; break; }
  }
  assert.ok(submitButton, "homeowner mobile chrome: expected sign-in button");
  await submitButton.click();
  await page.waitForFunction(() => window.location.pathname.startsWith("/portal/"), { timeout });
  await page.waitForNetworkIdle({ idleTime: 400, timeout }).catch(() => undefined);
}

async function assertDashboardChrome(page) {
  const header = await page.waitForSelector('header[data-portal-mobile-route="/portal/dashboard"]', { timeout });
  assert.ok(header, "dashboard mobile header should expose the live dashboard route");
  const eyebrow = await page.$eval('header[data-portal-mobile-route="/portal/dashboard"] p', (node) => (node.textContent || "").trim().toUpperCase());
  assert.ok(eyebrow.startsWith(expectedPhilippineGreeting()), `dashboard greeting should follow Asia/Manila time; saw ${eyebrow}`);
  const bannerVisible = await page.evaluate(() => document.body.textContent?.includes("Community Hub · Installed PWA ready") === true);
  assert.ok(bannerVisible, "dashboard should show the PWA-ready banner");
  const homeCurrent = await page.$eval('a[data-portal-primary-id="home"]', (node) => node.getAttribute("aria-current"));
  assert.equal(homeCurrent, "page", "Home should be active on dashboard");
}

async function navigatePrimary(page, { id, path, title }) {
  const selector = `a[data-portal-primary-id="${id}"]`;
  await page.waitForSelector(selector, { timeout });
  await page.click(selector);
  await page.waitForFunction((expectedPath) => window.location.pathname === expectedPath, { timeout }, path);
  await page.waitForFunction((primaryId) => document.querySelector(`a[data-portal-primary-id="${primaryId}"]`)?.getAttribute("aria-current") === "page", { timeout }, id);
  await page.waitForFunction((expectedTitle) => (document.querySelector("[data-portal-mobile-title]")?.textContent || "").trim() === expectedTitle, { timeout }, title);

  const state = await page.evaluate((primaryId, expectedPath) => {
    const active = document.querySelector(`a[data-portal-primary-id="${primaryId}"]`);
    const header = document.querySelector("header[data-portal-mobile-route]");
    const ai = document.querySelector('a[aria-label="Open Association Assistant"]');
    const nav = document.querySelector('nav[aria-label="Homeowner primary navigation"]');
    let aiOverlapsNav = false;
    if (ai && nav) {
      const aiRect = ai.getBoundingClientRect();
      const navRect = nav.getBoundingClientRect();
      aiOverlapsNav = aiRect.left < navRect.right && aiRect.right > navRect.left && aiRect.top < navRect.bottom && aiRect.bottom > navRect.top;
    }
    return {
      active: active?.getAttribute("aria-current"),
      route: header?.getAttribute("data-portal-mobile-route"),
      title: (document.querySelector("[data-portal-mobile-title]")?.textContent || "").trim(),
      bannerVisible: document.body.textContent?.includes("Community Hub · Installed PWA ready") === true,
      aiOverlapsNav,
      expectedPath,
    };
  }, id, path);

  assert.equal(state.active, "page", `${id}: expected bottom navigation active state`);
  assert.equal(state.route, path, `${id}: mobile header route should update after client navigation`);
  assert.equal(state.title, title, `${id}: mobile header title should update after client navigation`);
  assert.equal(state.bannerVisible, false, `${id}: dashboard-only PWA banner should be hidden`);
  assert.equal(state.aiOverlapsNav, false, `${id}: AI shortcut should not overlap the bottom navigation`);
}

const browser = await puppeteer.launch({ executablePath: await browserExecutable(), args: chromium.args, headless: true, defaultViewport: null });
try {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  try {
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await login(page);
    await page.goto(`${baseUrl}/portal/dashboard`, { waitUntil: "networkidle2", timeout });
    await assertDashboardChrome(page);

    await navigatePrimary(page, { id: "requests", path: "/portal/requests", title: "Requests" });
    await navigatePrimary(page, { id: "community", path: "/portal/community", title: "Community" });
    await navigatePrimary(page, { id: "more", path: "/portal/more", title: "More" });

    await page.click('a[data-portal-primary-id="home"]');
    await page.waitForFunction(() => window.location.pathname === "/portal/dashboard", { timeout });
    await assertDashboardChrome(page);

    console.log("Homeowner mobile route chrome passed live PWA-style navigation and Philippines greeting checks.");
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}
