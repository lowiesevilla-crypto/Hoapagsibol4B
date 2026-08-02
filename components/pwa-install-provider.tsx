"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Download, Info, RefreshCw, Smartphone, WifiOff, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type PwaPlatform = "ios" | "android" | "desktop" | "unknown";

type PwaInstallContextValue = {
  canInstall: boolean;
  installAvailable: boolean;
  installed: boolean;
  online: boolean;
  platform: PwaPlatform;
  updateAvailable: boolean;
  openInstallSheet: () => void;
  dismissInstall: () => void;
  runInstallPrompt: () => Promise<void>;
  refreshForUpdate: () => void;
};

const PwaInstallContext = createContext<PwaInstallContextValue | null>(null);
const DISMISSED_UNTIL_KEY = "hoahub:pwa-install-dismissed-until";
const DISMISS_COUNT_KEY = "hoahub:pwa-install-dismiss-count";
const DISMISS_MS = 14 * 24 * 60 * 60 * 1000;
const PWA_SERVICE_WORKER_PATH = "/sw.js";
const DEVELOPMENT_HOAHUB_CACHE_PREFIX = "hoahub-pwa-";

export function PwaInstallProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [online, setOnline] = useState(true);
  const [updateRegistration, setUpdateRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [platform, setPlatform] = useState<PwaPlatform>("unknown");
  const suppressed = isSuppressedInstallPath(pathname);

  useEffect(() => {
    setOnline(navigator.onLine);
    setPlatform(detectPlatform());
    setInstalled(isStandaloneMode());
    setDismissed(isInstallDismissed());

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setSheetOpen(false);
      setDeferredPrompt(null);
      clearInstallDismissal();
    };
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let disposed = false;

    if (process.env.NODE_ENV !== "production") {
      void removeDevelopmentHoaHubServiceWorker();
      return () => {
        disposed = true;
      };
    }

    navigator.serviceWorker.register(PWA_SERVICE_WORKER_PATH, { scope: "/" }).then((registration) => {
      if (disposed) return;
      if (registration.waiting) setUpdateRegistration(registration);
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            setUpdateRegistration(registration);
          }
        });
      });
    }).catch(() => undefined);

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSheetOpen(false);
    };
    if (sheetOpen) window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [sheetOpen]);

  const contextValue = useMemo<PwaInstallContextValue>(() => ({
    canInstall: !installed && !suppressed && (!dismissed || sheetOpen) && (Boolean(deferredPrompt) || platform === "ios" || platform === "desktop"),
    installAvailable: !installed && !suppressed && (Boolean(deferredPrompt) || platform === "ios" || platform === "desktop"),
    installed,
    online,
    platform,
    updateAvailable: Boolean(updateRegistration),
    openInstallSheet: () => setSheetOpen(true),
    dismissInstall: () => {
      persistInstallDismissal();
      setDismissed(true);
      setSheetOpen(false);
    },
    runInstallPrompt: async () => {
      if (!deferredPrompt) {
        setSheetOpen(true);
        return;
      }
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      if (choice.outcome === "accepted") {
        clearInstallDismissal();
      } else {
        persistInstallDismissal();
        setDismissed(true);
      }
      setSheetOpen(false);
    },
    refreshForUpdate: () => {
      const waiting = updateRegistration?.waiting;
      if (!waiting) return;
      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
      waiting.postMessage({ type: "SKIP_WAITING" });
    },
  }), [deferredPrompt, dismissed, installed, online, platform, sheetOpen, suppressed, updateRegistration]);

  const showDashboardBanner = pathname === "/portal/dashboard" && contextValue.canInstall && !sheetOpen;

  return (
    <PwaInstallContext.Provider value={contextValue}>
      {children}
      <OfflineBanner />
      <PwaUpdateAvailableNotice />
      {showDashboardBanner && <InstallHoaHubBanner />}
      <InstallHoaHubBottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </PwaInstallContext.Provider>
  );
}

export function InstallHoaHubBanner() {
  const pwa = usePwaInstall();
  if (!pwa.canInstall) return null;

  return (
    <section className="fixed inset-x-3 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-lg rounded-2xl border border-pine-100 bg-white p-3 shadow-soft lg:bottom-6 lg:left-auto lg:right-6 lg:mx-0" aria-label="Install HOAHub">
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-pine-50 text-pine-700">
          <Smartphone className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-ink">Install HOAHub</p>
          <p className="text-xs leading-5 text-slate-500">Add the homeowner portal to this device for quicker access.</p>
        </div>
        <button type="button" className="grid size-10 place-items-center rounded-xl text-slate-500 hover:bg-slate-50 focus-visible:outline focus-visible:outline-4 focus-visible:outline-pine-500/20" onClick={pwa.dismissInstall} aria-label="Dismiss install prompt">
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" className="btn-primary flex-1" onClick={pwa.runInstallPrompt}>
          <Download className="size-4" aria-hidden="true" />
          Install
        </button>
        <button type="button" className="btn-secondary flex-1" onClick={pwa.openInstallSheet}>
          How to install
        </button>
      </div>
    </section>
  );
}

export function PwaInstallActionCard() {
  const pwa = usePwaInstall();
  const disabled = pwa.installed;
  const title = pwa.installed ? "HOAHub is installed" : "Install HOAHub";
  const description = pwa.installed ? "Open HOAHub from your device app list or home screen." : "Add HOAHub to this device using the approved browser install flow.";

  return (
    <section className="rounded-3xl border border-pine-100 bg-white p-4 shadow-sm" aria-label="Install HOAHub">
      <div className="flex items-start gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-pine-50 text-pine-700">
          <Smartphone className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-black text-ink">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {!disabled && pwa.installAvailable && (
          <button type="button" className="btn-primary min-h-12 flex-1" onClick={pwa.runInstallPrompt}>
            <Download className="size-4" aria-hidden="true" />
            Install
          </button>
        )}
        <button type="button" className="btn-secondary min-h-12 flex-1" onClick={pwa.openInstallSheet}>
          {disabled ? "View status" : "How to install"}
        </button>
      </div>
    </section>
  );
}

export function InstallHoaHubBottomSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pwa = usePwaInstall();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) closeButtonRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/35 px-3 pb-3 pt-16 backdrop-blur-sm" role="presentation" onClick={onClose}>
      <section className="mx-auto flex max-h-[calc(100dvh-5rem)] w-full max-w-lg flex-col rounded-t-[1.5rem] rounded-b-2xl bg-white shadow-2xl lg:rounded-3xl" role="dialog" aria-modal="true" aria-labelledby="install-hoahub-title" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start gap-3 border-b border-slate-100 p-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-pine-50 text-pine-700">
            <Smartphone className="size-6" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="install-hoahub-title" className="text-lg font-black text-ink">Install HOAHub</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">Use your browser&apos;s safe app install flow. No homeowner data is stored by this prompt.</p>
          </div>
          <button ref={closeButtonRef} type="button" className="grid size-10 place-items-center rounded-xl text-slate-500 hover:bg-slate-50 focus-visible:outline focus-visible:outline-4 focus-visible:outline-pine-500/20" onClick={onClose} aria-label="Close install instructions">
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div className="overflow-y-auto p-4">
          {pwa.installed ? <PwaInstalledState /> : pwa.platform === "ios" ? <IOSInstallInstructions /> : pwa.platform === "android" ? <AndroidInstallInstructions /> : <DesktopInstallInstructions />}
        </div>
        <div className="flex gap-2 border-t border-slate-100 p-4">
          {!pwa.installed && (
            <button type="button" className="btn-primary flex-1" onClick={pwa.runInstallPrompt}>
              <Download className="size-4" aria-hidden="true" />
              Install
            </button>
          )}
          <button type="button" className="btn-secondary flex-1" onClick={pwa.dismissInstall}>
            Not now
          </button>
        </div>
      </section>
    </div>
  );
}

export function IOSInstallInstructions() {
  return (
    <InstructionPanel title="iPhone or iPad" steps={["Open HOAHub in Safari on localhost or the production HTTPS domain.", "Tap the Share button.", "Choose Add to Home Screen, then tap Add."]} />
  );
}

export function AndroidInstallInstructions() {
  return (
    <InstructionPanel title="Android Chrome" steps={["Open HOAHub in Chrome.", "Tap Install when Chrome offers it, or open the browser menu.", "Choose Install app or Add to Home screen."]} />
  );
}

export function DesktopInstallInstructions() {
  return (
    <InstructionPanel title="Desktop browser" steps={["Open HOAHub in Chrome, Edge, or another PWA-capable browser.", "Use the install icon in the address bar when available.", "If the icon is not shown, open the browser menu and choose Install HOAHub."]} />
  );
}

export function PwaInstalledState() {
  return (
    <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-emerald-900">
      <div className="flex items-center gap-3">
        <CheckCircle2 className="size-5 shrink-0" aria-hidden="true" />
        <p className="font-black">HOAHub is installed on this device.</p>
      </div>
      <p className="mt-2 text-sm leading-6">Open it from your home screen, dock, launcher, or app list.</p>
    </div>
  );
}

export function PwaUpdateAvailableNotice() {
  const pwa = usePwaInstall();
  if (!pwa.updateAvailable) return null;

  return (
    <section className="fixed inset-x-3 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-[60] mx-auto max-w-lg rounded-2xl border border-pine-100 bg-white p-3 shadow-soft lg:bottom-6 lg:left-auto lg:right-6 lg:mx-0" aria-label="HOAHub update available">
      <div className="flex items-center gap-3">
        <Info className="size-5 shrink-0 text-pine-700" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm font-bold text-ink">A safer, newer HOAHub version is ready.</p>
        <button type="button" className="btn-primary w-auto" onClick={pwa.refreshForUpdate}>
          <RefreshCw className="size-4" aria-hidden="true" />
          Update
        </button>
      </div>
    </section>
  );
}

export function OfflineBanner() {
  const pwa = usePwaInstall();
  if (pwa.online) return null;

  return (
    <div className="fixed inset-x-3 top-[calc(.75rem+env(safe-area-inset-top))] z-[80] mx-auto max-w-lg rounded-2xl border border-amber-200 bg-amber-50 p-3 text-amber-950 shadow-soft" role="status" aria-live="polite">
      <div className="flex items-center gap-3">
        <WifiOff className="size-5 shrink-0" aria-hidden="true" />
        <p className="text-sm font-bold">You are offline. Submissions and payments must wait until the connection returns.</p>
      </div>
    </div>
  );
}

function InstructionPanel({ title, steps }: { title: string; steps: string[] }) {
  return (
    <div className="space-y-4">
      <p className="text-sm font-black uppercase tracking-[.14em] text-pine-700">{title}</p>
      <ol className="space-y-3">
        {steps.map((step, index) => (
          <li key={step} className="flex gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3 text-sm leading-6 text-slate-700">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white text-xs font-black text-pine-700 ring-1 ring-pine-100">{index + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <p className="text-xs leading-5 text-slate-500">For local UAT, use <span className="font-bold">localhost</span>. Production installation requires the secure HOAHub domain.</p>
      <Link href="/offline" className="inline-flex text-sm font-black text-pine-700 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-4 focus-visible:outline-pine-500/20">View offline fallback page</Link>
    </div>
  );
}

export function usePwaInstall() {
  const context = useContext(PwaInstallContext);
  if (!context) throw new Error("PWA install components must be rendered inside PwaInstallProvider.");
  return context;
}

function detectPlatform(): PwaPlatform {
  const userAgent = navigator.userAgent || "";
  const touchMac = navigator.maxTouchPoints > 1 && /Macintosh/i.test(userAgent);
  if (/iPad|iPhone|iPod/i.test(userAgent) || touchMac) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  if (/Chrome|Chromium|Edg|Firefox|Safari/i.test(userAgent)) return "desktop";
  return "unknown";
}

function isStandaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function isInstallDismissed() {
  try {
    const dismissedUntil = Number(window.localStorage.getItem(DISMISSED_UNTIL_KEY) || "0");
    return dismissedUntil > Date.now();
  } catch {
    return true;
  }
}

function persistInstallDismissal() {
  try {
    const count = Number(window.localStorage.getItem(DISMISS_COUNT_KEY) || "0");
    window.localStorage.setItem(DISMISS_COUNT_KEY, String(count + 1));
    window.localStorage.setItem(DISMISSED_UNTIL_KEY, String(Date.now() + DISMISS_MS));
  } catch {
    // Local storage may be unavailable in private or restricted browser modes.
  }
}

function clearInstallDismissal() {
  try {
    window.localStorage.removeItem(DISMISSED_UNTIL_KEY);
  } catch {
    // Local storage may be unavailable in private or restricted browser modes.
  }
}

function isSuppressedInstallPath(pathname: string) {
  return pathname.includes("/print") || pathname.includes("/preview") || pathname.startsWith("/documents/") || pathname.startsWith("/receipts/");
}

async function removeDevelopmentHoaHubServiceWorker() {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV === "production") return;
  if (!isLocalDevelopmentOrigin(window.location)) return;
  const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
  await Promise.all(registrations.map(async (registration) => {
    const scriptUrl = registration.active?.scriptURL || registration.waiting?.scriptURL || registration.installing?.scriptURL || "";
    if (!isHoaHubServiceWorkerUrl(scriptUrl, window.location.origin)) return;
    await registration.unregister();
  }));
  if (!("caches" in window)) return;
  const cacheNames = await window.caches.keys().catch(() => []);
  await Promise.all(cacheNames.filter((name) => name.startsWith(DEVELOPMENT_HOAHUB_CACHE_PREFIX)).map((name) => window.caches.delete(name)));
}

function isLocalDevelopmentOrigin(location: Location) {
  return location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.hostname === "::1" || location.hostname === "[::1]";
}

function isHoaHubServiceWorkerUrl(scriptUrl: string, expectedOrigin: string) {
  if (!scriptUrl) return false;
  try {
    const parsed = new URL(scriptUrl);
    return parsed.origin === expectedOrigin && parsed.pathname === PWA_SERVICE_WORKER_PATH;
  } catch {
    return false;
  }
}
