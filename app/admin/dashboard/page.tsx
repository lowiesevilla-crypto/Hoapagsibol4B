import Link from "next/link";
import { BillStatus, DocumentRequestStatus, HomeownerStatus, PayrollStatus, PaymentRequestStatus } from "@prisma/client";
import type { LucideIcon } from "lucide-react";
import { Banknote, ClipboardCheck, Clock3, FileCheck2, ReceiptText, Sparkles, UserPlus, UsersRound, WalletCards } from "lucide-react";
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
  const previousMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));

  const [
    totalHomeowners,
    billed,
    duesCollected,
    previousMonthCollected,
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
    prisma.payment.aggregate({ _sum: { amount: true }, where: { tenantId, status: "ACTIVE", paymentDate: { gte: previousMonthStart, lt: monthStart } } }),
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
    prisma.payrollPeriod.count({ where: { tenantId, status: { in: [PayrollStatus.DRAFT, PayrollStatus.CALCULATED, PayrollStatus.FINALIZED, PayrollStatus.POSTING, PayrollStatus.POST_FAILED] } } }),
  ]);

  const billedAmount = Number(billed._sum.totalAmount ?? 0);
  const duesCollectedAmount = Number(duesCollected._sum.amount ?? 0);
  const previousMonthCollectedAmount = Number(previousMonthCollected._sum.amount ?? 0);
  const otherIncomeAmount = Number(otherIncome._sum.amount ?? 0) + Number(forfeitedIncome._sum.amountForfeited ?? 0);
  const totalIncome = duesCollectedAmount + otherIncomeAmount;
  const totalOutflows = Number(monthExpenses._sum.amount ?? 0) + Number(monthPayroll._sum.netPay ?? 0);
  const bondsHeld = Number(bondTotals._sum.amount ?? 0) - Number(bondTotals._sum.amountRefunded ?? 0) - Number(bondTotals._sum.amountForfeited ?? 0);
  const receivableAmount = Number(receivables._sum.balance ?? 0);
  const pendingApprovals = pendingPaymentRequests + pendingDocumentRequests;
  const needsAttention = pendingApprovals + overdueHomeowners.length + payrollReminders;
  const collectionRate = billedAmount > 0 ? Math.min(100, Math.round((duesCollectedAmount / billedAmount) * 100)) : 0;
  const communityHealth = totalHomeowners === 0 ? 100 : Math.max(0, Math.round(((totalHomeowners - overdueHomeowners.length) / totalHomeowners) * 100));
  const collectionMomentum = previousMonthCollectedAmount > 0 ? Math.round(((duesCollectedAmount - previousMonthCollectedAmount) / previousMonthCollectedAmount) * 100) : duesCollectedAmount > 0 ? 100 : 0;

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

  const financialMax = Math.max(billedAmount, duesCollectedAmount, otherIncomeAmount, totalOutflows, 1);

  return <div className="canva-dashboard-grid space-y-5">
    <PageHeader
      eyebrow={`Community Intelligence · ${monthLabel(monthStart)}`}
      title={`Good ${manilaDayPeriod(now).toLowerCase()}, ${firstName(user.name)}.`}
      description="Your association workspace brings collections, resident services, and operational risk into one focused view."
      context={<><StatusBadge tone={communityHealth >= 90 ? "success" : communityHealth >= 75 ? "warning" : "critical"}>Community Pulse · {communityHealth >= 90 ? "Healthy" : communityHealth >= 75 ? "Watch" : "Needs attention"}</StatusBadge><StatusBadge tone={needsAttention ? "warning" : "success"}>{needsAttention ? `${needsAttention} items need attention` : "Operational queues clear"}</StatusBadge></>}
      actions={<><Link className="btn-primary min-h-11 px-4" href="/admin/payments/record"><ReceiptText className="size-4" /> Record payment</Link><Link className="btn-secondary min-h-11 px-4" href="/admin/actions"><ClipboardCheck className="size-4" /> Action Center</Link><Link className="btn-secondary min-h-11 px-4" href="/admin/homeowners/new"><UserPlus className="size-4" /> Add homeowner</Link></>}
    />

    <section aria-label="Executive snapshot" className="grid gap-[15px] sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Active homeowners" value={totalHomeowners} note={`${communityHealth}% accounts without overdue dues`} icon={UsersRound} href="/admin/homeowners" tone="blue" />
      <MetricCard label="Collected this month" value={money(duesCollectedAmount)} note={`${collectionRate}% of billed monthly dues`} icon={Banknote} href="/admin/payments/active" tone="green" />
      <MetricCard label="Open receivables" value={money(receivableAmount)} note={`${overdueHomeowners.length} homeowners need follow-up`} icon={Clock3} href="/admin/billing" tone="amber" />
      <MetricCard label="Needs attention" value={needsAttention} note={`${pendingApprovals} approvals and exceptions`} icon={ClipboardCheck} href="/admin/actions" tone={needsAttention ? "red" : "green"} />
    </section>

    <section className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_390px]">
      <WorkspaceCard title="Financial pulse" description="Collections, billings and cash movement for the active association." action={<Link className="text-xs font-black text-[#0872ae] hover:underline" href="/admin/reports">View reports →</Link>}>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_250px]">
          <div className="rounded-[18px] border border-[#e3edf2] bg-[#f7fbfd] p-4 sm:p-5">
            <div className="flex h-44 items-end justify-around gap-4 border-b border-[#dbe7ee] px-2 pb-3">
              <FinancialBar label="Billed" value={billedAmount} max={financialMax} className="bg-[#0b95d8]" />
              <FinancialBar label="Collected" value={duesCollectedAmount} max={financialMax} className="bg-[#6ed64b]" />
              <FinancialBar label="Other" value={otherIncomeAmount} max={financialMax} className="bg-[#27b6ff]" />
              <FinancialBar label="Outflows" value={totalOutflows} max={financialMax} className="bg-[#7e93a1]" />
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 text-xs font-bold"><span className="text-[#6f8294]">Monthly dues collection progress</span><span className="text-[#0c3248]">{collectionRate}%</span></div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e3ebef]"><div className="h-full rounded-full bg-[linear-gradient(90deg,#0b95d8,#6ed64b)]" style={{ width: `${collectionRate}%` }} /></div>
          </div>
          <div className="grid content-start gap-3">
            <FinanceValue label="Dues collected" value={money(duesCollectedAmount)} positive />
            <FinanceValue label="Other income" value={money(otherIncomeAmount)} />
            <FinanceValue label="Net monthly cash" value={money(totalIncome - totalOutflows)} />
            <FinanceValue label="Refundable bonds held" value={money(bondsHeld)} />
          </div>
        </div>
      </WorkspaceCard>

      <aside className="canva-intelligence-panel rounded-[22px] p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-[#9edfd1]">HOAHub Intelligence · Live</p><h2 className="mt-2 text-xl font-black">Collection insight</h2></div><span className="grid size-11 place-items-center rounded-2xl bg-white/10"><Sparkles className="size-5 text-[#6ed64b]" /></span></div>
        <p className="mt-5 text-sm leading-6">Collections are <strong>{Math.abs(collectionMomentum)}%</strong> {collectionMomentum >= 0 ? "above" : "below"} the previous month based on posted payments.</p>
        <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-xs leading-5"><strong>{overdueHomeowners.length}</strong> homeowner account{overdueHomeowners.length === 1 ? "" : "s"} currently have overdue balances totaling <strong>{money(receivableAmount)}</strong>.</p></div>
        <Link className="mt-5 inline-flex text-xs font-black text-[#9fe98b] hover:underline" href="/admin/actions">View recommended operational actions →</Link>
      </aside>
    </section>

    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
      <WorkspaceCard title="Action Center" description="Prioritized work across authorized tenant modules." action={<Link href="/admin/actions"><StatusBadge tone={needsAttention ? "warning" : "success"}>{needsAttention ? `${needsAttention} open` : "Clear"}</StatusBadge></Link>}>
        <div className="divide-y divide-[#edf2f5]">
          <ActionRow count={pendingPaymentRequests} title="Payment requests" detail="Proof verification awaiting review" href="/admin/payments/requests?status=PENDING_REVIEW" icon={WalletCards} />
          <ActionRow count={overdueHomeowners.length} title="Overdue accounts" detail="Open homeowner balances requiring follow-up" href="/admin/billing" icon={Clock3} />
          <ActionRow count={pendingDocumentRequests} title="Document requests" detail="Submitted and under review" href="/admin/documents?section=requests" icon={FileCheck2} />
          <ActionRow count={payrollReminders} title="Payroll periods" detail="Draft or finalized periods requiring attention" href="/admin/payroll" icon={ClipboardCheck} />
        </div>
      </WorkspaceCard>

      <WorkspaceCard title="Today at a glance" description="Current operational queues for this tenant.">
        <div className="grid grid-cols-2 gap-3">
          <GlanceValue value={pendingPaymentRequests} label="Payment reviews" />
          <GlanceValue value={pendingDocumentRequests} label="Document requests" />
          <GlanceValue value={payrollReminders} label="Payroll periods" />
          <GlanceValue value={overdueHomeowners.length} label="Overdue accounts" />
        </div>
      </WorkspaceCard>
    </section>

    <WorkspaceCard title="Recent activity" description="Latest payment and collection activity in this tenant." action={<Link className="text-xs font-black text-[#0872ae] hover:underline" href="/admin/payments/history">Transaction history →</Link>}>
      <div className="grid gap-x-8 lg:grid-cols-2">
        {recentActivity.map((item) => <Link key={item.id} href={item.href} className="group flex items-start gap-3 border-b border-[#edf2f5] py-3"><span className={`mt-1 size-2.5 shrink-0 rounded-full ${item.tone === "green" ? "bg-[#6ed64b]" : "bg-[#0b95d8]"}`} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-black text-[#153c50] group-hover:text-[#0872ae]">{item.title}</span><span className="mt-0.5 block truncate text-xs text-[#7c8d9b]">{item.detail} · {shortDate(item.at)}</span></span></Link>)}
        {!recentActivity.length && <p className="py-10 text-center text-sm text-[#7c8d9b]">No recent financial activity yet.</p>}
      </div>
    </WorkspaceCard>
  </div>;
}

function FinancialBar({ label, value, max, className }: { label: string; value: number; max: number; className: string }) {
  const height = value <= 0 ? 4 : Math.max(12, Math.round((value / max) * 100));
  return <div className="flex h-full min-w-0 flex-1 flex-col justify-end text-center"><div className={`mx-auto w-full max-w-12 rounded-t-[10px] ${className}`} style={{ height: `${height}%` }} /><p className="mt-2 truncate text-[10px] font-black uppercase tracking-[.06em] text-[#7d8c9b]">{label}</p></div>;
}

function FinanceValue({ label, value, positive = false }: { label: string; value: string; positive?: boolean }) {
  return <div className="rounded-[16px] border border-[#e3edf2] bg-white p-3.5"><p className="text-[10px] font-black uppercase tracking-[.08em] text-[#8091a0]">{label}</p><p className={`mt-1 text-lg font-black tracking-[-.025em] ${positive ? "text-status-success" : "text-[#0c3248]"}`}>{value}</p></div>;
}

function ActionRow({ count, title, detail, href, icon: Icon }: { count: number; title: string; detail: string; href: string; icon: LucideIcon }) {
  return <Link href={href} className="group grid gap-3 py-3.5 first:pt-1 sm:grid-cols-[48px_minmax(0,1fr)_60px] sm:items-center"><span className="grid size-10 place-items-center rounded-[13px] bg-[#eaf6ff] text-[#0b80be]"><Icon className="size-[18px]" /></span><span className="min-w-0"><span className="block text-sm font-black text-[#153c50] group-hover:text-[#0872ae]">{title}</span><span className="mt-0.5 block text-xs text-[#7c8d9b]">{detail}</span></span><span className="text-right text-sm font-black text-[#155a78]">{count} →</span></Link>;
}

function GlanceValue({ value, label }: { value: number; label: string }) {
  return <div className="rounded-[16px] border border-[#e3edf2] bg-[#f7fbfd] p-4 text-center"><p className="text-2xl font-black tracking-[-.04em] text-[#0c3248]">{value}</p><p className="mt-1 text-[11px] font-bold leading-4 text-[#7c8d9b]">{label}</p></div>;
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || "Admin";
}
