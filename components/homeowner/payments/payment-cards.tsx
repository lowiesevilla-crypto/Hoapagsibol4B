import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { AlertCircle, CheckCircle2, ChevronRight, Clock3, CreditCard, FileText, Printer, QrCode, ReceiptText, ShieldCheck, WalletCards } from "lucide-react";
import { paymongoGatewayPresentation, paymongoGatewayStateFromRemark } from "@/lib/paymongo-gateway-status";

export type PaymentTone = "default" | "success" | "warning" | "danger" | "info";

const toneClasses: Record<PaymentTone, string> = {
  default: "bg-white text-ink",
  success: "bg-emerald-50 text-emerald-900",
  warning: "bg-amber-50 text-amber-950",
  danger: "bg-rose-50 text-rose-900",
  info: "bg-blue-50 text-blue-950",
};

const statusToneClasses: Record<PaymentTone, string> = {
  default: "bg-slate-100 text-slate-700",
  success: "bg-emerald-100 text-emerald-800",
  warning: "bg-amber-100 text-amber-900",
  danger: "bg-rose-100 text-rose-800",
  info: "bg-blue-100 text-blue-800",
};

export function PaymentAreaNavigation({ active }: { active: "pay" | "billing" | "soa" | "payments" | "collections" }) {
  const items = [
    { id: "pay", href: "/portal/pay", label: "Pay", icon: QrCode },
    { id: "billing", href: "/portal/billing", label: "Bills", icon: ReceiptText },
    { id: "soa", href: "/portal/soa", label: "SOA", icon: FileText },
    { id: "payments", href: "/portal/payments", label: "Receipts", icon: CreditCard },
    { id: "collections", href: "/portal/collections", label: "Other", icon: WalletCards },
  ] as const;
  return <nav aria-label="Payment area"><div className="grid grid-cols-5 gap-2">{items.map(({ id, href, label, icon: Icon }) => { const selected = active === id; const destination = id === "pay" && selected ? "#qr-payment" : href; return <Link key={id} href={destination} aria-current={selected ? "page" : undefined} className={`flex min-w-0 flex-col items-center gap-1 rounded-2xl px-1.5 py-2.5 text-[10px] font-black transition focus-visible:outline focus-visible:outline-4 focus-visible:outline-pine-500/20 ${selected ? "bg-pine-700 text-white shadow-sm" : "border border-slate-100 bg-white text-slate-500"}`}><Icon className="size-[18px]" aria-hidden="true" /><span className="max-w-full truncate">{label}</span></Link>; })}</div></nav>;
}

export function PaymentHeroCard({ amount, status, statusTone, collectionStatus, oldestCoverage, dueDate, availableCredit, pendingSummary, recentPayment }: { amount: string; status: string; statusTone: PaymentTone; collectionStatus: string; oldestCoverage?: string; dueDate?: string; availableCredit: string; pendingSummary: string; recentPayment: string }) {
  const Icon = statusTone === "success" ? CheckCircle2 : statusTone === "danger" || statusTone === "warning" ? AlertCircle : ReceiptText;
  return (
    <section className={`rounded-[1.6rem] border border-slate-100 p-4 shadow-[0_8px_28px_rgba(15,23,42,.06)] sm:p-5 ${toneClasses[statusTone]}`} aria-label="Payment overview">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white text-pine-700 shadow-sm"><Icon className="size-5" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[.13em] text-slate-400">Balance</p><p className="mt-1 break-words text-3xl font-black tabular-nums text-ink sm:text-4xl">{amount}</p><div className="mt-2 flex flex-wrap gap-1.5"><StatusPill label={status} tone={statusTone} /><StatusPill label={collectionStatus} tone="default" /></div></div>
        <Link href="/portal/pay#qr-payment" className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl bg-pine-700 px-3 text-xs font-black text-white shadow-sm"><QrCode className="size-4" /> Pay</Link>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-black/5 pt-3 sm:grid-cols-4"><PaymentMiniStat label="Oldest due" value={oldestCoverage || "None"} /><PaymentMiniStat label="Due date" value={dueDate || "Not due"} /><PaymentMiniStat label="Credit" value={availableCredit} /><PaymentMiniStat label="In progress" value={pendingSummary} /></dl>
      <div className="mt-3 flex flex-wrap gap-2"><PaymentAction href="/portal/soa" label="Statement" icon={FileText} /><PaymentAction href="/portal/payments" label="History" icon={CreditCard} /><PaymentAction href="/portal/payments#receipts" label="Receipts" icon={Printer} /></div>
      <span className="sr-only">Recent successful payment: {recentPayment}</span>
    </section>
  );
}

export function PaymentMetricCard({ label, value, note, icon: Icon, tone = "default", href }: { label: string; value: string; note?: string; icon: LucideIcon; tone?: PaymentTone; href?: string }) {
  const content = <div className="flex min-w-0 items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-pine-700 shadow-sm"><Icon className="size-4" aria-hidden="true" /></span><span className="min-w-0 flex-1"><span className="block truncate text-[9px] font-black uppercase tracking-[.1em] text-slate-400">{label}</span><span className="mt-0.5 block truncate text-lg font-black tabular-nums text-ink">{value}</span></span></div>;
  const className = `block rounded-2xl border border-slate-100 p-3 shadow-[0_4px_16px_rgba(15,23,42,.04)] ${toneClasses[tone]}`;
  return href ? <Link href={href} aria-label={note ? `${label}. ${note}` : label} className={className}>{content}</Link> : <section aria-label={note ? `${label}. ${note}` : label} className={className}>{content}</section>;
}

export function UnpaidBillingCard({ title, coverage, dueDate, originalAmount, paidAmount, balance, status, selectable, pending }: { title: string; coverage: string; dueDate: string; originalAmount: string; paidAmount: string; balance: string; status: string; selectable?: boolean; pending?: boolean }) {
  return <article className="rounded-2xl border border-slate-100 bg-white p-3.5 shadow-[0_4px_16px_rgba(15,23,42,.04)]"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-pine-50 text-pine-700"><ReceiptText className="size-[18px]" aria-hidden="true" /></span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="truncate text-sm font-black text-ink">{title}</h3><p className="mt-0.5 text-xs font-semibold text-slate-400">{coverage} · Due {dueDate}</p></div><StatusPill label={pending ? "In Progress" : status} tone={pending ? "warning" : "info"} /></div><div className="mt-3 flex items-end justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-wide text-slate-400">Remaining</p><p className="text-lg font-black tabular-nums text-ink">{balance}</p></div><div className="text-right text-[10px] font-semibold text-slate-400"><p>Original {originalAmount}</p><p>Paid {paidAmount}</p></div></div>{selectable && !pending && <p className="mt-2 text-[10px] font-bold text-pine-700">Available to select below</p>}</div></div></article>;
}

export function PaymentRequestStatusCard({ title, amount, status, statusTone, meta, reference, method, remarks, proofLabel }: { title: string; amount: string; status: string; statusTone: PaymentTone; meta: string; reference: string; method: string; remarks?: string | null; proofLabel?: string }) {
  const online = method === "PayMongo Online";
  const gatewayState = online ? paymongoGatewayStateFromRemark(remarks) : null;
  const gateway = gatewayState ? paymongoGatewayPresentation(gatewayState) : null;
  const awaitingPayment = online && (status === "Awaiting PayMongo" || status === "Awaiting Payment");
  const rejectedOnline = online && status === "REJECTED";
  const cancelledOnline = rejectedOnline && /cancel/i.test(remarks || "");
  const displayStatus = gateway?.label || (awaitingPayment ? "Awaiting Payment" : rejectedOnline ? cancelledOnline ? "Payment Cancelled" : "Payment Unsuccessful" : status);
  const displayTone = (gateway?.tone || statusTone) as PaymentTone;
  const requestId = reference.startsWith("HOP-") ? reference.slice(4) : "";
  const safeRemarks = remarks?.startsWith("PAYMONGO_CHECKOUT_SESSION:") || gatewayState ? null : remarks;
  const canResume = Boolean(requestId && (gateway ? gateway.canResume : awaitingPayment));
  return <article className="rounded-2xl border border-slate-100 bg-white p-3.5 shadow-[0_4px_16px_rgba(15,23,42,.04)]"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-pine-50 text-pine-700"><Clock3 className="size-[18px]" aria-hidden="true" /></span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="truncate text-sm font-black text-ink">{title}</h3><p className="mt-0.5 truncate text-[10px] font-bold text-slate-400">{meta}</p></div><StatusPill label={displayStatus} tone={displayTone} /></div><div className="mt-3 flex flex-wrap items-center gap-1.5"><MetaChip>{amount}</MetaChip><MetaChip>{online ? "Online Payment" : method}</MetaChip><MetaChip>{reference}</MetaChip>{proofLabel && <MetaChip>{proofLabel}</MetaChip>}</div>{safeRemarks && <p className="mt-2 line-clamp-2 text-xs font-semibold text-slate-500">{safeRemarks}</p>}{canResume && <Link href={`/portal/pay/paymongo-resume?requestId=${encodeURIComponent(requestId)}`} className="mt-3 inline-flex min-h-10 items-center rounded-xl bg-blue-700 px-3 text-xs font-black text-white">Continue / Retry Payment</Link>}{rejectedOnline && !canResume && <Link href="/portal/pay#qr-payment" className="mt-3 inline-flex min-h-10 items-center rounded-xl bg-pine-700 px-3 text-xs font-black text-white">New Payment</Link>}</div></div></article>;
}

export function PaymentHistoryCard({ href, receipt, amount, date, method, reference, coverage, status }: { href?: string; receipt: string; amount: string; date: string; method: string; reference: string; coverage: string; status: string }) {
  const content = <article className="rounded-2xl border border-slate-100 bg-white p-3.5 shadow-[0_4px_16px_rgba(15,23,42,.04)]"><div className="flex items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-pine-50 text-pine-700"><CreditCard className="size-[18px]" aria-hidden="true" /></span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-mono text-xs font-black text-pine-700">{receipt}</h3><p className="mt-0.5 truncate text-[10px] font-bold text-slate-400">{date} · {method}</p></div><p className="shrink-0 text-base font-black tabular-nums text-ink">{amount}</p></div><p className="mt-2 truncate text-xs font-semibold text-slate-600">{coverage}</p><div className="mt-2 flex items-center gap-1.5"><StatusPill label={status} tone={status === "VOIDED" || status === "Void" ? "danger" : "success"} /><MetaChip>{reference}</MetaChip></div></div>{href && <ChevronRight className="size-4 shrink-0 text-slate-300" />}</div></article>;
  return href ? <Link href={href} className="block focus-visible:outline focus-visible:outline-4 focus-visible:outline-pine-500/20">{content}</Link> : content;
}

export function CollectionCard({ href, title, date, amount, refunded, balance, status, reference, remarks }: { href?: string; title: string; date: string; amount: string; refunded: string; balance: string; status: string; reference: string; remarks?: string | null }) {
  const content = <article className="rounded-2xl border border-slate-100 bg-white p-3.5 shadow-[0_4px_16px_rgba(15,23,42,.04)]"><div className="flex items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-pine-50 text-pine-700"><WalletCards className="size-[18px]" aria-hidden="true" /></span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="truncate text-sm font-black text-ink">{title}</h3><p className="mt-0.5 truncate text-[10px] font-bold text-slate-400">{date} · {reference}</p></div><StatusPill label={status} tone="info" /></div><div className="mt-2 flex flex-wrap gap-1.5"><MetaChip>{amount}</MetaChip><MetaChip>Refunded {refunded}</MetaChip><MetaChip>Held {balance}</MetaChip></div>{remarks && <p className="mt-2 line-clamp-1 text-xs text-slate-500">{remarks}</p>}</div>{href && <ChevronRight className="size-4 shrink-0 text-slate-300" />}</div></article>;
  return href ? <Link href={href} className="block focus-visible:outline focus-visible:outline-4 focus-visible:outline-pine-500/20">{content}</Link> : content;
}

export function PaymentEmptyState({ title, description, icon: Icon = ShieldCheck }: { title: string; description: string; icon?: LucideIcon }) {
  return <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-center"><Icon className="mx-auto size-7 text-pine-600" aria-hidden="true" /><p className="mt-2 font-black text-ink">{title}</p><p className="mt-1 text-sm text-slate-400">{description}</p></div>;
}

export function PaymentPageSkeleton() {
  return <div className="space-y-4"><div className="h-12 rounded-2xl bg-slate-100" /><div className="h-48 rounded-2xl bg-slate-100" /><div className="grid grid-cols-2 gap-2 md:grid-cols-4">{[1, 2, 3, 4].map((item) => <div key={item} className="h-20 rounded-2xl bg-slate-100" />)}</div><div className="h-80 rounded-2xl bg-slate-100" /></div>;
}

export function PaymentSafeError({ title = "Payments temporarily unavailable", description = "Refresh the page and try again. No payment was submitted." }: { title?: string; description?: string }) {
  return <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-rose-900"><p className="font-black">{title}</p><p className="mt-1 text-sm">{description}</p></div>;
}

export function StatusPill({ label, tone = "default" }: { label: string; tone?: PaymentTone }) {
  return <span className={`inline-flex min-h-7 items-center rounded-full px-2.5 py-1 text-[10px] font-black ${statusToneClasses[tone]}`}>{label}</span>;
}

function PaymentAction({ href, label, icon: Icon }: { href: string; label: string; icon: LucideIcon }) {
  return <Link href={href} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-white/80 px-2.5 text-[11px] font-black text-pine-700 ring-1 ring-black/5 focus-visible:outline focus-visible:outline-4 focus-visible:outline-pine-500/20"><Icon className="size-3.5" aria-hidden="true" />{label}</Link>;
}

function PaymentMiniStat({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-[9px] font-black uppercase tracking-[.08em] text-slate-400">{label}</dt><dd className="mt-0.5 truncate text-xs font-black text-ink">{value}</dd></div>;
}

function MetaChip({ children }: { children: React.ReactNode }) {
  return <span className="max-w-full truncate rounded-full bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-slate-500">{children}</span>;
}
