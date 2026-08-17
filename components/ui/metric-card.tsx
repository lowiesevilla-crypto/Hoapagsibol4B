import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type MetricTone = "blue" | "green" | "amber" | "red" | "violet" | "neutral";

const toneClasses: Record<MetricTone, { bar: string; icon: string; note: string }> = {
  blue: { bar: "bg-pine-500", icon: "bg-pine-50 text-pine-700", note: "text-pine-700" },
  green: { bar: "bg-leaf-600", icon: "bg-emerald-50 text-status-success", note: "text-status-success" },
  amber: { bar: "bg-amber-500", icon: "bg-amber-50 text-status-warning", note: "text-status-warning" },
  red: { bar: "bg-rose-600", icon: "bg-rose-50 text-status-critical", note: "text-status-critical" },
  violet: { bar: "bg-violet-600", icon: "bg-violet-50 text-status-ai", note: "text-status-ai" },
  neutral: { bar: "bg-slate-400", icon: "bg-slate-100 text-slate-700", note: "text-slate-600" },
};

export function MetricCard({
  label,
  value,
  note,
  icon: Icon,
  tone = "blue",
  href,
  footer,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  icon?: LucideIcon;
  tone?: MetricTone;
  href?: string;
  footer?: ReactNode;
}) {
  const style = toneClasses[tone];
  const content = (
    <article className="group relative min-w-0 overflow-hidden rounded-workspace border border-slate-200 bg-surface-card p-4 shadow-workspace transition sm:p-5">
      <span className={`absolute inset-y-4 left-0 w-1 rounded-r-full ${style.bar}`} aria-hidden="true" />
      <div className="flex items-start justify-between gap-3 pl-1">
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold uppercase tracking-[.12em] text-slate-500">{label}</p>
          <div className="mt-2 break-words text-2xl font-black tracking-tight text-pine-900 sm:text-3xl">{value}</div>
          {note ? <div className={`mt-1.5 text-xs font-bold leading-5 ${style.note}`}>{note}</div> : null}
        </div>
        {Icon ? <span className={`grid size-10 shrink-0 place-items-center rounded-2xl ${style.icon}`}><Icon className="size-5" aria-hidden="true" /></span> : null}
      </div>
      {footer ? <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">{footer}</div> : null}
    </article>
  );

  return href ? <Link href={href} className="block rounded-workspace focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-pine-500/20">{content}</Link> : content;
}
