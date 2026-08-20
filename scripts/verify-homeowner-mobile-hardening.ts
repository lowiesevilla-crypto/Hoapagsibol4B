import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import manifest from "../app/manifest";

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

const manifestData = manifest();
const serviceWorker = readProjectFile("public/sw.js");
const provider = readProjectFile("components/pwa-install-provider.tsx");
const cacheRecovery = readProjectFile("components/browser-cache-recovery.tsx");
const appLauncher = readProjectFile("app/app/page.tsx");
const globals = readProjectFile("app/globals.css");
const requestRouteError = readProjectFile("components/homeowner/requests/request-route-error.tsx");
const contentImage = readProjectFile("components/content-image.tsx");
const chatMessenger = readProjectFile("components/chat-messenger.tsx");
const paymentCards = readProjectFile("components/homeowner/payments/payment-cards.tsx");
const payByQrForm = readProjectFile("components/pay-by-qr-form.tsx");
const packageJson = readProjectFile("package.json");
const portalLayout = readProjectFile("app/portal/layout.tsx");
const dashboardPage = readProjectFile("app/portal/dashboard/page.tsx");
const payPage = readProjectFile("app/portal/pay/page.tsx");
const billingPage = readProjectFile("app/portal/billing/page.tsx");
const soaPage = readProjectFile("app/portal/soa/page.tsx");
const paymentsPage = readProjectFile("app/portal/payments/page.tsx");
const collectionsPage = readProjectFile("app/portal/collections/page.tsx");
const requestsPage = readProjectFile("app/portal/requests/page.tsx");
const documentsPage = readProjectFile("app/portal/documents/page.tsx");
const complaintsPage = readProjectFile("app/portal/complaints/page.tsx");
const complaintsService = readProjectFile("lib/services/complaints.ts");
const announcementsPage = readProjectFile("app/portal/announcements/page.tsx");
const eventsPage = readProjectFile("app/portal/events/page.tsx");
const profilePage = readProjectFile("app/portal/profile/page.tsx");
const vehiclesPage = readProjectFile("app/portal/vehicles/page.tsx");
const authButtons = readProjectFile("components/auth-navigation-buttons.tsx");
const logoutTransitionRoute = readProjectFile("app/api/auth/logout-transition/route.ts");
const logoutRoute = readProjectFile("app/api/auth/logout/route.ts");
const files = changedFiles();

record("manifest uses approved name and short name", manifestData.name === "HOAHub" && manifestData.short_name === "HOAHub");
record("manifest keeps role-aware start URL", manifestData.start_url === "/app?source=pwa" && manifestData.scope === "/");
record("manifest uses installable standalone display", manifestData.display === "standalone" && manifestData.id === "/");
record("manifest includes maskable icon", (manifestData.icons || []).some((icon) => icon.src === "/icons/hoahub-maskable-512.png" && icon.purpose === "maskable"));

record("development does not register the service worker", hasAll(provider, ['process.env.NODE_ENV !== "production"', "removeDevelopmentHoaHubServiceWorker", "navigator.serviceWorker.register(PWA_SERVICE_WORKER_PATH"]) && provider.indexOf('process.env.NODE_ENV !== "production"') < provider.indexOf("navigator.serviceWorker.register(PWA_SERVICE_WORKER_PATH"));
record("development cleanup is HOAHub scoped", hasAll(provider + cacheRecovery, ["isLocalDevelopmentOrigin", "isHoaHubServiceWorkerUrl", "DEVELOPMENT_HOAHUB_CACHE_PREFIX", "startsWith(DEVELOPMENT_HOAHUB_CACHE_PREFIX)"]));
record("production registers the service worker", hasAll(provider, ['const PWA_SERVICE_WORKER_PATH = "/sw.js"', "navigator.serviceWorker.register(PWA_SERVICE_WORKER_PATH", 'scope: "/"']));
record("only one service-worker registration path exists", (provider.match(/serviceWorker\.register/g) || []).length === 1);
record("role-aware app launcher is dynamic and server-side", hasAll(appLauncher, ["dynamic = \"force-dynamic\"", "readSession", "defaultHomeForRole", "redirect(\"/login\")"]));
record("/app is protected from HTTP caching", readProjectFile("next.config.ts").includes('{ source: "/app", headers: noStoreHeaders }'));

record("private routes remain network-only", hasAll(serviceWorker, ["/api/", "/admin", "/portal", "/employee", "/platform", "/app", "/documents/", "/receipts/", "/uploads/", "/login", "/logout"]));
record("payment and profile private assets are network-only", hasAll(serviceWorker, ["NETWORK_ONLY_PATH_PATTERNS", "payment-proof", "receipt", "generated-document", "complaint", "chat", "profile", "vehicle"]));
record("mutations are never queued", serviceWorker.includes('request.method !== "GET"') && !/syncManager|background sync|queueMutation|mutation queue|outbox/i.test(serviceWorker + provider + chatMessenger));
record("Server Actions are never cached", hasAll(serviceWorker, ["isServerActionRequest", "Next-Action"]) && serviceWorker.indexOf("isServerActionRequest(request)") < serviceWorker.indexOf("event.respondWith"));
record("RSC and router prefetch requests are never cached", hasAll(serviceWorker, ["isReactServerComponentRequest", "isRouterPrefetchRequest", "_rsc", "text/x-component", "Next-Router-State-Tree"]));
record("credential and private responses are not cached", hasAll(serviceWorker, ["isCacheableStaticResponse", "set-cookie", "no-store", "private"]) && /application\\\/json|application\/json/.test(serviceWorker) && /text\\\/x-component|text\/x-component/.test(serviceWorker));
record("navigation offline fallback is generic only", hasAll(serviceWorker, ["networkFirstNavigation", "cache.match(OFFLINE_URL)", 'const OFFLINE_URL = "/offline"']));
record("PWA update flow avoids reload loop", hasAll(provider, ["UPDATE_RELOAD_KEY", "updatingRef", "controllerchange", "{ once: true }", "updateReloadAlreadyStarted"]));
record(
  "logout uses a same-origin full-document transition outside the protected React tree",
  hasAll(authButtons, [
    'const LOGOUT_TRANSITION_ENDPOINT = "/api/auth/logout-transition"',
    "href={href}",
    'rel="nofollow"',
    'data-hoahub-logout-button="true"',
    'data-hoahub-logout-scope={scope}',
  ])
    && !authButtons.includes("document.createElement(\"form\")")
    && !authButtons.includes("HTMLFormElement.prototype.submit.call")
    && !authButtons.includes("useActionState")
    && !authButtons.includes("fetch(")
    && !authButtons.includes("location.replace")
    && hasAll(logoutTransitionRoute, [
      'request.headers.get("sec-fetch-site") === "same-origin"',
      'request.headers.get("sec-fetch-mode") === "navigate"',
      'request.headers.get("sec-fetch-dest") === "document"',
      "allowedOrigins()",
      'action="/api/auth/logout"',
      'method="post"',
      'name="scope"',
      'const nonce = randomBytes(16).toString("hex")',
      'script nonce="${nonce}"',
      'form[data-hoahub-logout-transition="true"]',
      "HTMLFormElement.prototype.submit.call(form)",
      "privateNoStoreHeaders",
      "script-src 'nonce-${nonce}'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ])
    && !logoutTransitionRoute.includes('/logout-transition.js')
    && hasAll(logoutRoute, ["assertSameOrigin(request)", "privateNoStoreHeaders", "NextResponse.redirect(destination, 303)"]),
);

record("focus indicators exist globally", globals.includes(":focus-visible") && globals.includes("outline-offset"));
record("reduced-motion support exists", hasAll(globals, ["prefers-reduced-motion: reduce", "animation-duration", "transition-duration", "scroll-behavior: auto"]));
record("install dialog has accessible name description and focus trap", hasAll(provider, ['role="dialog"', 'aria-modal="true"', 'aria-labelledby="install-hoahub-title"', 'aria-describedby="install-hoahub-description"', "querySelectorAll<HTMLElement>", "event.key !== \"Tab\"", "event.key === \"Escape\""]));
record("dialogs have accessible names", hasAll(provider + contentImage, ['role="dialog"', "aria-label", "aria-labelledby"]));
record("error states have accessible Retry controls", hasAll(requestRouteError, ["Complaints temporarily unavailable", "No complaint was submitted", "aria-label={`Retry loading ${active}`", "reset"]));
record("offline status is accessible", hasAll(provider + chatMessenger, ['role="status"', "aria-live=\"polite\"", "Messages and attachments are not queued"]));
record("payment online state avoids server navigator hydration mismatch", payByQrForm.includes('useState(typeof window === "undefined" ? true : navigator.onLine)'));
record("payment summary cards can be real links", hasAll(paymentCards, ["href?: string", "<Link href={href}", "focus-visible:outline"]));
record("payment receipt summary cards have useful destinations", hasAll(paymentsPage, ['href="#receipts"', "Latest Payment", "Recent Credit", 'href="/portal/soa"', 'id="receipts"']));
record("homeowner SOA print uses document layout classes", hasAll(soaPage + globals, ["homeowner-soa-print", "homeowner-soa-print-table", "homeowner-soa-screen-cards", 'nav[aria-label="Homeowner primary navigation"]']));
record("mobile inputs avoid browser zoom", globals.includes(".field") && globals.includes("text-base") && readProjectFile("components/payment-proof-upload.tsx").includes("sr-only"));
record("minimum touch targets are preserved", hasAll(portalLayout + requestRouteError + provider + chatMessenger, ["min-h-12", "size-11"]));
record("image previews support keyboard close and lazy loading", hasAll(contentImage, ["closeButtonRef", "event.key === \"Escape\"", 'loading="lazy"', 'decoding="async"', "focus-visible:outline"]));

record("dashboard lists remain limited", hasAll(dashboardPage, ["take: 4", "take: 3", "select:"]));
record("payment routes remain paginated or limited", hasAll(payPage + billingPage + paymentsPage + collectionsPage, ["take: UNPAID_LIMIT", "PAGE_SIZE", "skip: (page - 1) * PAGE_SIZE"]));
record("request routes remain paginated or limited", hasAll(requestsPage + documentsPage + complaintsPage + complaintsService, ["REQUEST_LIMIT", "skip: (page - 1) * 10", "take: 100"]));
record("community lists remain limited", hasAll(announcementsPage + eventsPage, ["ANNOUNCEMENT_LIMIT", "EVENT_LIMIT", "take: ANNOUNCEMENT_LIMIT", "take: EVENT_LIMIT"]));
record("chat history remains progressively loaded", hasAll(chatMessenger, ["visibleMessages", "setVisibleMessages", "Scroll up to load older messages"]));
record("content images use responsive/fallback handling", hasAll(contentImage, ["fallbackText", "setFailed", "max-h-[92dvh]", "max-w-[96vw]"]));
record("configured QR image has a safe fallback", hasAll(payPage, ["availableGcashQrImageUrl", "locateTenantUpload", "locateUpload", "GCash QR is currently unavailable. Please contact Admin."]));
record("homeowner data remains server-loaded", [dashboardPage, payPage, billingPage, soaPage, paymentsPage, collectionsPage, requestsPage, complaintsPage, profilePage, vehiclesPage].every((source) => source.includes("requireHomeownerProfile") || source.includes("requireUser(Role.HOMEOWNER)") || source.includes("requireComplaintHomeowner")));

for (const script of [
  "verify:homeowner-pwa",
  "verify:homeowner-mobile-shell",
  "verify:homeowner-mobile-dashboard",
  "verify:homeowner-mobile-payments",
  "verify:homeowner-mobile-requests",
  "verify:homeowner-mobile-community",
  "verify:homeowner-mobile-hardening",
]) {
  record(`${script} is registered`, packageJson.includes(`"${script}"`));
}

record("non-homeowner portals are unaffected by Phase 7 diff", !files.some((file) => /^(app\/admin|app\/employee|app\/payroll|app\/platform)/.test(file)));
record("no new Prisma schema or migration", !files.some((file) => file === "prisma/schema.prisma" || file.startsWith("prisma/migrations/")));
record("no document-template changes", !files.some((file) => /document-template|template-replication|install-approved-pass|pass-template|document-renderer|document-generation|document-placeholders/i.test(file)));
record("no authentication tenant isolation service changes", !files.some((file) => /^(lib\/auth|lib\/tenant|lib\/tenant-context|middleware)/.test(file)));
record("expected Phase 7 file surface only", files.every((file) => [
  "app/globals.css",
  "app/portal/pay/page.tsx",
  "app/portal/payments/page.tsx",
  "app/portal/soa/page.tsx",
  "components/content-image.tsx",
  "components/homeowner/payments/payment-cards.tsx",
  "components/homeowner/requests/request-route-error.tsx",
  "components/pay-by-qr-form.tsx",
  "components/pwa-install-provider.tsx",
  "package.json",
  "public/sw.js",
  "scripts/verify-homeowner-mobile-hardening.ts",
].includes(file)), files.join(", "));

for (const relativePath of [
  "app/portal/dashboard/loading.tsx",
  "app/portal/pay/loading.tsx",
  "app/portal/billing/loading.tsx",
  "app/portal/soa/loading.tsx",
  "app/portal/payments/loading.tsx",
  "app/portal/collections/loading.tsx",
  "app/portal/requests/loading.tsx",
  "app/portal/documents/loading.tsx",
  "app/portal/complaints/loading.tsx",
  "app/portal/community/loading.tsx",
  "app/portal/chat/loading.tsx",
  "app/portal/profile/loading.tsx",
  "app/portal/vehicles/loading.tsx",
]) {
  record(`${relativePath} exists`, existsSync(path.join(root, relativePath)));
}

const failed = checks.filter((check) => !check.passed);
for (const check of checks) {
  console.log(`${check.passed ? "PASS" : "FAIL"} ${check.label}${check.detail ? ` (${check.detail})` : ""}`);
}

if (failed.length > 0) {
  console.error(`\nHomeowner mobile hardening verification failed: ${failed.length} check(s).`);
  process.exit(1);
}

console.log(`\nHomeowner mobile hardening verification passed: ${checks.length} checks.`);
