import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type MetricTone = "blue" | "green" | "amber" | "red" | "violet" | "neutral";

const toneClasses: Record<MetricTone, { icon: string; note: string; ring: string }> = {
  blue: { icon: "bg-[#eaf6ff] text-[#0872ae]", note: "text-[#5d7a8b]", ring: "ring-[#d9edf8]" },
  green: { icon: "bg-[#e9f8ee] text-status-success", note: "text-[#5d7a8b]", ring: "ring-[#d7eedf]" },
  amber: { icon: "bg-[#fff4dd] text-status-warning", note: "text-[#6f8294]", ring: "ring-[#f7e4b9]" },
  red: { icon: "bg-[#ffe9ec] text-status-critical", note: "text-[#6f8294]", ring: "ring-[#f6d4da]" },
  violet: { icon: "bg-[#f0edff] text-status-ai", note: "text-[#6f8294]", ring: "ring-[#dfd9ff]" },
  neutral: { icon: "bg-slate-100 text-slate-700", note: "text-[#6f8294]", ring: "ring-slate-200" },
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
    <article className="ui-metric-card group relative min-w-0 overflow-hidden rounded-[22px] border border-[#dbe7ee] bg-white p-[19px] shadow-[0_8px_24px_rgba(22,65,87,.055)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_34px_rgba(22,65,87,.09)] motion-reduce:hover:translate-y-0 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[.13em] text-[#7c8fa0] sm:text-[11px]">{label}</p>
          <div className="mt-2 break-words text-[26px] font-black tracking-[-.035em] text-[#0c3248] sm:text-[29px]">{value}</div>
          {note ? <div className={`mt-1.5 text-[12px] font-bold leading-5 ${style.note}`}>{note}</div> : null}
        </div>
        {Icon ? <span className={`grid size-10 shrink-0 place-items-center rounded-[14px] ring-1 ring-inset ${style.icon} ${style.ring}`}><Icon className="size-[18px]" aria-hidden="true" /></span> : null}
      </div>
      {footer ? <div className="mt-4 border-t border-[#edf2f5] pt-3 text-xs text-[#6f8294]">{footer}</div> : null}
    </article>
  );

  return href ? <Link href={href} className="block rounded-[22px] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#0b95d8]/20">{content}</Link> : content;
}
