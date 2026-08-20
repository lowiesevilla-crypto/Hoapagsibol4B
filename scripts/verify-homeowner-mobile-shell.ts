import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { TenantModule } from "@prisma/client";
import {
  homeownerModuleRules,
  homeownerPrimaryDestinations,
  homeownerRouteTitle,
  homeownerSidebarLinks,
  isHomeownerPrimaryActive,
  resolveHomeownerNavigation,
} from "../lib/homeowner-navigation";

type Check = { label: string; passed: boolean; detail?: string };

const root = process.cwd();
const checks: Check[] = [];

function record(label: string, passed: boolean, detail?: string) {
  checks.push({ label, passed, detail });
}

function readProjectFile(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function listProjectFiles(relativeDirectory: string): string[] {
  const absoluteDirectory = path.join(root, relativeDirectory);
  const files: string[] = [];

  for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true })) {
    const relativeEntry = path.posix.join(relativeDirectory.replaceAll("\\", "/"), entry.name);
    if (entry.isDirectory()) files.push(...listProjectFiles(relativeEntry));
    else if (entry.isFile()) files.push(relativeEntry);
  }

  return files;
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

const enabledAll = new Set<TenantModule>([
  TenantModule.BILLING,
  TenantModule.DOCUMENTS,
  TenantModule.COMPLAINTS,
  TenantModule.ANNOUNCEMENTS,
  TenantModule.EVENTS,
  TenantModule.CHAT,
  TenantModule.VEHICLES,
]);
const enabledNone = new Set<TenantModule>();
const enabledBillingOnly = new Set<TenantModule>([TenantModule.BILLING]);
const navigationAll = resolveHomeownerNavigation(enabledAll);
const navigationNone = resolveHomeownerNavigation(enabledNone);
const navigationBillingOnly = resolveHomeownerNavigation(enabledBillingOnly);

record("five primary homeowner destinations exist", homeownerPrimaryDestinations.map((item) => item.id).join(",") === "home,payments,requests,community,more");
record("bottom destinations use approved labels", homeownerPrimaryDestinations.map((item) => item.label).join(",") === "Home,Payments,Requests,Community,More");
record("home destination uses dashboard", homeownerPrimaryDestinations.find((item) => item.id === "home")?.href === "/portal/dashboard");
record("payments destination uses pay and billing prefixes", hasAll(JSON.stringify(homeownerPrimaryDestinations.find((item) => item.id === "payments")), ["/portal/pay", "/portal/billing", "/portal/soa", "/portal/payments", "/portal/collections"]));
record("payments destination requires billing entitlement", homeownerPrimaryDestinations.find((item) => item.id === "payments")?.module === TenantModule.BILLING);
record("requests destination is gated by existing service modules", hasAll(JSON.stringify(homeownerPrimaryDestinations.find((item) => item.id === "requests")), [TenantModule.DOCUMENTS, TenantModule.COMPLAINTS]));
record("community destination preserves organization access", homeownerPrimaryDestinations.find((item) => item.id === "community")?.prefixes.includes("/portal/organization") === true);
record("more destination includes profile and vehicles activity", hasAll(JSON.stringify(homeownerPrimaryDestinations.find((item) => item.id === "more")), ["/portal/profile", "/portal/vehicles"]));
record("all modules show all five bottom destinations", navigationAll.primaryDestinations.length === 5);
record("billing-only tenant hides requests but keeps home payments community more", navigationBillingOnly.primaryDestinations.map((item) => item.id).join(",") === "home,payments,community,more");
record("tenant with no optional modules hides payments and requests", navigationNone.primaryDestinations.map((item) => item.id).join(",") === "home,community,more");
record("payment child route activates payments", isHomeownerPrimaryActive(homeownerPrimaryDestinations[1], "/portal/soa"));
record("document child route activates requests", isHomeownerPrimaryActive(homeownerPrimaryDestinations[2], "/portal/documents"));
record("complaint child route activates requests", isHomeownerPrimaryActive(homeownerPrimaryDestinations[2], "/portal/complaints/new"));
record("chat child route activates community", isHomeownerPrimaryActive(homeownerPrimaryDestinations[3], "/portal/chat"));
record("profile child route activates more", isHomeownerPrimaryActive(homeownerPrimaryDestinations[4], "/portal/profile"));
record("new route titles are mapped", homeownerRouteTitle("/portal/requests") === "Requests" && homeownerRouteTitle("/portal/community") === "Community" && homeownerRouteTitle("/portal/more") === "More");
record("homeowner module rules cover entitled portal children", hasAll(JSON.stringify(homeownerModuleRules), ["/portal/documents", "/portal/complaints", "/portal/announcements", "/portal/events", "/portal/chat", "/portal/vehicles"]));
record("homeowner sidebar links contain no unsupported document query params", !homeownerSidebarLinks.some((link) => link.href.includes("?intent=") || link.href.includes("?section=")));

for (const relativePath of ["app/portal/requests/page.tsx", "app/portal/community/page.tsx", "app/portal/more/page.tsx", "lib/homeowner-navigation.ts", "lib/philippine-greeting.ts", "components/portal-mobile-route-chrome.tsx"]) {
  record(`${relativePath} exists`, existsSync(path.join(root, relativePath)));
}

const portalLayout = readProjectFile("app/portal/layout.tsx");
record("portal layout uses centralized navigation", hasAll(portalLayout, ["resolveHomeownerNavigation", "homeownerRouteTitle", "navigation.primaryDestinations"]));
record("portal layout still requires homeowner role", hasAll(portalLayout, ["requireUser(Role.HOMEOWNER)", "getEnabledTenantModules"]));
record("portal layout leaves live mobile route state to client chrome", hasAll(portalLayout, ["const mobileRouteTitles = links.map", "routeTitles={mobileRouteTitles}", "<PortalBottomNavigation destinations={navigation.primaryDestinations} />"]) && !portalLayout.includes("pathname={pathname}"));
record("portal content reserves mobile space for nav and floating AI", portalLayout.includes("pb-[calc(10.25rem+env(safe-area-inset-bottom))]"));

const mobileShell = readProjectFile("components/portal-mobile-shell.tsx");
const routeChrome = readProjectFile("components/portal-mobile-route-chrome.tsx");
const greeting = readProjectFile("lib/philippine-greeting.ts");
record("mobile header uses chat icon not notification bell", hasAll(routeChrome, ["MessageSquare", "Open chat"]) && !routeChrome.includes("Bell"));
record("mobile chrome follows client-side route changes", hasAll(routeChrome, ['"use client"', "usePathname", "currentPortalTitle(pathname, routeTitles)", "isPrimaryActive(entry, pathname)", "data-portal-mobile-route", "data-portal-primary-id"]));
record("mobile route chrome stays client-safe", !routeChrome.includes("@prisma/client") && !routeChrome.includes("@/lib/homeowner-navigation"));
record("dashboard-only mobile greeting and PWA banner follow live route", hasAll(routeChrome, ['pathname === "/portal/dashboard"', "Community Hub · Installed PWA ready", "Resident Services"]));
record("Philippines greeting uses explicit Asia Manila time boundaries", hasAll(greeting, ['PHILIPPINE_TIME_ZONE = "Asia/Manila"', 'return "Good morning"', 'return "Good afternoon"', 'return "Good evening"']) && routeChrome.includes("philippineGreeting"));
record("bottom nav uses dynamic visible destination count", hasAll(routeChrome, ["gridTemplateColumns", "destinations.length"]));
record("bottom nav keeps 48px touch target and safe area", hasAll(routeChrome, ["min-h-14", "env(safe-area-inset-bottom)", "focus-visible:outline"]));
record("desktop sidebar and mobile bottom nav are not shown together", hasAll(portalLayout, ["desktopOnly", "PortalBottomNavigation"]) && routeChrome.includes("lg:hidden"));
record("community compact metrics avoid narrow-card truncation", hasAll(mobileShell, ["compact = false", "flex-col items-start", "sm:flex-row"]) && readProjectFile("app/portal/community/page.tsx").includes("<PortalSummaryCard compact"));
record("request summary metrics use mobile vertical layout", hasAll(readProjectFile("components/homeowner/requests/request-cards.tsx"), ["flex-col items-start", "sm:flex-row", "text-[9px]"]));

const pwaProvider = readProjectFile("components/pwa-install-provider.tsx");
record("More page can invoke Phase 1 install provider", hasAll(pwaProvider, ["PwaInstallActionCard", "usePwaInstall", "runInstallPrompt", "openInstallSheet"]));

const requestsPage = readProjectFile("app/portal/requests/page.tsx");
record("Requests aggregator is server-role guarded", hasAll(requestsPage, ["requireUser(Role.HOMEOWNER)", "getEnabledTenantModules"]));
record("Requests aggregator uses existing routes only", hasAll(JSON.stringify(homeownerSidebarLinks), ["/portal/documents", "/portal/complaints", "/portal/complaints/new"]) && !/portal\/(gate|move)/i.test(requestsPage));
record("Requests aggregator does not trust browser tenant data", !/searchParams|tenantId=|homeownerId=|role=|module=/.test(requestsPage));

const communityPage = readProjectFile("app/portal/community/page.tsx");
record("Community aggregator is server-role guarded", hasAll(communityPage, ["requireUser(Role.HOMEOWNER)", "getEnabledTenantModules"]));
record("Community aggregator exposes chat only with chat module", hasAll(communityPage, ["TenantModule.CHAT", "/portal/chat"]));
record("Community aggregator includes no invented amenities route", !/amenit/i.test(communityPage));

const morePage = readProjectFile("app/portal/more/page.tsx");
record("More aggregator keeps profile install and logout actions", hasAll(morePage, ["/portal/profile", "PwaInstallActionCard", "LogoutButton"]));
record("More aggregator filters vehicles and documents by entitlement", hasAll(morePage, ["TenantModule.VEHICLES", "TenantModule.DOCUMENTS"]));
record("More aggregator does not trust browser tenant data", !/searchParams|tenantId=|homeownerId=|role=|module=/.test(morePage));

const routeFiles = listProjectFiles("app/portal").join("\n");
record("no new unsupported gate or move portal routes", !/app\/portal\/(gate|move)/i.test(routeFiles));

const files = changedFiles();
record("no Prisma schema or migration changes", !files.some((file) => file === "prisma/schema.prisma" || file.startsWith("prisma/migrations/")));
record("no admin employee payroll platform screen changes", !files.some((file) => /^(app\/admin|app\/employee|app\/platform)/.test(file)));
const allowedPhaseChatFiles = new Set(["lib/actions/chat.ts", "lib/services/chat.ts"]);
record("no auth tenant or non-chat business workflow service changes", !files.some((file) => /^(lib\/auth|lib\/actions|lib\/services\/(billing|payments|document-generation|complaint|chat)|lib\/tenant-context)/.test(file) && !allowedPhaseChatFiles.has(file)));

const failed = checks.filter((check) => !check.passed);
for (const check of checks) {
  console.log(`${check.passed ? "PASS" : "FAIL"} ${check.label}${check.detail ? ` (${check.detail})` : ""}`);
}

if (failed.length > 0) {
  console.error(`\nHomeowner mobile shell verification failed: ${failed.length} check(s).`);
  process.exit(1);
}

console.log(`\nHomeowner mobile shell verification passed: ${checks.length} checks.`);
