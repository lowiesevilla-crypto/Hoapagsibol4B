import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

test("Online Payments is visible in both the payments sub-navigation and admin shell menu", () => {
  const paymentsNav = source("components/payments-nav.tsx");
  const sidebarLinks = source("components/sidebar-links.ts");

  assert.match(paymentsNav, /\/admin\/payments\/online/);
  assert.match(paymentsNav, /Online Payments/);
  assert.match(sidebarLinks, /href: "\/admin\/payments\/online", label: "Online Payments"/);
});

test("PayMongo report exposes server-side search, filters, page size and pagination", () => {
  const page = source("app/admin/payments/online/page.tsx");

  assert.match(page, /name="q"/);
  assert.match(page, /name="finance"/);
  assert.match(page, /name="from"/);
  assert.match(page, /name="to"/);
  assert.match(page, /name="pageSize"/);
  assert.match(page, /Search \/ Filter/);
  assert.match(page, /Previous/);
  assert.match(page, /Next/);
  assert.match(page, /sticky top-0/);
});

test("PayMongo report remains tenant scoped and reconciles only bounded result-page batches", () => {
  const page = source("app/admin/payments/online/page.tsx");
  const service = source("lib/services/paymongo-online-report.ts");

  assert.match(page, /requirePermission\(Permission\.PAYMENTS_MANAGE\)/);
  assert.match(page, /tenantId: admin\.tenantId/);
  assert.match(service, /tenantId: input\.tenantId/);
  assert.match(service, /proofContentType: PAYMONGO_PAYMENT_REQUEST_MARKER/);
  assert.match(service, /const pageSizes = new Set\(\[25, 50, 100\]\)/);
  assert.match(service, /const reconciliationBatchSize = 8/);
  assert.match(service, /pageLeaders\.slice/);
  assert.match(service, /Promise\.all\(batch\.map\(reconcileLeader\)\)/);
  assert.doesNotMatch(service, /take: 30|take: 50|take: 5000/);
});
