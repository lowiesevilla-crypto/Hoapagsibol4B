import Link from "next/link";
import { BillStatus, DocumentRequestStatus, HomeownerStatus, PayrollStatus, PaymentRequestStatus } from "@prisma/client";
import type { LucideIcon } from "lucide-react";
import { Banknote, CircleDollarSign, ClipboardCheck, Clock3, FileText, HandCoins, ReceiptText, UserPlus, UsersRound } from "lucide-react";
import { prisma } from "@/lib/db";
import { paymentCoverageLabel } from "@/lib/payment-coverage";
import { refreshOverdueBills } from "@/lib/actions/billing";
import { collectionLabel, money, monthLabel, shortDate } from "@/lib/utils";
import { requireUser } from "@/lib/auth";

export default async function AdminDashboard() {
  const user = await requireUser();
  const tenantId = user.tenantId;
  await refreshOverdueBills();

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const [
    totalHomeowners,
    billed,
    duesCollected,
    otherIncome,
    forfeitedIncome,
    monthExpenses,
    monthPayroll,
    bondTotals,
    receivables,
    overdueHomeowners,
    recentPayments,
    recentCollections,
    pendingPaymentRequests,
    pendingDocumentRequests,
    payrollReminders,
  ] = await Promise.all([
    prisma.homeownerProfile.count({ where: { tenantId, status: HomeownerStatus.ACTIVE } }),
    prisma.bill.aggregate({ _sum: { totalAmount: true }, where: { tenantId, billingMonth: { gte: monthStart, lt: monthEnd }, archivedAt: null } }),
    prisma.payment.aggregate({ _sum: { amount: true }, where: { tenantId, status: "ACTIVE", paymentDate: { gte: monthStart, lt: monthEnd } } }),
    prisma.collection.aggregate({ _sum: { amount: true }, where: { tenantId, refundable: false, collectionDate: { gte: monthStart, lt: monthEnd } } }),
    prisma.collection.aggregate({ _sum: { amountForfeited: true }, where: { tenantId, forfeitedAt: { gte: monthStart, lt: monthEnd } } }),
    prisma.expense.aggregate({ _sum: { amount: true }, where: { tenantId, expenseDate: { gte: monthStart, lt: monthEnd } } }),
    prisma.payslip.aggregate({ _sum: { netPay: true }, where: { tenantId, payroll: { payDate: { gte: monthStart, lt: monthEnd }, status: { in: ["FINALIZED", "PAID"] } } } }),
    prisma.collection.aggregate({ _sum: { amount: true, amountRefunded: true, amountForfeited: true }, where: { tenantId, refundable: true } }),
    prisma.bill.aggregate({ _sum: { balance: true }, where: { tenantId, balance: { gt: 0 }, archivedAt: null } }),
    prisma.bill.groupBy({ by: ["homeownerId"], where: { tenantId, status: BillStatus.OVERDUE, balance: { gt: 0 }, archivedAt: null } }),
    prisma.payment.findMany({ where: { tenantId, status: "ACTIVE" }, take: 6, orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }], include: { homeowner: { include: { user: true } }, bill: true } }),
    prisma.collection.findMany({ where: { tenantId }, take: 6, orderBy: [{ collectionDate: "desc" }, { createdAt: "desc" }], include: { homeowner: { include: { user: true } }, contractor: true } }),
    prisma.paymentRequest.count({ where: { tenantId, status: PaymentRequestStatus.PENDING_REVIEW } }),
    prisma.documentRequest.count({ where: { tenantId, archivedAt: null, status: { in: [DocumentRequestStatus.SUBMITTED, DocumentRequestStatus.UNDER_REVIEW] } } }),
    prisma.payrollPeriod.count({ where: { tenantId, status: { in: [PayrollStatus.DRAFT, PayrollStatus.FINALIZED] } } }),
  ]);

  const billedAmount = Number(billed._sum.totalAmount ?? 0);
  const duesCollectedAmount = Number(duesCollected._sum.amount ?? 0);
  const otherIncomeAmount = Number(otherIncome._sum.amount ?? 0) + Number(forfeitedIncome._sum.amountForfeited ?? 0);
  const totalIncome = duesCollectedAmount + otherIncomeAmount;
  const totalOutflows = Number(monthExpenses._sum.amount ?? 0) + Number(monthPayroll._sum.netPay ?? 0);
  const bondsHeld = Number(bondTotals._sum.amount ?? 0) - Number(bondTotals._sum.amountRefunded ?? 0) - Number(bondTotals._sum.amountForfeited ?? 0);
  const receivableAmount = Number(receivables._sum.balance ?? 0);
  const pendingApprovals = pendingPaymentRequests + pendingDocumentRequests;
  const needsAttention = pendingApprovals + overdueHomeowners.length + payrollReminders;
  const collectionRate = billedAmount > 0 ? Math.min(100, Math.round((duesCollectedAmount / billedAmount) * 100)) : 0;
  const communityHealth = totalHomeowners === 0 ? 100 : Math.max(0, Math.round(((totalHomeowners - overdueHomeowners.length) / totalHomeowners) * 100));

  const recentActivity = [
    ...recentPayments.map((payment) => ({
      id: `payment-${payment.id}`,
      at: payment.createdAt,
      title: `Payment received — ${money(payment.amount)}`,
      detail: `${payment.homeowner.user.name} · ${paymentCoverageLabel(payment)}`,
      href: "/admin/payments/active",
      tone: "green" as const,
    })),
    ...recentCollections.map((item) => ({
      id: `collection-${item.id}`,
      at: item.createdAt,
      title: `${collectionLabel(item.type, item.description)} — ${money(item.amount)}`,
      detail: item.homeowner?.user.name ?? item.contractor?.companyName ?? "Association collection",
      href: "/admin/collections",
      tone: "blue" as const,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 6);

  return <div className="space-y-5">
    <section className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p className="text-xs font-extrabold uppercase tracking-[.18em] text-leaf-700">Association overview · {monthLabel(monthStart)}</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-pine-900 sm:text-4xl">Good morning, {firstName(user.name)}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">A focused view of collections, resident accounts, and work that needs action today.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link className="btn-primary min-h-11 px-4" href="/admin/payments/record"><ReceiptText className="size-4" /> Record payment</Link>
        <Link className="btn-secondary min-h-11 px-4" href="/admin/homeowners/new"><UserPlus className="size-4" /> Add homeowner</Link>
      </div>
    </section>

    <section aria-label="Executive snapshot" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Active homeowners" value={String(totalHomeowners)} note={`${communityHealth}% without overdue dues`} icon={UsersRound} href="/admin/homeowners" tone="blue" />
      <MetricCard label="Collected this month" value={money(duesCollectedAmount)} note={`${collectionRate}% of billed dues`} icon={Banknote} href="/admin/payments/active" tone="green" />
      <MetricCard label="Receivables" value={money(receivableAmount)} note={`${overdueHomeowners.length} overdue homeowner${overdueHomeowners.length === 1 ? "" : "s"}`} icon={Clock3} href="/admin/billing" tone="amber" />
      <MetricCard label="Needs attention" value={String(needsAttention)} note={`${pendingApprovals} approval${pendingApprovals === 1 ? "" : "s"} waiting`} icon={ClipboardCheck} href="/admin/payments/requests" tone="red" />
    </section>

    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <article className="rounded-[20px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-black text-pine-900">Finance overview</h2>
            <p className="mt-1 text-sm text-slate-500">Cash received versus monthly billings and operating outflows.</p>
          </div>
          <Link className="text-xs font-black text-pine-700 hover:underline" href="/admin/reports">View reports →</Link>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FinanceValue label="Dues billed" value={money(billedAmount)} />
          <FinanceValue label="Dues collected" value={money(duesCollectedAmount)} positive />
          <FinanceValue label="Other income" value={money(otherIncomeAmount)} />
          <FinanceValue label="Operating outflows" value={money(totalOutflows)} />
        </div>

        <div className="mt-7 rounded-2xl bg-[#f7fbfd] p-4">
          <div className="flex items-center justify-between gap-3 text-xs font-bold">
            <span className="text-slate-600">Monthly dues collection progress</span>
            <span className="text-pine-900">{collectionRate}%</span>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200" aria-label={`${collectionRate}% of billed dues collected`}>
            <div className="h-full rounded-full bg-leaf-600 transition-all" style={{ width: `${collectionRate}%` }} />
          </div>
          <div className="mt-4 grid gap-3 text-xs text-slate-500 sm:grid-cols-3">
            <p><span className="block font-black text-pine-900">{money(totalIncome - totalOutflows)}</span>Net monthly cash</p>
            <p><span className="block font-black text-pine-900">{money(bondsHeld)}</span>Refundable bonds held</p>
            <p><span className="block font-black text-pine-900">{money(receivableAmount)}</span>Open homeowner balances</p>
          </div>
        </div>
      </article>

      <article className="rounded-[20px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-pine-900">Needs attention</h2>
            <p className="mt-1 text-sm text-slate-500">Prioritized operational work for the active tenant.</p>
          </div>
          <span className="grid min-w-8 place-items-center rounded-full bg-rose-50 px-2 py-1 text-xs font-black text-rose-700">{needsAttention}</span>
        </div>
        <div className="mt-4 divide-y divide-slate-100">
          <AttentionRow count={pendingPaymentRequests} title="Payment requests" detail="Awaiting verification" href="/admin/payments/requests?status=PENDING_REVIEW" tone="amber" />
          <AttentionRow count={overdueHomeowners.length} title="Overdue homeowner accounts" detail="Open past-due balances" href="/admin/billing" tone="red" />
          <AttentionRow count={pendingDocumentRequests} title="Document requests" detail="Submitted or under review" href="/admin/documents?section=requests" tone="blue" />
          <AttentionRow count={payrollReminders} title="Payroll reminders" detail="Draft or finalized periods" href="/admin/payroll" tone="green" />
        </div>
      </article>
    </section>

    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <article className="rounded-[20px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-pine-900">Recent activity</h2>
            <p className="mt-1 text-sm text-slate-500">Latest payment and collection activity in this tenant.</p>
          </div>
          <Link className="text-xs font-black text-pine-700 hover:underline" href="/admin/payments/history">Transaction history →</Link>
        </div>
        <div className="mt-4 divide-y divide-slate-100">
          {recentActivity.map((item) => <Link key={item.id} href={item.href} className="group flex items-start gap-3 py-3 first:pt-1">
            <span className={`mt-1 size-2.5 shrink-0 rounded-full ${item.tone === "green" ? "bg-leaf-600" : "bg-sky-600"}`} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-black text-slate-800 group-hover:text-pine-700">{item.title}</span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">{item.detail} · {shortDate(item.at)}</span>
            </span>
          </Link>)}
          {!recentActivity.length && <p className="py-10 text-center text-sm text-slate-500">No recent financial activity yet.</p>}
        </div>
      </article>

      <aside className="rounded-[20px] bg-pine-900 p-5 text-white shadow-sm sm:p-6">
        <p className="text-xs font-extrabold uppercase tracking-[.18em] text-leaf-200">Quick actions</p>
        <h2 className="mt-2 text-xl font-black">Common admin tasks</h2>
        <p className="mt-2 text-sm leading-6 text-pine-100/75">Actions stay contextual while secondary configuration remains inside each workspace.</p>
        <div className="mt-5 grid gap-2">
          <QuickAction href="/admin/payments/record" icon={ReceiptText} label="Record a payment" />
          <QuickAction href="/admin/documents/new" icon={FileText} label="Create office request" />
          <QuickAction href="/admin/collections" icon={HandCoins} label="Record other collection" />
          <QuickAction href="/admin/billing" icon={CircleDollarSign} label="Review billing" />
        </div>
      </aside>
    </section>
  </div>;
}

type MetricTone = "blue" | "green" | "amber" | "red";
const metricToneStyles: Record<MetricTone, { bar: string; note: string; icon: string }> = {
  blue: { bar: "bg-sky-600", note: "text-sky-700", icon: "bg-sky-50 text-sky-700" },
  green: { bar: "bg-leaf-600", note: "text-leaf-700", icon: "bg-emerald-50 text-emerald-700" },
  amber: { bar: "bg-amber-500", note: "text-amber-700", icon: "bg-amber-50 text-amber-700" },
  red: { bar: "bg-rose-600", note: "text-rose-700", icon: "bg-rose-50 text-rose-700" },
};

function MetricCard({ label, value, note, icon: Icon, href, tone }: { label: string; value: string; note: string; icon: LucideIcon; href: string; tone: MetricTone }) {
  const style = metricToneStyles[tone];
  return <Link href={href} className="group rounded-[18px] border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-pine-200 hover:shadow-md">
    <div className="flex items-start justify-between gap-3">
      <span className={`mt-1 h-1.5 w-8 rounded-full ${style.bar}`} />
      <span className={`grid size-9 place-items-center rounded-xl ${style.icon}`}><Icon className="size-4" /></span>
    </div>
    <p className="mt-3 text-xs font-bold text-slate-500">{label}</p>
    <p className="mt-1 text-2xl font-black tracking-tight text-pine-900">{value}</p>
    <p className={`mt-1 text-xs font-bold ${style.note}`}>{note}</p>
  </Link>;
}

function FinanceValue({ label, value, positive = false }: { label: string; value: string; positive?: boolean }) {
  return <div className="rounded-2xl border border-slate-100 bg-white p-3">
    <p className="text-[11px] font-bold text-slate-500">{label}</p>
    <p className={`mt-1 text-lg font-black ${positive ? "text-leaf-700" : "text-pine-900"}`}>{value}</p>
  </div>;
}

function AttentionRow({ count, title, detail, href, tone }: { count: number; title: string; detail: string; href: string; tone: "amber" | "red" | "blue" | "green" }) {
  const dot = tone === "amber" ? "bg-amber-500" : tone === "red" ? "bg-rose-600" : tone === "blue" ? "bg-sky-600" : "bg-leaf-600";
  return <Link href={href} className="group flex items-start gap-3 py-3 first:pt-1">
    <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${dot}`} />
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-black text-slate-800 group-hover:text-pine-700">{count} {title}</span>
      <span className="mt-0.5 block text-xs text-slate-500">{detail}</span>
    </span>
    <span className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-pine-600">→</span>
  </Link>;
}

function QuickAction({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
  return <Link href={href} className="flex min-h-11 items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-bold text-pine-50 transition hover:bg-white/10">
    <span className="grid size-8 place-items-center rounded-lg bg-leaf-500/15 text-leaf-200"><Icon className="size-4" /></span>
    <span className="flex-1">{label}</span>
    <span className="text-pine-200">→</span>
  </Link>;
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || "Admin";
}
