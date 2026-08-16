import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { AlertCircle, CheckCircle2, ChevronRight, Clock3, Download, FileCheck2, FileQuestion, MessageSquarePlus, Printer, Search, ShieldCheck } from "lucide-react";

export type RequestTone = "default" | "success" | "warning" | "danger" | "info";

const toneClasses: Record<RequestTone, string> = {
  default: "bg-white text-ink",
  success: "bg-emerald-50 text-emerald-900",
  warning: "bg-amber-50 text-amber-950",
  danger: "bg-rose-50 text-rose-900",
  info: "bg-blue-50 text-blue-950",
};

const statusClasses: Record<RequestTone, string> = {
  default: "bg-slate-100 text-slate-700",
  success: "bg-emerald-100 text-emerald-800",
  warning: "bg-amber-100 text-amber-900",
  danger: "bg-rose-100 text-rose-800",
  info: "bg-blue-100 text-blue-800",
};

export function RequestAreaNavigation({ active }: { active: "requests" | "documents" | "complaints" | "track" }) {
  const items = [
    { id: "requests", href: "/portal/requests", label: "Requests", icon: FileQuestion },
    { id: "documents", href: "/portal/documents", label: "Documents", icon: FileCheck2 },
    { id: "complaints", href: "/portal/complaints", label: "Complaints", icon: MessageSquarePlus },
    { id: "track", href: "/complaints/track", label: "Track", icon: Search },
  ] as const;
  return (
    <nav aria-label="Requests area">
      <div className="grid grid-cols-4 gap-2">
        {items.map(({ id, href, label, icon: Icon }) => {
          const selected = active === id;
          return <Link key={id} href={href} aria-current={selected ? "page" : undefined} className={`flex min-w-0 flex-col items-center gap-1 rounded-2xl px-2 py-2.5 text-[10px] font-black transition focus-visible:outline focus-visible:outline-4 focus-visible:outline-pine-500/20 ${selected ? "bg-pine-700 text-white shadow-sm" : "border border-slate-100 bg-white text-slate-500"}`}><Icon className="size-[18px]" aria-hidden="true" /><span className="max-w-full truncate">{label}</span></Link>;
        })}
      </div>
    </nav>
  );
}

export function RequestMetricCard({ label, value, note, icon: Icon, tone = "default" }: { label: string; value: string; note?: string; icon: LucideIcon; tone?: RequestTone }) {
  return <section className={`flex min-w-0 items-center gap-3 rounded-2xl border border-slate-100 p-3 shadow-[0_4px_18px_rgba(15,23,42,.04)] ${toneClasses[tone]}`} aria-label={note ? `${label}. ${note}` : label}><span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white text-pine-700 shadow-sm"><Icon className="size-4" aria-hidden="true" /></span><span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-black uppercase tracking-[.1em] text-slate-400">{label}</span><span className="mt-0.5 block truncate text-xl font-black tabular-nums text-ink">{value}</span></span></section>;
}

export function RequestStatusPill({ label, tone = "default" }: { label: string; tone?: RequestTone }) {
  return <span className={`inline-flex min-h-7 items-center rounded-full px-2.5 py-1 text-[10px] font-black ${statusClasses[tone]}`}>{label}</span>;
}

export function RequestProgressTracker({ status, kind = "document" }: { status: string; kind?: "document" | "complaint" }) {
  const normalized = status.toUpperCase().replace(/\s+/g, "_");
  const steps = kind === "complaint" ? ["SUBMITTED", "ACKNOWLEDGED", "UNDER_REVIEW", "RESOLVED"] : ["SUBMITTED", "PENDING_APPROVAL", "APPROVED", "GENERATED"];
  const completeStatuses = new Set(kind === "complaint" ? ["RESOLVED", "CLOSED"] : ["READY_FOR_DOWNLOAD", "GENERATED", "DOWNLOADED", "ISSUED"]);
  const failed = ["REJECTED", "CANCELLED", "REVOKED", "WITHDRAWN"].includes(normalized);
  const activeIndex = failed ? steps.length - 1 : completeStatuses.has(normalized) ? steps.length - 1 : Math.max(0, steps.findIndex((step) => normalized === step || normalized.includes(step)));
  return <ol className="mt-3 grid grid-cols-4 gap-1" aria-label={`${kind} progress`}>{steps.map((step, index) => { const done = index <= activeIndex && !failed; const current = index === activeIndex || failed && index === steps.length - 1; return <li key={step} title={failed && current ? "Stopped" : step.replaceAll("_", " ")}><span className={`block h-1.5 rounded-full ${failed && current ? "bg-rose-500" : done ? "bg-pine-700" : "bg-slate-200"}`} /></li>; })}</ol>;
}

export function DocumentRequestCard({ title, reference, status, statusTone, requested, subject, purpose, fee, paymentStatus, href, downloadHref, printHref }: { title: string; reference: string; status: string; statusTone: RequestTone; requested: string; subject: string; purpose: string; fee: string; paymentStatus: string; href?: string; downloadHref?: string; printHref?: string }) {
  return (
    <article className="rounded-2xl border border-slate-100 bg-white p-3.5 shadow-[0_4px_18px_rgba(15,23,42,.04)]">
      <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-pine-50 text-pine-700"><FileCheck2 className="size-[18px]" aria-hidden="true" /></span><div className="min-w-0 flex-1"><div className="flex min-w-0 items-start justify-between gap-2"><div className="min-w-0"><h3 className="truncate text-sm font-black text-ink">{title}</h3><p className="mt-0.5 truncate font-mono text-[10px] font-bold text-slate-400">{reference} · {requested}</p></div><RequestStatusPill label={status} tone={statusTone} /></div><RequestProgressTracker status={status} /><div className="mt-3 flex flex-wrap gap-1.5"><MetaChip>{subject}</MetaChip><MetaChip>{fee}</MetaChip><MetaChip>{paymentStatus}</MetaChip></div>{purpose && purpose !== "Official HOA request" && <p className="mt-2 line-clamp-1 text-xs text-slate-500">{purpose}</p>}<div className="mt-3 flex flex-wrap gap-2">{href && <Link className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-slate-100 px-3 text-xs font-black text-slate-700" href={href}><FileQuestion className="size-3.5" /> View</Link>}{downloadHref && <a className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-pine-700 px-3 text-xs font-black text-white" href={downloadHref}><Download className="size-3.5" /> Download</a>}{printHref && <Link className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-slate-100 px-3 text-xs font-black text-slate-700" href={printHref}><Printer className="size-3.5" /> Print</Link>}</div></div>{href && <ChevronRight className="mt-3 size-4 shrink-0 text-slate-300" aria-hidden="true" />}</div>
    </article>
  );
}

export function ComplaintRequestCard({ title, reference, status, statusTone, privacy, category, submitted, activity, href }: { title: string; reference: string; status: string; statusTone: RequestTone; privacy: string; category: string; submitted: string; activity: string; href: string }) {
  return <Link href={href} className="block focus-visible:outline focus-visible:outline-4 focus-visible:outline-pine-500/20"><article className="rounded-2xl border border-slate-100 bg-white p-3.5 shadow-[0_4px_18px_rgba(15,23,42,.04)]"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-pine-50 text-pine-700"><MessageSquarePlus className="size-[18px]" aria-hidden="true" /></span><div className="min-w-0 flex-1"><div className="flex min-w-0 items-start justify-between gap-2"><div className="min-w-0"><h3 className="truncate text-sm font-black text-ink">{title}</h3><p className="mt-0.5 truncate font-mono text-[10px] font-bold text-slate-400">{reference} · {submitted}</p></div><RequestStatusPill label={status} tone={statusTone} /></div><RequestProgressTracker status={status} kind="complaint" /><div className="mt-3 flex flex-wrap gap-1.5"><MetaChip>{privacy}</MetaChip><MetaChip>{category}</MetaChip><MetaChip>{activity}</MetaChip></div></div><ChevronRight className="mt-3 size-4 shrink-0 text-slate-300" aria-hidden="true" /></div></article></Link>;
}

export function RequestEmptyState({ title, description, icon: Icon = ShieldCheck }: { title: string; description: string; icon?: LucideIcon }) {
  return <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-center"><Icon className="mx-auto size-7 text-pine-600" aria-hidden="true" /><p className="mt-2 font-black text-ink">{title}</p><p className="mt-1 text-sm text-slate-400">{description}</p></div>;
}

export function RequestPageSkeleton() {
  return <div className="space-y-4"><div className="h-12 rounded-2xl bg-slate-100" /><div className="grid gap-2 md:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="h-20 rounded-2xl bg-slate-100" />)}</div><div className="h-80 rounded-2xl bg-slate-100" /></div>;
}

export function RequestSafeError({ title = "Requests temporarily unavailable", description = "Refresh the page and try again. No request was submitted." }: { title?: string; description?: string }) {
  return <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-rose-900"><p className="font-black">{title}</p><p className="mt-1 text-sm">{description}</p></div>;
}

export function requestTone(status: string): RequestTone {
  const normalized = status.toUpperCase();
  if (["READY_FOR_DOWNLOAD", "GENERATED", "DOWNLOADED", "ISSUED", "APPROVED", "RESOLVED", "CLOSED"].includes(normalized)) return "success";
  if (["REJECTED", "CANCELLED", "REVOKED", "FAILED", "WITHDRAWN"].includes(normalized)) return "danger";
  if (["PAYMENT_PENDING", "PENDING_PAYMENT", "PENDING_APPROVAL", "UNDER_REVIEW", "RETURNED_FOR_CORRECTION", "GENERATING"].includes(normalized)) return "warning";
  return "info";
}

export function statusLabel(status: string) {
  return status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function requestIconForStatus(status: string) {
  const tone = requestTone(status);
  if (tone === "success") return CheckCircle2;
  if (tone === "danger") return AlertCircle;
  if (tone === "warning") return Clock3;
  return FileQuestion;
}

function MetaChip({ children }: { children: React.ReactNode }) {
  return <span className="max-w-full truncate rounded-full bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-slate-500">{children}</span>;
}
