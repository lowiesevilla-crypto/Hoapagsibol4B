import assert from "node:assert/strict";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const adminEmail = process.env.E2E_ADMIN_EMAIL || process.env.SEED_SYSTEM_ADMIN_EMAIL || "ci-system@example.invalid";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || process.env.SEED_SYSTEM_ADMIN_PASSWORD || "CI-Temporary-Password-2026!";
const homeownerEmail = process.env.E2E_HOMEOWNER_EMAIL || "ci-homeowner@example.invalid";
const otherHomeownerEmail = process.env.E2E_OTHER_HOMEOWNER_EMAIL || "ci-other-homeowner@example.invalid";
const homeownerPassword = process.env.E2E_HOMEOWNER_PASSWORD || "CI-Homeowner-Password-2026!";
const primaryTenantId = "tenant_pagsibol4b_default";
const secondaryTenantId = "tenant_e2e_browser_isolation";
const documentTitle = "E2E DMS Browser Policy";
const documentReference = "E2E-DMS-001";
const timeout = 45_000;

function assertE2eDatabaseSafety() {
  const allowLocal = process.env.HOAHUB_E2E_ALLOW_LOCAL === "1";
  if (process.env.CI !== "true" && !allowLocal) throw new Error("DMS browser UAT is restricted to CI or an explicitly disposable local database.");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for DMS browser UAT.");
  const host = new URL(databaseUrl).hostname;
  if (!allowLocal && !["127.0.0.1", "localhost", "mysql"].includes(host)) throw new Error(`Refusing DMS browser operations against non-disposable host: ${host}`);
}

async function pathExists(path) {
  if (!path) return false;
  try { await access(path); return true; } catch { return false; }
}

async function browserExecutable() {
  for (const candidate of [process.env.PUPPETEER_EXECUTABLE_PATH, process.env.CHROME_BIN, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"].filter(Boolean)) {
    if (await pathExists(candidate)) return candidate;
  }
  const packaged = await chromium.executablePath();
  if (await pathExists(packaged)) return packaged;
  throw new Error("No Chromium or Chrome executable is available for DMS browser UAT.");
}

async function pageText(page) { return page.evaluate(() => document.body?.textContent || ""); }

async function expectText(page, text, label = text) {
  await page.waitForFunction((expected) => (document.body?.textContent || "").includes(expected), { timeout }, text).catch(async (error) => {
    const body = (await pageText(page)).replace(/\s+/g, " ").trim();
    throw new Error(`Expected ${label} on ${page.url()}. Page text: ${body.slice(0, 1600)}`, { cause: error });
  });
}

async function clickByText(page, selector, matcher) {
  for (const element of await page.$$(selector)) {
    const text = (await element.evaluate((node) => node.textContent || "")).replace(/\s+/g, " ").trim();
    if (typeof matcher === "string" ? text.includes(matcher) : matcher.test(text)) { await element.click(); return; }
  }
  throw new Error(`No ${selector} matched ${String(matcher)} on ${page.url()}`);
}

async function login(page, email, password, expectedPrefix) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle2", timeout });
  await page.type("#identifier", email);
  await page.type("#password", password);
  await clickByText(page, "button", "Sign in securely");
  await page.waitForFunction((prefix) => window.location.pathname.startsWith(prefix), { timeout }, expectedPrefix);
  await page.waitForNetworkIdle({ idleTime: 400, timeout }).catch(() => undefined);
}

async function createPage(context, viewport) {
  const page = await context.newPage();
  await page.setViewport(viewport);
  page.setDefaultTimeout(timeout);
  page.on("console", (message) => { if (["error", "warning"].includes(message.type())) console.log(`[dms-browser:${message.type()}] ${message.text()}`); });
  page.on("pageerror", (error) => console.log(`[dms-browser:pageerror] ${error.message}`));
  return page;
}

async function clearStaleRecords() {
  const stale = await prisma.repositoryDocument.findMany({ where: { tenantId: primaryTenantId, title: documentTitle }, select: { id: true } });
  const ids = stale.map((item) => item.id);
  if (!ids.length) return;
  await prisma.aiKnowledgeBinding.deleteMany({ where: { tenantId: primaryTenantId, documentId: { in: ids } } });
  await prisma.repositoryDocument.deleteMany({ where: { tenantId: primaryTenantId, id: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { tenantId: primaryTenantId, module: "DOCUMENT_MANAGEMENT", entityId: { in: ids } } });
}

async function submitMultipartForm(page, selector) {
  const result = await page.evaluate(async (formSelector) => {
    const form = document.querySelector(formSelector);
    if (!(form instanceof HTMLFormElement)) throw new Error(`Missing form ${formSelector}`);
    const response = await fetch(form.action, {
      method: (form.method || "POST").toUpperCase(),
      body: new FormData(form),
      credentials: "include",
      redirect: "follow",
    });
    return { status: response.status, ok: response.ok, url: response.url, text: await response.text() };
  }, selector);
  assert.ok(result.ok, `Expected successful same-origin multipart request, received ${result.status}: ${result.text.slice(0, 500)}`);
  assert.ok(new URL(result.url).origin === new URL(baseUrl).origin, "DMS multipart response must remain same-origin.");
  await page.goto(result.url, { waitUntil: "networkidle2", timeout });
  return result;
}

async function uploadAndVerifyAdmin(browser, originalPath) {
  const context = await browser.createBrowserContext();
  const page = await createPage(context, { width: 1440, height: 1000 });
  try {
    await login(page, adminEmail, adminPassword, "/admin/");
    await page.goto(`${baseUrl}/admin/document-management`, { waitUntil: "networkidle2", timeout });
    await expectText(page, "Document Management");
    await expectText(page, "Upload document", "authorized DMS upload control");

    await page.goto(`${baseUrl}/admin/document-management/categories`, { waitUntil: "networkidle2", timeout });
    await expectText(page, "Document categories");
    await expectText(page, "System defaults are protected.");

    const category = await prisma.repositoryDocumentCategory.findFirst({ where: { tenantId: primaryTenantId, code: "POLICIES_GUIDELINES", active: true }, select: { id: true, governanceControlled: true } });
    assert.ok(category?.governanceControlled, "Expected governed Policies and Guidelines category.");

    await page.goto(`${baseUrl}/admin/document-management/upload`, { waitUntil: "networkidle2", timeout });
    await page.type('input[name="title"]', documentTitle);
    await page.select('select[name="categoryId"]', category.id);
    await page.type('input[name="documentReference"]', documentReference);
    await page.type('textarea[name="description"]', "DMS browser UAT tenant-isolated resident policy.");
    await page.type('input[name="issuingBody"]', "E2E HOA Board");
    await page.type('input[name="searchableKeywords"]', "e2e dms policy resident retrieval");
    await page.$eval('input[name="effectiveAt"]', (element) => { element.value = "2026-01-01"; element.dispatchEvent(new Event("input", { bubbles: true })); });
    await page.select('select[name="visibility"]', "TENANT_PUBLIC");
    await page.select('select[name="status"]', "PUBLISHED");
    const fileInput = await page.$('input[name="file"]');
    assert.ok(fileInput);
    await fileInput.uploadFile(originalPath);
    await submitMultipartForm(page, 'form[action="/api/admin/document-management/documents"]');
    await expectText(page, documentTitle, "uploaded DMS record");

    const document = await prisma.repositoryDocument.findFirst({ where: { tenantId: primaryTenantId, title: documentTitle }, include: { revisions: true } });
    assert.ok(document);
    assert.equal(document.status, "PUBLISHED");
    assert.equal(document.visibility, "TENANT_PUBLIC");
    assert.equal(document.revisionPolicy, "KEEP_HISTORY");
    assert.equal(document.currentRevision, 1);
    assert.equal(document.aiEnabled, false, "DMS upload must not silently enable AI retrieval.");
    const tenant = await prisma.tenant.findUnique({ where: { id: primaryTenantId }, select: { slug: true } });
    assert.ok(tenant && document.storageKey.startsWith(`tenants/${tenant.slug}/documents/repository/`));
    assert.ok(!document.storageKey.includes(document.originalFileName), "Storage key must be randomized.");

    await page.goto(`${baseUrl}/admin/document-management/${document.id}`, { waitUntil: "networkidle2", timeout });
    for (const control of ["Save changes", "Create next revision", "Permanently delete", "Download"]) await expectText(page, control, `authorized ${control} control`);
    return document.id;
  } finally { await context.close(); }
}

async function verifyHomeownerBoundaries(browser, documentId) {
  const primary = await browser.createBrowserContext();
  const page = await createPage(primary, { width: 390, height: 844, deviceScaleFactor: 1 });
  try {
    await login(page, homeownerEmail, homeownerPassword, "/portal/");
    const url = new URL("/portal/document-library", baseUrl); url.searchParams.set("search", documentTitle);
    await page.goto(url.toString(), { waitUntil: "networkidle2", timeout });
    await expectText(page, documentTitle);
    const download = await page.evaluate(async (id) => {
      const response = await fetch(`/api/portal/document-library/${id}/download`, { credentials: "include" });
      return { status: response.status, ok: response.ok, body: await response.text() };
    }, documentId);
    assert.equal(download.status, 200);
    assert.match(download.body, /original DMS browser content/i);
  } finally { await primary.close(); }

  const secondary = await browser.createBrowserContext();
  const otherPage = await createPage(secondary, { width: 390, height: 844, deviceScaleFactor: 1 });
  try {
    await login(otherPage, otherHomeownerEmail, homeownerPassword, "/portal/");
    const denial = await otherPage.evaluate(async (id) => {
      const response = await fetch(`/api/portal/document-library/${id}/download`, { credentials: "include", redirect: "manual" });
      return { status: response.status, ok: response.ok, body: await response.text() };
    }, documentId);
    assert.ok(!denial.ok || denial.status !== 200);
    assert.ok(!denial.body.includes("original DMS browser content"));
    await otherPage.goto(`${baseUrl}/portal/document-library`, { waitUntil: "networkidle2", timeout }).catch(() => undefined);
    assert.equal(new URL(otherPage.url()).pathname, "/portal/dashboard", "Tenant without DMS entitlement must be denied the library.");
  } finally { await secondary.close(); }
}

async function replaceAndUnpublish(browser, documentId, replacementPath) {
  const context = await browser.createBrowserContext();
  const page = await createPage(context, { width: 1440, height: 1000 });
  try {
    await login(page, adminEmail, adminPassword, "/admin/");
    await page.goto(`${baseUrl}/admin/document-management/${documentId}`, { waitUntil: "networkidle2", timeout });
    const replaceSelector = `form[action="/api/admin/document-management/documents/${documentId}/replace"]`;
    const input = await page.$(`${replaceSelector} input[name="file"]`);
    assert.ok(input);
    await input.uploadFile(replacementPath);
    await page.type(`${replaceSelector} textarea[name="reason"]`, "E2E controlled revision replacement");
    await submitMultipartForm(page, replaceSelector);
    await expectText(page, "Rev 2");

    const replaced = await prisma.repositoryDocument.findFirst({ where: { tenantId: primaryTenantId, id: documentId }, include: { revisions: { orderBy: { revision: "asc" } } } });
    assert.equal(replaced?.currentRevision, 2);
    assert.equal(replaced?.revisions.length, 1);
    assert.equal(replaced?.revisions[0].revision, 1);
    assert.ok(replaced?.revisions[0].storageKey, "Governed revision binary should be retained by the E2E entitlement.");

    await page.select('select[name="visibility"]', "INTERNAL");
    await page.select('select[name="status"]', "DRAFT");
    await page.$eval('form input[name="reason"]', (element) => { element.value = "E2E unpublish visibility lifecycle check"; element.dispatchEvent(new Event("input", { bubbles: true })); });
    const navigation = page.waitForNavigation({ waitUntil: "networkidle2", timeout }).catch(() => null);
    await clickByText(page, "button", "Save changes");
    await navigation;
    const unpublished = await prisma.repositoryDocument.findFirst({ where: { tenantId: primaryTenantId, id: documentId } });
    assert.equal(unpublished?.status, "DRAFT");
    assert.equal(unpublished?.visibility, "INTERNAL");
  } finally { await context.close(); }
}

async function verifyUnpublishedAndDelete(browser, documentId) {
  const resident = await browser.createBrowserContext();
  const page = await createPage(resident, { width: 390, height: 844, deviceScaleFactor: 1 });
  try {
    await login(page, homeownerEmail, homeownerPassword, "/portal/");
    const url = new URL("/portal/document-library", baseUrl); url.searchParams.set("search", documentTitle);
    await page.goto(url.toString(), { waitUntil: "networkidle2", timeout });
    assert.ok(!(await pageText(page)).includes(documentTitle), "Draft/internal record must disappear from resident retrieval.");
    const denial = await page.evaluate(async (id) => { const response = await fetch(`/api/portal/document-library/${id}/download`, { credentials: "include", redirect: "manual" }); return { status: response.status, ok: response.ok, body: await response.text() }; }, documentId);
    assert.ok(!denial.ok || denial.status !== 200);
    assert.ok(!denial.body.includes("replacement DMS browser content"));
  } finally { await resident.close(); }

  const admin = await browser.createBrowserContext();
  const adminPage = await createPage(admin, { width: 1440, height: 1000 });
  try {
    await login(adminPage, adminEmail, adminPassword, "/admin/");
    await adminPage.goto(`${baseUrl}/admin/document-management/${documentId}`, { waitUntil: "networkidle2", timeout });
    await adminPage.type('input[name="confirmation"]', "DELETE");
    await adminPage.evaluate(() => {
      const confirmation = document.querySelector('input[name="confirmation"]');
      const form = confirmation?.closest("form");
      const reason = form?.querySelector('input[name="reason"]');
      if (reason) { reason.value = "E2E lifecycle cleanup after verified DMS controls"; reason.dispatchEvent(new Event("input", { bubbles: true })); }
    });
    const navigation = adminPage.waitForNavigation({ waitUntil: "networkidle2", timeout }).catch(() => null);
    await clickByText(adminPage, "button", "Permanently delete");
    await navigation;
  } finally { await admin.close(); }

  assert.equal(await prisma.repositoryDocument.findFirst({ where: { tenantId: primaryTenantId, id: documentId } }), null);
  assert.equal(await prisma.repositoryDocumentRevision.count({ where: { tenantId: primaryTenantId, documentId } }), 0);
  const tombstone = await prisma.auditLog.findFirst({ where: { tenantId: primaryTenantId, module: "DOCUMENT_MANAGEMENT", action: "DOCUMENT_REPOSITORY_DELETED", entityId: documentId } });
  assert.ok(tombstone, "Permanent DMS delete must retain tenant-scoped audit evidence.");
  assert.equal(await prisma.repositoryDocument.findFirst({ where: { tenantId: secondaryTenantId, id: documentId } }), null);
}

async function main() {
  assertE2eDatabaseSafety();
  await clearStaleRecords();
  const dir = await mkdtemp(join(tmpdir(), "hoahub-dms-e2e-"));
  const original = join(dir, "e2e-dms-original.txt");
  const replacement = join(dir, "e2e-dms-replacement.txt");
  await writeFile(original, "Original DMS browser content for tenant A only.\n", "utf8");
  await writeFile(replacement, "Replacement DMS browser content after controlled revision.\n", "utf8");
  const browser = await puppeteer.launch({ executablePath: await browserExecutable(), headless: true, args: [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox"], defaultViewport: null });
  try {
    const documentId = await uploadAndVerifyAdmin(browser, original);
    await verifyHomeownerBoundaries(browser, documentId);
    await replaceAndUnpublish(browser, documentId, replacement);
    await verifyUnpublishedAndDelete(browser, documentId);
    console.log("DMS browser UAT passed: authorized controls, category access, authenticated same-origin upload, tenant-derived storage, publish/resident retrieval, cross-tenant denial, governed revision, unpublish denial, permanent deletion and audit evidence.");
  } finally {
    await browser.close();
    await rm(dir, { recursive: true, force: true });
    await prisma.$disconnect();
  }
}

main().catch(async (error) => { console.error(error); await prisma.$disconnect().catch(() => undefined); process.exitCode = 1; });
