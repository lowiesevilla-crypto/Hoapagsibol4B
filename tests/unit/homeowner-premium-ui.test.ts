import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const portalShell = readFileSync("components/portal-mobile-shell.tsx", "utf8");
const messengerPage = readFileSync("app/portal/chat/page.tsx", "utf8");
const messenger = readFileSync("components/homeowner-messenger.tsx", "utf8");
const directoryRoute = readFileSync("app/api/chat/homeowners/route.ts", "utf8");
const avatarRoute = readFileSync("app/api/profile/photo/[userId]/route.ts", "utf8");
const chatView = readFileSync("lib/services/homeowner-chat-view.ts", "utf8");
const requestPage = readFileSync("app/portal/requests/page.tsx", "utf8");
const communityPage = readFileSync("app/portal/community/page.tsx", "utf8");
const paymentCards = readFileSync("components/homeowner/payments/payment-cards.tsx", "utf8");

test("homeowner shell uses the uploaded photo with a resilient placeholder", () => {
  assert.match(portalShell, /HomeownerAvatar/);
  assert.match(portalShell, /src="\/api\/profile\/photo"/);
  assert.match(portalShell, /rounded-full/);
  assert.match(portalShell, /min-h-\[52px\]/);
});

test("homeowner chat uses the dedicated messenger-style experience", () => {
  assert.match(messengerPage, /HomeownerMessenger/);
  assert.doesNotMatch(messengerPage, /ChatMessenger/);
  assert.match(messenger, /Search name, block or lot/);
  assert.match(messenger, /fixed inset-0 z-\[90\]/);
  assert.match(messenger, /rounded-\[1\.4rem\]/);
  assert.match(messenger, /Block resident/);
  assert.match(messenger, /Delete for me/);
  assert.match(messenger, /HomeownerAvatar/);
});

test("resident avatars are authenticated and tenant scoped without restoring address exposure", () => {
  assert.match(avatarRoute, /requireUser\(\)/);
  assert.match(avatarRoute, /tenantId: viewer\.tenantId/);
  assert.match(avatarRoute, /role: Role\.HOMEOWNER/);
  assert.match(avatarRoute, /tenantUploadDirectory\(viewer\.tenant\.slug/);
  assert.match(directoryRoute, /avatarUrl: `\/api\/profile\/photo\/\$\{encodeURIComponent\(resident\.id\)\}`/);
  assert.doesNotMatch(directoryRoute, /address:/);
  assert.doesNotMatch(directoryRoute, /email: true/);
  assert.match(chatView, /sanitized\.homeownerProfile = null/);
  assert.match(chatView, /sanitized\.email = ""/);
  assert.match(chatView, /sanitized\.avatarUrl/);
});

test("homeowner request and community hubs remove redundant instructional panels", () => {
  assert.match(requestPage, /title="Start a request"/);
  assert.doesNotMatch(requestPage, /Choose a service/);
  assert.doesNotMatch(requestPage, /Use the existing document request flow/);
  assert.match(communityPage, /title="Stay connected"/);
  assert.doesNotMatch(communityPage, /Tenant-scoped announcements/);
  assert.doesNotMatch(communityPage, /Published HOA roster/);
});

test("payment cards prioritize compact icon-led state and actions", () => {
  assert.match(paymentCards, /rounded-\[1\.6rem\]/);
  assert.match(paymentCards, /label="Statement"/);
  assert.match(paymentCards, /label="History"/);
  assert.match(paymentCards, /label="Receipts"/);
  assert.doesNotMatch(paymentCards, /Recent successful payment:<\/span>/);
});
