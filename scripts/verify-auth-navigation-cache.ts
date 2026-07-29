import { existsSync, readFileSync } from "node:fs";

loadLocalEnv();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function read(path: string) {
  return readFileSync(path, "utf8");
}

function requireLocalClone() {
  const url = process.env.DATABASE_URL || "";
  assert(url.includes("127.0.0.1") && url.includes("hoahub_prodclone_local"), "Verification must run only against 127.0.0.1 / hoahub_prodclone_local.");
}

function loadLocalEnv() {
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    const text = readFileSync(file, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].trim().replace(/^"(.*)"$/, "$1");
    }
  }
}

async function main() {
  requireLocalClone();

  const loginForm = read("components/login-form.tsx");
  const passkeyButton = read("components/passkey-login-button.tsx");
  const activatePage = read("app/activate/page.tsx");
  const activationService = read("lib/services/homeowner-activation.ts");
  const authActions = read("lib/actions/auth.ts");
  const authButtons = read("components/auth-navigation-buttons.tsx");
  const sidebar = read("components/sidebar.tsx");
  const profile = read("app/portal/profile/page.tsx");
  const layout = read("app/layout.tsx");
  const globalError = read("app/error.tsx");
  const chunkRecovery = read("lib/chunk-recovery.ts");
  const browserRecovery = read("components/browser-cache-recovery.tsx");
  const nextConfig = read("next.config.ts");
  const packageJson = read("package.json");

  assert(!loginForm.includes("Activate homeowner account"), "Public universal login must not render an activation CTA.");
  assert(!loginForm.includes('href="/activate"'), "Public universal login must not link directly to /activate.");
  assert(loginForm.includes("PasskeyLoginButton"), "Public login must preserve passkey sign-in.");
  assert(loginForm.includes("window.location.replace(state.redirectTo)"), "Password login success must use a full document navigation.");
  assert(passkeyButton.includes("window.location.replace(result.redirectTo"), "Passkey login success must use a full document navigation.");

  assert(activatePage.includes("const canActivate = query.verified === \"email\" || query.verified === \"already\""), "Activation page must gate the setup form on invitation verification state.");
  assert(activatePage.indexOf("canActivate ?") < activatePage.indexOf("<HomeownerActivationForm />"), "Activation form must not render before invitation verification is checked.");
  assert(activatePage.includes("Activation requires a valid invitation link"), "Direct activation access must fail safely.");
  assert(activationService.includes("/activate/verify?token="), "Activation email must use the invitation verification URL.");
  assert(activationService.includes("const activationUrl = emailVerificationUrl"), "Activation email must not advertise an unauthenticated public activation page.");

  assert(authActions.includes("return { redirectTo: defaultHomeForRole(user.role) }"), "Password login must return a verified server-computed redirect destination.");
  assert(authActions.includes("logoutNavigationAction") && authActions.includes("logoutAllSessionsNavigationAction"), "Logout navigation actions are missing.");
  assert(authButtons.includes("useActionState") && authButtons.includes("window.location.replace(state.redirectTo)"), "Logout buttons must perform full document navigation after server-side logout.");
  assert(sidebar.includes("LogoutButton") && !sidebar.includes("logoutAction"), "Sidebar logout must use the safe navigation logout control.");
  assert(profile.includes("LogoutButton") && !profile.includes("logoutAction"), "Profile logout controls must use the safe navigation logout control.");

  assert(layout.includes("BrowserCacheRecovery"), "Root layout must mount browser cache/chunk recovery.");
  assert(chunkRecovery.includes("ChunkLoadError") && chunkRecovery.includes("_next") && chunkRecovery.includes("static") && chunkRecovery.includes("chunks"), "Chunk recovery must detect genuine Next.js chunk failures.");
  assert(globalError.includes("SAFE_CHUNK_RECOVERY_MESSAGE"), "Global error boundary must use a safe chunk recovery message.");
  assert(!globalError.includes("error.message"), "Global error boundary must not expose raw chunk URLs or exception messages.");
  assert(browserRecovery.includes("sessionStorage") && browserRecovery.includes("window.location.reload()"), "Chunk recovery must be guarded and reload once.");
  assert(browserRecovery.includes("getRegistrations") && browserRecovery.includes("registration.unregister()"), "Stale service workers must be removed safely.");
  assert(browserRecovery.includes("window.caches.delete"), "Old PWA runtime caches must be cleaned.");
  assert(browserRecovery.includes("routeCategory(pathname)") && !browserRecovery.includes("error.message"), "Chunk recovery logging must avoid sensitive request data and raw errors.");

  assert(nextConfig.includes('{ source: "/", headers: noStoreHeaders }'), "Root auth redirect page must be no-store.");
  assert(nextConfig.includes('{ source: "/login", headers: noStoreHeaders }'), "Universal login must be no-store.");
  assert(nextConfig.includes('{ source: "/api/auth/:path*", headers: noStoreHeaders }'), "Auth API routes must be no-store.");
  assert(nextConfig.includes('{ source: "/manifest.webmanifest", headers: revalidateHeaders }'), "PWA manifest must revalidate instead of going stale.");
  assert(nextConfig.includes('{ source: "/sw.js", headers: revalidateHeaders }'), "Legacy service worker script path must revalidate.");
  assert(!nextConfig.includes('/_next/static'), "Hashed Next.js static chunks must retain Next's immutable caching behavior.");
  assert(packageJson.includes('"verify:auth-navigation-cache": "tsx scripts/verify-auth-navigation-cache.ts"'), "Package script verify:auth-navigation-cache is missing.");

  console.log("Auth navigation and cache recovery verification passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
