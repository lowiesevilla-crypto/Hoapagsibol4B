"use client";

import { MessageCircleMore, Sparkles } from "lucide-react";
import { usePathname } from "next/navigation";

export function AiFloatingShortcut() {
  const pathname = usePathname();
  if (pathname === "/portal/ai" || pathname.startsWith("/portal/ai/") || pathname === "/portal/pay" || pathname.startsWith("/portal/pay/")) return null;

  return <a
    href="/portal/ai"
    aria-label="Open Association Assistant"
    title="Open Association Assistant"
    className="group fixed bottom-[calc(5.35rem+env(safe-area-inset-bottom))] right-5 z-[90] inline-flex size-16 items-center justify-center gap-2 rounded-full border-2 border-white bg-sky-700 text-white shadow-2xl shadow-slate-900/30 ring-4 ring-sky-100/80 transition hover:-translate-y-0.5 hover:bg-sky-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-200 sm:bottom-6 sm:right-6 sm:size-auto sm:min-h-14 sm:px-5 lg:bottom-7 lg:right-7"
  >
    <span className="relative grid size-7 place-items-center" aria-hidden="true">
      <MessageCircleMore className="size-7 sm:size-6" />
      <Sparkles className="absolute -right-1 -top-1 size-4 fill-white sm:size-3.5" />
    </span>
    <span className="sr-only sm:not-sr-only sm:whitespace-nowrap sm:text-sm sm:font-black">Ask AI</span>
  </a>;
}
