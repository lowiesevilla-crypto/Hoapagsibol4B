import Link from "next/link";
import { Banknote, CircleDollarSign, WalletCards } from "lucide-react";
import { EmployeeLoanStatus, PayrollStatus, Role } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { money, shortDate } from "@/lib/utils";

export default async function EmployeeLoansPage() {
  const user = await requireUser(Role.EMPLOYEE);
  if (!user.employeeProfile) throw new Error("Employee profile not linked.");

  const loans = await prisma.employeeLoan.findMany({
    where: { tenantId: user.tenantId, employeeId: user.employeeProfile.id },
    include: {
      payrollDeductions: {
        include: { payroll: { select: { status: true, startDate: true, endDate: true, payDate: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: [{ status: "asc" }, { issuedDate: "desc" }],
  });

  const openLoans = loans.filter((loan) => loan.status === EmployeeLoanStatus.OPEN);
  const totalOutstanding = openLoans.reduce((sum, loan) => sum + Number(loan.balance), 0);
  const totalPaid = loans.reduce((sum, loan) => sum + Number(loan.amountPaid), 0);
  const pendingPayrollDeductions = loans.reduce((sum, loan) => sum + loan.payrollDeductions
    .filter((item) => item.payroll.status !== PayrollStatus.PAID)
    .reduce((loanSum, item) => loanSum + Number(item.amount), 0), 0);

  return <>
    <PageHeader
      eyebrow="Employee self-service"
      title="Loans & cash advances"
      description="See your outstanding balance, total payments or payroll deductions, and deductions already scheduled in an open payroll period."
    />

    <nav className="mb-6 flex gap-2 overflow-x-auto pb-2">
      <Link className="btn-secondary shrink-0" href="/employee/attendance">Time</Link>
      <Link className="btn-secondary shrink-0" href="/employee/requests/overtime">Overtime</Link>
      <Link className="btn-secondary shrink-0" href="/employee/payslips">Payslips</Link>
      <Link className="btn-primary shrink-0" href="/employee/loans">Loans</Link>
    </nav>

    <section className="mb-6 grid gap-4 sm:grid-cols-3">
      <div className="card">
        <div className="flex items-center justify-between gap-3"><p className="text-xs font-black uppercase tracking-wider text-slate-500">Outstanding balance</p><CircleDollarSign className="size-5 text-slate-400" /></div>
        <p className="mt-2 text-3xl font-black text-ink">{money(totalOutstanding)}</p>
        <p className="mt-1 text-xs text-slate-500">Across {openLoans.length} open account{openLoans.length === 1 ? "" : "s"}</p>
      </div>
      <div className="card">
        <div className="flex items-center justify-between gap-3"><p className="text-xs font-black uppercase tracking-wider text-slate-500">Total paid / deducted</p><Banknote className="size-5 text-slate-400" /></div>
        <p className="mt-2 text-3xl font-black text-pine-700">{money(totalPaid)}</p>
        <p className="mt-1 text-xs text-slate-500">Recorded against your loans and cash advances</p>
      </div>
      <div className="card">
        <div className="flex items-center justify-between gap-3"><p className="text-xs font-black uppercase tracking-wider text-slate-500">Scheduled payroll deductions</p><WalletCards className="size-5 text-slate-400" /></div>
        <p className="mt-2 text-3xl font-black text-amber-700">{money(pendingPayrollDeductions)}</p>
        <p className="mt-1 text-xs text-slate-500">Draft or finalized payroll not yet marked paid</p>
      </div>
    </section>

    <section className="space-y-4">
      {loans.map((loan) => {
        const paidPayrollDeductions = loan.payrollDeductions
          .filter((item) => item.payroll.status === PayrollStatus.PAID)
          .reduce((sum, item) => sum + Number(item.amount), 0);
        const scheduled = loan.payrollDeductions
          .filter((item) => item.payroll.status !== PayrollStatus.PAID)
          .reduce((sum, item) => sum + Number(item.amount), 0);
        const progress = Number(loan.principalAmount) > 0
          ? Math.min(100, Math.max(0, (Number(loan.amountPaid) / Number(loan.principalAmount)) * 100))
          : 0;

        return <article key={loan.id} className="card">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-black">{loan.description}</h2>
                <StatusBadge status={loan.status} />
              </div>
              <p className="mt-1 text-sm text-slate-500">{loan.type.replaceAll("_", " ")} · Issued {shortDate(loan.issuedDate)}</p>
              {loan.referenceNumber && <p className="mt-1 text-xs text-slate-500">Reference: {loan.referenceNumber}</p>}
            </div>
            <div className="grid min-w-[300px] gap-3 sm:grid-cols-3">
              <Metric label="Principal" value={money(loan.principalAmount)} />
              <Metric label="Paid / deducted" value={money(loan.amountPaid)} />
              <Metric label="Balance" value={money(loan.balance)} strong />
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between text-xs font-bold text-slate-500"><span>Repayment progress</span><span>{progress.toFixed(0)}%</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-pine-600" style={{ width: `${progress}%` }} /></div>
          </div>

          <div className="mt-5 grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-3">
            <Metric label="Paid payroll deductions" value={money(paidPayrollDeductions)} />
            <Metric label="Scheduled next deductions" value={money(scheduled)} />
            <Metric label="Other/manual payments" value={money(Math.max(0, Number(loan.amountPaid) - paidPayrollDeductions))} />
          </div>

          {loan.payrollDeductions.length > 0 && <details className="mt-4 rounded-2xl border border-slate-100 p-4">
            <summary className="cursor-pointer font-bold">Payroll deduction history</summary>
            <div className="mt-3 space-y-2">
              {loan.payrollDeductions.map((item) => <div key={item.id} className="flex flex-col justify-between gap-1 rounded-xl bg-white p-3 text-sm sm:flex-row sm:items-center">
                <span>{shortDate(item.payroll.startDate)} - {shortDate(item.payroll.endDate)}</span>
                <span className="font-bold">{money(item.amount)} · {item.payroll.status.replaceAll("_", " ")}</span>
              </div>)}
            </div>
          </details>}
        </article>;
      })}

      {!loans.length && <div className="card py-14 text-center text-slate-500"><WalletCards className="mx-auto mb-3 size-9 text-slate-300" /><p className="font-bold text-slate-700">No loans or cash advances</p><p className="mt-1 text-sm">Any loan or cash advance recorded by Payroll will appear here automatically.</p></div>}
    </section>
  </>;
}

function Metric({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div><p className="text-xs font-black uppercase tracking-wider text-slate-500">{label}</p><p className={`mt-1 ${strong ? "text-lg font-black text-pine-700" : "font-bold text-ink"}`}>{value}</p></div>;
}
