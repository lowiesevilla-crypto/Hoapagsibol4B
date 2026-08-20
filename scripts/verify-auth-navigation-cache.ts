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
  const logoutTransitionRoute = read("app/api/auth/logout-transition/route.ts");
  const logoutRoute = read("app/api/auth/logout/route.ts");
  const authLogout = read("lib/auth-logout.ts");
  const sidebar = read("components/sidebar.tsx");
  const profile = read("app/portal/profile/page.tsx");
  const layout = read("app/layout.tsx");
  const globalError = read("app/error.tsx");
  const chunkRecovery = read("lib/chunk-recovery.ts");
  const navigationRecovery = read("lib/navigation-recovery.ts");
  const browserRecovery = read("components/browser-cache-recovery.tsx");
  const authNavigationE2e = read("tests/e2e/auth-navigation-recovery.mjs");
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
  assert(authButtons.includes('const LOGOUT_TRANSITION_ENDPOINT = "/api/auth/logout-transition"') && authButtons.includes("href={href}"), "Logout must leave the protected React tree through the dedicated same-origin transition route.");
  assert(authButtons.includes('data-hoahub-logout-button="true"') && authButtons.includes('data-hoahub-logout-scope={scope}'), "Logout must expose a visible control with explicit scope metadata.");
  assert(authButtons.includes('rel="nofollow"'), "Logout transition links must not invite speculative crawler navigation.");
  assert(!authButtons.includes("document.createElement(\"form\")") && !authButtons.includes("HTMLFormElement.prototype.submit.call"), "Protected React pages must not submit the logout mutation directly.");
  assert(!authButtons.includes("event.preventDefault()") && !authButtons.includes("useActionState") && !authButtons.includes("fetch("), "Protected React logout controls must not depend on delegated submit suppression, React action state, or client fetch authority.");
  assert(!authButtons.includes("location.replace") && !authButtons.includes("logoutNavigationAction"), "Protected React logout controls must not depend on client redirect authority or a React Server Action revocation path.");

  assert(logoutTransitionRoute.includes('request.headers.get("sec-fetch-site") === "same-origin"') && logoutTransitionRoute.includes('request.headers.get("sec-fetch-mode") === "navigate"') && logoutTransitionRoute.includes('request.headers.get("sec-fetch-dest") === "document"'), "Logout transition must require browser-controlled same-origin top-level navigation when referrer proof is unavailable.");
  assert(logoutTransitionRoute.includes("allowedOrigins()") && logoutTransitionRoute.includes("new URL(referer).origin === new URL(request.url).origin"), "Logout transition must accept only exact or explicitly configured application origins.");
  assert(logoutTransitionRoute.includes("const nonce = randomBytes(16).toString(\"hex\")") && logoutTransitionRoute.includes('script nonce="${nonce}"'), "Logout transition must use a per-response nonce for its isolated transport script.");
  assert(logoutTransitionRoute.includes('fetch("/api/auth/logout?scope=" + encodeURIComponent(scope)') && logoutTransitionRoute.includes('method: "PUT"') && logoutTransitionRoute.includes('credentials: "same-origin"') && logoutTransitionRoute.includes('redirect: "error"') && logoutTransitionRoute.includes('cache: "no-store"'), "The isolated transition document must create a fresh same-origin non-POST mutation outside the protected React tree without a redirect-follow chain.");
  assert(logoutTransitionRoute.includes('"X-HOAHub-Logout-Transition": "1"') && !logoutTransitionRoute.includes("body: new URLSearchParams"), "Logout transition must carry only the bounded scope in the same-origin URL and use an explicit isolated-transport marker without a mutation body.");
  assert(logoutTransitionRoute.includes('response.status !== 204') && logoutTransitionRoute.includes('response.headers.get("X-HOAHub-Logout-Destination")') && logoutTransitionRoute.includes("new URL(rawDestination, window.location.origin)") && logoutTransitionRoute.includes("destination.origin === window.location.origin") && logoutTransitionRoute.includes('destination.pathname === "/login"') && logoutTransitionRoute.includes('destination.pathname.endsWith("/login")') && logoutTransitionRoute.includes("window.location.replace(destination.href)"), "Transition navigation must use only the bounded same-origin login destination returned after server revocation.");
  assert(logoutTransitionRoute.includes('data-hoahub-logout-retry="true"') && logoutTransitionRoute.includes('dataset.hoahubLogoutError = reason') && !logoutTransitionRoute.includes("HTMLFormElement.prototype.submit.call") && !logoutTransitionRoute.includes("window.setTimeout(submitLogout"), "Transition retries must be explicit and diagnostics must remain bounded without duplicating logout mutations automatically.");
  assert(logoutTransitionRoute.includes("privateNoStoreHeaders") && logoutTransitionRoute.includes("script-src 'nonce-${nonce}'") && logoutTransitionRoute.includes("connect-src 'self'") && logoutTransitionRoute.includes("form-action 'none'") && logoutTransitionRoute.includes("frame-ancestors 'none'"), "Logout transition document must be private/no-store and CSP-restricted to its nonce-scoped same-origin transport.");
  assert(!logoutTransitionRoute.includes('/api/auth/logout-transition-script'), "Logout transition must be self-contained so sign-out cannot stall on a secondary script request.");

  assert(authNavigationE2e.includes('a[data-hoahub-logout-button=\\"true\\"][data-hoahub-logout-scope=\\"current\\"]') || authNavigationE2e.includes('a[data-hoahub-logout-button="true"][data-hoahub-logout-scope="current"]'), "Auth browser regression must locate the visible current-session logout link directly.");
  assert(authNavigationE2e.includes("await logoutButton.click()"), "Auth browser regression must exercise logout through the visible control.");
  assert(!authNavigationE2e.includes('page.request') && !authNavigationE2e.includes('fetch(`${baseUrl}/api/auth/logout'), "Auth browser regression must not bypass the visible logout control with a direct API mutation.");
  assert(logoutRoute.includes("assertSameOrigin(request)"), "Logout mutations must enforce same-origin request validation.");
  assert(logoutRoute.includes("export async function POST(request: Request)") && logoutRoute.includes("export async function PUT(request: Request)"), "Logout route must keep POST document compatibility while exposing the isolated transition PUT mutation.");
  assert(logoutRoute.includes('request.headers.get(TRANSITION_REQUEST_HEADER) !== "1"') && logoutRoute.includes('new URL(request.url).searchParams.get("scope") === "all"'), "Isolated logout PUT must require its explicit transition marker and bound scope to current or all.");
  assert(logoutRoute.includes("NextResponse.redirect(result.destination, 303)"), "Direct POST logout must retain the authoritative HTTP 303 redirect after revocation.");
  assert(logoutRoute.includes("status: 204") && logoutRoute.includes("TRANSITION_DESTINATION_HEADER") && logoutRoute.includes("result.destination.pathname"), "Isolated logout must return only a bounded server-resolved destination after revocation instead of following a fetch redirect chain.");
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
