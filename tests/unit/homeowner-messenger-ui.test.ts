import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const messenger = readFileSync("components/homeowner-messenger.tsx", "utf8");
const portalChat = readFileSync("app/portal/chat/page.tsx", "utf8");
const homeownerDirectory = readFileSync("app/api/chat/homeowners/route.ts", "utf8");

test("mobile homeowner chat uses the dedicated compact Messenger-style conversation shell", () => {
  assert.match(portalChat, /HomeownerMessenger/);
  assert.doesNotMatch(portalChat, /ChatMessenger/);
  assert.match(messenger, /Search name, block or lot/);
  assert.match(messenger, /ConversationRow/);
  assert.match(messenger, /MessageBubble/);
  assert.match(messenger, /fixed inset-0 z-\[90\]/);
  assert.match(messenger, /aria-label="Attach file"/);
  assert.match(messenger, /aria-label="Send message"/);
  assert.match(messenger, /Block resident/);
  assert.match(messenger, /Delete for me/);
  assert.doesNotMatch(messenger, />Back<\/button>/);
});

test("mobile directory visibly lists and searches homeowners without exposing addresses", () => {
  assert.match(messenger, /SectionLabel label="People"/);
  assert.match(messenger, /people\.map/);
  assert.match(messenger, /\/api\/chat\/homeowners/);
  assert.match(homeownerDirectory, /tenantId: user\.tenantId/);
  assert.match(homeownerDirectory, /role: Role\.HOMEOWNER/);
  assert.match(homeownerDirectory, /active: true/);
  assert.match(homeownerDirectory, /id: \{ not: user\.id \}/);
  assert.match(homeownerDirectory, /block: \{ contains: term \}/);
  assert.match(homeownerDirectory, /lot: \{ contains: term \}/);
  assert.match(homeownerDirectory, /email: ""/);
  assert.doesNotMatch(homeownerDirectory, /address:/);
  assert.match(homeownerDirectory, /take: 500/);
});

test("obsolete mobile CSS overrides are removed so the premium shell owns its layout", () => {
  assert.equal(existsSync("app/portal/chat/layout.tsx"), false);
  assert.equal(existsSync("app/portal/chat/chat-mobile.css"), false);
});
