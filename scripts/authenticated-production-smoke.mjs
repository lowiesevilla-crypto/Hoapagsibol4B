import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const requestedUrl = process.argv.slice(2).find((value) => value !== "--") || process.env.HOSTINGER_APP_URL || process.env.APP_URL;
const email = process.env.HOAHUB_UAT_ADMIN_EMAIL;
const password = process.env.HOAHUB_UAT_ADMIN_PASSWORD;
const homeownerQuery = process.env.HOAHUB_UAT_HOMEOWNER_QUERY;
const allowHttp = process.env.HOAHUB_UAT_ALLOW_HTTP === "1";
const timeout = Number(process.env.HOAHUB_UAT_TIMEOUT_MS || 45_000);

if (!requestedUrl) throw new Error("HOSTINGER_APP_URL or APP_URL is required for authenticated production smoke.");
if (!email || !password) throw new Error("HOAHUB_UAT_ADMIN_EMAIL and HOAHUB_UAT_ADMIN_PASSWORD are required.");
if (!homeownerQuery) throw new Error("HOAHUB_UAT_HOMEOWNER_QUERY is required so the smoke opens a controlled UAT homeowner record.");

const baseUrl = new URL(requestedUrl).origin;
if (!allowHttp && !baseUrl.startsWith("https://")) throw new Error(`Refusing authenticated production smoke against non-HTTPS origin: ${baseUrl}`);

const checks = [];
const blockedMutations = [];

function pass(label) {
  checks.push(label);
  console.log(`PASS ${label}`);
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
  throw new Error("No Chromium or Chrome executable is available for authenticated production smoke.");
}

async function bodyText(page) {
  return page.evaluate(() => (document.body?.textContent || "").replace(/\s+/g, " ").trim());
}

async function assertHealthyPage(page, label, expectedPathPrefix) {
  const current = new URL(page.url());
  const text = await bodyText(page);
  assert.equal(current.origin, baseUrl, `${label} left the configured production origin.`);
  assert.ok(current.pathname.startsWith(expectedPathPrefix), `${label} redirected unexpectedly to ${current.pathname}.`);
  assert.ok(!/Something went wrong|Application error|Internal Server Error/i.test(text), `${label} rendered an application error.`);
  assert.ok(!current.pathname.includes("/login"), `${label} lost the authenticated session.`);
  pass(label);
}

async function goto(page, path, label) {
  const response = await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle2", timeout });
  assert.ok(response && response.status() >= 200 && response.status() < 400, `${label} returned HTTP ${response?.status() ?? "no response"}.`);
  await assertHealthyPage(page, label, path.split("?")[0]);
}

async function findRecordHref(page, prefix, excludedSuffixes = []) {
  const hrefs = await page.$$eval("a[href]", (links) => links.map((link) => link.getAttribute("href")).filter(Boolean));
  return hrefs.find((href) => href.startsWith(prefix) && !excludedSuffixes.some((suffix) => href.endsWith(suffix))) || null;
}

async function login(page, label = "authenticated login") {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle2", timeout });
  await page.waitForSelector("#identifier", { timeout });
  await page.type("#identifier", email);
  await page.type("#password", password);
  const submit = await page.$("button[type='submit']");
  assert.ok(submit, "Login submit button was not found.");
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout }).catch(() => undefined),
    submit.click(),
  ]);
  const current = new URL(page.url());
  assert.ok(current.pathname.startsWith("/admin/"), `UAT account did not reach Tenant Admin after login; current path is ${current.pathname}. Use a dedicated tenant-admin UAT account without an account-choice step.`);
  pass(label);
}

const executablePath = await resolveBrowserExecutable();
const headlessMode = "shell";
const browser = await puppeteer.launch({ executablePath, headless: headlessMode, args: await puppeteer.defaultArgs({ args: chromium.args, headless: headlessMode }) });
const context = await browser.createBrowserContext();
const page = await context.newPage();
page.setDefaultTimeout(timeout);
await page.setViewport({ width: 1440, height: 1000 });

await page.setRequestInterception(true);
page.on("request", (request) => {
  const method = request.method().toUpperCase();
  const url = new URL(request.url());
  const safe = ["GET", "HEAD", "OPTIONS"].includes(method);
  const authOnlyPost = method === "POST" && url.origin === baseUrl && (url.pathname === "/login" || url.pathname === "/api/auth/logout");
  if (safe || authOnlyPost) return request.continue();
  blockedMutations.push(`${method} ${url.pathname}`);
  console.error(`BLOCKED non-read-only request during production smoke: ${method} ${url.pathname}`);
  return request.abort("blockedbyclient");
});

try {
  const health = await page.goto(`${baseUrl}/api/health`, { waitUntil: "networkidle2", timeout });
  assert.equal(health?.status(), 200, "Production health endpoint must return HTTP 200 before authentication.");
  pass("production health endpoint");

  await login(page);
  await goto(page, "/admin/dashboard", "dashboard load");

  await goto(page, `/admin/homeowners?q=${encodeURIComponent(homeownerQuery)}`, "homeowner search");
  const homeownerHref = await findRecordHref(page, "/admin/homeowners/", ["/new"]);
  assert.ok(homeownerHref, `No controlled homeowner matched HOAHUB_UAT_HOMEOWNER_QUERY=${JSON.stringify(homeownerQuery)}.`);
  await goto(page, homeownerHref, "homeowner profile open");

  await goto(page, `/admin/billing?q=${encodeURIComponent(homeownerQuery)}`, "billing list/search");
  await goto(page, "/admin/payments/history", "payment history");
  await goto(page, "/admin/payments/online", "Online Payments report");

  await goto(page, "/admin/employees", "employee list");
  const employeeHref = await findRecordHref(page, "/admin/employees/", ["/new"]);
  assert.ok(employeeHref, "Controlled UAT tenant must contain at least one employee profile for read-only profile smoke.");
  await goto(page, employeeHref, "employee profile open");

  await goto(page, "/admin/documents", "document requests");
  await goto(page, "/admin/complaints", "complaints");
  await goto(page, "/admin/reports", "financial report load");

  const logoutForm = await page.$("form[action='/api/auth/logout']");
  assert.ok(logoutForm, "Logout form was not found in the authenticated shell.");
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout }).catch(() => undefined),
    logoutForm.evaluate((form) => form.requestSubmit()),
  ]);
  assert.ok(new URL(page.url()).pathname.includes("/login"), `Logout did not return to login; current path is ${new URL(page.url()).pathname}.`);
  pass("logout");

  await login(page, "fresh login after logout");
  await goto(page, "/admin/dashboard", "fresh-session dashboard load");

  assert.deepEqual(blockedMutations, [], `Smoke attempted forbidden state-changing requests: ${blockedMutations.join(", ")}`);
  console.log(`PASS ${checks.length} authenticated non-destructive production UAT checks for ${baseUrl}`);
} finally {
  await context.close().catch(() => undefined);
  await browser.close().catch(() => undefined);
}
