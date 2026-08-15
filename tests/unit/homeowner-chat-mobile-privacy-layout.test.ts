import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const directoryRoute = readFileSync("app/api/chat/homeowners/route.ts", "utf8");
const sanitizer = readFileSync("lib/services/homeowner-chat-view.ts", "utf8");
const portalPage = readFileSync("app/portal/chat/page.tsx", "utf8");
const chatRoute = readFileSync("app/api/chat/route.ts", "utf8");
const conversationRoute = readFileSync("app/api/chat/conversations/route.ts", "utf8");
const messageRoute = readFileSync("app/api/chat/messages/route.ts", "utf8");
const privacyPanel = readFileSync("components/homeowner-chat-privacy-panel.tsx", "utf8");

test("homeowner directory supports name/block/lot without exposing address metadata", () => {
  assert.match(directoryRoute, /name: \{ contains: term \}/);
  assert.match(directoryRoute, /block: \{ contains: term \}/);
  assert.match(directoryRoute, /lot: \{ contains: term \}/);
  assert.doesNotMatch(directoryRoute, /address/);
  assert.match(directoryRoute, /homeownerProfile: null/);
  assert.match(directoryRoute, /block \$\{profile\.block\} lot \$\{profile\.lot\}/);
});

test("every homeowner chat payload path strips structured homeowner property metadata", () => {
  assert.match(sanitizer, /sanitized\.homeownerProfile = null/);
  assert.match(sanitizer, /sanitized\.email = ""/);
  assert.doesNotMatch(sanitizer, /address/);
  assert.match(portalPage, /sanitizeHomeownerChatPayload\(rawData\)/);
  assert.match(chatRoute, /sanitizeHomeownerChatPayload\(payload\)/);
  assert.match(conversationRoute, /sanitizeHomeownerChatPayload\(payload\)/);
  assert.match(messageRoute, /sanitizeHomeownerChatPayload\(payload\)/);
});

test("message privacy controls cannot grow wider than the homeowner phone viewport", () => {
  assert.match(privacyPanel, /w-full min-w-0 max-w-full gap-3 overflow-x-hidden/);
  assert.match(privacyPanel, /grid-cols-\[minmax\(0,1fr\)_auto\]/);
  assert.match(privacyPanel, /overflow-y-auto overflow-x-hidden/);
  assert.match(privacyPanel, /break-words/);
});
