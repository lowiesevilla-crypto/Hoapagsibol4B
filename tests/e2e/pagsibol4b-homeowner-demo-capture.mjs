import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { access } from "node:fs/promises";
import { PrismaClient, TenantModule } from "@prisma/client";
import puppeteer from "puppeteer-core";

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const adminEmail = process.env.E2E_ADMIN_EMAIL || process.env.SEED_SYSTEM_ADMIN_EMAIL || "ci-system@example.invalid";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || process.env.SEED_SYSTEM_ADMIN_PASSWORD || "CI-Temporary-Password-2026!";
const homeownerEmail = process.env.E2E_HOMEOWNER_EMAIL || "ci-homeowner@example.invalid";
const homeownerPassword = process.env.E2E_HOMEOWNER_PASSWORD || "CI-Homeowner-Password-2026!";
const homeownerName = "E2E Browser Homeowner";
const tenantId = "tenant_pagsibol4b_default";
const coverageYear = Number(process.env.E2E_COVERAGE_YEAR || 2099);
const coverageMonth = Number(process.env.E2E_COVERAGE_MONTH || 1);
const timeout = 45_000;
const outDir = process.env.DEMO_CAPTURE_DIR || "/tmp/hoahub-demo";
let shotIndex = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function exists(candidate) {
  if (!candidate) return false;
  try { await access(candidate); return true; } catch { return false; }
}

async function resolveBrowserExecutable() {
  for (const candidate of [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_BIN,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean)) {
    if (await exists(candidate)) return candidate;
  }
  throw new Error("A headful Chrome/Chromium executable is required for the presentation screen capture.");
}

async function ensureShowcaseModules() {
  const modules = [
    TenantModule.BILLING,
    TenantModule.DOCUMENTS,
    TenantModule.ANNOUNCEMENTS,
    TenantModule.EVENTS,
    TenantModule.CHAT,
    TenantModule.COMPLAINTS,
    TenantModule.VEHICLES,
  ];
  const subscription = await prisma.tenantSubscription.findFirst({
    where: { tenantId },
    orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
    select: { planId: true },
  });
  if (!subscription?.planId) throw new Error("Presentation capture requires the seeded tenant subscription plan.");
  for (const module of modules) {
    await prisma.tenantModuleEntitlement.upsert({
      where: { tenantId_module: { tenantId, module } },
      update: { enabled: true },
      create: { tenantId, module, enabled: true },
    });
    await prisma.subscriptionPlanModule.upsert({
      where: { planId_module: { planId: subscription.planId, module } },
      update: { enabled: true },
      create: { planId: subscription.planId, module, enabled: true },
    });
  }
}

async function clickByText(page, selector, matcher) {
  const nodes = await page.$$(selector);
  for (const node of nodes) {
    const text = await node.evaluate((element) => (element.textContent || "").replace(/\s+/g, " ").trim());
    const matches = typeof matcher === "string" ? text.includes(matcher) : matcher.test(text);
    if (matches) {
      await node.click();
      return text;
    }
  }
  throw new Error(`No ${selector} matched ${String(matcher)} at ${page.url()}`);
}

async function login(page, email, password, prefix) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle2", timeout });
  await page.waitForSelector("#identifier", { timeout });
  await page.type("#identifier", email);
  await page.type("#password", password);
  await clickByText(page, "button", "Sign in securely");
  await page.waitForFunction((expected) => window.location.pathname.startsWith(expected), { timeout }, prefix);
  await page.waitForNetworkIdle({ idleTime: 500, timeout }).catch(() => undefined);
}

function sanitizeName(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function capture(page, name, seconds = 10) {
  shotIndex += 1;
  const filename = `${String(shotIndex).padStart(2, "0")}-${sanitizeName(name)}.png`;
  await page.screenshot({ path: path.join(outDir, filename), fullPage: false });
  console.log(`CAPTURED ${filename} ${page.url()}`);
  const cycles = Math.max(1, Math.floor(seconds / 2));
  for (let i = 0; i < cycles; i += 1) {
    await sleep(900);
    await page.evaluate((step) => {
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      if (!max) return;
      const direction = step % 2 === 0 ? 1 : -1;
      window.scrollBy({ top: direction * Math.min(220, max), behavior: "smooth" });
    }, i);
    await sleep(900);
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" })).catch(() => undefined);
  await sleep(500);
}

async function gotoAndCapture(page, route, name, seconds = 10) {
  await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle2", timeout });
  await page.waitForNetworkIdle({ idleTime: 400, timeout }).catch(() => undefined);
  await capture(page, name, seconds);
}

async function createPaymentAndReceipt(page) {
  const billingPreview = new URL("/admin/billing", baseUrl);
  billingPreview.searchParams.set("preview", "1");
  billingPreview.searchParams.set("coverageYear", String(coverageYear));
  billingPreview.searchParams.set("coverageMonth", String(coverageMonth));
  billingPreview.searchParams.set("scope", "ALL");
  await page.goto(billingPreview.toString(), { waitUntil: "networkidle2", timeout });
  await capture(page, "Admin Billing Preview", 10);
  await clickByText(page, "button", "Generate for Eligible Homeowners");
  await page.waitForFunction(() => new URL(window.location.href).searchParams.get("billingGenerated") === "1", { timeout });
  await capture(page, "Admin Billing Generated", 8);

  const paymentSearch = new URL("/admin/payments/record", baseUrl);
  paymentSearch.searchParams.set("q", homeownerName);
  await page.goto(paymentSearch.toString(), { waitUntil: "networkidle2", timeout });
  await page.waitForFunction((name) => (document.body?.textContent || "").includes(name), { timeout }, homeownerName);
  await capture(page, "Admin Record Payment", 10);
  await clickByText(page, "button[type='button']", homeownerName);
  await page.waitForFunction(() => Number(document.querySelector("input[name='amount']")?.value || 0) > 0, { timeout });
  await page.select("select[name='method']", "CASH");
  await capture(page, "Admin Payment Ready", 8);
  await clickByText(page, "button[type='submit']", /Record payment/i);
  await page.waitForFunction(() => /^\/receipts\/payment\/[^/]+$/.test(window.location.pathname), { timeout });
  await page.waitForFunction(() => (document.body?.textContent || "").includes("Receipt No."), { timeout });
  await capture(page, "Official Receipt Test Transaction", 16);

  const body = await page.evaluate(() => document.body?.textContent || "");
  const receiptNumber = body.match(/AR-MD-\d{4}-\d{7}/)?.[0];
  assert.ok(receiptNumber, "Expected official receipt number after the test transaction.");
  return receiptNumber;
}

async function ensureDemoAnnouncement(page) {
  const title = "Pagsibol 4B HOAHub Homeowner Showcase";
  await page.goto(`${baseUrl}/admin/announcements`, { waitUntil: "networkidle2", timeout });
  if (!(await page.evaluate((t) => (document.body?.textContent || "").includes(t), title))) {
    const titleInput = await page.$("input[name='title']");
    const contentInput = await page.$("textarea[name='content']");
    const statusSelect = await page.$("select[name='status']");
    if (titleInput && contentInput && statusSelect) {
      await page.type("input[name='title']", title);
      await page.type("textarea[name='content']", "Welcome to the HOAHub homeowner system showcase. This is isolated test data for the presentation.");
      await page.select("select[name='status']", "PUBLISHED");
      await clickByText(page, "button[type='submit']", "Create announcement");
      await page.waitForNetworkIdle({ idleTime: 400, timeout }).catch(() => undefined);
    }
  }
  await capture(page, "Admin Announcement", 7);
}

await mkdir(outDir, { recursive: true });
await ensureShowcaseModules();

const executablePath = await resolveBrowserExecutable();
const browser = await puppeteer.launch({
  executablePath,
  headless: false,
  defaultViewport: null,
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--window-size=1366,768",
    "--start-maximized",
  ],
});

try {
  const adminContext = await browser.createBrowserContext();
  const adminPage = await adminContext.newPage();
  adminPage.setDefaultTimeout(timeout);
  await login(adminPage, adminEmail, adminPassword, "/admin/");
  await capture(adminPage, "Admin Dashboard", 8);
  const receiptNumber = await createPaymentAndReceipt(adminPage);
  await ensureDemoAnnouncement(adminPage);
  await adminContext.close();

  const homeownerContext = await browser.createBrowserContext();
  const page = await homeownerContext.newPage();
  page.setDefaultTimeout(timeout);
  await login(page, homeownerEmail, homeownerPassword, "/portal/");
  await capture(page, "Homeowner Dashboard", 14);

  const screens = [
    ["/portal/pay", "Pay by QR", 12],
    ["/portal/billing", "My Billing", 12],
    ["/portal/soa", "Statement of Account", 14],
    ["/portal/payments", "Payment History and Receipts", 14],
    ["/portal/collections", "Collections and Bonds", 11],
    ["/portal/rentals", "Rental Reservations and Contracts", 11],
    ["/portal/requests", "Requests Hub", 11],
    ["/portal/documents", "Document Requests", 13],
    ["/portal/complaints", "My Complaints", 10],
    ["/portal/complaints/new", "Submit Complaint", 12],
    ["/portal/community", "Community Hub", 10],
    ["/portal/announcements", "Announcements", 12],
    ["/portal/events", "Events", 10],
    ["/portal/chat", "Secure HOA Chat", 10],
    ["/portal/organization", "HOA Officers and Contacts", 10],
    ["/portal/more", "More Homeowner Services", 10],
    ["/portal/profile", "Profile Property Household and Security", 13],
    ["/portal/vehicles", "My Vehicles", 10],
    ["/portal/document-library", "Document Library", 10],
    ["/portal/ai", "Association Assistant", 12],
  ];

  for (const [route, name, seconds] of screens) {
    await gotoAndCapture(page, route, name, seconds);
  }

  await gotoAndCapture(page, "/portal/dashboard", "Homeowner Closing Dashboard", 16);
  const finalBody = await page.evaluate(() => document.body?.textContent || "");
  console.log(`SHOWCASE TEST RECEIPT: ${receiptNumber}`);
  console.log(`FINAL HOMEOWNER DASHBOARD LOADED: ${finalBody.includes("Active Requests") || finalBody.includes("Recent Activity")}`);
  await homeownerContext.close();
} finally {
  await browser.close();
  await prisma.$disconnect();
}
