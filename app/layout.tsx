import type { Metadata } from "next";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Pagsibol Village PH2 4B East", template: "%s | Pagsibol Village PH2 4B East" },
  description: "Secure homeowner billing and community portal",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
