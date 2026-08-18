import { Role } from "@prisma/client";
import { Suspense } from "react";
import { PlatformTopbar } from "@/components/platform-topbar";
import { Sidebar } from "@/components/sidebar";
import { platformLinks } from "@/components/sidebar-links";
import { TransactionFeedback } from "@/components/transaction-feedback";
import { requireUser } from "@/lib/auth";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser(Role.PLATFORM_ADMIN);
  const roleLabel = user.role.replaceAll("_", " ");

  return (
    <div className="min-h-screen overflow-x-hidden bg-surface-canvas print:bg-white">
      <div className="print:hidden">
        <Sidebar
          user={user}
          links={platformLinks}
          roleLabel={roleLabel}
          association={{ name: "HOAHub Platform", logoUrl: "/Hoahub-logo.png" }}
        />
      </div>

      <Suspense>
        <TransactionFeedback />
      </Suspense>

      <div className="min-w-0 lg:ml-72 print:ml-0">
        <div className="print:hidden">
          <PlatformTopbar userName={user.name} roleLabel={roleLabel} />
        </div>
        <main className="mx-auto min-w-0 max-w-[1800px] px-4 py-6 sm:px-7 lg:px-10 lg:py-9 print:max-w-none print:p-0">
          {children}
        </main>

        <footer className="mx-auto max-w-[1800px] px-4 pb-6 text-xs text-slate-400 sm:px-7 lg:px-10 print:hidden">
          HOAHub™ v1.1 • Community Intelligence OS • © 2026 Lowie Sevilla
        </footer>
      </div>
    </div>
  );
}
