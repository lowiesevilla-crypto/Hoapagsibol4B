import { Download, FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { PayrollReportPrintButton } from "@/components/payroll-report-print-button";
import { StatusBadge } from "@/components/status-badge";
import { requirePayrollAccess } from "@/lib/payroll-access";
import { getPayrollReport, parsePayrollReportStatus } from "@/lib/services/payroll-report";
import { inputDate, money, shortDate } from "@/lib/utils";

type PayrollReportPageProps = {
  searchParams: Promise<{ from?: string; to?: string; status?: string }>;
};

/**
 * @requirement PAY-RPT-001 PAY-SEC-001
 * @status IMPLEMENTED
 * @description Printable and CSV-exportable tenant-scoped payroll report with payout-date and status filters.
 */
export default async function PayrollReportsPage({ searchParams }: PayrollReportPageProps) {
  const { user } = await requirePayrollAccess();
  const filters = await searchParams;
  const now = new Date();
  const defaultFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const fromText = validDateInput(filters.from) ? filters.from! : inputDate(defaultFrom);
  const toText = validDateInput(filters.to) ? filters.to! : inputDate(now);
  const from = new Date(`${fromText}T00:00:00.000Z`);
  const to = new Date(`${toText}T23:59:59.999Z`);
  const status = parsePayrollReportStatus(filters.status);
  const report = await getPayrollReport({ tenantId: user.tenantId, from, to, status });
  const query = new URLSearchParams({ from: fromText, to: toText, status }).toString();

  return <>
    <div className="print:hidden">
      <PageHeader
        eyebrow="Payroll"
        title="Payroll report"
        description={`Tenant-confidential payroll from ${shortDate(from)} to ${shortDate(to)} by payout date.`}
        action={<div className="flex flex-wrap gap-2">
          <a className="btn-primary" href={`/admin/payroll/reports/export?${query}`}><Download className="size-4" /> Export CSV</a>
          <PayrollReportPrintButton />
        </div>}
      />
      <form className="card mb-6 grid gap-4 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
        <div><label className="label" htmlFor="from">From payout date</label><input className="field" id="from" name="from" type="date" defaultValue={fromText} required /></div>
        <div><label className="label" htmlFor="to">To payout date</label><input className="field" id="to" name="to" type="date" defaultValue={toText} required /></div>
        <div><label className="label" htmlFor="status">Payroll status</label><select className="field" id="status" name="status" defaultValue={status}><option value="ALL">All statuses</option><option value="DRAFT">Draft</option><option value="CALCULATED">Calculated</option><option value="FINALIZED">Finalized</option><option value="POSTING">Posting</option><option value="POSTED">Posted</option><option value="POST_FAILED">Post failed</option><option value="PAID">Paid</option></select></div>
        <button className="btn-primary">Generate</button>
      </form>
    </div>

    <section className="mb-6 hidden print:block">
      <h1 className="text-2xl font-black">Payroll Report</h1>
      <p className="text-sm">Payout dates: {shortDate(from)} to {shortDate(to)} · Status: {status === "ALL" ? "All" : status}</p>
    </section>

    <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Payroll periods" value={String(report.totals.periods)} />
      <Metric label="Employees" value={String(report.totals.employees)} />
      <Metric label="Gross payroll" value={money(report.totals.grossPay)} />
      <Metric label="Net payroll" value={money(report.totals.netPay)} />
    </section>

    <section className="card mb-6">
      <div className="flex items-start justify-between gap-4">
        <div><h2 className="text-lg font-black">Payroll totals</h2><p className="text-sm text-slate-500">The totals below are calculated from the same employee rows used for CSV export.</p></div>
        <FileSpreadsheet className="size-6 text-pine-700 print:hidden" />
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Basic pay" value={money(report.totals.basicPay)} compact />
        <Metric label="Overtime pay" value={money(report.totals.overtimePay)} compact />
        <Metric label="Allowances" value={money(report.totals.allowance)} compact />
        <Metric label="Deductions" value={money(report.totals.deduction)} compact />
        <Metric label="Payable days" value={report.totals.payableDays.toFixed(2)} compact />
        <Metric label="Absent days" value={report.totals.absentDays.toFixed(2)} compact />
        <Metric label="OT hours" value={report.totals.overtimeHours.toFixed(2)} compact />
        <Metric label="Payslips" value={String(report.totals.payslips)} compact />
      </div>
    </section>

    <section className="card print:border-0 print:p-0 print:shadow-none">
      <div className="mb-4"><h2 className="text-lg font-black">Employee payroll breakdown</h2><p className="text-sm text-slate-500">Each row is tied to one payroll period and payslip for the authenticated tenant.</p></div>
      <div className="table-wrap shadow-none print:overflow-visible">
        <table className="data-table text-xs">
          <thead><tr><th>Employee</th><th>Coverage</th><th>Pay date</th><th>Status</th><th className="text-right">Days</th><th className="text-right">OT hrs</th><th className="text-right">Basic</th><th className="text-right">OT pay</th><th className="text-right">Allowance</th><th className="text-right">Deduction</th><th className="text-right">Gross</th><th className="text-right">Net</th></tr></thead>
          <tbody>
            {report.rows.map((row) => <tr key={row.payslipId}>
              <td><p className="font-bold">{row.employeeName}</p><p className="text-[11px] text-slate-500">{row.employeeNumber} · {row.position}</p></td>
              <td>{shortDate(row.periodStart)} – {shortDate(row.periodEnd)}</td>
              <td>{shortDate(row.payDate)}</td>
              <td><StatusBadge status={row.payrollStatus} /></td>
              <td className="text-right">{row.payableDays.toFixed(2)}</td>
              <td className="text-right">{row.overtimeHours.toFixed(2)}</td>
              <td className="text-right">{money(row.basicPay)}</td>
              <td className="text-right">{money(row.overtimePay)}</td>
              <td className="text-right">{money(row.allowance)}</td>
              <td className="text-right">{money(row.deduction)}</td>
              <td className="text-right font-bold">{money(row.grossPay)}</td>
              <td className="text-right font-black text-pine-700">{money(row.netPay)}</td>
            </tr>)}
            {!report.rows.length && <tr><td colSpan={12} className="py-12 text-center text-slate-500">No payroll records match the selected payout-date range and status.</td></tr>}
          </tbody>
          {!!report.rows.length && <tfoot><tr className="font-black"><td colSpan={6}>TOTAL</td><td className="text-right">{money(report.totals.basicPay)}</td><td className="text-right">{money(report.totals.overtimePay)}</td><td className="text-right">{money(report.totals.allowance)}</td><td className="text-right">{money(report.totals.deduction)}</td><td className="text-right">{money(report.totals.grossPay)}</td><td className="text-right">{money(report.totals.netPay)}</td></tr></tfoot>}
        </table>
      </div>
    </section>
  </>;
}

function validDateInput(value: string | undefined) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value ?? "");
}

function Metric({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return <div className={compact ? "rounded-xl bg-slate-50 p-3" : "card"}><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className={compact ? "mt-1 text-lg font-black" : "mt-2 text-2xl font-black"}>{value}</p></div>;
}
