import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export function StatCard({ label, value, note, icon: Icon, href }: { label: string; value: string; note?: string; icon: LucideIcon; href?: string }) {
  const content = <><span className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-leaf-500 to-pine-500" /><span className="pointer-events-none absolute -bottom-10 -right-8 size-24 rounded-full bg-pine-50 transition-transform duration-300 group-hover:scale-125" /><div className="relative mb-4 flex items-start justify-between gap-3"><p className="text-sm font-bold text-slate-500">{label}</p><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-leaf-100 to-pine-100 text-pine-700 ring-1 ring-pine-100"><Icon className="size-5" /></span></div><p className="relative text-2xl font-black tracking-tight text-ink">{value}</p>{note && <p className="relative mt-1 text-xs leading-5 text-slate-400">{note}</p>}</>;
  const className = "card group relative block overflow-hidden transition hover:-translate-y-0.5 hover:border-pine-200 hover:shadow-lg";
  return href ? <Link href={href} className={className}>{content}</Link> : <div className={className}>{content}</div>;
}
