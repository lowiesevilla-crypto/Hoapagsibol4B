import { Download, FileText, HandCoins, ReceiptText, TrendingUp, WalletCards } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { prisma } from "@/lib/db";
import { paymentAllocationCoverageLabel } from "@/lib/payment-coverage";
import { collectionLabel, inputDate, money, monthLabel, shortDate } from "@/lib/utils";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const filters = await searchParams;
  const now = new Date();
  const fromText = /^\d{4}-\d{2}-\d{2}$/.test(filters.from ?? "") ? filters.from! : `${now.getUTCFullYear()}-01-01`;
  const toText = /^\d{4}-\d{2}-\d{2}$/.test(filters.to ?? "") ? filters.to! : inputDate(now);
  const from = new Date(`${fromText}T00:00:00.000Z`);
  const to = new Date(`${toText}T23:59:59.999Z`);
  if (from > to) throw new Error("Report start date must be on or before the end date.");
  const range = { gte: from, lte: to };

  const [payments, collections, refunds, expenses, payrolls, employeeLoanIssuances, employeeLoanRepaymentRows, allEmployeeLoanTotals, employeeLoanBalances, billSummary, statusCounts, monthly, allBondTotals] = await Promise.all([
    prisma.payment.findMany({ where: { status: "ACTIVE", paymentDate: range }, include: { homeowner: { include: { user: true } }, bill: true, allocations: { include: { bill: true }, orderBy: { bill: { billingMonth: "asc" } } } }, orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }] }),
    prisma.collection.findMany({ where: { OR: [{ collectionDate: range }, { forfeitedAt: range }] } }),
    prisma.bondRefund.findMany({ where: { refundDate: range } }),
    prisma.expense.findMany({ where: { expenseDate: range }, include: { category: true }, orderBy: { expenseDate: "asc" } }),
    prisma.payrollPeriod.findMany({ where: { payDate: range, status: { in: ["FINALIZED", "PAID"] } }, include: { payslips: true } }),
    prisma.employeeLoan.findMany({ where: { issuedDate: range, status: { not: "CANCELLED" } }, include: { employee: true }, orderBy: { issuedDate: "asc" } }),
    prisma.payrollDeduction.findMany({ where: { employeeLoanId: { not: null }, payroll: { payDate: range, status: "PAID" } }, include: { employee: true, employeeLoan: true, payroll: true }, orderBy: { createdAt: "asc" } }),
    prisma.employeeLoan.aggregate({ _sum: { principalAmount: true, amountPaid: true, balance: true }, where: { status: { not: "CANCELLED" } } }),
    prisma.employeeLoan.findMany({ where: { status: { not: "CANCELLED" } }, include: { employee: true }, orderBy: [{ status: "asc" }, { issuedDate: "desc" }] }),
    prisma.bill.aggregate({ _sum: { totalAmount: true, balance: true } }),
    prisma.bill.groupBy({ by: ["status"], _count: true, _sum: { balance: true } }),
    prisma.bill.groupBy({ by: ["billingMonth"], _sum: { totalAmount: true, amountPaid: true, balance: true }, orderBy: { billingMonth: "desc" }, take: 12 }),
    prisma.collection.aggregate({ _sum: { amount: true, amountRefunded: true, amountForfeited: true }, where: { refundable: true } }),
  ]);

  const duesIncome = payments.reduce((sum, item) => sum + Number(item.amount), 0);
  const feeCollections = collections.filter((item) => !item.refundable && item.collectionDate >= from && item.collectionDate <= to);
  const feeIncome = feeCollections.reduce((sum, item) => sum + Number(item.amount), 0);
  const forfeitedIncome = collections.filter((item) => item.forfeitedAt && item.forfeitedAt >= from && item.forfeitedAt <= to).reduce((sum, item) => sum + Number(item.amountForfeited), 0);
  const recognizedIncome = duesIncome + feeIncome + forfeitedIncome;
  const operatingExpenses = expenses.reduce((sum, item) => sum + Number(item.amount), 0);
  const payrollExpense = payrolls.flatMap((period) => period.payslips).reduce((sum, item) => sum + Number(item.netPay), 0);
  const employeeLoansIssued = employeeLoanIssuances.reduce((sum, item) => sum + Number(item.principalAmount), 0);
  const employeeLoanRepayments = employeeLoanRepaymentRows.reduce((sum, item) => sum + Number(item.amount), 0);
  const employeeLoanOutstanding = Number(allEmployeeLoanTotals._sum.balance ?? 0);
  const totalExpenses = operatingExpenses + payrollExpense;
  const operatingSurplus = recognizedIncome - totalExpenses;
  const bondsReceived = collections.filter((item) => item.refundable && item.collectionDate >= from && item.collectionDate <= to).reduce((sum, item) => sum + Number(item.amount), 0);
  const bondsRefunded = refunds.reduce((sum, item) => sum + Number(item.amount), 0);
  const cashInflows = duesIncome + feeIncome + bondsReceived;
  const cashOutflows = operatingExpenses + payrollExpense + bondsRefunded + employeeLoansIssued;
  const netCashMovement = cashInflows - cashOutflows;
  const bondsHeld = Number(allBondTotals._sum.amount ?? 0) - Number(allBondTotals._sum.amountRefunded ?? 0) - Number(allBondTotals._sum.amountForfeited ?? 0);

  const feeBreakdown = new Map<string, number>();
  for (const item of feeCollections) feeBreakdown.set(collectionLabel(item.type, item.description), (feeBreakdown.get(collectionLabel(item.type, item.description)) ?? 0) + Number(item.amount));
  const expenseBreakdown = new Map<string, number>();
  for (const item of expenses) expenseBreakdown.set(item.category.name, (expenseBreakdown.get(item.category.name) ?? 0) + Number(item.amount));

  const reportQuery = `from=${fromText}&to=${toText}`;
  return <><PageHeader eyebrow="Financials" title="HOA financial reports" description={`Reporting period: ${shortDate(from)} to ${shortDate(to)}.`} action={<div className="flex flex-wrap gap-2"><a className="btn-primary" href={`/admin/reports/pdf?${reportQuery}`}><Download className="size-4" /> PDF report</a><a className="btn-secondary" href={`/admin/reports/docx?${reportQuery}`}><FileText className="size-4" /> Word report</a><a className="btn-secondary" href="/admin/reports/export"><Download className="size-4" /> CSV</a></div>} />
    <form className="card mb-6 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><div><label className="label">From</label><input className="field" name="from" type="date" defaultValue={fromText} required /></div><div><label className="label">To</label><input className="field" name="to" type="date" defaultValue={toText} required /></div><button className="btn-primary">Generate report</button></form>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><StatCard label="Recognized income" value={money(recognizedIncome)} note="Dues, fees and forfeitures" icon={ReceiptText} /><StatCard label="Operating expenses" value={money(totalExpenses)} note="Expenses plus finalized payroll" icon={WalletCards} /><StatCard label="Operating surplus" value={money(operatingSurplus)} note="Income less operating expenses" icon={TrendingUp} /><StatCard label="Refundable bonds held" value={money(bondsHeld)} note="Ending liability, all periods" icon={HandCoins} /><StatCard label="Employee loan balance" value={money(employeeLoanOutstanding)} note="Cash advances and loans receivable" icon={HandCoins} /></section>

    <section className="mt-6 grid gap-6 xl:grid-cols-2"><Statement title="Statement of Income and Expenses" subtitle={`${shortDate(from)} to ${shortDate(to)}`}><SectionLabel text="REVENUE" /><Row label="Homeowner monthly dues" value={duesIncome} />{[...feeBreakdown.entries()].map(([label, value]) => <Row key={label} label={label} value={value} />)}<Row label="Forfeited bond income" value={forfeitedIncome} /><Row label="Total revenue" value={recognizedIncome} total /><SectionLabel text="OPERATING EXPENSES" />{[...expenseBreakdown.entries()].map(([label, value]) => <Row key={label} label={label} value={value} />)}<Row label="Employee payroll" value={payrollExpense} /><Row label="Total operating expenses" value={totalExpenses} total /><Row label="NET OPERATING SURPLUS / (DEFICIT)" value={operatingSurplus} grand /></Statement>
      <Statement title="Statement of Cash Receipts and Disbursements" subtitle={`${shortDate(from)} to ${shortDate(to)}`}><SectionLabel text="CASH RECEIPTS" /><Row label="Monthly dues collections" value={duesIncome} /><Row label="Other fee collections" value={feeIncome} /><Row label="Refundable bonds received" value={bondsReceived} /><Row label="Total cash receipts" value={cashInflows} total /><SectionLabel text="CASH DISBURSEMENTS" /><Row label="Operating expenses" value={operatingExpenses} /><Row label="Employee payroll" value={payrollExpense} /><Row label="Employee loans / cash advances issued" value={employeeLoansIssued} /><Row label="Bond refunds" value={bondsRefunded} /><Row label="Total cash disbursements" value={cashOutflows} total /><Row label="NET CASH MOVEMENT" value={netCashMovement} grand /></Statement></section>

    <section className="card mt-6"><h2 className="text-lg font-black">Monthly dues collection summary</h2><p className="mb-4 text-sm text-slate-500">Receipt-level collection detail, including every allocated billing period.</p><div className="table-wrap shadow-none"><table className="data-table"><thead><tr><th>Receipt</th><th>Homeowner</th><th>Payment date</th><th>Payment Coverage</th><th className="text-right">Amount</th></tr></thead><tbody>{payments.map((payment) => <tr key={payment.id}><td className="font-mono text-xs font-bold text-pine-700">{payment.receiptNumber || "Legacy receipt"}</td><td className="font-bold">{payment.homeowner.user.name}</td><td>{shortDate(payment.paymentDate)}</td><td>{paymentAllocationCoverageLabel(payment)}</td><td className="text-right font-black">{money(payment.amount)}</td></tr>)}{!payments.length && <tr><td colSpan={5} className="py-10 text-center text-slate-500">No monthly dues collections in this reporting period.</td></tr>}</tbody></table></div></section>

    <section className="card mt-6"><h2 className="text-lg font-black">Refundable bond accountability</h2><p className="mb-4 text-sm text-slate-500">Bonds are liabilities until refunded or forfeited after a documented violation.</p><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Bonds received this period" value={bondsReceived} /><Metric label="Bonds refunded this period" value={bondsRefunded} /><Metric label="Bonds forfeited to income" value={forfeitedIncome} /><Metric label="Ending bonds held" value={bondsHeld} /></div></section>

    <section className="card mt-6"><h2 className="text-lg font-black">Employee loans and cash advances</h2><p className="mb-4 text-sm text-slate-500">Loan releases are tracked as employee receivables. Payroll repayments reduce the balance after the payroll period is marked paid.</p><div className="grid gap-3 sm:grid-cols-3"><Metric label="Issued this period" value={employeeLoansIssued} /><Metric label="Payroll repayments this period" value={employeeLoanRepayments} /><Metric label="Outstanding balance" value={employeeLoanOutstanding} /></div><div className="table-wrap mt-5"><table className="data-table"><thead><tr><th>Employee</th><th>Loan / cash advance</th><th>Issued</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead><tbody>{employeeLoanBalances.map((loan) => <tr key={loan.id}><td><p className="font-bold">{loan.employee.name}</p><p className="text-xs text-slate-400">{loan.employee.employeeNumber}</p></td><td><p className="font-bold">{loanTypeLabel(loan.type)}</p><p className="text-xs text-slate-500">{loan.description}</p></td><td>{money(loan.principalAmount)}</td><td>{money(loan.amountPaid)}</td><td className="font-black text-pine-700">{money(loan.balance)}</td><td>{loanStatusLabel(loan.status, loan.balance)}</td></tr>)}{!employeeLoanBalances.length && <tr><td colSpan={6} className="py-10 text-center text-slate-500">No employee loans or cash advances recorded.</td></tr>}</tbody></table></div></section>

    <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_2fr]"><div className="card"><h2 className="mb-4 text-lg font-black">Dues receivables</h2><p className="mb-3 text-sm text-slate-500">Lifetime billed: {money(billSummary._sum.totalAmount ?? 0)}<br />Outstanding: {money(billSummary._sum.balance ?? 0)}</p><div className="space-y-3">{statusCounts.map((row) => <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3" key={row.status}><StatusBadge status={row.status} /><div className="text-right"><p className="font-black">{row._count} bills</p><p className="text-xs text-slate-500">{money(row._sum.balance ?? 0)}</p></div></div>)}</div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Billing month</th><th>Billed</th><th>Paid</th><th>Balance</th><th>Collection rate</th></tr></thead><tbody>{monthly.map((row) => { const total = Number(row._sum.totalAmount ?? 0); const paid = Number(row._sum.amountPaid ?? 0); return <tr key={row.billingMonth.toISOString()}><td className="font-bold">{monthLabel(row.billingMonth)}</td><td>{money(total)}</td><td>{money(paid)}</td><td>{money(row._sum.balance ?? 0)}</td><td className="font-black text-pine-700">{total ? `${Math.round((paid / total) * 100)}%` : "0%"}</td></tr>; })}</tbody></table></div></section>
  </>;
}

function Statement({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) { return <article className="card"><div className="mb-4 text-center"><h2 className="text-lg font-black uppercase">{title}</h2><p className="text-sm text-slate-500">{subtitle}</p></div><div className="space-y-1 text-sm">{children}</div></article>; }
function SectionLabel({ text }: { text: string }) { return <p className="mt-4 border-b pb-1 text-xs font-black tracking-widest text-slate-500">{text}</p>; }
function Row({ label, value, total = false, grand = false }: { label: string; value: number; total?: boolean; grand?: boolean }) { return <div className={`flex justify-between gap-4 px-2 py-1.5 ${total ? "border-t font-bold" : ""} ${grand ? "mt-3 border-y-2 border-ink py-2 font-black" : ""}`}><span>{label}</span><span className={value < 0 ? "text-rose-700" : ""}>{money(value)}</span></div>; }
function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 text-xl font-black">{money(value)}</p></div>; }
function loanTypeLabel(type: string) { return type.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function loanStatusLabel(status: string, balance: number | string | { toString(): string }) { if (status === "PAID" || Number(balance) <= 0) return "Fully Paid"; if (status === "OPEN") return "Open"; return "Cancelled"; }
