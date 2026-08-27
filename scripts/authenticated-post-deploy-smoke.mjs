import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const baseUrl = (process.env.HOAHUB_UAT_BASE_URL || process.env.E2E_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const parsedBase = new URL(baseUrl);
const localTarget = ["127.0.0.1", "localhost"].includes(parsedBase.hostname);
const adminEmail = process.env.HOAHUB_UAT_ADMIN_EMAIL || (localTarget ? process.env.E2E_ADMIN_EMAIL || process.env.SEED_SYSTEM_ADMIN_EMAIL || "ci-system@example.invalid" : "");
const adminPassword = process.env.HOAHUB_UAT_ADMIN_PASSWORD || (localTarget ? process.env.E2E_ADMIN_PASSWORD || process.env.SEED_SYSTEM_ADMIN_PASSWORD || "CI-Temporary-Password-2026!" : "");
const expectedTenant = (process.env.HOAHUB_UAT_EXPECTED_TENANT || "").trim();
const timeout = 45_000;

function assertConfiguration() {
  if (!adminEmail || !adminPassword) throw new Error("Controlled UAT administrator credentials are required.");
  if (!localTarget && process.env.HOAHUB_UAT_CONTROLLED !== "1") {
    throw new Error("Refusing authenticated smoke against a non-local target unless HOAHUB_UAT_CONTROLLED=1 explicitly confirms the controlled UAT tenant/account.");
  }
  if (!/^https?:$/.test(parsedBase.protocol)) throw new Error("HOAHUB_UAT_BASE_URL must use http or https.");
}

async function pathExists(path) {
  if (!path) return false;
  try { await access(path); return true; } catch { return false; }
}

async function resolveBrowserExecutable() {
  const candidates = [process.env.PUPPETEER_EXECUTABLE_PATH, process.env.CHROME_BIN, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"].filter(Boolean);
  for (const candidate of candidates) if (await pathExists(candidate)) return candidate;
  const packaged = await chromium.executablePath();
  if (await pathExists(packaged)) return packaged;
  throw new Error("No Chromium or Chrome executable is available for authenticated post-deploy smoke.");
}

async function pageText(page) {
  return page.evaluate(() => document.body?.textContent || "");
}

async function expectText(page, text, label = text) {
  try {
    await page.waitForFunction((expected) => (document.body?.textContent || "").includes(expected), { timeout }, text);
  } catch (error) {
    const body = (await pageText(page)).replace(/\s+/g, " ").trim();
    throw new Error(`Expected ${label} on ${page.url()}. Page text: ${body.slice(0, 1800)}`, { cause: error });
  }
}

async function gotoProtected(page, path, expectedText) {
  const response = await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle2", timeout });
  assert.ok(response && response.status() < 400, `${path} returned HTTP ${response?.status() ?? "unknown"}.`);
  const url = new URL(page.url());
  assert.notEqual(url.pathname, "/login", `${path} redirected to login unexpectedly.`);
  if (expectedText) await expectText(page, expectedText, `${path} read-only workspace`);
}

async function clickByText(page, selector, text) {
  for (const element of await page.$$(selector)) {
    const value = (await element.evaluate((node) => node.textContent || "")).replace(/\s+/g, " ").trim();
    if (value.includes(text)) { await element.click(); return; }
  }
  throw new Error(`Could not find ${selector} containing ${text}.`);
}

async function login(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle2", timeout });
  await page.waitForSelector("#identifier", { timeout });
  await page.type("#identifier", adminEmail);
  await page.type("#password", adminPassword);
  await clickByText(page, "button", "Sign in securely");
  await page.waitForFunction(() => location.pathname.startsWith("/admin/"), { timeout });
  if (expectedTenant) await expectText(page, expectedTenant, "controlled UAT tenant identity");
}

async function firstProfileLink(page, prefix) {
  return page.evaluate((pathPrefix) => {
    const links = [...document.querySelectorAll("a[href]")];
    const anchor = links.find((node) => {
      const href = node.getAttribute("href") || "";
      return href.startsWith(pathPrefix) && !href.endsWith("/new") && href.split("?")[0].split("/").filter(Boolean).length === 3;
    });
    if (!anchor) return null;
    const row = anchor.closest("tr");
    const firstCell = row?.querySelector("td");
    return { href: anchor.getAttribute("href"), rowText: (firstCell?.textContent || row?.textContent || "").replace(/\s+/g, " ").trim() };
  }, prefix);
}

async function runSmoke(page) {
  await login(page);

  await gotoProtected(page, "/admin/dashboard", "Dashboard");

  await gotoProtected(page, "/admin/homeowners", "Homeowners");
  const homeowner = await firstProfileLink(page, "/admin/homeowners/");
  assert.ok(homeowner?.href && homeowner.rowText, "Controlled UAT tenant must contain at least one homeowner for read-only profile smoke.");
  const homeownerQuery = homeowner.rowText.split(/\s+/).slice(0, 3).join(" ");
  await gotoProtected(page, `/admin/homeowners?q=${encodeURIComponent(homeownerQuery)}`, "Homeowners");
  await expectText(page, homeowner.rowText.split(/\s+/)[0], "homeowner search result");
  await gotoProtected(page, homeowner.href, homeowner.rowText.split(/\s+/)[0]);

  await gotoProtected(page, `/admin/billing?q=${encodeURIComponent(homeownerQuery)}`, "Billing management");
  await expectText(page, "Found", "tenant-wide billing search evidence");

  await gotoProtected(page, "/admin/payments/history", "Transaction history");
  await gotoProtected(page, "/admin/payments/online", "Online payment status");

  await gotoProtected(page, "/admin/employees", "Employees");
  const employee = await firstProfileLink(page, "/admin/employees/");
  assert.ok(employee?.href && employee.rowText, "Controlled UAT tenant must contain at least one employee for read-only profile smoke.");
  const employeeSearch = await page.$('input[placeholder="Search employee, position or number"]');
  assert.ok(employeeSearch, "Employee read-only search control was not found.");
  const employeeQuery = employee.rowText.split(/\s+/).slice(0, 2).join(" ");
  await employeeSearch.type(employeeQuery);
  await expectText(page, employee.rowText.split(/\s+/)[0], "employee search result");
  await gotoProtected(page, employee.href, employee.rowText.split(/\s+/)[0]);

  await gotoProtected(page, "/admin/documents?section=requests", "Documents");
  await gotoProtected(page, "/admin/complaints", "Complaints");
  await gotoProtected(page, "/admin/reports", "HOA financial reports");

  await page.goto(`${baseUrl}/admin/dashboard`, { waitUntil: "networkidle2", timeout });
  const logout = await page.$('[data-hoahub-logout-button="true"]');
  assert.ok(logout, "Logout control was not found in the authenticated tenant shell.");
  await logout.click();
  await page.waitForFunction(() => location.pathname === "/login", { timeout });
  await expectText(page, "Welcome to HOAHub", "login screen after logout");

  await login(page);
  await gotoProtected(page, "/admin/dashboard", "Dashboard");
}

assertConfiguration();
const executablePath = await resolveBrowserExecutable();
const headlessMode = "shell";
const browser = await puppeteer.launch({ executablePath, headless: headlessMode, args: await puppeteer.defaultArgs({ args: chromium.args, headless: headlessMode }) });
const context = await browser.createBrowserContext();
const page = await context.newPage();
await page.setViewport({ width: 1440, height: 1000 });
page.setDefaultTimeout(timeout);

try {
  await runSmoke(page);
  console.log("Authenticated non-destructive post-deploy smoke passed:");
  console.log("- login, dashboard, homeowner search/profile, billing search, payment history and Online Payments loaded");
  console.log("- employee search/profile, document requests, complaints and Financial Reports loaded read-only");
  console.log("- logout invalidated the browser session and a fresh login succeeded");
} catch (error) {
  console.error("Authenticated non-destructive post-deploy smoke failed.");
  console.error(error);
  process.exitCode = 1;
} finally {
  await context.close().catch(() => undefined);
  await browser.close();
}
