import { Role } from "@prisma/client";
import { Suspense } from "react";
import { LogOut } from "lucide-react";
import Link from "next/link";
import { logoutAction } from "@/lib/actions/auth";
import { requireUser } from "@/lib/auth";
import { TransactionFeedback } from "@/components/transaction-feedback";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (user.role !== Role.SUPER_ADMIN && user.role !== Role.PLATFORM_ADMIN) return null;

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50">
      <header className="sticky top-0 z-30 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-7">
          <div>
            <Link href="/platform/tenants" className="text-xl font-black text-pine-900">HOA Digital Hub</Link>
            <p className="text-xs font-bold uppercase tracking-wider text-leaf-700">Platform Administration</p>
          </div>
          <nav className="flex flex-wrap items-center justify-end gap-2">
            <Link href="/platform/tenants" className="rounded-xl px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100">Tenants</Link>
            <span className="hidden rounded-xl bg-pine-50 px-3 py-2 text-sm font-semibold text-pine-900 sm:block">
              {user.name} · {user.role.replaceAll("_", " ")}
            </span>
            <form action={logoutAction}>
              <button type="submit" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700">
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Log out
              </button>
            </form>
          </nav>
        </div>
      </header>
      <Suspense><TransactionFeedback /></Suspense>
      <main className="mx-auto min-w-0 max-w-[1500px] p-4 sm:p-7 lg:p-9">{children}</main>
    </div>
  );
}
