const SHELL_CACHE = "hoahub-pwa-shell-v2";
const OFFLINE_URL = "/offline";
const APP_SHELL_ASSETS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icons/hoahub-icon-192.png",
  "/icons/hoahub-icon-512.png",
  "/icons/hoahub-maskable-512.png",
  "/apple-touch-icon.png",
];

const NETWORK_ONLY_PREFIXES = [
  "/api/",
  "/admin",
  "/portal",
  "/employee",
  "/platform",
  "/app",
  "/documents/",
  "/receipts/",
  "/uploads/",
  "/login",
  "/logout",
  "/activate",
  "/reset-password",
  "/forgot-password",
  "/complaints",
  "/verify/documents",
];

const NETWORK_ONLY_PATH_PATTERNS = [
  /payment-proof/i,
  /proof/i,
  /receipt/i,
  /generated-document/i,
  /complaint/i,
  /chat/i,
  /profile/i,
  /vehicle/i,
  /document-preview/i,
];

const NETWORK_ONLY_QUERY_KEYS = [
  "_rsc",
  "__flight__",
  "next-router-state-tree",
  "next-router-prefetch",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_ASSETS)).catch(() => undefined),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => Promise.all(
      cacheNames.filter((name) => name.startsWith("hoahub-pwa-shell-") && name !== SHELL_CACHE).map((name) => caches.delete(name)),
    )).then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  if (isServerActionRequest(request) || isReactServerComponentRequest(request) || isRouterPrefetchRequest(request)) return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (hasSensitiveRequest(url)) {
    event.respondWith(fetch(request));
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || APP_SHELL_ASSETS.includes(url.pathname)) {
    event.respondWith(cacheFirstStatic(request));
  }
});

function hasSensitiveRequest(url) {
  const pathname = url.pathname;
  if (NETWORK_ONLY_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix))) return true;
  if (NETWORK_ONLY_PATH_PATTERNS.some((pattern) => pattern.test(pathname))) return true;
  return NETWORK_ONLY_QUERY_KEYS.some((key) => url.searchParams.has(key));
}

function isServerActionRequest(request) {
  return request.headers.has("Next-Action") || request.headers.has("next-action");
}

function isReactServerComponentRequest(request) {
  const accept = request.headers.get("Accept") || "";
  return request.headers.has("RSC") || accept.includes("text/x-component");
}

function isRouterPrefetchRequest(request) {
  return request.headers.has("Next-Router-State-Tree")
    || request.headers.has("Next-Router-Prefetch")
    || request.headers.get("Purpose") === "prefetch"
    || request.headers.get("Sec-Purpose") === "prefetch"
    || request.headers.get("X-Middleware-Prefetch") === "1";
}

async function networkFirstNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    return await cache.match(OFFLINE_URL) || Response.error();
  }
}

async function cacheFirstStatic(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (isCacheableStaticResponse(response)) {
    await cache.put(request, response.clone());
  }
  return response;
}

function isCacheableStaticResponse(response) {
  if (!(response.ok && !response.headers.has("set-cookie"))) return false;
  const cacheControl = response.headers.get("cache-control") || "";
  if (/\b(no-store|private)\b/i.test(cacheControl)) return false;
  const contentType = response.headers.get("content-type") || "";
  if (/text\/html|application\/json|text\/x-component/i.test(contentType)) return false;
  return true;
}
