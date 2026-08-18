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

const dashboard = readProjectFile("app/portal/dashboard/page.tsx");
const cards = readProjectFile("components/homeowner/dashboard/dashboard-cards.tsx");
const loading = readProjectFile("app/portal/dashboard/loading.tsx");
const error = readProjectFile("app/portal/dashboard/error.tsx");
const shell = readProjectFile("components/portal-mobile-shell.tsx");

record("dashboard page exists", existsSync(path.join(root, "app/portal/dashboard/page.tsx")));
record("dashboard requires homeowner profile authentication", hasAll(dashboard, ["requireHomeownerProfile", "profile.userId", "profile.tenantId"]));
record("balance comes from Statement of Account source of truth", hasAll(dashboard, ["getStatementOfAccount", "soa.summary.currentOutstandingBalance", "soa.summary.collectionStatus"]));
record("no browser balance API was introduced", !existsSync(path.join(root, "app/api/portal/dashboard/route.ts")) && !existsSync(path.join(root, "app/api/portal/balance/route.ts")));
record("Pay Dues uses existing payment route", hasAll(cards, ['href="/portal/pay"', "Pay Dues"]));
record("View Statement uses existing SOA route", hasAll(cards, ['href="/portal/soa"', "View Statement"]));
record("quick actions respect module entitlements", hasAll(dashboard, ["enabledModules.has(TenantModule.BILLING)", "enabledModules.has(TenantModule.DOCUMENTS)", "enabledModules.has(TenantModule.COMPLAINTS)"]));
record("maximum four primary quick actions", hasAll(dashboard, [".slice(0, 4)"]) && hasAll(cards, ["actions.slice(0, 4)"]));
record("Gate Pass reuses Documents flow", dashboard.includes('label: "Gate Pass"') && dashboard.includes('href: "/portal/documents"') && !/portal\/(gate|move)/i.test(dashboard));
record("complaints action hidden when module disabled", dashboard.includes("TenantModule.COMPLAINTS") && dashboard.includes('href: "/portal/complaints/new"'));
record("document requests are homeowner-owned and tenant-scoped", hasAll(dashboard, ["tenantId: profile.tenantId", "homeownerId: profile.id", "documentRequest.findMany", "take: 4"]));
record("complaints are homeowner-owned and tenant-scoped", hasAll(dashboard, ["complaint.findMany", "tenantId: profile.tenantId", "submittedById: profile.userId", "homeownerId: profile.id", "take: 3"]));
record("payment requests are homeowner-owned and tenant-scoped", hasAll(dashboard, ["paymentRequest.findMany", "homeownerId: profile.id", "PaymentRequestStatus.PENDING_REVIEW", "take: 3"]));
record("announcements are published and tenant-scoped", hasAll(dashboard, ["announcement.findFirst", 'status: "PUBLISHED"', "tenantId: profile.tenantId"]));
record("events are published upcoming and tenant-scoped", hasAll(dashboard, ["event.findMany", 'status: "PUBLISHED"', "eventDate: { gte: today }", "tenantId: profile.tenantId", "take: 3"]));
record("no full unpaginated history is loaded", !/take:\s*100|take:\s*50/.test(dashboard) && !dashboard.includes("findMany({ where"));
record("no duplicate balance calculation in dashboard", !dashboard.includes("reduce((total, bill)") && !dashboard.includes("_sum: { balance"));
record("no arbitrary tenant or homeowner ID from browser input", !/searchParams|tenantId=|homeownerId=|accountNumber=|module=|role=/.test(dashboard));
record("mobile touch targets remain at least 48px while using compact Canva shortcut rows", hasAll(cards, ["min-h-12", "min-h-[66px]", "focus-visible:outline"]));
record("dashboard uses mobile-first responsive layouts", hasAll(cards, ["overflow-x-auto", "xl:grid-cols"]) && hasAll(dashboard, ["xl:grid-cols"]));
record("Canva account health and resident shortcut hierarchy is present", hasAll(cards, ["Account Health", "Resident Shortcuts", "Pay Dues"]));
record("loading empty and error states exist", hasAll(loading, ["DashboardSkeletons"]) && hasAll(error, ["Retry"]) && hasAll(cards, ["DashboardEmptyState", "Safe Error"]));
record("desktop sidebar remains in portal shell", hasAll(readProjectFile("app/portal/layout.tsx"), ["Sidebar", "desktopOnly", "PortalBottomNavigation"]));
record("Phase 2 navigation remains intact", hasAll(readProjectFile("lib/homeowner-navigation.ts"), ["homeownerPrimaryDestinations", "/portal/requests", "/portal/community", "/portal/more"]));
record("admin employee payroll platform pages unaffected by dashboard-only verification", !changedFiles().some((file) => /^(app\/employee)/.test(file)));
record("no Prisma schema or migration change", !changedFiles().some((file) => file === "prisma/schema.prisma" || file.startsWith("prisma/migrations/")));
const allowedPhaseChatFiles = new Set(["lib/actions/chat.ts", "lib/services/chat.ts"]);
record("no auth tenant or non-chat business service changes", !changedFiles().some((file) => /^(lib\/auth|lib\/actions|lib\/services\/(billing|payments|statement-of-account|documents|complaints|chat)|lib\/tenant-context)/.test(file) && !allowedPhaseChatFiles.has(file)));
record("private portal cache boundaries remain network-only", hasAll(readProjectFile("public/sw.js"), ["/portal", "/api/", 'request.method !== "GET"']));
record("mobile shell still hides bottom navigation on desktop", shell.includes("lg:hidden"));

const failed = checks.filter((check) => !check.passed);
for (const check of checks) {
  console.log(`${check.passed ? "PASS" : "FAIL"} ${check.label}${check.detail ? ` (${check.detail})` : ""}`);
}

if (failed.length > 0) {
  console.error(`\nHomeowner mobile dashboard verification failed: ${failed.length} check(s).`);
  process.exit(1);
}

console.log(`\nHomeowner mobile dashboard verification passed: ${checks.length} checks.`);