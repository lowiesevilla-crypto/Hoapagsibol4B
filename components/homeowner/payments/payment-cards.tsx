import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { AlertCircle, CheckCircle2, ChevronRight, Clock3, CreditCard, FileText, Printer, QrCode, ReceiptText, ShieldCheck, WalletCards } from "lucide-react";

export type PaymentTone = "default" | "success" | "warning" | "danger" | "info";

const toneClasses: Record<PaymentTone, string> = {
  default: "border-pine-100 bg-white text-ink",
  success: "border-emerald-100 bg-emerald-50 text-emerald-900",
  warning: "border-amber-100 bg-amber-50 text-amber-950",
  danger: "border-rose-100 bg-rose-50 text-rose-900",
  info: "border-blue-100 bg-blue-50 text-blue-950",
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
  return (
    <nav aria-label="Payment area">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {items.map(({ id, href, label, icon: Icon }) => {
          const selected = active === id;
          const destination = id === "pay" && selected ? "#qr-payment" : href;
          return (
            <Link key={id} href={destination} aria-current={selected ? "page" : undefined} className={`inline-flex min-h-12 min-w-0 items-center justify-center gap-1 rounded-2xl border px-2 text-xs font-black transition focus-visible:outline focus-visible:outline-4 focus-visible:outline-pine-500/20 sm:gap-2 sm:px-4 sm:text-sm ${selected ? "border-pine-700 bg-pine-700 text-white shadow-brand" : "border-pine-100 bg-white text-slate-600 hover:bg-pine-50 hover:text-pine-700"}`}>
              <Icon className="size-4" aria-hidden="true" />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function PaymentHeroCard({
  amount,
  status,
  statusTone,
  collectionStatus,
  oldestCoverage,
  dueDate,
  availableCredit,
  pendingSummary,
  recentPayment,
}: {
  amount: string;
  status: string;
  statusTone: PaymentTone;
  collectionStatus: string;
  oldestCoverage?: string;
  dueDate?: string;
  availableCredit: string;
  pendingSummary: string;
  recentPayment: string;
}) {
  const Icon = statusTone === "success" ? CheckCircle2 : statusTone === "danger" || statusTone === "warning" ? AlertCircle : ReceiptText;
  return (
    <section className={`rounded-3xl border p-5 shadow-soft sm:p-6 ${toneClasses[statusTone]}`} aria-label="Payment overview">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[.16em] text-pine-700">Current Balance</p>
          <p className="mt-3 break-words text-4xl font-black tracking-normal text-ink tabular-nums sm:text-5xl">{amount}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusPill label={status} tone={statusTone} />
            <StatusPill label={collectionStatus} tone="default" />
          </div>
        </div>
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white text-pine-700 shadow-sm ring-1 ring-pine-100">
          <Icon className="size-7" aria-hidden="true" />
        </span>
      </div>
      <dl className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <PaymentMiniStat label="Oldest unpaid coverage" value={oldestCoverage || "None"} />
        <PaymentMiniStat label="Due date" value={dueDate || "Not due"} />
        <PaymentMiniStat label="Available credit" value={availableCredit} />
        <PaymentMiniStat label="Payments in progress" value={pendingSummary} />
      </dl>
      <div className="mt-4 rounded-2xl bg-white/70 p-3 text-sm font-semibold text-slate-700">
        Recent successful payment: <span className="font-black text-ink">{recentPayment}</span>
      </div>
      <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <PaymentAction href="/portal/pay#qr-payment" label="Pay Now" icon={QrCode} primary />
        <PaymentAction href="/portal/soa" label="View Statement" icon={FileText} />
        <PaymentAction href="/portal/payments" label="Payment History" icon={CreditCard} />
        <PaymentAction href="/portal/payments#receipts" label="Digital Receipts" icon={Printer} />
      </div>
    </section>
  );
}

export function PaymentMetricCard({ label, value, note, icon: Icon, tone = "default", href }: { label: string; value: string; note?: string; icon: LucideIcon; tone?: PaymentTone; href?: string }) {
  const content = (
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[.14em] text-slate-500">{label}</p>
          <p className="mt-2 break-words text-2xl font-black tabular-nums text-ink">{value}</p>
          {note && <p className="mt-1 text-xs leading-5 text-slate-500">{note}</p>}
        </div>
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white text-pine-700 shadow-sm ring-1 ring-pine-100"><Icon className="size-5" aria-hidden="true" /></span>
      </div>
  );
  const className = `block rounded-3xl border p-4 shadow-sm ${toneClasses[tone]}`;
  return href
    ? <Link href={href} className={`${className} transition hover:-translate-y-0.5 hover:shadow-soft focus-visible:outline focus-visible:outline-4 focus-visible:outline-pine-500/20`}>{content}</Link>
    : <section className={className}>{content}</section>;
}

export function UnpaidBillingCard({
  title,
  coverage,
  dueDate,
  originalAmount,
  paidAmount,
  balance,
  status,
  selectable,
  pending,
}: {
  title: string;
  coverage: string;
  dueDate: string;
  originalAmount: string;
  paidAmount: string;
  balance: string;
  status: string;
  selectable?: boolean;
  pending?: boolean;
}) {
  return (
    <article className="rounded-3xl border border-pine-100 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-pine-50 text-pine-700"><ReceiptText className="size-5" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="break-words font-black text-ink">{title}</h3>
              <p className="mt-1 text-sm font-semibold text-slate-500">{coverage}</p>
            </div>
            <StatusPill label={pending ? "Payment In Progress" : status} tone={pending ? "warning" : "info"} />
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <CompactField label="Due date" value={dueDate} />
            <CompactField label="Original" value={originalAmount} />
            <CompactField label="Paid / applied" value={paidAmount} />
            <CompactField label="Remaining" value={balance} strong />
          </dl>
          {selectable && <p className="mt-3 text-xs font-bold text-pine-700">{pending ? "Selection disabled while a payment is in progress. Continue it from Payment Status." : "Selectable in the payment form below."}</p>}
        </div>
      </div>
    </article>
  );
}

export function PaymentRequestStatusCard({
  title,
  amount,
  status,
  statusTone,
  meta,
  reference,
  method,
  remarks,
  proofLabel,
}: {
  title: string;
  amount: string;
  status: string;
  statusTone: PaymentTone;
  meta: string;
  reference: string;
  method: string;
  remarks?: string | null;
  proofLabel?: string;
}) {
  const online = method === "PayMongo Online";
  const awaitingPayment = online && (status === "Awaiting PayMongo" || status === "Awaiting Payment");
  const rejectedOnline = online && status === "REJECTED";
  const cancelledOnline = rejectedOnline && /cancel/i.test(remarks || "");
  const displayStatus = awaitingPayment
    ? "Awaiting Payment"
    : rejectedOnline
      ? cancelledOnline ? "Payment Cancelled" : "Payment Unsuccessful"
      : status;
  const requestId = reference.startsWith("HOP-") ? reference.slice(4) : "";
  const safeRemarks = remarks?.startsWith("PAYMONGO_CHECKOUT_SESSION:") ? null : remarks;

  return (
    <article className="rounded-3xl border border-pine-100 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-pine-50 text-pine-700"><Clock3 className="size-5" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="break-words font-black text-ink">{title}</h3>
              <p className="mt-1 text-xs font-bold text-slate-500">{meta}</p>
            </div>
            <StatusPill label={displayStatus} tone={statusTone} />
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <CompactField label="Amount" value={amount} strong />
            <CompactField label="Method" value={online ? "Online Payment" : method} />
            <CompactField label="Reference" value={reference} />
            <CompactField label="Proof" value={proofLabel || "No attachment"} />
          </dl>
          {safeRemarks && <p className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm font-semibold text-slate-600">{safeRemarks}</p>}
          {awaitingPayment && requestId && <Link href={`/portal/pay/paymongo-resume?requestId=${encodeURIComponent(requestId)}`} className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-blue-700 px-4 text-sm font-black text-white shadow-sm sm:w-auto">Continue Payment</Link>}
          {rejectedOnline && <Link href="/portal/pay#qr-payment" className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-pine-700 px-4 text-sm font-black text-white shadow-sm sm:w-auto">Start New Payment</Link>}
        </div>
      </div>
    </article>
  );
}

export function PaymentHistoryCard({ href, receipt, amount, date, method, reference, coverage, status }: { href?: string; receipt: string; amount: string; date: string; method: string; reference: string; coverage: string; status: string }) {
  const content = (
    <article className="rounded-3xl border border-pine-100 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-pine-50 text-pine-700"><CreditCard className="size-5" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="break-words font-mono text-sm font-black text-pine-700">{receipt}</h3>
              <p className="mt-1 text-xs font-bold text-slate-500">{date} · {method}</p>
            </div>
            <p className="shrink-0 text-right text-lg font-black tabular-nums text-ink">{amount}</p>
          </div>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-700">{coverage}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusPill label={status} tone={status === "VOIDED" || status === "Void" ? "danger" : "success"} />
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">Ref: {reference}</span>
          </div>
        </div>
        {href && <ChevronRight className="mt-3 size-4 shrink-0 text-slate-300" aria-hidden="true" />}
      </div>
    </article>
  );
  return href ? <Link href={href} className="block focus-visible:outline focus-visible:outline-4 focus-visible:outline-pine-500/20">{content}</Link> : content;
}

export function CollectionCard({ href, title, date, amount, refunded, balance, status, reference, remarks }: { href?: string; title: string; date: string; amount: string; refunded: string; balance: string; status: string; reference: string; remarks?: string | null }) {
  const content = (
    <article className="rounded-3xl border border-pine-100 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-pine-50 text-pine-700"><WalletCards className="size-5" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap justify-between gap-2">
            <div className="min-w-0">
              <h3 className="break-words font-black text-ink">{title}</h3>
              <p className="mt-1 text-xs font-bold text-slate-500">{date} · {reference}</p>
            </div>
            <StatusPill label={status} tone="info" />
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
            <CompactField label="Amount" value={amount} strong />
            <CompactField label="Refunded" value={refunded} />
            <CompactField label="Held" value={balance} />
          </dl>
          {remarks && <p className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm font-semibold text-slate-600">{remarks}</p>}
        </div>
        {href && <ChevronRight className="mt-3 size-4 shrink-0 text-slate-300" aria-hidden="true" />}
      </div>
    </article>
  );
  return href ? <Link href={href} className="block focus-visible:outline focus-visible:outline-4 focus-visible:outline-pine-500/20">{content}</Link> : content;
}

export function PaymentEmptyState({ title, description, icon: Icon = ShieldCheck }: { title: string; description: string; icon?: LucideIcon }) {
  return (
    <div className="rounded-3xl border border-dashed border-pine-100 bg-white p-6 text-center">
      <Icon className="mx-auto size-9 text-pine-600" aria-hidden="true" />
      <p className="mt-3 font-black text-ink">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}

export function PaymentPageSkeleton() {
  return (
    <div className="space-y-5">
      <div className="h-14 rounded-3xl bg-slate-100" />
      <div className="h-72 rounded-3xl bg-slate-100" />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{[1, 2, 3, 4].map((item) => <div key={item} className="h-36 rounded-3xl bg-slate-100" />)}</div>
      <div className="h-96 rounded-3xl bg-slate-100" />
    </div>
  );
}

export function PaymentSafeError({ title = "Payments temporarily unavailable", description = "Refresh the page and try again. No payment was submitted." }: { title?: string; description?: string }) {
  return <div className="rounded-3xl border border-rose-100 bg-rose-50 p-5 text-rose-900"><p className="font-black">{title}</p><p className="mt-1 text-sm leading-6">{description}</p></div>;
}

export function StatusPill({ label, tone = "default" }: { label: string; tone?: PaymentTone }) {
  return <span className={`inline-flex min-h-8 items-center rounded-full px-3 py-1 text-xs font-black ${statusToneClasses[tone]}`}>{label}</span>;
}

function PaymentAction({ href, label, icon: Icon, primary = false }: { href: string; label: string; icon: LucideIcon; primary?: boolean }) {
  return (
    <Link href={href} className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-black focus-visible:outline focus-visible:outline-4 focus-visible:outline-pine-500/20 ${primary ? "bg-pine-700 text-white shadow-brand" : "bg-white text-pine-700 ring-1 ring-pine-100"}`}>
      <Icon className="size-4" aria-hidden="true" />
      {label}
    </Link>
  );
}

function PaymentMiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/80 p-3">
      <dt className="text-[10px] font-black uppercase tracking-[.14em] text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-sm font-black text-ink">{value}</dd>
    </div>
  );
}

function CompactField({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-black uppercase tracking-[.12em] text-slate-400">{label}</dt>
      <dd className={`mt-1 break-words tabular-nums ${strong ? "font-black text-ink" : "font-bold text-slate-700"}`}>{value}</dd>
    </div>
  );
}
