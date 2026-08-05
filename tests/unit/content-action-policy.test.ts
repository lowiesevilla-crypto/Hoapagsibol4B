import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const sourcePath = new URL("../../lib/actions/content.ts", import.meta.url);

async function contentActionSource() {
  return readFile(sourcePath, "utf8");
}

test("content mutations use named permissions instead of the legacy admin role", async () => {
  const source = await contentActionSource();
  assert.equal(source.includes("requireUser(Role.ADMIN)"), false);
  assert.match(source, /requirePermission\(Permission\.ANNOUNCEMENTS_PUBLISH\)/);
  assert.match(source, /requirePermission\(Permission\.COMMUNITY_MANAGE\)/);
  assert.match(source, /requirePermission\(Permission\.BILLING_MANAGE\)/);
});

test("content records, recipients, reminders, and external publishing remain tenant-scoped", async () => {
  const source = await contentActionSource();
  const tenantPredicates = source.match(/tenantId:\s*(admin\.tenantId|tenantId)/g) ?? [];

  assert.ok(tenantPredicates.length >= 12, `Expected explicit tenant predicates throughout content actions, found ${tenantPredicates.length}.`);
  assert.match(source, /prisma\.user\.findMany\(\{ where: \{ tenantId: admin\.tenantId, role: Role\.HOMEOWNER/);
  assert.match(source, /prisma\.bill\.findMany\(\{\s*where: \{ tenantId: admin\.tenantId/);
  assert.match(source, /prisma\.announcement\.updateMany\(\{ where: \{ id, tenantId \}/);
  assert.match(source, /prisma\.event\.updateMany\(\{ where: \{ id, tenantId \}/);
});
