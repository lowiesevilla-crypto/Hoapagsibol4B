import assert from "node:assert/strict";
import { access } from "node:fs/promises";
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
const tenantId = "tenant_pagsibol4b_default";
const secondaryTenantId = "tenant_e2e_browser_isolation";
const homeownerId = "e2e_browser_homeowner";
const definitionId = "e2e_browser_document_workflow_definition";
const requestPurpose = "E2E homeowner approval and generated document";
const timeout = 45_000;
const submissionTimeout = 90_000;
const documentRequestFormSelector = "[data-document-request-form='true']";

function assertE2eDatabaseSafety() {
  const allowLocal = process.env.HOAHUB_E2E_ALLOW_LOCAL === "1";
  if (process.env.CI !== "true" && !allowLocal) {
    throw new Error(
      "The document workflow browser test is restricted to CI. Set HOAHUB_E2E_ALLOW_LOCAL=1 only for an explicit disposable local database run.",
    );
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for the document workflow browser test.");
  const host = new URL(databaseUrl).hostname;
  if (!allowLocal && !["127.0.0.1", "localhost", "mysql"].includes(host)) {
    throw new Error(`Refusing document workflow browser operations against non-disposable host: ${host}`);
  }
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
  const packaged = await chromium.executablePath();
  if (await pathExists(packaged)) return packaged;
  throw new Error("No Chromium or Chrome executable is available for the document workflow browser test.");
}

async function pageText(page) {
  return page.evaluate(() => document.body?.textContent || "");
}

async function expectText(page, text, label = text) {
  try {
    await page.waitForFunction(
      (expected) => (document.body?.textContent || "").includes(expected),
      { timeout },
      text,
    );
  } catch (error) {
    const body = (await pageText(page)).replace(/\s+/g, " ").trim();
    throw new Error(`Expected ${label} on ${page.url()}. Page text: ${body.slice(0, 2000)}`, { cause: error });
  }
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
  await page.waitForFunction(
    (prefix) => window.location.pathname.startsWith(prefix),
    { timeout },
    expectedPathPrefix,
  );
  await page.waitForNetworkIdle({ idleTime: 500, timeout }).catch(() => undefined);
}

async function createPage(context, viewport) {
  const page = await context.newPage();
  await page.setViewport(viewport);
  page.setDefaultTimeout(timeout);
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) console.log(`[document-browser:${message.type()}] ${message.text()}`);
  });
  page.on("pageerror", (error) => console.log(`[document-browser:pageerror] ${error.message}`));
  return page;
}

async function waitForRequest(where, description, waitMs = timeout) {
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    const request = await prisma.documentRequest.findFirst({
      where,
      include: {
        versions: { orderBy: { version: "desc" } },
        histories: { orderBy: { createdAt: "asc" } },
      },
    });
    if (request) return request;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${description}.`);
}

async function submitRequest(browser) {
  const context = await browser.createBrowserContext();
  const page = await createPage(context, { width: 390, height: 844, deviceScaleFactor: 1 });
  let request;
  try {
    await login(page, homeownerEmail, homeownerPassword, "/portal/");
    await page.goto(`${baseUrl}/portal/documents`, { waitUntil: "networkidle2", timeout });
    await expectText(page, "Request an HOA document");
    await expectText(page, "E2E Clearance Certificate", "disposable document definition");
    await page.waitForSelector(documentRequestFormSelector, { timeout });
    await page.waitForFunction(
      (formSelector) => document.querySelector(formSelector)?.getAttribute("data-submission-ready") === "true",
      { timeout },
      documentRequestFormSelector,
    );

    const definitionSelector = `${documentRequestFormSelector} select[name='definitionId']`;
    const purposeSelector = `${documentRequestFormSelector} textarea[name='field_purpose']`;
    await page.select(definitionSelector, definitionId);
    await clearAndType(page, purposeSelector, requestPurpose);

    await page.waitForFunction((formSelector) => {
      const form = document.querySelector(formSelector);
      const submissionKey = form?.querySelector("input[name='submissionKey']");
      const button = [...(form?.querySelectorAll("button") || [])].find((candidate) => candidate.textContent?.includes("Submit request"));
      return submissionKey instanceof HTMLInputElement
        && Boolean(submissionKey.value)
        && button instanceof HTMLButtonElement
        && !button.matches(":disabled");
    }, { timeout }, documentRequestFormSelector);

    const feedbackPromise = page.waitForFunction((formSelector) => {
      const form = document.querySelector(formSelector);
      if (!(form instanceof HTMLFormElement)) return null;
      const state = form.getAttribute("data-submission-state") || "idle";
      if (!['success', 'error'].includes(state)) return null;
      const feedback = form.querySelector("[data-document-request-feedback]");
      return {
        state,
        requestId: form.getAttribute("data-submission-request-id") || "",
        text: feedback?.textContent?.replace(/\s+/g, " ").trim() || "",
      };
    }, { timeout: submissionTimeout }, documentRequestFormSelector);

    const persistedRequestPromise = waitForRequest(
      { tenantId, homeownerId, definitionId, purpose: requestPurpose },
      "the homeowner-submitted document request",
      submissionTimeout,
    );

    await page.evaluate((formSelector) => {
      const form = document.querySelector(formSelector);
      if (!(form instanceof HTMLFormElement)) throw new Error("Document request form is unavailable.");
      const button = [...form.querySelectorAll("button")].find((candidate) => candidate.textContent?.includes("Submit request"));
      if (!(button instanceof HTMLButtonElement) || button.disabled) throw new Error("Submit request button is unavailable.");
      button.click();
    }, documentRequestFormSelector);

    const [feedbackHandle, persistedRequest] = await Promise.all([feedbackPromise, persistedRequestPromise]);
    const feedback = await feedbackHandle.jsonValue();
    await feedbackHandle.dispose();
    if (feedback?.state !== "success") {
      throw new Error(`Document request form returned ${feedback?.state || "unknown"}: ${feedback?.text || "No response"}`);
    }
    if (!feedback.text.includes("Document request submitted")) {
      throw new Error(`Document request success feedback was unexpected: ${feedback.text || "No response"}`);
    }
    request = persistedRequest;
    assert.equal(feedback.requestId, request.id, "Visible submission state must reference the persisted tenant-scoped request.");

    const historyUrl = new URL("/portal/documents", baseUrl);
    historyUrl.searchParams.set("q", requestPurpose);
    await page.goto(historyUrl.toString(), { waitUntil: "networkidle2", timeout });
    await expectText(page, requestPurpose, "submitted request in homeowner history");
    await expectText(page, "PENDING APPROVAL", "approval-required request status");
  } finally {
    await context.close();
  }

  assert.ok(request, "Expected the homeowner request to be persisted.");
  assert.equal(request.origin, "HOMEOWNER");
  assert.ok(["SUBMITTED", "PENDING_APPROVAL", "UNDER_REVIEW"].includes(request.status));
  assert.equal(request.generatedContent, null);
  assert.equal(
    await prisma.documentRequest.count({
      where: { tenantId: secondaryTenantId, definitionId, purpose: requestPurpose },
    }),
    0,
    "The homeowner request must not be created in the isolation tenant.",
  );
  return request.id;
}

async function approveAndGenerate(browser, requestId) {
  const context = await browser.createBrowserContext();
  const page = await createPage(context, { width: 1440, height: 1000 });
  try {
    await login(page, adminEmail, adminPassword, "/admin/");

    await page.goto(`${baseUrl}/admin/documents/operations`, { waitUntil: "networkidle2", timeout });
    await expectText(page, "Document Operations Command Center");
    await expectText(page, "Production readiness checklist");
    await expectText(page, "Operational CSV export");

    const exportResult = await page.evaluate(async (purpose) => {
      const response = await fetch(`/admin/documents/export?q=${encodeURIComponent(purpose)}`, { credentials: "include" });
      return {
        status: response.status,
        contentType: response.headers.get("content-type") || "",
        disposition: response.headers.get("content-disposition") || "",
        body: await response.text(),
      };
    }, requestPurpose);
    assert.equal(exportResult.status, 200);
    assert.match(exportResult.contentType, /^text\/csv/i);
    assert.match(exportResult.disposition, /attachment/i);
    assert.ok(exportResult.body.includes(requestPurpose), "Expected the filtered export to contain the tenant request.");
    assert.ok(!exportResult.body.includes(secondaryTenantId), "The export must not contain another tenant identifier.");

    await page.goto(`${baseUrl}/admin/documents/guide`, { waitUntil: "networkidle2", timeout });
    await expectText(page, "Administrator Runbook");
    await expectText(page, "Daily operating checklist");

    await page.goto(`${baseUrl}/admin/documents/${requestId}`, { waitUntil: "networkidle2", timeout });
    await expectText(page, "E2E Clearance Certificate");
    await expectText(page, requestPurpose);
    await expectText(page, "Approve & generate");

    page.once("dialog", (dialog) => dialog.accept());
    await clickByText(page, "button", "Approve & generate");
    await page.waitForFunction(
      () => new URL(window.location.href).searchParams.get("success") === "approve",
      { timeout },
    );
    await page.reload({ waitUntil: "networkidle2", timeout });
  } finally {
    await context.close();
  }

  const request = await waitForRequest(
    { tenantId, id: requestId, generatedContent: { not: null }, documentNumber: { not: null } },
    "administrator approval and generated document",
  );
  assert.ok(request.documentNumber, "Expected an official generated document number.");
  assert.ok(request.generatedContent, "Expected generated document content.");
  assert.ok(request.versions.length >= 1, "Expected immutable document version history.");
  assert.ok(
    request.histories.some((history) => ["APPROVED", "GENERATING", "ISSUED", "READY_FOR_DOWNLOAD", "GENERATED"].includes(history.status)),
    "Expected approval or generation status history.",
  );
  return request;
}

async function verifyAuthorizedAccess(browser, request) {
  const context = await browser.createBrowserContext();
  const page = await createPage(context, { width: 390, height: 844, deviceScaleFactor: 1 });
  try {
    await login(page, homeownerEmail, homeownerPassword, "/portal/");
    const search = new URL("/portal/documents", baseUrl);
    search.searchParams.set("q", requestPurpose);
    await page.goto(search.toString(), { waitUntil: "networkidle2", timeout });
    await expectText(page, requestPurpose);
    await expectText(page, request.documentNumber, "generated document number in homeowner history");
    await expectText(page, "View Document");

    await page.goto(`${baseUrl}/portal/documents/guide`, { waitUntil: "networkidle2", timeout });
    await expectText(page, "Document Request Guide");
    await expectText(page, "Viewing, downloading, printing, and verification");

    await page.goto(`${baseUrl}/documents/${request.id}`, { waitUntil: "networkidle2", timeout });
    await expectText(page, request.documentNumber, "authorized generated document view");
    await expectText(page, requestPurpose);

    const download = await page.evaluate(async (url) => {
      const response = await fetch(url, { credentials: "include" });
      const bytes = await response.arrayBuffer();
      return {
        status: response.status,
        contentType: response.headers.get("content-type") || "",
        disposition: response.headers.get("content-disposition") || "",
        byteLength: bytes.byteLength,
      };
    }, `/documents/${request.id}/pdf`);
    assert.equal(download.status, 200);
    assert.match(download.contentType, /^application\/pdf/i);
    assert.match(download.disposition, /attachment/i);
    assert.ok(download.byteLength > 1_000, `Expected a non-empty PDF, received ${download.byteLength} bytes.`);
  } finally {
    await context.close();
  }
}

async function verifyCrossTenantDenial(browser, request) {
  const context = await browser.createBrowserContext();
  const page = await createPage(context, { width: 390, height: 844, deviceScaleFactor: 1 });
  try {
    await login(page, otherHomeownerEmail, homeownerPassword, "/portal/");
    await page.goto(`${baseUrl}/documents/${request.id}`, { waitUntil: "networkidle2", timeout }).catch(() => undefined);
    const body = await pageText(page);
    assert.ok(!body.includes(request.documentNumber), "Another tenant must not see the generated document number.");
    assert.ok(!body.includes(requestPurpose), "Another tenant must not see generated document content.");

    await page.goto(`${baseUrl}/admin/documents/operations`, { waitUntil: "networkidle2", timeout }).catch(() => undefined);
    assert.ok(!(await pageText(page)).includes("Document Operations Command Center"), "A homeowner must not access administrator documentation operations.");

    await page.goto(`${baseUrl}/portal/dashboard`, { waitUntil: "networkidle2", timeout });
    const exportDenial = await page.evaluate(async () => {
      const response = await fetch("/admin/documents/export", { credentials: "include", redirect: "manual" });
      return { status: response.status, type: response.headers.get("content-type") || "" };
    });
    assert.ok(exportDenial.status !== 200 || !exportDenial.type.startsWith("text/csv"), "A homeowner must not download the administrator CSV export.");

    const denial = await page.evaluate(async (url) => {
      const response = await fetch(url, { credentials: "include", redirect: "manual" });
      return {
        status: response.status,
        ok: response.ok,
        type: response.headers.get("content-type") || "",
      };
    }, `/documents/${request.id}/pdf`);
    assert.ok(!denial.ok || denial.status !== 200 || !denial.type.startsWith("application/pdf"));
  } finally {
    await context.close();
  }
}

async function assertFinalDatabaseState(requestId) {
  const request = await prisma.documentRequest.findFirst({
    where: { tenantId, id: requestId },
    include: {
      versions: true,
      histories: true,
    },
  });
  assert.ok(request, "Expected the generated request to remain tenant scoped.");
  assert.ok(["ISSUED", "READY_FOR_DOWNLOAD", "GENERATED", "DOWNLOADED"].includes(request.status));
  assert.ok(request.downloadedAt || request.status !== "DOWNLOADED" || request.histories.some((history) => history.status === "DOWNLOADED"));

  const entityIds = [request.id, ...request.versions.map((version) => version.id)];
  const audits = await prisma.auditLog.findMany({
    where: { tenantId, module: "DOCUMENTS", entityId: { in: entityIds } },
    orderBy: { createdAt: "asc" },
  });
  assert.ok(audits.some((audit) => audit.action === "SUBMIT_DOCUMENT_REQUEST"), "Expected homeowner submission audit evidence.");
  assert.ok(audits.some((audit) => /APPROV|GENERAT|ISSUE/.test(audit.action)), "Expected administrator approval or generation audit evidence.");
  assert.ok(audits.some((audit) => audit.action === "DOWNLOAD_PDF"), "Expected authorized PDF download audit evidence.");
}

assertE2eDatabaseSafety();
const executablePath = await resolveBrowserExecutable();
const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: [...new Set([...(chromium.args || []), "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"])],
});

try {
  const requestId = await submitRequest(browser);
  const request = await approveAndGenerate(browser, requestId);
  await verifyAuthorizedAccess(browser, request);
  await verifyCrossTenantDenial(browser, request);
  await assertFinalDatabaseState(requestId);
  console.log("Document workflow browser suite passed:");
  console.log("- homeowner portal submission passed");
  console.log("- tenant-scoped administrator readiness, runbook, and filtered export passed");
  console.log("- approval and official document generation passed");
  console.log("- homeowner guide, document view, and PDF download passed");
  console.log("- cross-tenant document access and administrator-export denial passed");
  console.log("- request history, immutable version, and audit evidence passed");
} catch (error) {
  console.error("Document workflow browser suite failed.");
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
  await prisma.$disconnect();
}
