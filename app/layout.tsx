import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BrowserCacheRecovery } from "@/components/browser-cache-recovery";

export const dynamic = "force-dynamic";

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
  return <html lang="en" className="overflow-x-hidden" data-scroll-behavior="smooth"><body><BrowserCacheRecovery />{children}</body></html>;
}
