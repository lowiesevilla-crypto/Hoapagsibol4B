import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

async function source(path: string) {
  return readFile(path, "utf8");
}

test("mobile complaint tracking exposes an explicit homepage return action", async () => {
  const page = await source("app/complaints/track/page.tsx");
  assert.match(page, /href="\/"/);
  assert.match(page, /Back to Home/);
  assert.match(page, /sm:hidden/);
  assert.match(page, /aria-label="Back to homepage"/);
});

test("payment record search recognizes combined block and lot phrases", async () => {
  const service = await source("lib/services/admin-payments.ts");
  assert.match(service, /parseBlockLotSearch\(q\)/);
  assert.match(service, /\(\?:block\|blk\)/);
  assert.match(service, /\\blot\\s\*/);
  assert.match(service, /block: \{ contains: block \}/);
  assert.match(service, /lot: \{ contains: lot \}/);
  assert.match(service, /homeowner: blockLot/);
});

test("staff-created walk-in documents bypass unrelated balances and unpaid document fees only for staff viewers", async () => {
  const [policy, access, runtime] = await Promise.all([
    source("lib/services/document-balance-policy.ts"),
    source("lib/document-access.ts"),
    source("lib/services/document-runtime-context.ts"),
  ]);
  assert.match(policy, /request\.origin === "ADMIN"/);
  assert.match(policy, /viewerRole !== Role\.HOMEOWNER/);
  assert.match(policy, /balanceLocked = !staffWalkIn/);
  assert.match(policy, /paymentLocked = !staffWalkIn && request\.paymentRequiredSnapshot/);
  assert.match(policy, /request\.paymentRequest\?\.status !== PaymentRequestStatus\.APPROVED/);
  assert.match(access, /viewerRole: user\.role/);
  assert.match(runtime, /role === Role\.STAFF/);
  assert.match(runtime, /"APPROVE_REQUESTS"/);
  assert.match(runtime, /"ISSUE_DOCUMENT"/);
  assert.match(runtime, /"RELEASE_DOCUMENT"/);
  assert.match(runtime, /"VIEW_ISSUED_DOCUMENT"/);
});
