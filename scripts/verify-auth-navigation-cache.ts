import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function read(path: string) {
  return readFileSync(path, "utf8");
}

async function main() {
  const loginForm = read("components/login-form.tsx");
  const passkeyButton = read("components/passkey-login-button.tsx");
  const activatePage = read("app/activate/page.tsx");
  const activationService = read("lib/services/homeowner-activation.ts");
  const authActions = read("lib/actions/auth.ts");
  const authButtons = read("components/auth-navigation-buttons.tsx");
  const logoutRoute = read("app/api/auth/logout/route.ts");
  const authLogout = read("lib/auth-logout.ts");
  const sidebar = read("components/sidebar.tsx");
  const profile = read("app/portal/profile/page.tsx");
  const layout = read("app/layout.tsx");
  const globalError = read("app/error.tsx");
  const chunkRecovery = read("lib/chunk-recovery.ts");
  const navigationRecovery = read("lib/navigation-recovery.ts");
  const browserRecovery = read("components/browser-cache-recovery.tsx");
  const nextConfig = read("next.config.ts");
  const packageJson = read("package.json");

  assert(!loginForm.includes("Activate homeowner account"), "Public universal login must not render an activation CTA.");
  assert(!loginForm.includes('href="/activate"'), "Public universal login must not link directly to /activate.");
  assert(loginForm.includes("PasskeyLoginButton"), "Public login must preserve passkey sign-in.");
  assert(loginForm.includes("window.location.replace(returnTo || state.redirectTo!)"), "Password login success must use a full document navigation to a server-approved destination.");
  assert(passkeyButton.includes("window.location.replace(returnTo || result.redirectTo || \"/portal/dashboard\")"), "Passkey login success must use a full document navigation to a safe destination.");

  assert(activatePage.includes('const handoffDetails = query.verified === "email" ? await getActivationHandoffDetails(handoffToken) : null'), "Email activation must require a verified secure handoff before setup is allowed.");
  assert(activatePage.includes('const canActivate = Boolean(handoffDetails) || query.verified === "already"'), "Activation page must gate the setup form on verified invitation state.");
  assert(activatePage.indexOf("canActivate ?") < activatePage.indexOf("<HomeownerActivationForm"), "Activation form must not render before invitation verification is checked.");
  assert(activatePage.includes("Activation requires a valid invitation link"), "Direct activation access must fail safely.");
  assert(activationService.includes("/activate/verify?token="), "Activation email must use the invitation verification URL.");
  assert(activationService.includes("const activationUrl = emailVerificationUrl"), "Activation email must not advertise an unauthenticated public activation page.");

  assert(authActions.includes("return { redirectTo: defaultHomeForRoles(roles, role) }"), "Password login must return a verified server-computed redirect destination.");
  assert(authButtons.includes('action="/api/auth/logout"') && authButtons.includes('method="post"'), "Logout must use the dedicated same-origin POST endpoint.");
  assert(authButtons.includes('name="scope"') && authButtons.includes('value={allSessions ? "all" : "current"}'), "Logout scope must be submitted explicitly by the shared control.");
  assert(authButtons.includes("event.preventDefault()") && authButtons.includes("HTMLFormElement.prototype.submit.call(form)"), "Logout must deliberately bypass React delegated submit handling and force a native full-document POST.");
  assert(!authButtons.includes("fetch(form.action") && !authButtons.includes("useActionState") && !authButtons.includes("location.replace"), "Logout must not use client fetch, React action state, or client redirect as the revocation authority.");
  assert(!authButtons.includes("logoutNavigationAction"), "Logout must not revoke the session inside a React Server Action state transition.");
  assert(logoutRoute.includes("assertSameOrigin(request)"), "Logout POST must enforce same-origin request validation.");
  assert(logoutRoute.includes("NextResponse.redirect(destination, 303)"), "Logout POST must finish with an HTTP 303 full-document redirect after revocation.");
  assert(!logoutRoute.includes("X-HOA-Logout-Navigation") && !logoutRoute.includes("NextResponse.json("), "Logout route must not depend on a client fetch navigation branch.");
  assert(logoutRoute.includes("privateNoStoreHeaders"), "Logout responses must be private/no-store.");
  assert(authLogout.includes("session.tenantSlug") && !authLogout.includes("platformPrisma.tenant"), "Logout redirect must use signed session routing data instead of a database lookup.");
  assert(authLogout.includes("await deleteSession()"), "Logout must remove the signed browser session even when persisted-session cleanup is best-effort.");
  assert(sidebar.includes("LogoutButton") && !sidebar.includes("logoutAction"), "Sidebar logout must use the shared safe logout control.");
  assert(profile.includes("LogoutButton") && !profile.includes("logoutAction"), "Profile logout controls must use the shared safe logout control.");

  assert(layout.includes("BrowserCacheRecovery"), "Root layout must mount browser cache/navigation recovery.");
  assert(chunkRecovery.includes("ChunkLoadError") && chunkRecovery.includes("_next") && chunkRecovery.includes("static") && chunkRecovery.includes("chunks"), "Chunk recovery must detect genuine Next.js chunk failures.");
  assert(globalError.includes("SAFE_CHUNK_RECOVERY_MESSAGE"), "Global error boundary must use a safe chunk recovery message.");
  assert(!globalError.includes("error.message"), "Global error boundary must not expose raw exception messages.");
  assert(globalError.includes("window.location.reload()") && globalError.includes('window.location.replace("/")'), "Try again must use full-document recovery with a safe-entry fallback.");
  assert(!globalError.includes("reset()"), "Global Try again must not retry the same broken React render tree.");
  assert(navigationRecovery.includes('"/admin"') && navigationRecovery.includes('"/platform"') && navigationRecovery.includes('"/portal"') && navigationRecovery.includes('"/employee"'), "Protected navigation recovery must cover all authenticated shells.");
  assert(browserRecovery.includes('addEventListener("pageshow"') && browserRecovery.includes('addEventListener("popstate"'), "Back/Forward recovery must handle BFCache and history traversal.");
  assert(browserRecovery.includes("isProtectedApplicationPath") && browserRecovery.includes("window.location.reload()"), "Protected history traversal must refresh from authoritative server state.");
  assert(browserRecovery.includes("sessionStorage") && browserRecovery.includes("GLOBAL_ERROR_RECOVERY_KEY"), "Stable pages must clear guarded recovery state.");
  assert(browserRecovery.includes("getRegistrations") && browserRecovery.includes("registration.unregister()"), "Stale service workers must be removed safely.");
  assert(browserRecovery.includes("window.caches.delete"), "Old PWA runtime caches must be cleaned.");
  assert(browserRecovery.includes("routeCategory(currentPath)") && !browserRecovery.includes("error.message"), "Navigation recovery logging must avoid sensitive request data and raw errors.");

  assert(nextConfig.includes('{ source: "/", headers: noStoreHeaders }'), "Root auth redirect page must be no-store.");
  assert(nextConfig.includes('{ source: "/login", headers: noStoreHeaders }'), "Universal login must be no-store.");
  assert(nextConfig.includes('{ source: "/api/auth/:path*", headers: noStoreHeaders }'), "Auth API routes must be no-store.");
  assert(nextConfig.includes('{ source: "/portal/:path*", headers: noStoreHeaders }') && nextConfig.includes('{ source: "/admin/:path*", headers: noStoreHeaders }') && nextConfig.includes('{ source: "/platform/:path*", headers: noStoreHeaders }'), "Authenticated shells must remain no-store.");
  assert(nextConfig.includes('{ source: "/manifest.webmanifest", headers: revalidateHeaders }'), "PWA manifest must revalidate instead of going stale.");
  assert(nextConfig.includes('{ source: "/sw.js", headers: serviceWorkerHeaders }'), "Service worker script must never be served stale.");
  assert(!nextConfig.includes('/_next/static'), "Hashed Next.js static chunks must retain Next's immutable caching behavior.");
  assert(packageJson.includes('"verify:auth-navigation-cache": "tsx scripts/verify-auth-navigation-cache.ts"'), "Package script verify:auth-navigation-cache is missing.");

  console.log("Auth navigation, logout, history, and error recovery verification passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
