const SHELL_CACHE = "hoahub-pwa-shell-v1";
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
  "/activate",
  "/reset-password",
  "/forgot-password",
  "/complaints",
  "/verify/documents",
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

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (hasSensitiveRequest(url.pathname)) {
    event.respondWith(fetch(request));
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || APP_SHELL_ASSETS.includes(url.pathname)) {
    event.respondWith(cacheFirstStatic(request));
  }
});

function hasSensitiveRequest(pathname) {
  return NETWORK_ONLY_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
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
  if (response.ok && !response.headers.has("set-cookie")) {
    await cache.put(request, response.clone());
  }
  return response;
}
