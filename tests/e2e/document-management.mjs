import assert from "node:assert/strict";
import { access, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
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
  if (process.env.CI !== "true" && !allowLocal) {
    throw new Error("DMS browser UAT is restricted to CI. Set HOAHUB_E2E_ALLOW_LOCAL=1 only for an explicit disposable local database run.");
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for DMS browser UAT.");
  const host = new URL(databaseUrl).hostname;
  if (!allowLocal && !["127.0.0.1", "localhost", "mysql"].includes(host)) {
    throw new Error(`Refusing DMS browser operations against non-disposable host: ${host}`);
  }
}

async function pathExists(path) {
  if (!path) return false;
  try { await access(path); return true; } catch { return false; }
}

function uploadRoot() {
  const configured = process.env.STORAGE_ROOT?.trim() || "storage";
  const storageRoot = isAbsolute(configured) ? resolve(configured) : resolve(process.cwd(), configured);
  return resolve(storageRoot, "uploads");
}

function storagePathForKey(storageKey) {
  const normalized = String(storageKey || "").replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..") || normalized.includes("\0") || !normalized.startsWith("tenants/")) {
    throw new Error(`Refusing unsafe DMS fixture storage key: ${storageKey}`);
  }
  const root = uploadRoot();
  const absolute = resolve(root, ...normalized.split("/"));
  const child = relative(root, absolute);
  if (!child || child.startsWith("..") || isAbsolute(child)) {
    throw new Error(`Refusing DMS fixture storage key outside upload root: ${storageKey}`);
  }
  return absolute;
}

async function deleteStorageKeys(storageKeys) {
  for (const storageKey of new Set(storageKeys.filter(Boolean))) {
    try {
      await unlink(storagePathForKey(storageKey));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
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
  for (const candidate of candidates) if (await pathExists(candidate)) return candidate;
  const packaged = await chromium.executablePath();
  if (await pathExists(packaged)) return packaged;
  throw new Error("No Chromium or Chrome executable is available for DMS browser UAT.");
}

async function pageText(page) {
  return page.evaluate(() => document.body?.textContent || "");
}

async function expectText(page, text, label = text) {
  await page.waitForFunction((expected) => (document.body?.textContent || "").includes(expected), { timeout }, text).catch(async (error) => {
    const body = (await pageText(page)).replace(/\s+/g, " ").trim();
    throw new Error(`Expected ${label} on ${page.url()}. Page text: ${body.slice(0, 2000)}`, { cause: error });
  });
}

async function clickByText(page, selector, matcher) {
  const elements = await page.$$(selector);
  for (const element of elements) {
    const text = (await element.evaluate((node) => node.textContent || "")).replace(/\s+/g, " ").trim();
    const matches = typeof matcher === "string" ? text.includes(matcher) : matcher.test(text);
    if (matches) {
      await element.click();
      return text;
    }
  }
  throw new Error(`No ${selector} matched ${String(matcher)} on ${page.url()}`);
}

async function clearAndType(page, selector, value) {
  await page.waitForSelector(selector, { timeout });
  await page.$eval(selector, (element) => {
    element.value = "";
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.type(selector, value);
}

async function login(page, email, password, expectedPathPrefix) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle2", timeout });
  await page.waitForSelector("#identifier", { timeout });
  await page.type("#identifier", email);
  await page.type("#password", password);
  await clickByText(page, "button", "Sign in securely");
  await page.waitForFunction((prefix) => window.location.pathname.startsWith(prefix), { timeout }, expectedPathPrefix);
  await page.waitForNetworkIdle({ idleTime: 400, timeout }).catch(() => undefined);
}

async function createPage(context, viewport) {
  const page = await context.newPage();
  await page.setViewport(viewport);
  page.setDefaultTimeout(timeout);
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) console.log(`[dms-browser:${message.type()}] ${message.text()}`);
  });
  page.on("pageerror", (error) => console.log(`[dms-browser:pageerror] ${error.message}`));
  return page;
}

async function submitSameOriginMultipartForm(page, selector) {
  const result = await page.$eval(selector, async (form) => {
    if (!(form instanceof HTMLFormElement)) throw new Error("Expected an HTML form.");
    const action = new URL(form.action || location.href, location.href);
    if (action.origin !== location.origin) throw new Error(`Refusing cross-origin DMS form action: ${action.origin}`);
    const method = (form.method || "POST").toUpperCase();
    if (method !== "POST") throw new Error(`Unexpected DMS multipart method: ${method}`);
    const response = await fetch(action.toString(), {
      method,
      body: new FormData(form),
      credentials: "include",
      redirect: "follow",
    });
    return {
      ok: response.ok,
      status: response.status,
      url: response.url,
      text: await response.text(),
    };
  });
  assert.ok(result.ok, `DMS multipart submission failed with HTTP ${result.status}: ${result.text.slice(0, 500)}`);
  const finalUrl = new URL(result.url);
  assert.equal(finalUrl.origin, new URL(baseUrl).origin, "DMS multipart redirect must remain on the application origin.");
  return result;
}

async function cleanupStaleDatabaseRecords() {
  const stale = await prisma.repositoryDocument.findMany({
    where: { tenantId: primaryTenantId, title: documentTitle },
    select: { id: true, storageKey: true, revisions: { select: { storageKey: true } } },
  });
  const ids = stale.map((document) => document.id);
  if (!ids.length) return;
  const storageKeys = stale.flatMap((document) => [document.storageKey, ...document.revisions.map((revision) => revision.storageKey)]);
  await prisma.aiKnowledgeBinding.deleteMany({ where: { tenantId: primaryTenantId, documentId: { in: ids } } });
  await prisma.repositoryDocument.deleteMany({ where: { tenantId: primaryTenantId, id: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { tenantId: primaryTenantId, module: "DOCUMENT_MANAGEMENT", entityId: { in: ids } } });
  await deleteStorageKeys(storageKeys);
}

async function withSecondaryDocumentManagementEntitlement(callback) {
  const previous = await prisma.tenantFeatureEntitlement.findUnique({
    where: { tenantId_featureCode: { tenantId: secondaryTenantId, featureCode: "DOCUMENT_MANAGEMENT" } },
  });
  await prisma.tenantFeatureEntitlement.upsert({
    where: { tenantId_featureCode: { tenantId: secondaryTenantId, featureCode: "DOCUMENT_MANAGEMENT" } },
    update: {
      enabledOverride: true,
      storageLimitMbOverride: 50,
      maxFileSizeMbOverride: 5,
      retainRevisionBinariesOverride: true,
      maxRevisionBinariesOverride: 2,
    },
    create: {
      tenantId: secondaryTenantId,
      featureCode: "DOCUMENT_MANAGEMENT",
      enabledOverride: true,
      storageLimitMbOverride: 50,
      maxFileSizeMbOverride: 5,
      retainRevisionBinariesOverride: true,
      maxRevisionBinariesOverride: 2,
    },
  });
  try {
    return await callback();
  } finally {
    if (previous) {
      await prisma.tenantFeatureEntitlement.update({
        where: { tenantId_featureCode: { tenantId: secondaryTenantId, featureCode: "DOCUMENT_MANAGEMENT" } },
        data: {
          enabledOverride: previous.enabledOverride,
          storageLimitMbOverride: previous.storageLimitMbOverride,
          maxFileSizeMbOverride: previous.maxFileSizeMbOverride,
          retainRevisionBinariesOverride: previous.retainRevisionBinariesOverride,
          maxRevisionBinariesOverride: previous.maxRevisionBinariesOverride,
          configurationOverride: previous.configurationOverride,
          updatedById: previous.updatedById,
        },
      });
    } else {
      await prisma.tenantFeatureEntitlement.delete({
        where: { tenantId_featureCode: { tenantId: secondaryTenantId, featureCode: "DOCUMENT_MANAGEMENT" } },
      }).catch(() => undefined);
    }
  }
}

async function uploadPublishedDocument(browser, originalPath) {
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

    const category = await prisma.repositoryDocumentCategory.findFirst({
      where: { tenantId: primaryTenantId, code: "POLICIES_GUIDELINES", active: true },
      select: { id: true, governanceControlled: true },
    });
    assert.ok(category, "Expected the default Policies and Guidelines DMS category.");
    assert.equal(category.governanceControlled, true, "DMS revision UAT requires a governed category.");

    await page.goto(`${baseUrl}/admin/document-management/upload`, { waitUntil: "networkidle2", timeout });
    await expectText(page, "Upload document");
    await clearAndType(page, 'input[name="title"]', documentTitle);
    await page.select('select[name="categoryId"]', category.id);
    await clearAndType(page, 'input[name="documentReference"]', documentReference);
    await clearAndType(page, 'textarea[name="description"]', "Published by DMS browser UAT for tenant-isolated homeowner retrieval and revision testing.");
    await clearAndType(page, 'input[name="issuingBody"]', "E2E HOA Board");
    await clearAndType(page, 'input[name="searchableKeywords"]', "e2e dms browser policy homeowner retrieval");
    await page.$eval('input[name="effectiveAt"]', (element) => { element.value = "2026-01-01"; element.dispatchEvent(new Event("input", { bubbles: true })); });
    await page.select('select[name="visibility"]', "TENANT_PUBLIC");
    await page.select('select[name="status"]', "PUBLISHED");
    const fileInput = await page.$('input[name="file"]');
    assert.ok(fileInput, "Expected DMS upload file input.");
    await fileInput.uploadFile(originalPath);

    const upload = await submitSameOriginMultipartForm(page, 'form[action="/api/admin/document-management/documents"]');
    const uploadUrl = new URL(upload.url);
    assert.equal(uploadUrl.pathname, "/admin/document-management");
    assert.ok(uploadUrl.searchParams.has("success"), `Expected successful DMS upload redirect, got ${upload.url}`);
    await page.goto(upload.url, { waitUntil: "networkidle2", timeout });
    await expectText(page, documentTitle, "uploaded DMS document in repository list");

    const document = await prisma.repositoryDocument.findFirst({
      where: { tenantId: primaryTenantId, title: documentTitle },
      include: { revisions: true },
    });
    assert.ok(document, "Expected uploaded DMS document in the active tenant.");
    assert.equal(document.status, "PUBLISHED");
    assert.equal(document.visibility, "TENANT_PUBLIC");
    assert.equal(document.revisionPolicy, "KEEP_HISTORY");
    assert.equal(document.currentRevision, 1);
    assert.equal(document.revisions.length, 0);
    assert.equal(document.aiEnabled, false, "Normal DMS upload must not silently opt a document into AI retrieval.");

    const tenant = await prisma.tenant.findUnique({ where: { id: primaryTenantId }, select: { slug: true } });
    assert.ok(tenant);
    assert.ok(document.storageKey.startsWith(`tenants/${tenant.slug}/documents/repository/`), "DMS storage key must be tenant-derived server-side.");
    assert.ok(!document.storageKey.includes(document.originalFileName), "Randomized storage key must not expose the original filename.");

    await page.goto(`${baseUrl}/admin/document-management/${document.id}`, { waitUntil: "networkidle2", timeout });
    await expectText(page, "Save changes", "authorized DMS metadata action");
    await expectText(page, "Create next revision", "authorized DMS replace action");
    await expectText(page, "Permanently delete", "authorized DMS delete action");
    await expectText(page, "Download", "authorized DMS internal download action");
    return document.id;
  } finally {
    await context.close();
  }
}

async function verifyPublishedHomeownerAccess(browser, documentId) {
  const primaryContext = await browser.createBrowserContext();
  const primaryPage = await createPage(primaryContext, { width: 390, height: 844, deviceScaleFactor: 1 });
  try {
    await login(primaryPage, homeownerEmail, homeownerPassword, "/portal/");
    const url = new URL("/portal/document-library", baseUrl);
    url.searchParams.set("search", documentTitle);
    await primaryPage.goto(url.toString(), { waitUntil: "networkidle2", timeout });
    await expectText(primaryPage, documentTitle, "published DMS record in homeowner library");
    await expectText(primaryPage, documentReference);

    const download = await primaryPage.evaluate(async (id) => {
      const response = await fetch(`/api/portal/document-library/${id}/download`, { credentials: "include" });
      return {
        status: response.status,
        contentType: response.headers.get("content-type") || "",
        disposition: response.headers.get("content-disposition") || "",
        body: await response.text(),
      };
    }, documentId);
    assert.equal(download.status, 200);
    assert.match(download.contentType, /^text\/plain/i);
    assert.match(download.disposition, /attachment/i);
    assert.match(download.body, /original DMS browser content/i);
  } finally {
    await primaryContext.close();
  }

  const secondaryContext = await browser.createBrowserContext();
  const secondaryPage = await createPage(secondaryContext, { width: 390, height: 844, deviceScaleFactor: 1 });
  try {
    await login(secondaryPage, otherHomeownerEmail, homeownerPassword, "/portal/");
    const direct = await withSecondaryDocumentManagementEntitlement(() => secondaryPage.evaluate(async (id) => {
      const response = await fetch(`/api/portal/document-library/${id}/download`, { credentials: "include", redirect: "manual" });
      return { status: response.status, ok: response.ok, contentType: response.headers.get("content-type") || "", body: await response.text() };
    }, documentId));
    assert.ok(!direct.ok || direct.status !== 200, "Another tenant must not download a known DMS document ID.");
    assert.ok(!direct.body.includes("original DMS browser content"), "Cross-tenant denial must not leak DMS file content.");

    await secondaryPage.goto(`${baseUrl}/portal/document-library`, { waitUntil: "networkidle2", timeout }).catch(() => undefined);
    assert.equal(new URL(secondaryPage.url()).pathname, "/portal/dashboard", "Tenant without DMS entitlement must not receive the homeowner document library.");
  } finally {
    await secondaryContext.close();
  }
}

async function replaceAndUnpublish(browser, documentId, replacementPath) {
  const context = await browser.createBrowserContext();
  const page = await createPage(context, { width: 1440, height: 1000 });
  try {
    await login(page, adminEmail, adminPassword, "/admin/");
    await page.goto(`${baseUrl}/admin/document-management/${documentId}`, { waitUntil: "networkidle2", timeout });

    const replaceSelector = `form[action="/api/admin/document-management/documents/${documentId}/replace"]`;
    const replaceForm = await page.$(replaceSelector);
    assert.ok(replaceForm, "Expected authorized governed-record replacement form.");
    const replacementInput = await replaceForm.$('input[name="file"]');
    const replacementReason = await replaceForm.$('textarea[name="reason"]');
    assert.ok(replacementInput && replacementReason);
    await replacementInput.uploadFile(replacementPath);
    await replacementReason.type("E2E controlled revision replacement");
    const replacement = await submitSameOriginMultipartForm(page, replaceSelector);
    const replacementUrl = new URL(replacement.url);
    assert.equal(replacementUrl.pathname, `/admin/document-management/${documentId}`);
    assert.ok(replacementUrl.searchParams.has("success"), `Expected successful DMS replacement redirect, got ${replacement.url}`);
    await page.goto(replacement.url, { waitUntil: "networkidle2", timeout });
    await expectText(page, "Rev 2", "updated DMS revision number");
    await expectText(page, "E2E controlled revision replacement", "DMS revision ledger reason");

    const replaced = await prisma.repositoryDocument.findFirst({
      where: { tenantId: primaryTenantId, id: documentId },
      include: { revisions: { orderBy: { revision: "asc" } } },
    });
    assert.ok(replaced);
    assert.equal(replaced.currentRevision, 2);
    assert.equal(replaced.originalFileName, "e2e-dms-replacement.txt");
    assert.equal(replaced.revisions.length, 1);
    assert.equal(replaced.revisions[0].revision, 1);
    assert.equal(replaced.revisions[0].originalFileName, "e2e-dms-original.txt");
    assert.ok(replaced.revisions[0].storageKey, "Governed plan should retain the prior revision binary during this UAT.");

    await page.select('select[name="visibility"]', "INTERNAL");
    await page.select('select[name="status"]', "DRAFT");
    await page.$eval('form input[name="reason"]', (element) => {
      element.value = "E2E unpublish visibility lifecycle check";
      element.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const saveNavigation = page.waitForNavigation({ waitUntil: "networkidle2", timeout }).catch(() => null);
    await clickByText(page, "button", "Save changes");
    await saveNavigation;
    await page.waitForFunction(
      () => new URL(window.location.href).searchParams.has("success") || (document.body?.textContent || "").includes("Document details updated."),
      { timeout },
    ).catch(async (error) => {
      const current = await prisma.repositoryDocument.findFirst({ where: { tenantId: primaryTenantId, id: documentId }, select: { status: true, visibility: true } });
      if (current?.status === "DRAFT" && current.visibility === "INTERNAL") return;
      const body = (await pageText(page)).replace(/\s+/g, " ").trim();
      throw new Error(`Expected DMS metadata save success after unpublish. URL: ${page.url()}. Current DB state: ${JSON.stringify(current)}. Page text: ${body.slice(0, 1600)}`, { cause: error });
    });

    const unpublished = await prisma.repositoryDocument.findFirst({ where: { tenantId: primaryTenantId, id: documentId } });
    assert.ok(unpublished);
    assert.equal(unpublished.status, "DRAFT");
    assert.equal(unpublished.visibility, "INTERNAL");
  } finally {
    await context.close();
  }
}

async function verifyUnpublishedHomeownerDenial(browser, documentId) {
  const context = await browser.createBrowserContext();
  const page = await createPage(context, { width: 390, height: 844, deviceScaleFactor: 1 });
  try {
    await login(page, homeownerEmail, homeownerPassword, "/portal/");
    const url = new URL("/portal/document-library", baseUrl);
    url.searchParams.set("search", documentTitle);
    await page.goto(url.toString(), { waitUntil: "networkidle2", timeout });
    const body = await pageText(page);
    assert.ok(!body.includes(documentTitle), "Draft/internal DMS record must disappear from homeowner retrieval immediately.");

    const direct = await page.evaluate(async (id) => {
      const response = await fetch(`/api/portal/document-library/${id}/download`, { credentials: "include", redirect: "manual" });
      return { status: response.status, ok: response.ok, body: await response.text() };
    }, documentId);
    assert.ok(!direct.ok || direct.status !== 200, "Known document ID must not bypass unpublished/internal DMS controls.");
    assert.ok(!direct.body.includes("replacement DMS browser content"), "Unpublished direct download denial must not leak file content.");
  } finally {
    await context.close();
  }
}

async function permanentlyDelete(browser, documentId) {
  const context = await browser.createBrowserContext();
  const page = await createPage(context, { width: 1440, height: 1000 });
  try {
    await login(page, adminEmail, adminPassword, "/admin/");
    await page.goto(`${baseUrl}/admin/document-management/${documentId}`, { waitUntil: "networkidle2", timeout });
    const confirmation = await page.$('input[name="confirmation"]');
    assert.ok(confirmation, "Expected permanent DMS deletion confirmation control.");
    await confirmation.type("DELETE");
    await page.evaluate(() => {
      const confirmationInput = document.querySelector('input[name="confirmation"]');
      const form = confirmationInput?.closest("form");
      const reason = form?.querySelector('input[name="reason"]');
      if (reason) {
        reason.value = "E2E lifecycle cleanup after verified publish, revision and access controls";
        reason.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    const navigation = page.waitForNavigation({ waitUntil: "networkidle2", timeout }).catch(() => null);
    await clickByText(page, "button", "Permanently delete");
    await navigation;
    await page.waitForFunction(() => window.location.pathname === "/admin/document-management" && new URL(window.location.href).searchParams.has("success"), { timeout });
    await expectText(page, "Document permanently deleted and repository storage released.");
  } finally {
    await context.close();
  }

  const deleted = await prisma.repositoryDocument.findFirst({ where: { tenantId: primaryTenantId, id: documentId } });
  assert.equal(deleted, null, "Permanent DMS delete must remove the tenant repository record.");
  const revisions = await prisma.repositoryDocumentRevision.count({ where: { tenantId: primaryTenantId, documentId } });
  assert.equal(revisions, 0, "Permanent DMS delete must cascade revision records.");
  const tombstone = await prisma.auditLog.findFirst({
    where: { tenantId: primaryTenantId, module: "DOCUMENT_MANAGEMENT", action: "DOCUMENT_REPOSITORY_DELETED", entityId: documentId },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(tombstone, "Permanent DMS delete must leave tenant-scoped audit evidence.");
  assert.match(tombstone.reason || "", /E2E lifecycle cleanup/i);

  const foreign = await prisma.repositoryDocument.findFirst({ where: { tenantId: secondaryTenantId, id: documentId } });
  assert.equal(foreign, null, "DMS lifecycle must never create a shadow record in another tenant.");
}

async function main() {
  assertE2eDatabaseSafety();
  await cleanupStaleDatabaseRecords();
  const tempDirectory = await mkdtemp(join(tmpdir(), "hoahub-dms-e2e-"));
  const originalPath = join(tempDirectory, "e2e-dms-original.txt");
  const replacementPath = join(tempDirectory, "e2e-dms-replacement.txt");
  await writeFile(originalPath, "Original DMS browser content for tenant A only.\n", "utf8");
  await writeFile(replacementPath, "Replacement DMS browser content after controlled revision.\n", "utf8");

  const executablePath = await resolveBrowserExecutable();
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox"],
    defaultViewport: null,
  });

  try {
    const documentId = await uploadPublishedDocument(browser, originalPath);
    await verifyPublishedHomeownerAccess(browser, documentId);
    await replaceAndUnpublish(browser, documentId, replacementPath);
    await verifyUnpublishedHomeownerDenial(browser, documentId);
    await permanentlyDelete(browser, documentId);
    console.log("DMS browser UAT passed: entitlement, admin controls, category access, upload, tenant-derived storage, publish/homeowner retrieval, tenant isolation, download, governed revision, unpublish denial, permanent delete and audit tombstone.");
  } finally {
    await browser.close();
    await rm(tempDirectory, { recursive: true, force: true });
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect().catch(() => undefined);
  process.exitCode = 1;
});
