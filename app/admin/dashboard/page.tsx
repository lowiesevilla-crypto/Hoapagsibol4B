import { BillStatus, DocumentRequestStatus, HomeownerStatus, PayrollStatus, PaymentRequestStatus } from "@prisma/client";
import { Activity, Banknote, BellRing, CalendarClock, CircleDollarSign, ClipboardCheck, Clock3, HandCoins, Megaphone, MessageSquareWarning, ReceiptText, UserCheck, UsersRound } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
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
  const [totalHomeowners, billed, duesCollected, otherIncome, forfeitedIncome, monthExpenses, monthPayroll, bondTotals, receivables, overdueHomeowners, recentPayments, recentCollections, pendingPaymentRequests, pendingDocumentRequests, activeAnnouncements, todayAttendance, payrollReminders] = await Promise.all([
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
    prisma.payment.findMany({ where: { tenantId, status: "ACTIVE" }, take: 8, orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }], include: { homeowner: { include: { user: true } }, bill: true } }),
    prisma.collection.findMany({ where: { tenantId }, take: 8, orderBy: [{ collectionDate: "desc" }, { createdAt: "desc" }], include: { homeowner: { include: { user: true } }, contractor: true } }),
    prisma.paymentRequest.count({ where: { tenantId, status: PaymentRequestStatus.PENDING_REVIEW } }),
    prisma.documentRequest.count({ where: { tenantId, archivedAt: null, status: { in: [DocumentRequestStatus.SUBMITTED, DocumentRequestStatus.UNDER_REVIEW] } } }),
    prisma.announcement.count({ where: { tenantId, status: "PUBLISHED" } }),
    prisma.attendance.count({ where: { tenantId, date: { gte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())), lt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)) } } }),
    prisma.payrollPeriod.count({ where: { tenantId, status: { in: [PayrollStatus.DRAFT, PayrollStatus.FINALIZED] } } }),
  ]);
  const totalIncome = Number(duesCollected._sum.amount ?? 0) + Number(otherIncome._sum.amount ?? 0) + Number(forfeitedIncome._sum.amountForfeited ?? 0);
  const totalOutflows = Number(monthExpenses._sum.amount ?? 0) + Number(monthPayroll._sum.netPay ?? 0);
  const bondsHeld = Number(bondTotals._sum.amount ?? 0) - Number(bondTotals._sum.amountRefunded ?? 0) - Number(bondTotals._sum.amountForfeited ?? 0);
  const pendingApprovals = pendingPaymentRequests + pendingDocumentRequests;
  const communityHealth = totalHomeowners === 0 ? 100 : Math.max(0, Math.round(((totalHomeowners - overdueHomeowners.length) / totalHomeowners) * 100));
  return <>
    <PageHeader eyebrow="Association overview" title="Admin dashboard" description={`Live financial position for ${monthLabel(monthStart)}.`} />
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      <StatCard label="Active homeowners" value={String(totalHomeowners)} note="Profiles in good standing" icon={UsersRound} href="/admin/homeowners" />
      <StatCard label="Dues billed this month" value={money(billed._sum.totalAmount ?? 0)} note="Including penalties" icon={CircleDollarSign} href="/admin/billing" />
      <StatCard label="Income this month" value={money(totalIncome)} note="Dues, fees and forfeited bonds" icon={Banknote} href="/admin/reports" />
      <StatCard label="Expenses this month" value={money(totalOutflows)} note="Operating costs and payroll" icon={Banknote} href="/admin/expenses" />
      <StatCard label="Total receivables" value={money(receivables._sum.balance ?? 0)} note={`${overdueHomeowners.length} overdue homeowner${overdueHomeowners.length === 1 ? "" : "s"}`} icon={Clock3} href="/admin/billing" />
      <StatCard label="Refundable bonds held" value={money(bondsHeld)} note="Homeowner and contractor liabilities" icon={HandCoins} href="/admin/collections" />
    </section>
    <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
      <StatCard label="Outstanding Collections" value={money(receivables._sum.balance ?? 0)} note="Open homeowner receivables" icon={CircleDollarSign} href="/admin/billing" />
      <StatCard label="Pending Approvals" value={String(pendingApprovals)} note={`${pendingPaymentRequests} payment, ${pendingDocumentRequests} document`} icon={ClipboardCheck} href="/admin/payments?status=PENDING_REVIEW" />
      <StatCard label="Resident Complaints" value="0" note="Complaints workflow placeholder" icon={MessageSquareWarning} />
      <StatCard label="Today's Visitors" value="0" note="Visitor module placeholder" icon={UserCheck} />
      <StatCard label="Active Announcements" value={String(activeAnnouncements)} note="Published notices" icon={Megaphone} href="/admin/announcements" />
      <StatCard label="Employee Attendance" value={String(todayAttendance)} note="Records captured today" icon={CalendarClock} href="/admin/attendance" />
      <StatCard label="Payroll Reminders" value={String(payrollReminders)} note="Draft or finalized payroll periods" icon={BellRing} href="/admin/payroll" />
      <StatCard label="Recent Payments" value={String(recentPayments.length)} note="Latest receipts listed below" icon={ReceiptText} href="/admin/payments" />
      <StatCard label="Community Health" value={`${communityHealth}%`} note="Active homeowners less overdue accounts" icon={Activity} href="/admin/reports" />
    </section>
    <section className="card mt-6">
      <div className="mb-4"><h2 className="text-lg font-black">Recent other collections</h2><p className="text-sm text-slate-500">Fees and refundable bonds outside monthly dues.</p></div>
      <div className="table-wrap shadow-none"><table className="data-table"><thead><tr><th>Payer</th><th>Type</th><th>Date</th><th>Treatment</th><th className="text-right">Amount</th></tr></thead><tbody>
        {recentCollections.map((item) => <tr key={item.id}><td className="font-bold">{item.homeowner?.user.name ?? item.contractor?.companyName ?? "Unknown"}</td><td>{collectionLabel(item.type, item.description)}</td><td>{shortDate(item.collectionDate)}</td><td><StatusBadge status={item.refundable ? item.refundStatus : "INCOME"} /></td><td className="text-right font-black text-pine-700">{money(item.amount)}</td></tr>)}
        {!recentCollections.length && <tr><td colSpan={5} className="py-10 text-center text-slate-500">No other collections have been recorded yet.</td></tr>}
      </tbody></table></div>
    </section>
    <section className="card mt-6">
      <div className="mb-4"><h2 className="text-lg font-black">Recent payments</h2><p className="text-sm text-slate-500">Latest receipts recorded by the association.</p></div>
      <div className="table-wrap shadow-none"><table className="data-table"><thead><tr><th>Homeowner</th><th>Billing month</th><th>Date</th><th>Method</th><th className="text-right">Amount</th></tr></thead><tbody>
        {recentPayments.map((payment) => <tr key={payment.id}><td><p className="font-bold">{payment.homeowner.user.name}</p><p className="text-xs text-slate-400">Block {payment.homeowner.block}, Lot {payment.homeowner.lot}</p></td><td>{paymentCoverageLabel(payment)}</td><td>{shortDate(payment.paymentDate)}</td><td><StatusBadge status={payment.method.replaceAll("_", " ")} /></td><td className="text-right font-black text-pine-700">{money(payment.amount)}</td></tr>)}
        {!recentPayments.length && <tr><td colSpan={5} className="py-10 text-center text-slate-500">No payments have been recorded yet.</td></tr>}
      </tbody></table></div>
    </section>
  </>;
}
