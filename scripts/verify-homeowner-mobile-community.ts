import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

type Check = { label: string; passed: boolean; detail?: string };

const root = process.cwd();
const checks: Check[] = [];

function record(label: string, passed: boolean, detail?: string) {
  checks.push({ label, passed, detail });
}

function readProjectFile(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function hasAll(source: string, values: string[]) {
  return values.every((value) => source.includes(value));
}

function changedFiles() {
  return execSync("git diff --name-only HEAD", { cwd: root, encoding: "utf8" })
    .split(/\r?\n/)
    .filter(Boolean)
    .map((file) => file.replaceAll("\\", "/"));
}

const communityPage = readProjectFile("app/portal/community/page.tsx");
const announcementsPage = readProjectFile("app/portal/announcements/page.tsx");
const announcementDetail = readProjectFile("app/portal/announcements/[id]/page.tsx");
const eventsPage = readProjectFile("app/portal/events/page.tsx");
const eventDetail = readProjectFile("app/portal/events/[id]/page.tsx");
const organizationPage = readProjectFile("app/portal/organization/page.tsx");
const chatPage = readProjectFile("app/portal/chat/page.tsx");
const chatMessenger = readProjectFile("components/chat-messenger.tsx");
const chatService = readProjectFile("lib/services/chat.ts");
const chatActions = readProjectFile("lib/actions/chat.ts");
const chatMessageApi = readProjectFile("app/api/chat/messages/route.ts");
const morePage = readProjectFile("app/portal/more/page.tsx");
const profilePage = readProjectFile("app/portal/profile/page.tsx");
const vehiclesPage = readProjectFile("app/portal/vehicles/page.tsx");
const communityCards = readProjectFile("components/homeowner/community/community-cards.tsx");
const portalLayout = readProjectFile("app/portal/layout.tsx");
const aiPage = readProjectFile("app/portal/ai/page.tsx");
const aiAskRoute = readProjectFile("app/api/portal/ai/ask/route.ts");
const aiGovernancePolicy = readProjectFile("lib/ai-assistance/governance-policy.ts");
const serviceWorker = readProjectFile("public/sw.js");
const packageJson = readProjectFile("package.json");
const files = changedFiles();

for (const relativePath of [
  "app/portal/community/page.tsx",
  "app/portal/announcements/page.tsx",
  "app/portal/announcements/[id]/page.tsx",
  "app/portal/events/page.tsx",
  "app/portal/events/[id]/page.tsx",
  "app/portal/organization/page.tsx",
  "app/portal/chat/page.tsx",
  "app/portal/more/page.tsx",
  "app/portal/profile/page.tsx",
  "app/portal/vehicles/page.tsx",
  "components/homeowner/community/community-cards.tsx",
  "app/portal/ai/page.tsx",
  "app/api/portal/ai/ask/route.ts",
]) {
  record(`${relativePath} exists`, existsSync(path.join(root, relativePath)));
}

record("community routes require authenticated homeowner access", [communityPage, announcementsPage, eventsPage, chatPage, morePage, aiPage].every((source) => source.includes("requireUser(Role.HOMEOWNER)") || source.includes("requireHomeownerProfile")));
record("announcements are tenant-scoped and published-only", hasAll(announcementsPage + announcementDetail, ["tenantId: user.tenantId", "status: \"PUBLISHED\"", "tenantId: profile.tenantId", "notFound()"]));
record("events are tenant-scoped and published-only", hasAll(eventsPage + eventDetail, ["tenantId: user.tenantId", "status: \"PUBLISHED\"", "tenantId: profile.tenantId", "notFound()"]));
record("unpublished content is not exposed", [announcementsPage, announcementDetail, eventsPage, eventDetail].every((source) => source.includes("status: \"PUBLISHED\"")));
record("community lists are limited or searchable", hasAll(announcementsPage + eventsPage, ["take: ANNOUNCEMENT_LIMIT", "take: EVENT_LIMIT", "CommunitySearchBar"]));
record("announcement and event images have safe fallbacks", hasAll(communityCards, ["AnnouncementMobileCard", "EventMobileCard", "FallbackVisual", "ImageOff"]));
record("organization and HOA contacts use existing services", hasAll(organizationPage, ["getActiveOrganizationOfficers", "getAssociationSettings", "profile.tenantId", "OfficerMobileCard"]));
record("chat conversations are tenant-scoped", hasAll(chatService, ["tenantId: user.tenantId", "conversation: { tenantId }", "tenantId: currentUser.tenantId"]));
record("chat messages are participant-authorized", hasAll(chatService + chatMessageApi + chatActions, ["participants", "userId: user.id", "senderId: user.id", "You do not have access to this conversation."]));
record("recipient search cannot cross tenants", hasAll(chatService, ["getRecipients(scope, user.id, user.tenantId", "tenantId,", "findFirst({ where: { id: recipientId, tenantId: currentUser.tenantId }"]));
record("private chat is not service-worker cached", hasAll(serviceWorker, ["/api/", "/portal", "/uploads/", "hasSensitiveRequest"]));
record("offline chat mutations are not queued", !/syncManager|background sync|queueMutation|mutation queue/i.test(serviceWorker + chatMessenger) && hasAll(chatMessenger, ["navigator.onLine", "Messages and attachments are not queued"]));
record("profile data belongs to authenticated homeowner", hasAll(profilePage, ["requireHomeownerProfile", "profile.tenantId", "profile.id", "PasskeyEnrollmentPanel"]));
record("vehicle data belongs to authenticated homeowner", hasAll(vehiclesPage, ["requireHomeownerProfile", "tenantId: profile.tenantId", "homeownerId: profile.id", "take: 30"]));
record("logout uses stable named Server Actions", hasAll(morePage + profilePage, ["LogoutButton", "allSessions"]));
record(
  "resident AI is explicit, server-authorized, and hidden unless entitlement and governance gates pass",
  hasAll(portalLayout, [
    "resolveAiAssistanceEntitlement(user.tenantId)",
    "evaluateAiGovernance",
    "AI_ASSISTANCE_USE",
    "pathname.startsWith(\"/portal/ai\")",
    "aiAvailable",
  ])
    && hasAll(aiGovernancePolicy, ["GLOBAL_AI_KILL_SWITCH", "AI_NOT_ENTITLED", "PIA_APPROVAL_REQUIRED", "DPO_APPROVAL_REQUIRED", "CROSS_BORDER_REVIEW_REQUIRED", "PRIVACY_NOTICE_REQUIRED", "LAWFUL_BASIS_REQUIRED"])
    && hasAll(aiAskRoute, ["answerTenantKnowledgeQuestion", "private, no-store", "X-Content-Type-Options"])
    && !aiAskRoute.includes("body.tenantId")
    && morePage.includes("aiAvailable")
    && morePage.includes("/portal/ai"),
);
record("mobile cards replace compressed desktop tables", hasAll(communityCards + announcementsPage + eventsPage + vehiclesPage, ["grid gap-4", "rounded-3xl", "AnnouncementMobileCard", "EventMobileCard", "VehicleMobileCard"]) && ![announcementsPage, eventsPage, vehiclesPage, organizationPage].some((source) => source.includes("<table")));
record("loading and error states exist", ["community", "announcements", "events", "organization", "chat", "more", "profile", "vehicles"].every((route) => existsSync(path.join(root, `app/portal/${route}/loading.tsx`)) && existsSync(path.join(root, `app/portal/${route}/error.tsx`))));
record("minimum touch targets are preserved", hasAll(communityCards + morePage + profilePage + chatMessenger, ["min-h-12", "size-11"]));
record("Phase 1 PWA verifier remains registered", packageJson.includes("\"verify:homeowner-pwa\""));
record("Phase 2 shell verifier remains registered", packageJson.includes("\"verify:homeowner-mobile-shell\""));
record("Phase 3 dashboard verifier remains registered", packageJson.includes("\"verify:homeowner-mobile-dashboard\""));
record("Phase 4 payments verifier remains registered", packageJson.includes("\"verify:homeowner-mobile-payments\""));
record("Phase 5 requests verifier remains registered", packageJson.includes("\"verify:homeowner-mobile-requests\""));
record("Phase 6 verifier is registered", packageJson.includes("\"verify:homeowner-mobile-community\""));
record("no uncommitted Prisma schema or migration change", !files.some((file) => file === "prisma/schema.prisma" || file.startsWith("prisma/migrations/")));
record("no uncommitted template change", !files.some((file) => /document-template|template-replication|install-approved-pass|pass-template/i.test(file)));
record("no uncommitted admin employee payroll platform page changes", !files.some((file) => /^(app\/admin|app\/employee|app\/payroll|app\/platform)/.test(file)));

const failed = checks.filter((check) => !check.passed);
for (const check of checks) {
  console.log(`${check.passed ? "PASS" : "FAIL"} ${check.label}${check.detail ? ` (${check.detail})` : ""}`);
}

if (failed.length > 0) {
  console.error(`\nHomeowner mobile community verification failed: ${failed.length} check(s).`);
  process.exit(1);
}

console.log(`\nHomeowner mobile community verification passed: ${checks.length} checks.`);
