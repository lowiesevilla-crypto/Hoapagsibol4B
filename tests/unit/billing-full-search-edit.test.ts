import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const page = readFileSync(resolve(process.cwd(), "app/admin/billing/page.tsx"), "utf8");
const billForm = readFileSync(resolve(process.cwd(), "components/bill-form.tsx"), "utf8");
const endpoint = readFileSync(resolve(process.cwd(), "app/api/admin/billing/homeowners/search/route.ts"), "utf8");

test("billing search is server-side, tenant-scoped, and covers active plus complete archive", () => {
  assert.match(page, /billingBillSearchWhere\(user\.tenantId, billSearch, false\)/);
  assert.match(page, /billingBillSearchWhere\(user\.tenantId, billSearch, true\)/);
  assert.match(page, /const base: Prisma\.BillWhereInput = \{ tenantId, archivedAt:/);
  assert.doesNotMatch(page, /archivedAt: \{ not: null \}[\s\S]{0,450}take: 50/);
  assert.match(page, /accountNumber: \{ contains: rawTerm \}/);
  assert.match(page, /coverageMonth: month/);
  assert.match(page, /coverageYear: year/);
  assert.match(page, /amountPaid: numeric/);
});

test("Edit Bill preselects its actual homeowner and uses tenant-wide searchable lookup", () => {
  assert.match(billForm, /defaultValue=\{bill\.homeownerId\}/);
  assert.match(billForm, /searchEndpoint="\/api\/admin\/billing\/homeowners\/search"/);
  assert.match(billForm, /\[bill\.homeowner, \.\.\.homeowners\]/);
  assert.match(billForm, /Search includes active and inactive tenant homeowner records/);
});

test("billing homeowner lookup uses Billing Adjust authority and searches all tenant statuses", () => {
  assert.match(endpoint, /requirePermission\(Permission\.BILLING_ADJUST\)/);
  assert.match(endpoint, /baseWhere: Prisma\.HomeownerProfileWhereInput = \{ tenantId: user\.tenantId \}/);
  assert.doesNotMatch(endpoint, /status:\s*HomeownerStatus\.ACTIVE/);
  assert.match(endpoint, /homeownerSearchWhere\(q\)/);
  assert.match(endpoint, /total,/);
  assert.match(endpoint, /hasMore:/);
});
