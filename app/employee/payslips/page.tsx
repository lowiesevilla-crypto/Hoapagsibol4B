import { StandardTable } from "@/components/standard-table";
import Link from "next/link";
import { Download, Printer, ReceiptText } from "lucide-react";
import { PayrollStatus, Role } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { money, shortDate } from "@/lib/utils";

export default async function EmployeePayslipsPage() {
  const user = await requireUser(Role.EMPLOYEE);
  if (!user.employeeProfile) throw new Error("Employee profile not linked.");

  const payslips = await prisma.payslip.findMany({
    where: { employeeId: user.employeeProfile.id, payroll: { status: PayrollStatus.PAID } },
    include: { payroll: true },
    orderBy: [{ payroll: { payDate: "desc" } }, { createdAt: "desc" }],
  });
  const totalNet = payslips.reduce((sum, slip) => sum + Number(slip.netPay), 0);
  const latest = payslips[0];

  return <>
    <PageHeader
      eyebrow="Employee self-service"
      title="My payslips"
      description="View paid payroll history, print payslips, and download PDF copies for your records."
    />
    <section className="mb-6 grid gap-4 md:grid-cols-3">
      <div className="card">
        <p className="text-xs font-black uppercase tracking-wider text-slate-500">Paid payslips</p>
        <p className="mt-2 text-3xl font-black text-ink">{payslips.length}</p>
      </div>
      <div className="card">
        <p className="text-xs font-black uppercase tracking-wider text-slate-500">Total net pay</p>
        <p className="mt-2 text-3xl font-black text-pine-700">{money(totalNet)}</p>
      </div>
      <div className="card">
        <p className="text-xs font-black uppercase tracking-wider text-slate-500">Latest payment</p>
        <p className="mt-2 text-3xl font-black text-ink">{latest ? shortDate(latest.payroll.payDate) : "-"}</p>
      </div>
    </section>
    <section className="card">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-black">Payroll history</h2>
          <p className="text-sm text-slate-500">Payslips appear here after payroll has been finalized and marked as paid.</p>
        </div>
      </div>
      <div className="table-wrap shadow-none">
        <StandardTable><table className="data-table">
          <thead><tr><th>Payroll Period</th><th>Gross Pay</th><th>Deductions</th><th>Net Pay</th><th>Payment Date</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {payslips.map((slip) => <tr key={slip.id}>
              <td className="font-bold">{shortDate(slip.payroll.startDate)} - {shortDate(slip.payroll.endDate)}</td>
              <td>{money(slip.grossPay)}</td>
              <td>{money(slip.deduction)}</td>
              <td className="font-black text-pine-700">{money(slip.netPay)}</td>
              <td>{shortDate(slip.payroll.payDate)}</td>
              <td><StatusBadge status={slip.payroll.status} /></td>
              <td>
                <div className="flex flex-wrap justify-end gap-2">
                  <Link className="btn-secondary min-h-8 px-3 py-1" href={`/employee/payslips/${slip.id}`}><Printer className="size-4" /> View / Print</Link>
                  <Link className="btn-primary min-h-8 px-3 py-1" href={`/employee/payslips/${slip.id}/pdf`}><Download className="size-4" /> Download PDF</Link>
                </div>
              </td>
            </tr>)}
            {!payslips.length && <tr><td colSpan={7} className="py-12 text-center text-slate-500"><ReceiptText className="mx-auto mb-3 size-8 text-slate-300" />No paid payslips are available yet.</td></tr>}
          </tbody>
        </table></StandardTable>
      </div>
    </section>
  </>;
}
