import { Role } from "@prisma/client";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";
import { platformLinks } from "@/components/sidebar-links";
import { TransactionFeedback } from "@/components/transaction-feedback";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser(Role.PLATFORM_ADMIN);

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50">
      <Sidebar user={user} links={platformLinks} roleLabel={user.role.replaceAll("_", " ")} association={{ name: "HOAHub Platform", logoUrl: "/pagsibol-logo.png" }} />

      <Suspense>
        <TransactionFeedback />
      </Suspense>

      <main className="mx-auto min-w-0 max-w-[1800px] px-4 py-6 sm:px-7 lg:ml-72 lg:px-10 lg:py-9">
        {children}
      </main>

      <footer className="mx-auto max-w-[1800px] px-4 pb-6 text-xs text-slate-400 sm:px-7 lg:ml-72 lg:px-10">
        HOAHub™ v1.1 • Community Operating System • © 2026 Lowie Sevilla
      </footer>
    </div>
  );
}
