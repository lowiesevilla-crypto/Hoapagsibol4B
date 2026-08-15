import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const chat = readFileSync("lib/services/chat.ts", "utf8");
const privacy = readFileSync("lib/services/chat-privacy.ts", "utf8");
const privacyPanel = readFileSync("components/homeowner-chat-privacy-panel.tsx", "utf8");
const portalChat = readFileSync("app/portal/chat/page.tsx", "utf8");
const rootLayout = readFileSync("app/layout.tsx", "utf8");
const portalLayout = readFileSync("app/portal/layout.tsx", "utf8");
const publicInstall = readFileSync("components/public-pwa-install-banner.tsx", "utf8");
const pwaProvider = readFileSync("components/pwa-install-provider.tsx", "utf8");
const migration = readFileSync("prisma/migrations/20260815213000_chat_privacy_requests_blocks/migration.sql", "utf8");

test("resident messaging policy is tenant scoped and persists privacy requests and blocks", () => {
  for (const table of ["ChatPrivacyPreference", "ChatUserBlock", "ChatMessageRequest"]) assert.match(migration, new RegExp(`CREATE TABLE \\`${table}\\``));
  assert.match(migration, /tenantId/);
  assert.match(privacy, /WHERE tenantId = \$\{tenantId\}/);
  assert.match(privacy, /recipientUserId = \$\{input\.userId\}/);
  assert.match(privacy, /blockerUserId = \$\{blockerUserId\}/);
});

test("homeowners may discover residents without exposing resident email in the serialized chat payload", () => {
  assert.match(chat, /\[Role\.ADMIN, Role\.SYSTEM_ADMIN, Role\.EMPLOYEE, Role\.HOMEOWNER\]/);
  assert.match(chat, /email: ""/);
  assert.doesNotMatch(chat, /searchText: \[user\.name, user\.email/);
});

test("resident-to-resident messages enforce blocks and message request acceptance on every send", () => {
  assert.match(chat, /sender\.user\.role === Role\.HOMEOWNER && other\.user\.role === Role\.HOMEOWNER/);
  assert.match(chat, /areResidentsBlocked\(tenantId, senderId, other\.userId\)/);
  assert.match(chat, /requestState\?\.status === "DECLINED"/);
  assert.match(chat, /requestState\?\.status === "PENDING" && requestState\.recipientUserId === senderId/);
});

test("HOA Official authority is server derived and resident block controls target homeowners only", () => {
  assert.match(privacy, /Role\.ADMIN \|\| role === Role\.SYSTEM_ADMIN \|\| role === Role\.EMPLOYEE/);
  assert.match(chat, /official = isHoaOfficialRole\(user\.role\)/);
  const blocksRoute = readFileSync("app/api/chat/blocks/route.ts", "utf8");
  assert.match(blocksRoute, /role: Role\.HOMEOWNER/);
  assert.match(privacyPanel, /HOA Official/);
  assert.match(privacyPanel, /never suppress official HOA communication/);
});

test("message requests have explicit Accept and Decline controls and are hidden from normal chat until accepted", () => {
  assert.match(portalChat, /HomeownerChatPrivacyPanel/);
  assert.match(privacyPanel, /Message Requests/);
  assert.match(privacyPanel, /"ACCEPT"/);
  assert.match(privacyPanel, /"DECLINE"/);
  assert.match(chat, /getHiddenIncomingConversationIds/);
  assert.match(chat, /conversations\.filter\(\(conversation\) => !hiddenIncoming\.has\(conversation\.id\)\)/);
});

test("PWA install detection is global while the public install prompt remains mobile-only", () => {
  assert.match(rootLayout, /<PwaInstallProvider>/);
  assert.match(rootLayout, /<PublicPwaInstallBanner \/>/);
  assert.doesNotMatch(portalLayout, /PwaInstallProvider/);
  assert.match(publicInstall, /pathname !== "\/"/);
  assert.match(publicInstall, /lg:hidden/);
  assert.match(pwaProvider, /beforeinstallprompt/);
  assert.match(pwaProvider, /\.prompt\(\)/);
  assert.match(pwaProvider, /appinstalled/);
  assert.match(pwaProvider, /matchMedia\("\(display-mode: standalone\)"\)/);
  assert.match(pwaProvider, /navigator\.standalone/);
  assert.match(pwaProvider, /Add to Home Screen/);
});
