import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { AlertCircle, CheckCircle2, ChevronRight, Clock3, Download, FileCheck2, FileQuestion, MessageSquarePlus, Printer, Search, ShieldCheck } from "lucide-react";

export type RequestTone = "default" | "success" | "warning" | "danger" | "info";

const toneClasses: Record<RequestTone, string> = {
  default: "border-pine-100 bg-white text-ink",
  success: "border-emerald-100 bg-emerald-50 text-emerald-900",
  warning: "border-amber-100 bg-amber-50 text-amber-950",
  danger: "border-rose-100 bg-rose-50 text-rose-900",
  info: "border-blue-100 bg-blue-50 text-blue-950",
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
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {items.map(({ id, href, label, icon: Icon }) => {
          const selected = active === id;
          return (
            <Link key={id} href={href} aria-current={selected ? "page" : undefined} className={`inline-flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-2xl border px-3 text-sm font-black transition focus-visible:outline focus-visible:outline-4 focus-visible:outline-pine-500/20 ${selected ? "border-pine-700 bg-pine-700 text-white shadow-brand" : "border-pine-100 bg-white text-slate-600 hover:bg-pine-50 hover:text-pine-700"}`}>
              <Icon className="size-4" aria-hidden="true" />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function RequestMetricCard({ label, value, note, icon: Icon, tone = "default" }: { label: string; value: string; note?: string; icon: LucideIcon; tone?: RequestTone }) {
  return (
    <section className={`rounded-3xl border p-4 shadow-sm ${toneClasses[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[.14em] text-slate-500">{label}</p>
          <p className="mt-2 break-words text-2xl font-black tabular-nums text-ink">{value}</p>
          {note && <p className="mt-1 text-xs leading-5 text-slate-500">{note}</p>}
        </div>
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white text-pine-700 shadow-sm ring-1 ring-pine-100"><Icon className="size-5" aria-hidden="true" /></span>
      </div>
    </section>
  );
}

export function RequestStatusPill({ label, tone = "default" }: { label: string; tone?: RequestTone }) {
  return <span className={`inline-flex min-h-8 items-center rounded-full px-3 py-1 text-xs font-black ${statusClasses[tone]}`}>{label}</span>;
}

export function RequestProgressTracker({ status, kind = "document" }: { status: string; kind?: "document" | "complaint" }) {
  const normalized = status.toUpperCase().replace(/\s+/g, "_");
  const steps = kind === "complaint"
    ? ["SUBMITTED", "ACKNOWLEDGED", "UNDER_REVIEW", "RESOLVED"]
    : ["SUBMITTED", "PENDING_APPROVAL", "APPROVED", "GENERATED"];
  const completeStatuses = new Set(kind === "complaint" ? ["RESOLVED", "CLOSED"] : ["READY_FOR_DOWNLOAD", "GENERATED", "DOWNLOADED", "ISSUED"]);
  const failed = ["REJECTED", "CANCELLED", "REVOKED", "WITHDRAWN"].includes(normalized);
  const activeIndex = failed ? steps.length - 1 : completeStatuses.has(normalized) ? steps.length - 1 : Math.max(0, steps.findIndex((step) => normalized === step || normalized.includes(step)));
  return (
    <ol className="mt-3 grid grid-cols-4 gap-1 text-[10px] font-black uppercase tracking-[.08em]" aria-label={`${kind} progress`}>
      {steps.map((step, index) => {
        const done = index <= activeIndex && !failed;
        const current = index === activeIndex || failed && index === steps.length - 1;
        return (
          <li key={step} className="min-w-0">
            <span className={`block h-1.5 rounded-full ${failed && current ? "bg-rose-500" : done ? "bg-pine-700" : "bg-slate-200"}`} />
            <span className={`mt-1 block truncate ${current ? "text-pine-800" : "text-slate-400"}`}>{failed && current ? "Stopped" : step.replaceAll("_", " ")}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function DocumentRequestCard({
  title,
  reference,
  status,
  statusTone,
  requested,
  subject,
  purpose,
  fee,
  paymentStatus,
  href,
  downloadHref,
  printHref,
}: {
  title: string;
  reference: string;
  status: string;
  statusTone: RequestTone;
  requested: string;
  subject: string;
  purpose: string;
  fee: string;
  paymentStatus: string;
  href?: string;
  downloadHref?: string;
  printHref?: string;
}) {
  return (
    <article className="rounded-3xl border border-pine-100 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-pine-50 text-pine-700"><FileCheck2 className="size-5" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="break-words font-black text-ink">{title}</h3>
              <p className="mt-1 font-mono text-xs font-bold text-slate-500">{reference} · {requested}</p>
            </div>
            <RequestStatusPill label={status} tone={statusTone} />
          </div>
          <RequestProgressTracker status={status} />
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <CompactField label="Subject" value={subject} />
            <CompactField label="Fee" value={fee} />
            <CompactField label="Payment" value={paymentStatus} />
            <CompactField label="Purpose" value={purpose} />
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            {href && <Link className="btn-secondary min-h-10 px-3 py-1.5 text-xs" href={href}><FileQuestion className="size-4" /> View</Link>}
            {downloadHref && <a className="btn-primary min-h-10 px-3 py-1.5 text-xs" href={downloadHref}><Download className="size-4" /> Download</a>}
            {printHref && <Link className="btn-secondary min-h-10 px-3 py-1.5 text-xs" href={printHref}><Printer className="size-4" /> Print</Link>}
          </div>
        </div>
        {href && <ChevronRight className="mt-3 size-4 shrink-0 text-slate-300" aria-hidden="true" />}
      </div>
    </article>
  );
}

export function ComplaintRequestCard({ title, reference, status, statusTone, privacy, category, submitted, activity, href }: { title: string; reference: string; status: string; statusTone: RequestTone; privacy: string; category: string; submitted: string; activity: string; href: string }) {
  return (
    <Link href={href} className="block focus-visible:outline focus-visible:outline-4 focus-visible:outline-pine-500/20">
      <article className="rounded-3xl border border-pine-100 bg-white p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-pine-50 text-pine-700"><MessageSquarePlus className="size-5" aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="break-words font-black text-ink">{title}</h3>
                <p className="mt-1 font-mono text-xs font-bold text-slate-500">{reference} · {submitted}</p>
              </div>
              <RequestStatusPill label={status} tone={statusTone} />
            </div>
            <RequestProgressTracker status={status} kind="complaint" />
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <CompactField label="Privacy" value={privacy} />
              <CompactField label="Category" value={category} />
              <CompactField label="Activity" value={activity} />
              <CompactField label="Latest" value="Open case details" />
            </dl>
          </div>
          <ChevronRight className="mt-3 size-4 shrink-0 text-slate-300" aria-hidden="true" />
        </div>
      </article>
    </Link>
  );
}

export function RequestEmptyState({ title, description, icon: Icon = ShieldCheck }: { title: string; description: string; icon?: LucideIcon }) {
  return (
    <div className="rounded-3xl border border-dashed border-pine-100 bg-white p-6 text-center">
      <Icon className="mx-auto size-9 text-pine-600" aria-hidden="true" />
      <p className="mt-3 font-black text-ink">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}

export function RequestPageSkeleton() {
  return (
    <div className="space-y-5">
      <div className="h-14 rounded-3xl bg-slate-100" />
      <div className="grid gap-3 md:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="h-32 rounded-3xl bg-slate-100" />)}</div>
      <div className="h-96 rounded-3xl bg-slate-100" />
    </div>
  );
}

export function RequestSafeError({ title = "Requests temporarily unavailable", description = "Refresh the page and try again. No request was submitted." }: { title?: string; description?: string }) {
  return <div className="rounded-3xl border border-rose-100 bg-rose-50 p-5 text-rose-900"><p className="font-black">{title}</p><p className="mt-1 text-sm leading-6">{description}</p></div>;
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

function CompactField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-black uppercase tracking-[.12em] text-slate-400">{label}</dt>
      <dd className="mt-1 break-words font-bold text-slate-700">{value}</dd>
    </div>
  );
}
