import type { Metadata } from "next";
import "./globals.css";
import { BrowserCacheRecovery } from "@/components/browser-cache-recovery";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "HOAHub", template: "%s | HOAHub" },
  description: "Secure multi-tenant HOA management platform",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className="overflow-x-hidden" data-scroll-behavior="smooth"><body><BrowserCacheRecovery />{children}</body></html>;
}
