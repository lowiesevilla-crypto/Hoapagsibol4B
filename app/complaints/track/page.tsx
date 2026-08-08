import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ComplaintTrackForm } from "@/components/complaint-track-form";

export const metadata: Metadata = { title: "Track Complaint | HOAHub" };

export default function ComplaintTrackingPage() {
  return <main className="mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-7">
    <Link href="/" className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-xl border border-pine-200 bg-white px-4 text-sm font-black text-pine-800 shadow-sm hover:bg-pine-50 sm:hidden" aria-label="Back to homepage">
      <ArrowLeft className="size-4" aria-hidden="true" />
      Back to Home
    </Link>
    <header className="mb-6">
      <p className="text-xs font-black uppercase tracking-[.18em] text-pine-700">Anonymous tracking</p>
      <h1 className="text-3xl font-black text-pine-950">Track Complaint</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">Use the tracking code and PIN shown when the anonymous complaint was submitted.</p>
    </header>
    <ComplaintTrackForm />
  </main>;
}
