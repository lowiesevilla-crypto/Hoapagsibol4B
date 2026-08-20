import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function source(path: string) { return readFileSync(join(process.cwd(), path), "utf8"); }

test("tenant Action Center is permission-aware and delegates to authoritative workflows", () => {
  const page = source("app/admin/actions/page.tsx");
  assert.match(page, /requireUser\(Role\.ADMIN\)/);
  assert.match(page, /Permission\.PAYMENTS_MANAGE/);
  assert.match(page, /Permission\.DOCUMENTS_MANAGE/);
  assert.match(page, /Permission\.PAYROLL_MANAGE/);
  assert.match(page, /Permission\.COMPLAINTS_MANAGE/);
  assert.match(page, /tenantId/);
  assert.match(page, /\/admin\/payments\/requests/);
  assert.match(page, /\/admin\/documents\?section=requests/);
  assert.match(page, /\/admin\/payroll/);
  assert.match(page, /\/admin\/complaints/);
});

test("Resident 360 keeps homeowner data tenant-scoped and links back to managed workflows", () => {
  const page = source("app/admin/homeowners/[id]/overview/page.tsx");
  assert.match(page, /where: \{ id, tenantId: user\.tenantId \}/);
  assert.match(page, /homeownerId: id/);
  assert.match(page, /\/admin\/homeowners\/\$\{homeowner\.id\}/);
  assert.match(page, /\/admin\/homeowners\/\$\{homeowner\.id\}\/soa/);
  assert.doesNotMatch(page, /complaintConfidentialIdentity/);
});

test("workforce command center remains behind payroll access", () => {
  const page = source("app/admin/workforce/page.tsx");
  assert.match(page, /requirePayrollAccess\(\)/);
  assert.match(page, /tenantId = user\.tenantId/);
  assert.match(page, /attendanceAdjustment\.count/);
  assert.match(page, /payrollPeriod/);
});

test("platform AI usage is metadata-only and platform audit uses real audit evidence", () => {
  const usage = source("app/platform/ai-usage/page.tsx");
  const audit = source("app/platform/audit/page.tsx");
  assert.match(usage, /aiUsageLedger/);
  assert.match(usage, /inputTokens/);
  assert.match(usage, /outputTokens/);
  assert.doesNotMatch(usage, /contentRedacted|AiMessage/);
  assert.match(audit, /prisma\.auditLog/);
  assert.doesNotMatch(audit, /placeholder|future platform audit/i);
});

test("homeowner PWA premium shell preserves safe area and primary navigation contracts", () => {
  const routeChrome = source("components/portal-mobile-route-chrome.tsx");
  const navigation = source("lib/homeowner-navigation.ts");
  assert.match(routeChrome, /env\(safe-area-inset-top\)/);
  assert.match(routeChrome, /env\(safe-area-inset-bottom\)/);
  assert.match(routeChrome, /min-h-14/);
  for (const label of ["Home", "Payments", "Requests", "Community", "More"]) assert.match(navigation, new RegExp(`label: "${label}"`));
});

test("tenant and platform navigation expose the approved command centers", () => {
  const links = source("components/sidebar-links.ts");
  assert.match(links, /href: "\/admin\/actions"/);
  assert.match(links, /href: "\/admin\/workforce"/);
  assert.match(links, /href: "\/platform\/ai-usage"/);
  assert.match(links, /label: "Audit & Security"/);
});