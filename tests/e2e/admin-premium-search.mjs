import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const adminEmail = process.env.SEED_SYSTEM_ADMIN_EMAIL || "ci-system@example.invalid";
const adminPassword = process.env.SEED_SYSTEM_ADMIN_PASSWORD || "CI-Temporary-Password-2026!";
const tenantId = "tenant_pagsibol4b_default";
const timeout = 45_000;

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
  await page.type("#identifier", adminEmail);
  await page.type("#password", adminPassword);
  const buttons = await page.$$("button");
  for (const button of buttons) {
    const text = await button.evaluate((node) => (node.textContent || "").replace(/\s+/g, " ").trim());
    if (text.includes("Sign in securely")) {
      await button.click();
      await page.waitForFunction(() => window.location.pathname.startsWith("/admin/"), { timeout });
      return;
    }
  }
  assert.fail("Expected admin sign-in button");
}

async function clickButtonByText(page, text) {
  const buttons = await page.$$("button");
  for (const button of buttons) {
    const label = await button.evaluate((node) => (node.textContent || "").replace(/\s+/g, " ").trim());
    if (label === text || label.includes(text)) {
      await button.click();
      return;
    }
  }
  assert.fail(`Expected button containing ${text}`);
}

const target = await prisma.homeownerProfile.findFirst({
  where: { tenantId, block: { not: "" }, lot: { not: "" } },
  include: { user: true },
  orderBy: { createdAt: "asc" },
});
assert.ok(target, "Expected a seeded homeowner with block and lot values");

const browser = await puppeteer.launch({ executablePath: await browserExecutable(), args: chromium.args, headless: true, defaultViewport: null });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await login(page);

  await page.goto(`${baseUrl}/admin/dashboard`, { waitUntil: "networkidle2", timeout });
  const command = await page.waitForSelector('input[aria-label="Search HOAHub navigation"]', { timeout });
  assert.ok(command, "Authorized Admin command search should be visible on desktop");
  await command.type("homeowners");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.location.pathname === "/admin/homeowners", { timeout });

  const propertyQuery = `block ${target.block} lot ${target.lot}`;
  const search = await page.waitForSelector('input[name="q"][type="search"]', { timeout });
  assert.ok(search, "Homeowner directory search should be available");
  await search.type(propertyQuery);
  await clickButtonByText(page, "Apply");
  await page.waitForFunction((expected) => new URLSearchParams(window.location.search).get("q") === expected, { timeout }, propertyQuery);
  await page.waitForNetworkIdle({ idleTime: 300, timeout }).catch(() => undefined);

  const body = await page.evaluate(() => document.body.textContent || "");
  assert.ok(body.includes(target.user.name), "Combined block/lot lookup must return the matching homeowner");
  assert.ok(body.includes(`Block ${target.block}, Lot ${target.lot}`), "Combined block/lot lookup must preserve the matching property row");

  await page.goto(`${baseUrl}/admin/homeowners?q=${encodeURIComponent("block never-match lot never-match")}`, { waitUntil: "networkidle2", timeout });
  const emptyBody = await page.evaluate(() => document.body.textContent || "");
  assert.ok(emptyBody.includes("No homeowners match the selected filters."), "Homeowner search must show a clear empty-result state");

  console.log("Premium Admin command search and combined block/lot search browser regression passed.");
} finally {
  await browser.close();
  await prisma.$disconnect();
}
