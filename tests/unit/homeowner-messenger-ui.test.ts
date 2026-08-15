import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const messenger = readFileSync("components/chat-messenger.tsx", "utf8");
const homeownerDirectory = readFileSync("app/api/chat/homeowners/route.ts", "utf8");

test("mobile homeowner chat uses a compact Messenger-style conversation shell", () => {
  assert.match(messenger, /Search homeowners or chats/);
  assert.match(messenger, /MobileConversationRow/);
  assert.match(messenger, /MobileMessageBubble/);
  assert.match(messenger, /fixed inset-0 z-\[90\]/);
  assert.match(messenger, /bg-\[#0A7CFF\]/);
  assert.match(messenger, /aria-label="Add attachment"/);
  assert.match(messenger, /aria-label="Emoji"/);
  assert.match(messenger, /aria-label="Send message"/);
  assert.doesNotMatch(messenger, />Back<\/button>/);
});

test("mobile directory visibly lists and searches homeowners", () => {
  assert.match(messenger, /<h2 className="text-base font-black text-slate-950">Homeowners<\/h2>/);
  assert.match(messenger, /homeownerRecipients\.map/);
  assert.match(messenger, /\/api\/chat\/homeowners/);
  assert.match(messenger, /Verified residents in this HOA/);
  assert.match(homeownerDirectory, /tenantId: user\.tenantId/);
  assert.match(homeownerDirectory, /role: Role\.HOMEOWNER/);
  assert.match(homeownerDirectory, /active: true/);
  assert.match(homeownerDirectory, /id: \{ not: user\.id \}/);
  assert.match(homeownerDirectory, /block: \{ contains: term \}/);
  assert.match(homeownerDirectory, /lot: \{ contains: term \}/);
  assert.match(homeownerDirectory, /email: ""/);
  assert.match(homeownerDirectory, /take: 500/);
});

test("obsolete mobile CSS overrides are removed so the new shell owns its layout", () => {
  assert.equal(existsSync("app/portal/chat/layout.tsx"), false);
  assert.equal(existsSync("app/portal/chat/chat-mobile.css"), false);
});
