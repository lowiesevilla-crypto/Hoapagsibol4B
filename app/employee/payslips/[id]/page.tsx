import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { PayrollStatus, Role } from "@prisma/client";
import { AssociationLogo } from "@/components/association-logo";
import { PrintButton } from "@/components/print-button";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getAssociationSettings } from "@/lib/system-settings";
import { money, shortDate } from "@/lib/utils";

export default async function EmployeePayslipPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(Role.EMPLOYEE);
  if (!user.employeeProfile) notFound();
  const { id } = await params;
  const slip = await prisma.payslip.findUnique({ where: { id }, include: { employee: true, payroll: true } });
  if (!slip || slip.employeeId !== user.employeeProfile.id || slip.payroll.status !== PayrollStatus.PAID) notFound();

  const assignedDeductions = await prisma.payrollDeduction.findMany({
    where: { payrollId: slip.payrollId, employeeId: slip.employeeId },
    include: { deductionType: true, employeeLoan: true },
    orderBy: { createdAt: "asc" },
  });
  const association = await getAssociationSettings(user.tenantId);

  return <main className="print-document mx-auto min-h-screen max-w-3xl bg-white p-5 sm:p-10">
    <div className="print-hidden mb-6 flex flex-wrap justify-end gap-2">
      <Link className="btn-secondary" href="/employee/payslips">Back to payslips</Link>
      <Link className="btn-primary" href={`/employee/payslips/${slip.id}/pdf`}><Download className="size-4" />Download PDF</Link>
      <PrintButton label="Print payslip" />
    </div>
    <section className="border-2 border-ink p-5 sm:p-8">
      <header className="flex flex-col gap-4 border-b-2 border-ink pb-5 sm:flex-row sm:items-center">
        <AssociationLogo className="size-20" src={association.logoUrl} alt={`${association.name} logo`} />
        <div>
          <h1 className="text-lg font-black sm:text-2xl">{association.name}</h1>
          <p className="text-sm font-bold uppercase tracking-widest">Employee Payslip</p>
          {association.address && <p className="mt-1 text-xs text-slate-500">{association.address}</p>}
          {association.tinNumber && <p className="text-xs text-slate-500">TIN: {association.tinNumber}</p>}
        </div>
      </header>
      <div className="grid gap-3 border-b border-ink py-5 text-sm sm:grid-cols-2">
        <Info label="Employee" value={slip.employee.name} />
        <Info label="Employee no." value={slip.employee.employeeNumber} />
        <Info label="Position" value={slip.employee.position} />
        <Info label="Payment status" value={slip.payroll.status} />
        <Info label="Payroll period" value={`${shortDate(slip.payroll.startDate)} - ${shortDate(slip.payroll.endDate)}`} />
        <Info label="Payment date" value={shortDate(slip.payroll.payDate)} />
      </div>
      <div className="grid gap-6 py-6 sm:grid-cols-2">
        <div>
          <h2 className="mb-3 border-b font-black uppercase">Earnings</h2>
          <Line label={`Basic pay (${slip.payableDays} days)`} value={money(slip.basicPay)} />
          <Line label={`Overtime (${slip.overtimeHours} hrs)`} value={money(slip.overtimePay)} />
          <Line label="Allowance" value={money(slip.allowance)} />
          <Line label="Gross pay" value={money(slip.grossPay)} strong />
        </div>
        <div>
          <h2 className="mb-3 border-b font-black uppercase">Deductions</h2>
          {Number(slip.employee.fixedDeduction) > 0 && <Line label="Employee fixed deduction" value={money(slip.employee.fixedDeduction)} />}
          {assignedDeductions.map((deduction) => <Line key={deduction.id} label={deductionLabel(deduction)} value={money(deduction.amount)} />)}
          {!assignedDeductions.length && Number(slip.employee.fixedDeduction) <= 0 && <Line label="No assigned deductions" value={money(0)} />}
          <Line label="Total deductions" value={money(slip.deduction)} strong />
          <Line label="Absent days" value={String(slip.absentDays)} />
          <div className="mt-8 border-2 border-ink p-3"><Line label="NET PAY" value={money(slip.netPay)} strong /></div>
        </div>
      </div>
      <div className="mt-12 grid gap-10 text-center text-xs sm:grid-cols-2">
        <div className="border-t border-ink pt-2">Employee signature</div>
        <div className="border-t border-ink pt-2">Authorized signature</div>
      </div>
    </section>
  </main>;
}

function Info({ label, value }: { label: string; value: string }) { return <p><span className="font-bold">{label}:</span> {value}</p>; }
function Line({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) { return <div className={`flex justify-between gap-4 py-1.5 ${strong ? "font-black" : ""}`}><span>{label}</span><span>{value}</span></div>; }
function deductionLabel(deduction: { deductionType: { name: string }; employeeLoan: { description: string; balance: number | string | { toString(): string } } | null }) {
  if (!deduction.employeeLoan) return deduction.deductionType.name;
  return `${deduction.deductionType.name} - ${deduction.employeeLoan.description} (balance ${money(deduction.employeeLoan.balance)})`;
}
