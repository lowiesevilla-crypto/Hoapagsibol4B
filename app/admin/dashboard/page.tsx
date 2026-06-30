import { BillStatus, HomeownerStatus } from "@prisma/client";
import { Banknote, CircleDollarSign, Clock3, HandCoins, UsersRound } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { prisma } from "@/lib/db";
import { paymentCoverageLabel } from "@/lib/payment-coverage";
import { refreshOverdueBills } from "@/lib/actions/billing";
import { collectionLabel, money, monthLabel, shortDate } from "@/lib/utils";

export default async function AdminDashboard() {
  await refreshOverdueBills();
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const [totalHomeowners, billed, duesCollected, otherIncome, forfeitedIncome, monthExpenses, monthPayroll, bondTotals, receivables, overdueHomeowners, recentPayments, recentCollections] = await Promise.all([
    prisma.homeownerProfile.count({ where: { status: HomeownerStatus.ACTIVE } }),
    prisma.bill.aggregate({ _sum: { totalAmount: true }, where: { billingMonth: { gte: monthStart, lt: monthEnd }, archivedAt: null } }),
    prisma.payment.aggregate({ _sum: { amount: true }, where: { status: "ACTIVE", paymentDate: { gte: monthStart, lt: monthEnd } } }),
    prisma.collection.aggregate({ _sum: { amount: true }, where: { refundable: false, collectionDate: { gte: monthStart, lt: monthEnd } } }),
    prisma.collection.aggregate({ _sum: { amountForfeited: true }, where: { forfeitedAt: { gte: monthStart, lt: monthEnd } } }),
    prisma.expense.aggregate({ _sum: { amount: true }, where: { expenseDate: { gte: monthStart, lt: monthEnd } } }),
    prisma.payslip.aggregate({ _sum: { netPay: true }, where: { payroll: { payDate: { gte: monthStart, lt: monthEnd }, status: { in: ["FINALIZED", "PAID"] } } } }),
    prisma.collection.aggregate({ _sum: { amount: true, amountRefunded: true, amountForfeited: true }, where: { refundable: true } }),
    prisma.bill.aggregate({ _sum: { balance: true }, where: { balance: { gt: 0 }, archivedAt: null } }),
    prisma.bill.groupBy({ by: ["homeownerId"], where: { status: BillStatus.OVERDUE, balance: { gt: 0 }, archivedAt: null } }),
    prisma.payment.findMany({ where: { status: "ACTIVE" }, take: 8, orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }], include: { homeowner: { include: { user: true } }, bill: true } }),
    prisma.collection.findMany({ take: 8, orderBy: [{ collectionDate: "desc" }, { createdAt: "desc" }], include: { homeowner: { include: { user: true } }, contractor: true } }),
  ]);
  const totalIncome = Number(duesCollected._sum.amount ?? 0) + Number(otherIncome._sum.amount ?? 0) + Number(forfeitedIncome._sum.amountForfeited ?? 0);
  const totalOutflows = Number(monthExpenses._sum.amount ?? 0) + Number(monthPayroll._sum.netPay ?? 0);
  const bondsHeld = Number(bondTotals._sum.amount ?? 0) - Number(bondTotals._sum.amountRefunded ?? 0) - Number(bondTotals._sum.amountForfeited ?? 0);
  return <>
    <PageHeader eyebrow="Association overview" title="Admin dashboard" description={`Live financial position for ${monthLabel(monthStart)}.`} />
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      <StatCard label="Active homeowners" value={String(totalHomeowners)} note="Profiles in good standing" icon={UsersRound} />
      <StatCard label="Dues billed this month" value={money(billed._sum.totalAmount ?? 0)} note="Including penalties" icon={CircleDollarSign} />
      <StatCard label="Income this month" value={money(totalIncome)} note="Dues, fees and forfeited bonds" icon={Banknote} />
      <StatCard label="Expenses this month" value={money(totalOutflows)} note="Operating costs and payroll" icon={Banknote} />
      <StatCard label="Total receivables" value={money(receivables._sum.balance ?? 0)} note={`${overdueHomeowners.length} overdue homeowner${overdueHomeowners.length === 1 ? "" : "s"}`} icon={Clock3} />
      <StatCard label="Refundable bonds held" value={money(bondsHeld)} note="Homeowner and contractor liabilities" icon={HandCoins} />
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
