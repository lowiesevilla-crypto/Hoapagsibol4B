import type { Metadata } from "next";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "HOAHub", template: "%s | HOAHub" },
  description: "Secure multi-tenant HOA management platform",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className="overflow-x-hidden" data-scroll-behavior="smooth"><body>{children}</body></html>;
}
