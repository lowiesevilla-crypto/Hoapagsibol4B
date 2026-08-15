"use client";

import { usePathname } from "next/navigation";
import { InstallHoaHubBanner } from "@/components/pwa-install-provider";

export function PublicPwaInstallBanner() {
  const pathname = usePathname() || "/";
  if (pathname !== "/") return null;
  return <div className="lg:hidden"><InstallHoaHubBanner /></div>;
}
