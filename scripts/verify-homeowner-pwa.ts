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
record("service worker provides generic navigation offline fallback", hasAll(serviceWorker, ['request.mode === "navigate"', "networkFirstNavigation", "cache.match(OFFLINE_URL)"]));
record("service worker avoids caching credential-setting responses", serviceWorker.includes('!response.headers.has("set-cookie")'));

const provider = readProjectFile("components/pwa-install-provider.tsx");
record("Chromium deferred install prompt is captured safely", hasAll(provider, ["beforeinstallprompt", "event.preventDefault()", "deferredPrompt", ".prompt()", "userChoice"]));
record("installed app state hides install UI", hasAll(provider, ["appinstalled", "setInstalled(true)", "isStandaloneMode"]));
record("iOS install instructions exist", hasAll(provider, ["IOSInstallInstructions", "Add to Home Screen", "Safari"]));
record("Android install instructions exist", hasAll(provider, ["AndroidInstallInstructions", "Android Chrome", "Install app"]));
record("Desktop install instructions exist", hasAll(provider, ["DesktopInstallInstructions", "address bar"]));
const storageLines = provider.split(/\r?\n/).filter((line) => line.includes("localStorage") || line.includes("DISMISSED_UNTIL_KEY") || line.includes("DISMISS_COUNT_KEY")).join("\n");
record("dismissal persistence stores only generic metadata", hasAll(provider, ["DISMISSED_UNTIL_KEY", "DISMISS_COUNT_KEY", "localStorage"]) && !/email|name|account|balance|payment|session|token/i.test(storageLines));
record("offline banner is implemented", hasAll(provider, ["OfflineBanner", "navigator.onLine", "online", "offline"]));
record("update available notice is implemented", hasAll(provider, ["PwaUpdateAvailableNotice", "SKIP_WAITING", "controllerchange"]));
record("install UI is suppressed for print and document preview routes", hasAll(provider, ["/print", "/preview", "/documents/", "/receipts/"]));

const portalLayout = readProjectFile("app/portal/layout.tsx");
record("homeowner portal integrates PWA provider", hasAll(portalLayout, ["PwaInstallProvider", "<PwaInstallProvider>"]));

const appLauncher = readProjectFile("app/app/page.tsx");
record("global PWA launcher is role-aware", hasAll(appLauncher, ["readSession", "defaultHomeForRole", "redirect(\"/login\")"]));

const cacheRecovery = readProjectFile("components/browser-cache-recovery.tsx");
record("cache recovery does not unregister the new /sw.js", !cacheRecovery.includes("/\\/(sw|service-worker)\\\\.js") && cacheRecovery.includes("LEGACY_SERVICE_WORKER_PATH_PATTERN"));

const nextConfig = readProjectFile("next.config.ts");
record("service worker served with safe headers", hasAll(nextConfig, ["Service-Worker-Allowed", "no-cache, no-store, must-revalidate"]));
record("portal app launcher and auth responses remain no-store", hasAll(nextConfig, ["/portal/:path*", "/api/auth/:path*", "/login", "/app", "/activate"]));

const changedFiles = gitChangedFiles();
const disallowedChangedFiles = changedFiles.filter((file) => /^(app\/admin|app\/employee|app\/platform|app\/api|prisma\/|lib\/actions|lib\/services|lib\/auth|lib\/tenant)/.test(file.replaceAll("\\", "/")));
record("no admin employee payroll platform api auth tenant prisma changes", disallowedChangedFiles.length === 0, disallowedChangedFiles.join(", "));

const failed = checks.filter((check) => !check.passed);
for (const check of checks) {
  console.log(`${check.passed ? "PASS" : "FAIL"} ${check.label}${check.detail ? ` (${check.detail})` : ""}`);
}

if (failed.length > 0) {
  console.error(`\nHomeowner PWA verification failed: ${failed.length} check(s).`);
  process.exit(1);
}

console.log(`\nHomeowner PWA verification passed: ${checks.length} checks.`);
