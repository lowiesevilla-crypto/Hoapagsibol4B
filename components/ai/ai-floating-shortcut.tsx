import { MessageCircleMore, Sparkles } from "lucide-react";
import Link from "next/link";

export function AiFloatingShortcut() {
  return <Link
    href="/portal/ai"
    aria-label="Open Association Assistant"
    title="Open Association Assistant"
    className="group fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] right-4 z-40 inline-flex min-h-14 items-center justify-center gap-2 rounded-full border border-pine-700/20 bg-pine-800 px-4 text-white shadow-xl shadow-slate-900/20 ring-4 ring-white/80 transition hover:-translate-y-0.5 hover:bg-pine-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-pine-200 sm:right-5 lg:bottom-7 lg:right-7"
  >
    <span className="relative grid size-7 place-items-center" aria-hidden="true">
      <MessageCircleMore className="size-6" />
      <Sparkles className="absolute -right-1 -top-1 size-3.5 fill-white" />
    </span>
    <span className="max-w-0 overflow-hidden whitespace-nowrap text-sm font-black opacity-0 transition-all duration-200 group-hover:max-w-32 group-hover:opacity-100 group-focus-visible:max-w-32 group-focus-visible:opacity-100 sm:max-w-32 sm:opacity-100">Ask HOAHub AI</span>
  </Link>;
}
