import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import "./canva-parity.css";
import { BrowserCacheRecovery } from "@/components/browser-cache-recovery";
import { NavigationProgress } from "@/components/navigation-progress";
import { PublicPwaInstallBanner } from "@/components/public-pwa-install-banner";
import { PwaInstallProvider } from "@/components/pwa-install-provider";

export const dynamic = "force-dynamic";

const EARLY_STATIC_ASSET_RECOVERY_SCRIPT = String.raw`(() => {
  const STATIC_ASSET_PATH = /\/_next\/static\/(?:chunks|css)\//i;
  const CACHE_PREFIX = "hoahub-pwa-shell-";
  const RECOVERY_PREFIX = "hoahub:static-asset-recovery:";
  const RECOVERY_COOLDOWN_MS = 60_000;
  let recovering = false;

  function staticAssetUrlFromEvent(event) {
    const target = event && event.target;
    if (!target) return null;
    const candidate = typeof target.src === "string" && target.src
      ? target.src
      : typeof target.href === "string" && target.href
        ? target.href
        : null;
    if (!candidate) return null;
    try {
      const url = new URL(candidate, window.location.href);
      if (url.origin !== window.location.origin || !STATIC_ASSET_PATH.test(url.pathname)) return null;
      return url;
    } catch {
      return null;
    }
  }

  function startRecovery(event) {
    if (recovering || !staticAssetUrlFromEvent(event)) return;

    const storageKey = RECOVERY_PREFIX + window.location.pathname;
    try {
      const previous = Number(window.sessionStorage.getItem(storageKey) || "0");
      if (previous > 0 && Date.now() - previous < RECOVERY_COOLDOWN_MS) return;
      window.sessionStorage.setItem(storageKey, String(Date.now()));
    } catch {
      // Recovery must still work when browser storage is unavailable.
    }

    recovering = true;
    const reload = () => window.location.reload();
    if (!("caches" in window)) {
      reload();
      return;
    }

    window.caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((name) => name.startsWith(CACHE_PREFIX))
          .map((name) => window.caches.delete(name)),
      ))
      .catch(() => undefined)
      .finally(reload);
  }

  // Capture resource-load errors before the React/Next runtime is needed. This
  // protects users even when the missing file is app/layout or app/error itself.
  window.addEventListener("error", startRecovery, true);
})();`;

export const metadata: Metadata = {
  applicationName: "HOAHub",
  title: { default: "HOAHub", template: "%s | HOAHub" },
  description: "Secure multi-tenant HOA management platform",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/hoahub-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/hoahub-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "HOAHub",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#078bc9",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="overflow-x-hidden" data-scroll-behavior="smooth">
      <body>
        <Script
          id="hoahub-early-static-asset-recovery"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: EARLY_STATIC_ASSET_RECOVERY_SCRIPT }}
        />
        <BrowserCacheRecovery />
        <PwaInstallProvider>
          <Suspense fallback={null}><NavigationProgress /></Suspense>
          {children}
          <PublicPwaInstallBanner />
        </PwaInstallProvider>
      </body>
    </html>
  );
}
