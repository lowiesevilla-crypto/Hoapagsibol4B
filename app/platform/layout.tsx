import { Role } from "@prisma/client";
import { Suspense } from "react";
import { LogOut } from "lucide-react";
import Link from "next/link";
import { logoutAction } from "@/lib/actions/auth";
import { requireUser } from "@/lib/auth";
import { TransactionFeedback } from "@/components/transaction-feedback";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  if (user.role !== Role.SUPER_ADMIN && user.role !== Role.PLATFORM_ADMIN) {
    return null;
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50">
      <header className="sticky top-0 z-30 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-7">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-pine-700 to-emerald-600 text-xl font-black text-white shadow-lg">
              H
            </div>

            <div>
              <Link
                href="/platform/tenants"
                className="text-2xl font-black tracking-tight text-pine-900"
              >
                HOAHub™
              </Link>

              <p className="text-sm font-semibold text-emerald-700">
                Community Operating System
              </p>

              <p className="text-xs uppercase tracking-[0.25em] text-slate-500">
                Platform Administration • Version 1.1
              </p>
            </div>
          </div>

          <nav className="flex flex-wrap items-center justify-end gap-2">
            <Link
              href="/platform/tenants"
              className="rounded-xl px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100"
            >
              Tenants
            </Link>

            <span className="hidden rounded-xl bg-pine-50 px-3 py-2 text-sm font-semibold text-pine-900 sm:block">
              {user.name} · {user.role.replaceAll("_", " ")}
            </span>

            <form action={logoutAction}>
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Log out
              </button>
            </form>
          </nav>
        </div>
      </header>

      <Suspense>
        <TransactionFeedback />
      </Suspense>

      <main className="mx-auto min-w-0 max-w-[1500px] p-4 sm:p-7 lg:p-9">
        {children}
      </main>

      <footer className="mx-auto max-w-[1500px] px-4 pb-6 text-xs text-slate-400 sm:px-7 lg:px-9">
        HOAHub™ v1.1 • Community Operating System • © 2026 Lowie Sevilla
      </footer>
    </div>
  );
}