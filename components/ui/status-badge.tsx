import type { ReactNode } from "react";

export type StatusTone = "success" | "info" | "warning" | "critical" | "ai" | "neutral";

const toneClasses: Record<StatusTone, string> = {
  success: "bg-emerald-50 text-status-success ring-emerald-200/80",
  info: "bg-sky-50 text-status-info ring-sky-200/80",
  warning: "bg-amber-50 text-status-warning ring-amber-200/80",
  critical: "bg-rose-50 text-status-critical ring-rose-200/80",
  ai: "bg-violet-50 text-status-ai ring-violet-200/80",
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
};

export function StatusBadge({ children, tone = "neutral", className = "" }: { children: ReactNode; tone?: StatusTone; className?: string }) {
  return (
    <span className={`inline-flex min-h-7 items-center rounded-full px-2.5 py-1 text-xs font-black ring-1 ring-inset ${toneClasses[tone]} ${className}`}>
      {children}
    </span>
  );
}
