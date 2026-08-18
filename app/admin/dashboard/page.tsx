import Link from "next/link";
import { BillStatus, DocumentRequestStatus, HomeownerStatus, PayrollStatus, PaymentRequestStatus } from "@prisma/client";
import type { LucideIcon } from "lucide-react";
import { Banknote, CircleDollarSign, ClipboardCheck, Clock3, FileText, HandCoins, ReceiptText, UserPlus, UsersRound } from "lucide-react";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { WorkspaceCard } from "@/components/ui/workspace-card";
import { refreshOverdueBills } from "@/lib/actions/billing";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { paymentCoverageLabel } from "@/lib/payment-coverage";
import { collectionLabel, manilaDayPeriod, money, monthLabel, shortDate } from "@/lib/utils";

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
    <PageHeader
      eyebrow={`Association overview · ${monthLabel(monthStart)}`}
      title={`Good ${manilaDayPeriod(now).toLowerCase()}, ${firstName(user.name)}`}
      description="Community Intelligence brings collections, resident account health, and operational work into one focused tenant workspace."
      context={<><StatusBadge tone={communityHealth >= 90 ? "success" : communityHealth >= 75 ? "warning" : "critical"}>{communityHealth}% community account health</StatusBadge><StatusBadge tone={needsAttention ? "warning" : "success"}>{needsAttention ? `${needsAttention} items need attention` : "Operational queues clear"}</StatusBadge></>}
      actions={<><Link className="btn-primary min-h-11 px-4" href="/admin/payments/record"><ReceiptText className="size-4" /> Record payment</Link><Link className="btn-secondary min-h-11 px-4" href="/admin/actions"><ClipboardCheck className="size-4" /> Action Center</Link><Link className="btn-secondary min-h-11 px-4" href="/admin/homeowners/new"><UserPlus className="size-4" /> Add homeowner</Link></>}
    />

    <section aria-label="Executive snapshot" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Active homeowners" value={totalHomeowners} note={`${communityHealth}% without overdue dues`} icon={UsersRound} href="/admin/homeowners" tone="blue" />
      <MetricCard label="Collected this month" value={money(duesCollectedAmount)} note={`${collectionRate}% of billed dues`} icon={Banknote} href="/admin/payments/active" tone="green" />
      <MetricCard label="Receivables" value={money(receivableAmount)} note={`${overdueHomeowners.length} overdue homeowner${overdueHomeowners.length === 1 ? "" : "s"}`} icon={Clock3} href="/admin/billing" tone="amber" />
      <MetricCard label="Needs attention" value={needsAttention} note={`${pendingApprovals} approval${pendingApprovals === 1 ? "" : "s"} waiting`} icon={ClipboardCheck} href="/admin/actions" tone={needsAttention ? "red" : "green"} />
    </section>

    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
      <WorkspaceCard title="Finance overview" description="Cash received versus monthly billings and operating outflows." action={<Link className="text-xs font-black text-pine-700 hover:underline" href="/admin/reports">View reports →</Link>}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FinanceValue label="Dues billed" value={money(billedAmount)} />
          <FinanceValue label="Dues collected" value={money(duesCollectedAmount)} positive />
          <FinanceValue label="Other income" value={money(otherIncomeAmount)} />
          <FinanceValue label="Operating outflows" value={money(totalOutflows)} />
        </div>
        <div className="mt-6 rounded-2xl border border-slate-100 bg-surface-subtle p-4">
          <div className="flex items-center justify-between gap-3 text-xs font-bold"><span className="text-slate-600">Monthly dues collection progress</span><span className="text-pine-900">{collectionRate}%</span></div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200" aria-label={`${collectionRate}% of billed dues collected`}><div className="h-full rounded-full bg-gradient-to-r from-pine-500 to-leaf-600 transition-all" style={{ width: `${collectionRate}%` }} /></div>
          <div className="mt-4 grid gap-3 text-xs text-slate-500 sm:grid-cols-3"><p><span className="block font-black text-pine-900">{money(totalIncome - totalOutflows)}</span>Net monthly cash</p><p><span className="block font-black text-pine-900">{money(bondsHeld)}</span>Refundable bonds held</p><p><span className="block font-black text-pine-900">{money(receivableAmount)}</span>Open homeowner balances</p></div>
        </div>
      </WorkspaceCard>

      <WorkspaceCard title="Needs attention" description="Prioritized work for the active tenant." action={<Link href="/admin/actions"><StatusBadge tone={needsAttention ? "warning" : "success"}>{needsAttention ? `${needsAttention} open` : "Clear"}</StatusBadge></Link>}>
        <div className="divide-y divide-slate-100">
          <AttentionRow count={pendingPaymentRequests} title="Payment requests" detail="Awaiting verification" href="/admin/payments/requests?status=PENDING_REVIEW" tone="amber" />
          <AttentionRow count={overdueHomeowners.length} title="Overdue homeowner accounts" detail="Open past-due balances" href="/admin/billing" tone="red" />
          <AttentionRow count={pendingDocumentRequests} title="Document requests" detail="Submitted or under review" href="/admin/documents?section=requests" tone="blue" />
          <AttentionRow count={payrollReminders} title="Payroll reminders" detail="Draft or finalized periods" href="/admin/payroll" tone="green" />
        </div>
        <Link className="btn-secondary mt-4 w-full" href="/admin/actions">Open Action Center</Link>
      </WorkspaceCard>
    </section>

    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
      <WorkspaceCard title="Recent activity" description="Latest payment and collection activity in this tenant." action={<Link className="text-xs font-black text-pine-700 hover:underline" href="/admin/payments/history">Transaction history →</Link>}>
        <div className="divide-y divide-slate-100">
          {recentActivity.map((item) => <Link key={item.id} href={item.href} className="group flex items-start gap-3 py-3 first:pt-1"><span className={`mt-1 size-2.5 shrink-0 rounded-full ${item.tone === "green" ? "bg-leaf-600" : "bg-sky-600"}`} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-black text-slate-800 group-hover:text-pine-700">{item.title}</span><span className="mt-0.5 block truncate text-xs text-slate-500">{item.detail} · {shortDate(item.at)}</span></span></Link>)}
          {!recentActivity.length && <p className="py-10 text-center text-sm text-slate-500">No recent financial activity yet.</p>}
        </div>
      </WorkspaceCard>

      <aside className="rounded-workspace bg-gradient-to-br from-pine-900 via-platform-700 to-pine-700 p-5 text-white shadow-floating sm:p-6">
        <p className="text-xs font-extrabold uppercase tracking-[.18em] text-leaf-200">Quick actions</p><h2 className="mt-2 text-xl font-black">Common admin tasks</h2><p className="mt-2 text-sm leading-6 text-pine-100/80">Fast entry points into existing tenant-authorized workflows.</p>
        <div className="mt-5 grid gap-2"><QuickAction href="/admin/payments/record" icon={ReceiptText} label="Record a payment" /><QuickAction href="/admin/documents/new" icon={FileText} label="Create office request" /><QuickAction href="/admin/collections" icon={HandCoins} label="Record other collection" /><QuickAction href="/admin/billing" icon={CircleDollarSign} label="Review billing" /></div>
      </aside>
    </section>
  </div>;
}

function FinanceValue({ label, value, positive = false }: { label: string; value: string; positive?: boolean }) {
  return <div className="rounded-2xl border border-slate-100 bg-white p-3"><p className="text-[11px] font-bold text-slate-500">{label}</p><p className={`mt-1 text-lg font-black ${positive ? "text-status-success" : "text-pine-900"}`}>{value}</p></div>;
}

function AttentionRow({ count, title, detail, href, tone }: { count: number; title: string; detail: string; href: string; tone: "amber" | "red" | "blue" | "green" }) {
  const dot = tone === "amber" ? "bg-amber-500" : tone === "red" ? "bg-rose-600" : tone === "blue" ? "bg-sky-600" : "bg-leaf-600";
  return <Link href={href} className="group flex items-start gap-3 py-3 first:pt-1"><span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${dot}`} /><span className="min-w-0 flex-1"><span className="block text-sm font-black text-slate-800 group-hover:text-pine-700">{count} {title}</span><span className="mt-0.5 block text-xs text-slate-500">{detail}</span></span><span className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-pine-600">→</span></Link>;
}

function QuickAction({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
  return <Link href={href} className="flex min-h-11 items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-bold text-pine-50 transition hover:bg-white/10"><span className="grid size-8 place-items-center rounded-lg bg-leaf-500/15 text-leaf-200"><Icon className="size-4" /></span><span className="flex-1">{label}</span><span className="text-pine-200">→</span></Link>;
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || "Admin";
}
