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

function pngSize(relativePath: string) {
  const buffer = readFileSync(path.join(root, relativePath));
  if (buffer.toString("ascii", 1, 4) !== "PNG") throw new Error(`${relativePath} is not a PNG file.`);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function gitChangedFiles() {
  try {
    return execSync("git diff --name-only HEAD", { cwd: root, encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
}

const manifestData = manifest();
record("manifest uses standalone display", manifestData.display === "standalone");
record("manifest starts through role-aware launcher", manifestData.start_url === "/app?source=pwa");
record("manifest has homeowner scope", manifestData.scope === "/");
record("manifest has theme and background colors", manifestData.theme_color === "#078bc9" && manifestData.background_color === "#f5fbff");
record("manifest has tenant-neutral icons", (manifestData.icons || []).some((icon) => icon.src === "/icons/hoahub-icon-192.png" && icon.sizes === "192x192") && (manifestData.icons || []).some((icon) => icon.src === "/icons/hoahub-icon-512.png" && icon.sizes === "512x512") && (manifestData.icons || []).some((icon) => icon.src === "/icons/hoahub-maskable-512.png" && icon.purpose === "maskable"));

for (const [relativePath, size] of [
  ["public/icons/hoahub-icon-192.png", 192],
  ["public/icons/hoahub-icon-512.png", 512],
  ["public/icons/hoahub-maskable-512.png", 512],
  ["public/apple-touch-icon.png", 180],
] as const) {
  const dimensions = pngSize(relativePath);
  record(`${relativePath} has expected dimensions`, dimensions.width === size && dimensions.height === size, `${dimensions.width}x${dimensions.height}`);
}
record("favicon exists", existsSync(path.join(root, "public/favicon.ico")));

const serviceWorker = readProjectFile("public/sw.js");
record("service worker precaches only generic shell assets", hasAll(serviceWorker, ["OFFLINE_URL", "/offline", "APP_SHELL_ASSETS"]));
record("service worker routes private prefixes to network-only handling", hasAll(serviceWorker, ["/api/", "/admin", "/portal", "/employee", "/platform", "/app", "/documents/", "/receipts/", "/uploads/", "/login", "/activate"]));
record("service worker does not handle mutations from cache", serviceWorker.includes('request.method !== "GET"'));
record("service worker leaves Server Action requests network-only", hasAll(serviceWorker, ["isServerActionRequest", 'request.headers.has("Next-Action")']) && serviceWorker.indexOf("isServerActionRequest(request)") < serviceWorker.indexOf("event.respondWith"));
record("service worker leaves RSC requests network-only", hasAll(serviceWorker, ["isReactServerComponentRequest", 'request.headers.has("RSC")', "text/x-component"]));
record("service worker leaves router prefetch requests network-only", hasAll(serviceWorker, ["isRouterPrefetchRequest", "Next-Router-State-Tree", "Next-Router-Prefetch", "prefetch"]));
record("private portal HTML is network-only before navigation fallback", serviceWorker.indexOf("hasSensitiveRequest(url.pathname)") < serviceWorker.indexOf('request.mode === "navigate"'));
record("service worker provides generic navigation offline fallback", hasAll(serviceWorker, ['request.mode === "navigate"', "networkFirstNavigation", "cache.match(OFFLINE_URL)"]));
record("service worker avoids caching credential-setting responses", serviceWorker.includes('!response.headers.has("set-cookie")'));
record("service worker caches only reviewed static assets", serviceWorker.includes('url.pathname.startsWith("/_next/static/")') && !serviceWorker.includes('url.pathname.startsWith("/_next/") ||'));

const provider = readProjectFile("components/pwa-install-provider.tsx");
record("development mode does not register production service worker", hasAll(provider, ['process.env.NODE_ENV !== "production"', "removeDevelopmentHoaHubServiceWorker", "navigator.serviceWorker.register(PWA_SERVICE_WORKER_PATH"]) && provider.indexOf('process.env.NODE_ENV !== "production"') < provider.indexOf("navigator.serviceWorker.register(PWA_SERVICE_WORKER_PATH"));
record("production build still registers /sw.js", hasAll(provider, ['const PWA_SERVICE_WORKER_PATH = "/sw.js"', "navigator.serviceWorker.register(PWA_SERVICE_WORKER_PATH", 'scope: "/"']));
record("development cleanup targets only local HOAHub /sw.js and caches", hasAll(provider, ["isLocalDevelopmentOrigin", "isHoaHubServiceWorkerUrl", "DEVELOPMENT_HOAHUB_CACHE_PREFIX", "cacheNames.filter((name) => name.startsWith(DEVELOPMENT_HOAHUB_CACHE_PREFIX))"]));
record("single PWA provider registration path", (provider.match(/serviceWorker\.register/g) || []).length === 1);
record("Chromium deferred install prompt is captured safely", hasAll(provider, ["beforeinstallprompt", "event.preventDefault()", "deferredPrompt", ".prompt()", "userChoice"]));
record("installed app state hides install UI", hasAll(provider, ["appinstalled", "setInstalled(true)", "isStandaloneMode"]));
record("standalone detection covers display-mode and typed iOS navigator standalone", hasAll(provider, ['matchMedia("(display-mode: standalone)")', "standalone?: boolean", "}).standalone"]));
record("iOS install instructions exist", hasAll(provider, ["IOSInstallInstructions", "Add to Home Screen", "Safari"]));
record("Android install instructions exist", hasAll(provider, ["AndroidInstallInstructions", "Android Chrome", "Install app"]));
record("Desktop install instructions exist", hasAll(provider, ["DesktopInstallInstructions", "address bar"]));
const storageLines = provider.split(/\r?\n/).filter((line) => line.includes("localStorage") || line.includes("DISMISSED_UNTIL_KEY") || line.includes("DISMISS_COUNT_KEY")).join("\n");
record("dismissal persistence stores only generic metadata", hasAll(provider, ["DISMISSED_UNTIL_KEY", "DISMISS_COUNT_KEY", "localStorage"]) && !/email|name|account|balance|payment|session|token/i.test(storageLines));
record("offline banner is implemented", hasAll(provider, ["OfflineBanner", "navigator.onLine", "online", "offline"]));
record("update available notice is implemented", hasAll(provider, ["PwaUpdateAvailableNotice", "SKIP_WAITING", "controllerchange"]));
record("install UI is suppressed for print and document preview routes", hasAll(provider, ["/print", "/preview", "/documents/", "/receipts/"]));

const rootLayout = readProjectFile("app/layout.tsx");
const portalLayout = readProjectFile("app/portal/layout.tsx");
const publicInstallBanner = readProjectFile("components/public-pwa-install-banner.tsx");
record("root layout integrates the single PWA provider", hasAll(rootLayout, ["PwaInstallProvider", "<PwaInstallProvider>", "PublicPwaInstallBanner"]));
record("portal layout does not duplicate the root PWA provider", !portalLayout.includes("PwaInstallProvider"));
record("public HOAHub entry exposes a mobile-only install prompt", hasAll(publicInstallBanner, ['pathname !== "/"', "lg:hidden", "InstallHoaHubBanner"]));

const appLauncher = readProjectFile("app/app/page.tsx");
record("global PWA launcher is role-aware", hasAll(appLauncher, ["readSession", "defaultHomeForRole", "redirect(\"/login\")"]));

const cacheRecovery = readProjectFile("components/browser-cache-recovery.tsx");
record("cache recovery removes HOAHub /sw.js only in local development", hasAll(cacheRecovery, ["shouldRemoveDevelopmentHoaHubWorker", 'process.env.NODE_ENV !== "production"', "isLocalDevelopmentOrigin", 'scriptUrl.pathname === HOAHUB_SERVICE_WORKER_PATH']));
record("cache recovery removes only HOAHub-owned development caches", hasAll(cacheRecovery, ["shouldRemoveDevelopmentHoaHubCache", "DEVELOPMENT_HOAHUB_CACHE_PREFIX", "cacheName.startsWith(DEVELOPMENT_HOAHUB_CACHE_PREFIX)"]));

const authButtons = readProjectFile("components/auth-navigation-buttons.tsx");
const logoutRoute = readProjectFile("app/api/auth/logout/route.ts");
const authLogout = readProjectFile("lib/auth-logout.ts");
const profilePage = readProjectFile("app/portal/profile/page.tsx");
const morePage = readProjectFile("app/portal/more/page.tsx");
record(
  "logout buttons use a detached browser-native full-document POST outside the React form tree",
  hasAll(authButtons, [
    'const LOGOUT_ENDPOINT = "/api/auth/logout"',
    'document.createElement("form")',
    'form.method = "post"',
    "form.action = LOGOUT_ENDPOINT",
    'type="button"',
    'data-hoahub-logout-button="true"',
    'data-hoahub-logout-scope={scope}',
    'scopeInput.name = "scope"',
    "scopeInput.value = scope",
    "document.body.append(form)",
    "HTMLFormElement.prototype.submit.call(form)",
  ])
    && !authButtons.includes("<form")
    && !authButtons.includes('type="submit"')
    && !authButtons.includes("event.preventDefault()")
    && !authButtons.includes("form.submit()")
    && !authButtons.includes("requestSubmit(")
    && !authButtons.includes("useActionState")
    && !authButtons.includes("fetch(form.action")
    && !authButtons.includes("location.replace"),
);
record("logout endpoint enforces same-origin private 303 redirect", hasAll(logoutRoute, ["assertSameOrigin(request)", "privateNoStoreHeaders", "NextResponse.redirect(destination, 303)"]));
record("profile and more contain no inline logout action", hasAll(profilePage, ["LogoutButton"]) && hasAll(morePage, ["LogoutButton"]) && !profilePage.includes("logoutAction") && !morePage.includes("logoutAction") && !profilePage.includes("form action={async") && !morePage.includes("form action={async"));
record("logout removes browser session before document redirect", hasAll(authLogout, ["await deleteSession()", "logoutRedirectForSession", "session.tenantSlug"]));

const nextConfig = readProjectFile("next.config.ts");
record("service worker served with safe headers", hasAll(nextConfig, ["Service-Worker-Allowed", "no-cache, no-store, must-revalidate"]));
record("portal app launcher and auth responses remain no-store", hasAll(nextConfig, ["/portal/:path*", "/api/auth/:path*", "/login", "/app", "/activate"]));

const changedFiles = gitChangedFiles();
const allowedPhaseChatFiles = new Set([
  "app/api/chat/conversations/route.ts",
  "app/api/chat/messages/route.ts",
  "app/api/chat/privacy/route.ts",
  "app/api/chat/requests/route.ts",
  "app/api/chat/blocks/route.ts",
  "lib/actions/chat.ts",
  "lib/services/chat.ts",
  "lib/services/chat-privacy.ts",
  "prisma/migrations/20260815213000_chat_privacy_requests_blocks/migration.sql",
]);
const disallowedChangedFiles = changedFiles.filter((file) => {
  const normalized = file.replaceAll("\\", "/");
  return /^(app\/admin|app\/employee|app\/platform|app\/api|prisma\/|lib\/actions|lib\/services|lib\/auth|lib\/tenant)/.test(normalized) && !allowedPhaseChatFiles.has(normalized);
});
record("no unrelated admin employee payroll platform api auth tenant prisma changes", disallowedChangedFiles.length === 0, disallowedChangedFiles.join(", "));

const failed = checks.filter((check) => !check.passed);
for (const check of checks) {
  console.log(`${check.passed ? "PASS" : "FAIL"} ${check.label}${check.detail ? ` (${check.detail})` : ""}`);
}

if (failed.length > 0) {
  console.error(`\nHomeowner PWA verification failed: ${failed.length} check(s).`);
  process.exit(1);
}

console.log(`\nHomeowner PWA verification passed: ${checks.length} checks.`);
