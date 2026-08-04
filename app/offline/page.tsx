import type { Metadata } from "next";
import Link from "next/link";
import { WifiOff } from "lucide-react";

export const metadata: Metadata = {
  title: "Offline",
  description: "Generic HOAHub offline fallback",
  robots: { index: false, follow: false, nocache: true },
};

export default function OfflinePage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-sand px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border border-pine-100 bg-white p-6 text-center shadow-soft">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-amber-50 text-amber-700">
          <WifiOff className="size-7" aria-hidden="true" />
        </span>
        <p className="mt-5 text-xs font-black uppercase tracking-[.16em] text-pine-700">Offline mode</p>
        <h1 className="mt-2 text-2xl font-black text-ink">HOAHub cannot reach the network.</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Reconnect to continue viewing homeowner balances, requests, payments, documents, and private portal data.
        </p>
        <Link href="/portal/dashboard" className="btn-primary mt-6">
          Try homeowner portal
        </Link>
      </section>
    </main>
  );
}
