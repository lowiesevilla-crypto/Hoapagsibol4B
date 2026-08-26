import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import {
  CollectionType,
  PaymentMethod,
  PayerType,
  PrismaClient,
  RefundStatus,
} from "@prisma/client";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const prisma = new PrismaClient();
const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const adminEmail = process.env.E2E_ADMIN_EMAIL || process.env.SEED_SYSTEM_ADMIN_EMAIL || "ci-system@example.invalid";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || process.env.SEED_SYSTEM_ADMIN_PASSWORD || "CI-Temporary-Password-2026!";
const homeownerEmail = process.env.E2E_HOMEOWNER_EMAIL || "ci-homeowner@example.invalid";
const primaryTenantId = "tenant_pagsibol4b_default";
const coverageYear = Number(process.env.E2E_COVERAGE_YEAR || 2099);
const coverageMonth = Number(process.env.E2E_COVERAGE_MONTH || 1);
const timeout = 45_000;
const runToken = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const voidReason = `E2E payment void ${runToken}`;
const refundReference1 = `E2E-RF-1-${runToken}`.slice(0, 80);
const refundReference2 = `E2E-RF-2-${runToken}`.slice(0, 80);
let collectionId = null;

async function pathExists(path) {
  if (!path) return false;
  try { await access(path); return true; } catch { return false; }
}

function assertE2eDatabaseSafety() {
  const allowLocal = process.env.HOAHUB_E2E_ALLOW_LOCAL === "1";
  if (process.env.CI !== "true" && !allowLocal) {
    throw new Error("Finance reversal browser database operations are restricted to CI. Set HOAHUB_E2E_ALLOW_LOCAL=1 only for an explicit disposable local database run.");
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for the finance reversal browser suite.");
  const host = new URL(databaseUrl).hostname;
  if (!allowLocal && !["127.0.0.1", "localhost", "mysql"].includes(host)) {
    throw new Error(`Refusing finance reversal browser database operations against non-disposable host: ${host}`);
  }
}

async function resolveBrowserExecutable() {
  const candidates = [process.env.PUPPETEER_EXECUTABLE_PATH, process.env.CHROME_BIN, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"].filter(Boolean);
  for (const candidate of candidates) if (await pathExists(candidate)) return candidate;
  const packaged = await chromium.executablePath();
  if (await pathExists(packaged)) return packaged;
  throw new Error("No Chromium or Chrome executable is available for the finance reversal browser suite.");
}

async function pageText(page) {
  return page.evaluate(() => document.body?.textContent || "");
}

async function expectText(page, text, label = text) {
  try {
    await page.waitForFunction((expected) => (document.body?.textContent || "").includes(expected), { timeout }, text);
  } catch (error) {
    const body = (await pageText(page)).replace(/\s+/g, " ").trim();
    throw new Error(`Expected ${label} on ${page.url()}. Page text: ${body.slice(0, 2000)}`, { cause: error });
  }
}

async function clickByText(page, selector, matcher) {
  for (const element of await page.$$(selector)) {
    const text = (await element.evaluate((node) => node.textContent || "")).replace(/\s+/g, " ").trim();
    if ((typeof matcher === "string" && text.includes(matcher)) || (matcher instanceof RegExp && matcher.test(text))) {
      await element.click();
      return element;
    }
  }
  throw new Error(`No ${selector} matched ${String(matcher)} on ${page.url()}`);
}

async function login(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle2", timeout });
  await page.type("#identifier", adminEmail);
  await page.type("#password", adminPassword);
  await clickByText(page, "button", "Sign in securely");
  await page.waitForFunction(() => window.location.pathname.startsWith("/admin/"), { timeout });
  await page.waitForNetworkIdle({ idleTime: 500, timeout }).catch(() => undefined);
}

async function createPage(context) {
  const page = await context.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  page.setDefaultTimeout(timeout);
  page.on("pageerror", (error) => console.log(`[browser:pageerror] ${error.message}`));
  return page;
}

async function createBondFixture() {
  const [admin, homeowner] = await Promise.all([
    prisma.user.findFirst({ where: { tenantId: primaryTenantId, email: adminEmail, active: true } }),
    prisma.homeownerProfile.findFirst({ where: { tenantId: primaryTenantId, user: { email: homeownerEmail } }, include: { user: true } }),
  ]);
  assert.ok(admin, "Expected seeded CI administrator for finance reversal regression.");
  assert.ok(homeowner, "Expected seeded CI homeowner for finance reversal regression.");

  const receiptNumber = `AR-CB-E2E-${runToken}`.slice(0, 50);
  const collection = await prisma.collection.create({
    data: {
      tenantId: primaryTenantId,
      type: CollectionType.CONSTRUCTION_BOND,
      payerType: PayerType.HOMEOWNER,
      homeownerId: homeowner.id,
      amount: 2000,
      collectionDate: new Date("2099-01-15T00:00:00.000Z"),
      method: PaymentMethod.CASH,
      referenceNumber: `E2E-BOND-${runToken}`.slice(0, 80),
      receiptNumber,
      remarks: "Disposable finance reversal browser fixture",
      refundable: true,
      refundStatus: RefundStatus.HELD,
      createdById: admin.id,
    },
  });
  collectionId = collection.id;
  return { collection, homeowner };
}

async function cleanup() {
  if (!collectionId) return;
  const refundIds = (await prisma.bondRefund.findMany({ where: { collectionId }, select: { id: true } })).map((item) => item.id);
  if (refundIds.length) {
    await prisma.auditLog.deleteMany({ where: { tenantId: primaryTenantId, entityType: "BondRefund", entityId: { in: refundIds } } }).catch(() => undefined);
    await prisma.bondRefund.deleteMany({ where: { collectionId } });
  }
  await prisma.auditLog.deleteMany({ where: { tenantId: primaryTenantId, entityType: "Collection", entityId: collectionId } }).catch(() => undefined);
  await prisma.collection.deleteMany({ where: { id: collectionId, tenantId: primaryTenantId } });
}

async function locateCriticalPayment(homeownerId) {
  const payment = await prisma.payment.findFirst({
    where: {
      tenantId: primaryTenantId,
      homeownerId,
      status: "ACTIVE",
      receiptNumber: { startsWith: `AR-MD-${coverageYear}-` },
      allocations: { some: { coverageYear, coverageMonth } },
    },
    include: { allocations: { include: { bill: true } } },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(payment, "Expected the preceding critical browser suite to create an active monthly-dues payment.");
  return payment;
}

async function assertBillsRecalculated(payment) {
  for (const allocation of payment.allocations) {
    const bill = await prisma.bill.findUnique({ where: { id: allocation.billId } });
    assert.ok(bill, `Expected affected bill ${allocation.billId} after void.`);
    const [allocated, legacy] = await Promise.all([
      prisma.paymentAllocation.aggregate({ where: { billId: bill.id, payment: { status: "ACTIVE" } }, _sum: { amount: true } }),
      prisma.payment.aggregate({ where: { billId: bill.id, status: "ACTIVE", allocations: { none: {} } }, _sum: { amount: true } }),
    ]);
    const expectedPaid = Math.round((Number(allocated._sum.amount ?? 0) + Number(legacy._sum.amount ?? 0) + Number.EPSILON) * 100) / 100;
    const expectedBalance = Math.round((Math.max(0, Number(bill.totalAmount) - expectedPaid) + Number.EPSILON) * 100) / 100;
    assert.equal(Number(bill.amountPaid), expectedPaid, `Bill ${bill.id} amountPaid must be recalculated from remaining ACTIVE payments.`);
    assert.equal(Number(bill.balance), expectedBalance, `Bill ${bill.id} balance must be restored after the payment void.`);
  }
}

async function runPaymentVoid(page, homeowner) {
  const payment = await locateCriticalPayment(homeowner.id);
  const receiptNumber = payment.receiptNumber || payment.id.slice(-8).toUpperCase();
  const activeUrl = new URL("/admin/payments/active", baseUrl);
  activeUrl.searchParams.set("q", receiptNumber);
  await page.goto(activeUrl.toString(), { waitUntil: "networkidle2", timeout });
  await expectText(page, receiptNumber, "target active payment receipt");

  const targetRow = await page.evaluateHandle((receipt) => {
    return Array.from(document.querySelectorAll("tbody tr")).find((row) => (row.textContent || "").includes(receipt)) || null;
  }, receiptNumber);
  const row = targetRow.asElement();
  assert.ok(row, `Expected active payment row for ${receiptNumber}.`);
  const voidButton = await row.$("button.btn-danger");
  assert.ok(voidButton, "Expected Void action for active payment.");
  await voidButton.click();

  const reasonInput = await row.$("input[name='reason']");
  assert.ok(reasonInput, "Expected void reason input after opening the Void action.");
  await reasonInput.type(voidReason);
  await page.evaluate(() => { window.confirm = () => true; });
  const confirmButton = await row.$("button[type='submit']");
  assert.ok(confirmButton, "Expected Confirm void submit action.");
  await confirmButton.click();
  await page.waitForFunction(() => new URL(window.location.href).searchParams.get("success") === "deleted", { timeout });

  const voided = await prisma.payment.findUnique({ where: { id: payment.id } });
  assert.ok(voided, "Voided payment must remain available for audit.");
  assert.equal(voided.status, "VOIDED");
  assert.equal(voided.voidReason, voidReason);
  assert.ok(voided.voidedAt, "Void timestamp must be persisted.");
  assert.equal(await prisma.paymentArchive.count({ where: { tenantId: primaryTenantId, originalPaymentId: payment.id } }), 1, "Voiding an allocated payment must create one immutable archive snapshot.");
  assert.ok(await prisma.auditLog.findFirst({ where: { tenantId: primaryTenantId, module: "PAYMENTS", action: "VOID_PAYMENT_TRANSACTION", metadata: { path: ["originalPaymentId"], equals: payment.id } } }), "Payment void must retain audit evidence.");
  await assertBillsRecalculated(payment);

  await page.goto(`${baseUrl}/admin/payments/history?q=${encodeURIComponent(receiptNumber)}`, { waitUntil: "networkidle2", timeout });
  await expectText(page, receiptNumber, "voided receipt in transaction history");
  await expectText(page, "VOID", "voided transaction status");
  await expectText(page, voidReason, "void reason in transaction history");
}

async function runBondRefund(page, collection, homeowner) {
  await page.goto(`${baseUrl}/admin/collections`, { waitUntil: "networkidle2", timeout });
  await expectText(page, "Refund a bond");

  const optionIds = await page.$$eval("select[name='collectionId'] option", (options) => options.map((option) => option.value).filter(Boolean));
  const primaryOpenBondIds = new Set((await prisma.collection.findMany({
    where: { tenantId: primaryTenantId, refundable: true, refundStatus: { in: [RefundStatus.HELD, RefundStatus.PARTIALLY_REFUNDED] } },
    select: { id: true },
  })).map((item) => item.id));
  assert.ok(optionIds.includes(collection.id), "Current tenant's open bond must be selectable for refund.");
  for (const id of optionIds) assert.ok(primaryOpenBondIds.has(id), `Refund selector exposed non-current-tenant or closed bond ${id}.`);

  await page.select("select[name='collectionId']", collection.id);
  await page.type("input[name='amount']", "750.25");
  await page.select("select[name='method']", PaymentMethod.GCASH);
  await page.type("input[name='referenceNumber']", refundReference1);
  await page.type("input[name='remarks']", "E2E partial clearance refund");
  await clickByText(page, "button[type='submit']", "Process refund");
  await page.waitForFunction(() => new URL(window.location.href).searchParams.get("success") === "refunded", { timeout });

  let refreshed = await prisma.collection.findUnique({ where: { id: collection.id } });
  assert.ok(refreshed);
  assert.equal(Number(refreshed.amountRefunded), 750.25);
  assert.equal(refreshed.refundStatus, RefundStatus.PARTIALLY_REFUNDED);
  assert.equal(await prisma.bondRefund.count({ where: { collectionId: collection.id } }), 1);
  await expectText(page, homeowner.user.name, "refund payer after partial refund");
  await expectText(page, refundReference1, "partial refund reference in audit table");

  await page.select("select[name='collectionId']", collection.id);
  const amountInput = await page.$("input[name='amount']");
  await amountInput.evaluate((node) => { node.value = ""; node.dispatchEvent(new Event("input", { bubbles: true })); });
  await amountInput.type("1249.75");
  const referenceInput = await page.$("input[name='referenceNumber']");
  await referenceInput.evaluate((node) => { node.value = ""; node.dispatchEvent(new Event("input", { bubbles: true })); });
  await referenceInput.type(refundReference2);
  await clickByText(page, "button[type='submit']", "Process refund");
  await page.waitForFunction(() => new URL(window.location.href).searchParams.get("success") === "refunded", { timeout });

  refreshed = await prisma.collection.findUnique({ where: { id: collection.id } });
  assert.ok(refreshed);
  assert.equal(Number(refreshed.amountRefunded), 2000);
  assert.equal(refreshed.refundStatus, RefundStatus.REFUNDED);
  assert.equal(await prisma.bondRefund.count({ where: { collectionId: collection.id } }), 2, "Partial plus final refund must retain two immutable refund rows.");
  assert.equal(await prisma.auditLog.count({ where: { tenantId: primaryTenantId, module: "COLLECTIONS", action: "BOND_REFUND_PROCESSED", entityType: "BondRefund" } }), 2, "Both refund state transitions must be audited in the disposable test tenant.");

  await page.goto(`${baseUrl}/admin/collections`, { waitUntil: "networkidle2", timeout });
  const closedOptionIds = await page.$$eval("select[name='collectionId'] option", (options) => options.map((option) => option.value));
  assert.ok(!closedOptionIds.includes(collection.id), "Fully refunded bond must leave the open-bond refund selector.");
}

assertE2eDatabaseSafety();
const { collection, homeowner } = await createBondFixture();
const executablePath = await resolveBrowserExecutable();
const headlessMode = "shell";
const browser = await puppeteer.launch({ executablePath, headless: headlessMode, args: await puppeteer.defaultArgs({ args: chromium.args, headless: headlessMode }) });

try {
  const context = await browser.createBrowserContext();
  const page = await createPage(context);
  try {
    await login(page);
    await runPaymentVoid(page, homeowner);
    await runBondRefund(page, collection, homeowner);
  } finally {
    await context.close();
  }
  console.log("Finance reversal browser regression suite passed:");
  console.log("- active payment void archived the receipt and recalculated affected bill balances");
  console.log("- voided transaction remained visible in history with audit reason");
  console.log("- bond refund selector remained tenant scoped");
  console.log("- partial and full bond refunds preserved exact centavo totals and audit rows");
  console.log("- fully refunded bond left the open refund selector");
} catch (error) {
  console.error("Finance reversal browser regression suite failed.");
  console.error(error);
  process.exitCode = 1;
} finally {
  await cleanup().catch((error) => console.error("Finance reversal browser cleanup failed.", error));
  await browser.close();
  await prisma.$disconnect();
}
