import { StandardTable } from "@/components/standard-table";
import Link from "next/link";
import { AlertTriangle, CalendarDays, Calculator, CheckCircle2, HandCoins, LockKeyhole, Printer, RotateCcw, ShieldCheck } from "lucide-react";
import { PayrollAccessRole } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { PayrollCutoffDeductionsPanel } from "@/components/payroll-cutoff-deductions-panel";
import { PayrollDeleteForm } from "@/components/payroll-delete-form";
import { StatusBadge } from "@/components/status-badge";
import { DeleteButton, SubmitButton } from "@/components/ui";
import {
  cancelEmployeeLoanAction,
  deleteEmployeeScheduleAction,
  deletePayrollAccessAction,
  deletePayrollCalendarDayAction,
  finalizePayrollAction,
  generatePayrollAction,
  markPayrollPaidAction,
  recalculatePayrollAction,
  returnPayrollToDraftAction,
  reviewOvertimeRecordAction,
  saveEmployeeLoanAction,
  saveEmployeeScheduleAction,
  savePayrollAccessAction,
  savePayrollCalendarDayAction,
  savePayrollDeductionTypeAction,
  saveOvertimeRecordAction,
} from "@/lib/actions/payroll";
import { prisma } from "@/lib/db";
import { hasPayrollRole, payrollApprovalRoles, payrollManageRoles, payrollRoleLabel, payrollWriteRoles, requirePayrollAccess } from "@/lib/payroll-access";
import { inputDate, money, shortDate } from "@/lib/utils";

type PayrollPageProps = { searchParams: Promise<{ period?: string; section?: string; employee?: string }> };

export default async function PayrollPage({ searchParams }: PayrollPageProps) {
  const { roles } = await requirePayrollAccess();
  const { period: periodId, section: requestedSection, employee: requestedEmployeeId } = await searchParams;
  const validSections = ["dashboard", "employees", "attendance", "processing", "calendar", "adjustments", "overtime", "loans", "approval", "payslips", "reports", "contributions", "settings"];
  const section = validSections.includes(requestedSection ?? "") ? requestedSection! : "dashboard";
  const canWritePayroll = hasPayrollRole(roles, payrollWriteRoles);
  const canApprovePayroll = hasPayrollRole(roles, payrollApprovalRoles);
  const canManagePayroll = hasPayrollRole(roles, payrollManageRoles);
  const periods = await prisma.payrollPeriod.findMany({
    include: {
      payslips: { include: { employee: true }, orderBy: { employee: { name: "asc" } } },
      deductions: { include: { employee: true, deductionType: true, employeeLoan: true }, orderBy: { createdAt: "desc" } },
      _count: { select: { payslips: true } },
    },
    orderBy: { endDate: "desc" },
  });
  const deductionTypes = await prisma.payrollDeductionType.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] });
  const activeEmployees = await prisma.employeeProfile.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } });
  const employeeLoans = await prisma.employeeLoan.findMany({ include: { employee: true }, orderBy: [{ status: "asc" }, { issuedDate: "desc" }, { createdAt: "desc" }] });
  const calendarDays = await prisma.payrollCalendarDay.findMany({ include: { createdBy: true }, orderBy: { date: "desc" }, take: 80 });
  const schedules = await prisma.employeeSchedule.findMany({ include: { employee: true }, orderBy: [{ employee: { name: "asc" } }, { dayOfWeek: "asc" }, { effectiveFrom: "desc" }], take: 120 });
  const payrollUsers = await prisma.user.findMany({ where: { role: { in: ["ADMIN", "SYSTEM_ADMIN", "EMPLOYEE"] } }, include: { employeeProfile: true, payrollAccesses: { orderBy: { role: "asc" } } }, orderBy: { name: "asc" } });
  const payrollAccesses = await prisma.payrollAccess.findMany({ include: { user: true, grantedBy: true }, orderBy: [{ active: "desc" }, { role: "asc" }] });
  const auditLogs = await prisma.auditLog.findMany({ where: { module: { in: ["PAYROLL", "ATTENDANCE"] } }, include: { actor: true }, orderBy: { createdAt: "desc" }, take: 20 });
  const overtimeRecords = await prisma.overtimeRecord.findMany({ include: { employee: true, createdBy: true, reviewedBy: true }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 200 });
  const activeDeductionTypes = deductionTypes.filter((deduction) => deduction.active);
  const openEmployeeLoans = employeeLoans.filter((loan) => loan.status === "OPEN" && Number(loan.balance) > 0);
  const selected = periods.find((period) => period.id === periodId) ?? periods[0];
  const selectedDeductionAssignments = [...(selected?.deductions ?? [])].sort((a, b) => a.employee.name.localeCompare(b.employee.name) || a.deductionType.name.localeCompare(b.deductionType.name));
  const initialDeductionEmployeeId = activeEmployees.some((employee) => employee.id === requestedEmployeeId) ? requestedEmployeeId : "";
  const selectedGrossPay = selected?.payslips.reduce((sum, slip) => sum + Number(slip.grossPay), 0) ?? 0;
  const selectedDeductions = selected?.payslips.reduce((sum, slip) => sum + Number(slip.deduction), 0) ?? 0;
  const selectedTotalPayroll = selected?.payslips.reduce((sum, slip) => sum + Number(slip.netPay), 0) ?? 0;
  const activeLoanRecords = employeeLoans.filter((loan) => loan.status !== "CANCELLED");
  const totalLoanPrincipal = activeLoanRecords.reduce((sum, loan) => sum + Number(loan.principalAmount), 0);
  const totalLoanPaid = activeLoanRecords.reduce((sum, loan) => sum + Number(loan.amountPaid), 0);
  const totalLoanBalance = activeLoanRecords.reduce((sum, loan) => sum + Number(loan.balance), 0);
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  const tabs = [
    { id: "dashboard", href: "/admin/payroll", label: "Dashboard" },
    { id: "processing", href: "/admin/payroll/periods", label: "Period management" },
    { id: "processing", href: "/admin/payroll/computation", label: "Computation" },
    { id: "payslips", href: "/admin/payroll/employee-details", label: "Employee details" },
    { id: "adjustments", href: "/admin/payroll/adjustments", label: "Adjustments" },
    { id: "overtime", href: "/admin/payroll/overtime", label: "Approved OT" },
    { id: "loans", href: "/admin/payroll/deductions", label: "Deductions & balances" },
    { id: "approval", href: "/admin/payroll/review", label: "Review" },
    { id: "approval", href: "/admin/payroll/approval", label: "Approval" },
    { id: "approval", href: "/admin/payroll/release", label: "Release / mark paid" },
    { id: "payslips", href: "/admin/payroll/payslips", label: "Payslips" },
    { id: "reports", href: "/admin/payroll/reports", label: "Reports" },
    { id: "settings", href: "/admin/payroll/settings", label: "Settings" },
    { id: "archive", href: "/admin/payroll/archive", label: "Archive" },
  ];

  return <>
    <PageHeader
      eyebrow="Human resources"
      title="Payroll & payslips"
      description="Calculate salary from attendance, reopen finalized periods for adjustments, lock paid periods, and print individual payslips."
    />
    <section className="mb-6 rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-950">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 size-5 shrink-0" /><div><p className="font-black">Confidential payroll module</p><p>Payroll access is separate from general Admin access. Your active payroll role{roles.length === 1 ? "" : "s"}: {roles.map(payrollRoleLabel).join(", ")}.</p></div></div>
        {canManagePayroll && <Link className="btn-secondary min-h-8 px-3 py-1 text-xs" href="/admin/payroll?section=settings">Manage payroll access</Link>}
      </div>
    </section>
    <nav className="mb-6 flex max-w-full gap-2 overflow-x-auto pb-2" aria-label="Payroll sections">
      {tabs.map((tab, index) => <Link key={`${tab.href}-${index}`} href={tab.href} className={`shrink-0 rounded-xl border px-4 py-2 text-sm font-bold transition ${section === tab.id ? "border-pine-500 bg-pine-50 text-pine-900 shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{tab.label}</Link>)}
    </nav>

    {section === "dashboard" && <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Payroll periods" value={periods.length} currency={false} />
      <Metric label="Draft periods" value={periods.filter((item) => item.status === "DRAFT").length} currency={false} />
      <Metric label="Pending OT requests" value={overtimeRecords.filter((item) => item.status === "PENDING").length} currency={false} />
      <Metric label="Latest net payroll" value={selectedTotalPayroll} />
    </section>}

    {section === "employees" && <section className="grid gap-4 lg:grid-cols-2">
      <SectionLinkCard title="Employee master data" description="Add, edit, activate, or deactivate employee profiles, salary type, base rate, and standard work days." href="/admin/employees" action="Open employee profiles" />
      <SectionLinkCard title="Before payroll processing" description="Confirm each employee profile is updated before calculating a draft payroll period." href="/admin/employees/new" action="Add new employee" />
    </section>}

    {section === "attendance" && <section className="grid gap-4 lg:grid-cols-2">
      <SectionLinkCard title="Attendance management" description="Encode or correct employee attendance, time in, time out, leave status, and overtime hours." href="/admin/attendance" action="Open attendance" />
      <div className="card text-sm leading-6 text-slate-600">
        <h2 className="mb-2 text-lg font-black text-ink">Attendance reminder</h2>
        <p>Payroll calculations use attendance records inside the selected cutoff period. Make attendance corrections first, then recalculate while the payroll period is still in draft.</p>
      </div>
    </section>}

    {section === "calendar" && <section className="space-y-6">
      {canManagePayroll ? <div className="grid gap-5 xl:grid-cols-2">
        <form action={savePayrollCalendarDayAction} className="card">
          <div className="mb-5"><p className="text-xs font-bold uppercase tracking-wider text-pine-600">Calendar setup</p><h2 className="text-lg font-black">Holiday / working day</h2><p className="text-sm text-slate-500">Define holidays, special days, HOA-declared non-working days, or forced working days.</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="label">Date</label><input className="field" name="date" type="date" defaultValue={inputDate(now)} required /></div>
            <div><label className="label">Type</label><select className="field" name="type" defaultValue="REGULAR_HOLIDAY"><option value="REGULAR_HOLIDAY">Regular holiday</option><option value="SPECIAL_NON_WORKING_HOLIDAY">Special non-working holiday</option><option value="SPECIAL_WORKING_HOLIDAY">Special working holiday</option><option value="HOA_DECLARED_HOLIDAY">HOA declared holiday</option><option value="WORKING_DAY">Working day</option><option value="NON_WORKING_DAY">Non-working day</option></select></div>
            <div className="sm:col-span-2"><label className="label">Description</label><input className="field" name="description" placeholder="e.g. Independence Day" required /></div>
            <div className="sm:col-span-2"><label className="label">Pay rule</label><input className="field" name="payRule" placeholder="e.g. Add 30% premium when worked" required /></div>
            <label className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm font-bold"><input type="checkbox" name="active" defaultChecked className="accent-pine-600" /> Active</label>
          </div>
          <div className="mt-5"><SubmitButton><CalendarDays className="size-4" /> Save calendar day</SubmitButton></div>
        </form>

        <form action={saveEmployeeScheduleAction} className="card">
          <div className="mb-5"><p className="text-xs font-bold uppercase tracking-wider text-pine-600">Schedule setup</p><h2 className="text-lg font-black">Employee schedule range</h2><p className="text-sm text-slate-500">Define one shift and the rest days for an effective date range. The system creates the weekly schedule and blocks overlaps.</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><label className="label">Employee</label><select className="field" name="employeeId" required><option value="">Select employee</option>{activeEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} - {employee.employeeNumber}</option>)}</select></div>
            <div><label className="label">Effective from</label><input className="field" name="effectiveFrom" type="date" defaultValue={inputDate(now)} required /></div>
            <div><label className="label">Effective to</label><input className="field" name="effectiveTo" type="date" /></div>
            <div><label className="label">Shift start</label><input className="field" name="shiftStart" type="time" defaultValue="08:00" required /></div>
            <div><label className="label">Shift end</label><input className="field" name="shiftEnd" type="time" defaultValue="17:00" required /></div>
            <div className="sm:col-span-2">
              <label className="label">Rest Days</label>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3, 4, 5, 6].map((day) => <label key={day} className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm font-bold"><input type="checkbox" name="restDays" value={day} defaultChecked={day === 0 || day === 6} className="accent-pine-600" /> {dayName(day)}</label>)}</div>
            </div>
          </div>
          <div className="mt-5"><SubmitButton>Save schedule range</SubmitButton></div>
        </form>
      </div> : <ReadOnlyNotice text="Your payroll role can view calendar and schedule settings but cannot change them." />}

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="card"><h2 className="text-lg font-black">Configured calendar days</h2><div className="mt-4 table-wrap shadow-none"><StandardTable><table className="data-table"><thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Rule</th><th></th></tr></thead><tbody>{calendarDays.map((item) => <tr key={item.id}><td className="font-bold">{shortDate(item.date)}</td><td>{item.type.replaceAll("_", " ")}</td><td>{item.description}<p className="text-xs text-slate-400">{item.active ? "Active" : "Inactive"}</p></td><td>{item.payRule}</td><td>{canManagePayroll && <form action={deletePayrollCalendarDayAction}><input type="hidden" name="id" value={item.id} /><DeleteButton /></form>}</td></tr>)}{!calendarDays.length && <tr><td colSpan={5} className="py-10 text-center text-slate-500">No calendar days configured yet.</td></tr>}</tbody></table></StandardTable></div></section>
        <section className="card"><h2 className="text-lg font-black">Employee schedules</h2><div className="mt-4 table-wrap shadow-none"><StandardTable><table className="data-table"><thead><tr><th>Employee</th><th>Day</th><th>Shift</th><th>Effective</th><th></th></tr></thead><tbody>{schedules.map((item) => <tr key={item.id}><td className="font-bold">{item.employee.name}</td><td>{dayName(item.dayOfWeek)}<p className="text-xs text-slate-400">{item.restDay ? "Rest day" : "Working day"}</p></td><td>{item.shiftStart} - {item.shiftEnd}</td><td>{shortDate(item.effectiveFrom)}{item.effectiveTo ? ` to ${shortDate(item.effectiveTo)}` : ""}</td><td>{canManagePayroll && <form action={deleteEmployeeScheduleAction}><input type="hidden" name="id" value={item.id} /><DeleteButton /></form>}</td></tr>)}{!schedules.length && <tr><td colSpan={5} className="py-10 text-center text-slate-500">No employee schedules configured yet.</td></tr>}</tbody></table></StandardTable></div></section>
      </div>
    </section>}

    {section === "processing" && (canWritePayroll ? <form action={generatePayrollAction} className="card mb-6">
      <div className="mb-5">
        <h2 className="text-lg font-black">Calculate payroll period</h2>
        <p className="text-sm text-slate-500">Draft periods are recalculated using the latest attendance records. Finalized periods must be returned to draft first.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <label className="label">Start date</label>
          <input className="field" name="startDate" type="date" defaultValue={inputDate(start)} required />
        </div>
        <div>
          <label className="label">End date</label>
          <input className="field" name="endDate" type="date" defaultValue={inputDate(end)} required />
        </div>
        <div>
          <label className="label">Pay date</label>
          <input className="field" name="payDate" type="date" defaultValue={inputDate(end)} required />
        </div>
        <div className="flex items-end">
          <SubmitButton><Calculator className="size-4" /> Calculate payroll</SubmitButton>
        </div>
      </div>
    </form> : <ReadOnlyNotice text="Your payroll role can view payroll records but cannot calculate or recalculate payroll periods." />)}

    {section === "settings" && <section className="space-y-6">
      {canManagePayroll && <section className="card">
        <div className="mb-5"><p className="text-xs font-bold uppercase tracking-wider text-pine-600">Access control</p><h2 className="text-lg font-black">Payroll role assignments</h2><p className="text-sm text-slate-500">General Admin users do not automatically receive payroll access. Assign payroll access manually here.</p></div>
        <form action={savePayrollAccessAction} className="mb-5 grid gap-4 lg:grid-cols-[1.3fr_1fr_auto_auto] lg:items-end">
          <div><label className="label">User</label><select className="field" name="userId" required><option value="">Select user</option>{payrollUsers.map((item) => <option key={item.id} value={item.id}>{item.name} - {item.email}{item.employeeProfile ? ` (${item.employeeProfile.employeeNumber})` : ""}</option>)}</select></div>
          <div><label className="label">Payroll role</label><select className="field" name="role" defaultValue="PAYROLL_STAFF">{Object.values(PayrollAccessRole).map((role) => <option key={role} value={role}>{payrollRoleLabel(role)}</option>)}</select></div>
          <label className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm font-bold"><input type="checkbox" name="active" defaultChecked className="accent-pine-600" /> Active</label>
          <SubmitButton>Save access</SubmitButton>
        </form>
        <div className="table-wrap shadow-none"><StandardTable><table className="data-table"><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Granted by</th><th></th></tr></thead><tbody>{payrollAccesses.map((item) => <tr key={item.id}><td><p className="font-bold">{item.user.name}</p><p className="text-xs text-slate-400">{item.user.email}</p></td><td>{payrollRoleLabel(item.role)}</td><td><StatusBadge status={item.active ? "ACTIVE" : "INACTIVE"} /></td><td>{item.grantedBy?.name ?? "-"}</td><td><form action={deletePayrollAccessAction}><input type="hidden" name="id" value={item.id} /><DeleteButton label="Remove" /></form></td></tr>)}{!payrollAccesses.length && <tr><td colSpan={5} className="py-10 text-center text-slate-500">No payroll access assignments yet.</td></tr>}</tbody></table></StandardTable></div>
      </section>}

      <section className="card">
      <div className="mb-5">
        <h2 className="text-lg font-black">Payroll deduction types</h2>
        <p className="text-sm leading-6 text-slate-500">Add, edit, activate, or deactivate deduction templates. A type is not automatically applied to every employee. Assign it to a specific employee and payroll period below when needed, such as Cash Advance for one cutoff only.</p>
      </div>
      <div className="grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
        {canManagePayroll ? <form action={savePayrollDeductionTypeAction} className="rounded-2xl border border-pine-100 bg-pine-50/40 p-4">
          <h3 className="mb-3 font-black text-pine-900">Add new deduction</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label">Deduction name</label><input className="field" name="name" placeholder="e.g. SSS" required /></div>
            <div><label className="label">Default amount</label><input className="field" name="amount" type="number" min="0" step="0.01" defaultValue="0" required /></div>
            <div className="sm:col-span-2"><label className="label">Description / settings</label><textarea className="field min-h-20" name="description" placeholder="Describe when this deduction applies." /></div>
          </div>
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
            <label className="flex items-center gap-2 rounded-xl bg-white p-3 font-semibold"><input type="checkbox" name="active" className="accent-pine-600" /> Active</label>
            <label className="flex items-center gap-2 rounded-xl bg-white p-3 font-semibold"><input type="checkbox" name="applyToMonthly" defaultChecked className="accent-pine-600" /> Monthly staff</label>
            <label className="flex items-center gap-2 rounded-xl bg-white p-3 font-semibold"><input type="checkbox" name="applyToDaily" defaultChecked className="accent-pine-600" /> Daily staff</label>
          </div>
          <div className="mt-4"><SubmitButton className="btn-secondary">Add deduction type</SubmitButton></div>
        </form> : <ReadOnlyNotice text="Your payroll role can view deduction types but cannot change payroll settings." />}

        <div className="space-y-3">
          {deductionTypes.map((deduction) => <details key={deduction.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <summary className="cursor-pointer list-none">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="font-black">{deduction.name}</p><p className="text-xs text-slate-500">{deduction.description || "No description."}</p></div>
                <div className="flex flex-wrap gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${deduction.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{deduction.active ? "Active" : "Inactive"}</span><span className="rounded-full bg-pine-50 px-2.5 py-1 text-xs font-bold text-pine-700">{money(deduction.amount)}</span></div>
              </div>
            </summary>
            {canManagePayroll && <form action={savePayrollDeductionTypeAction} className="mt-4 border-t border-slate-100 pt-4">
              <input type="hidden" name="id" value={deduction.id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label className="label">Deduction name</label><input className="field" name="name" defaultValue={deduction.name} required /></div>
                <div><label className="label">Default amount</label><input className="field" name="amount" type="number" min="0" step="0.01" defaultValue={String(deduction.amount)} required /></div>
                <div className="sm:col-span-2"><label className="label">Description / settings</label><textarea className="field min-h-20" name="description" defaultValue={deduction.description ?? ""} /></div>
              </div>
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                <label className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 font-semibold"><input type="checkbox" name="active" defaultChecked={deduction.active} className="accent-pine-600" /> Active</label>
                <label className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 font-semibold"><input type="checkbox" name="applyToMonthly" defaultChecked={deduction.applyToMonthly} className="accent-pine-600" /> Monthly staff</label>
                <label className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 font-semibold"><input type="checkbox" name="applyToDaily" defaultChecked={deduction.applyToDaily} className="accent-pine-600" /> Daily staff</label>
              </div>
              <div className="mt-4"><SubmitButton className="btn-secondary">Save deduction type</SubmitButton></div>
            </form>}
          </details>)}
          {!deductionTypes.length && <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No payroll deduction types yet.</p>}
        </div>
      </div>
      </section>

      <section className="card"><h2 className="text-lg font-black">Recent payroll audit trail</h2><p className="mb-4 text-sm text-slate-500">Security-sensitive payroll and attendance changes are logged automatically.</p><div className="table-wrap shadow-none"><StandardTable><table className="data-table"><thead><tr><th>Date</th><th>Actor</th><th>Module</th><th>Action</th><th>Entity</th></tr></thead><tbody>{auditLogs.map((item) => <tr key={item.id}><td>{shortDate(item.createdAt)}</td><td>{item.actor?.name ?? "System"}</td><td>{item.module}</td><td>{item.action.replaceAll("_", " ")}</td><td>{item.entityType ?? "-"} {item.entityId ? item.entityId.slice(-6).toUpperCase() : ""}</td></tr>)}{!auditLogs.length && <tr><td colSpan={5} className="py-10 text-center text-slate-500">No payroll audit logs yet.</td></tr>}</tbody></table></StandardTable></div></section>
    </section>}

    {section === "loans" && <section className="card mb-6">
      <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-pine-600">Employee receivables</p>
          <h2 className="mt-1 text-lg font-black">Loans and cash advances</h2>
          <p className="text-sm leading-6 text-slate-500">Create employee loans or cash advances here. During payroll, assign a deduction and link it to the loan so each paid cutoff reduces the employee balance.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[520px]">
          <Metric label="Principal" value={totalLoanPrincipal} />
          <Metric label="Paid" value={totalLoanPaid} />
          <Metric label="Outstanding" value={totalLoanBalance} />
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
        {canWritePayroll ? <form action={saveEmployeeLoanAction} className="rounded-2xl border border-pine-100 bg-pine-50/40 p-4">
          <h3 className="mb-3 font-black text-pine-900">Add loan or cash advance</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Employee</label>
              <select className="field" name="employeeId" required>
                <option value="">Select employee</option>
                {activeEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} - {employee.employeeNumber}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Type</label>
              <select className="field" name="type" defaultValue="CASH_ADVANCE" required>
                <option value="CASH_ADVANCE">Cash advance</option>
                <option value="LOAN">Employee loan</option>
                <option value="OTHER">Other receivable</option>
              </select>
            </div>
            <div className="sm:col-span-2"><label className="label">Description</label><input className="field" name="description" placeholder="e.g. June salary cash advance" required /></div>
            <div><label className="label">Principal amount</label><input className="field" name="principalAmount" type="number" min="0.01" step="0.01" required /></div>
            <div><label className="label">Issued date</label><input className="field" name="issuedDate" type="date" defaultValue={inputDate(now)} required /></div>
            <div><label className="label">Reference number</label><input className="field" name="referenceNumber" placeholder="Voucher / reference" /></div>
            <div><label className="label">Remarks</label><input className="field" name="remarks" placeholder="Optional notes" /></div>
          </div>
          <div className="mt-4"><SubmitButton className="btn-secondary"><HandCoins className="size-4" /> Save loan</SubmitButton></div>
        </form> : <ReadOnlyNotice text="Your payroll role can view employee loans and cash advances but cannot create or edit them." />}

        <div className="table-wrap">
          <StandardTable><table className="data-table">
            <thead><tr><th>Employee</th><th>Loan / cash advance</th><th>Paid</th><th>Balance</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {employeeLoans.map((loan) => <tr key={loan.id} data-search={`${loan.employee.name} ${loan.employee.employeeNumber} ${loan.description} ${loan.type} ${loan.status}`.toLowerCase()}>
                <td><p className="font-bold">{loan.employee.name}</p><p className="text-xs text-slate-400">{loan.employee.employeeNumber}</p></td>
                <td><p className="font-bold">{loanTypeLabel(loan.type)} - {money(loan.principalAmount)}</p><p className="text-xs text-slate-400">{loan.description} - Issued {shortDate(loan.issuedDate)}</p></td>
                <td>{money(loan.amountPaid)}</td>
                <td className="font-black text-pine-700">{money(loan.balance)}</td>
                <td><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${loanStatusClass(loan.status, loan.balance)}`}>{loanStatusLabel(loan.status, loan.balance)}</span></td>
                <td>
                  {canWritePayroll ? <details className="min-w-72 rounded-xl border border-slate-100 bg-white p-2">
                    <summary className="cursor-pointer list-none text-sm font-bold text-pine-700">Manage</summary>
                    <form action={saveEmployeeLoanAction} className="mt-3 space-y-3 border-t border-slate-100 pt-3">
                      <input type="hidden" name="id" value={loan.id} />
                      <div><label className="label">Employee</label><select className="field" name="employeeId" defaultValue={loan.employeeId} required>{activeEmployees.concat(activeEmployees.some((employee) => employee.id === loan.employeeId) ? [] : [loan.employee]).map((employee) => <option key={employee.id} value={employee.id}>{employee.name} - {employee.employeeNumber}</option>)}</select></div>
                      <div><label className="label">Type</label><select className="field" name="type" defaultValue={loan.type} required><option value="CASH_ADVANCE">Cash advance</option><option value="LOAN">Employee loan</option><option value="OTHER">Other receivable</option></select></div>
                      <div><label className="label">Description</label><input className="field" name="description" defaultValue={loan.description} required /></div>
                      <div><label className="label">Principal amount</label><input className="field" name="principalAmount" type="number" min={String(loan.amountPaid)} step="0.01" defaultValue={String(loan.principalAmount)} required /></div>
                      <div><label className="label">Issued date</label><input className="field" name="issuedDate" type="date" defaultValue={inputDate(loan.issuedDate)} required /></div>
                      <div><label className="label">Reference number</label><input className="field" name="referenceNumber" defaultValue={loan.referenceNumber ?? ""} /></div>
                      <div><label className="label">Remarks</label><input className="field" name="remarks" defaultValue={loan.remarks ?? ""} /></div>
                      <SubmitButton className="btn-secondary">Save changes</SubmitButton>
                    </form>
                    {canManagePayroll && Number(loan.amountPaid) <= 0 && loan.status === "OPEN" && <form action={cancelEmployeeLoanAction} className="mt-2">
                      <input type="hidden" name="id" value={loan.id} />
                      <DeleteButton label="Cancel loan" />
                    </form>}
                  </details> : <span className="text-xs text-slate-400">Read only</span>}
                </td>
              </tr>)}
              {!employeeLoans.length && <tr><td colSpan={6} className="py-10 text-center text-slate-500">No employee loans or cash advances have been recorded yet.</td></tr>}
            </tbody>
          </table></StandardTable>
        </div>
      </div>
    </section>}

    {section === "contributions" && <section className="card mb-6">
      <div className="mb-5">
        <p className="text-xs font-bold uppercase tracking-wider text-pine-600">Statutory payroll setup</p>
        <h2 className="mt-1 text-lg font-black">Government contributions</h2>
        <p className="text-sm leading-6 text-slate-500">Use payroll deduction types for SSS, PhilHealth, Pag-IBIG, and other statutory deductions. Activate a contribution type only when the amount and applicability are ready.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {deductionTypes.filter((deduction) => ["sss", "philhealth", "pag-ibig", "pagibig"].includes(deduction.name.toLowerCase())).map((deduction) => <div key={deduction.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <p className="font-black">{deduction.name}</p>
          <p className="mt-1 text-xs text-slate-500">{deduction.description || "No contribution settings yet."}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold"><span className="rounded-full bg-white px-2.5 py-1">{money(deduction.amount)}</span><span className={`rounded-full px-2.5 py-1 ${deduction.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{deduction.active ? "Active" : "Inactive"}</span></div>
        </div>)}
      </div>
      <div className="mt-5"><Link className="btn-secondary" href={`/admin/payroll?section=settings${selected ? `&period=${selected.id}` : ""}`}>Edit contribution deduction types</Link></div>
    </section>}

    {section === "reports" && <section className="grid gap-4 lg:grid-cols-2">
      <SectionLinkCard title="Payroll financial reports" description="Review payroll expenses, loan releases, loan repayments, and totals inside HOA financial reports." href="/admin/reports" action="Open reports" />
      <SectionLinkCard title="Exportable reports" description="Use the financial report export options for PDF, DOCX, and CSV reporting outputs." href="/admin/reports" action="Prepare report" />
    </section>}

    {section === "overtime" && <section className="grid gap-6 xl:grid-cols-[380px_1fr]">
      {canWritePayroll ? <form action={saveOvertimeRecordAction} className="card h-fit">
        <h2 className="text-lg font-black">OT request / manager adjustment</h2>
        <p className="mt-1 text-sm text-slate-500">Only approved records are included in payroll. Manager adjustments are approved immediately and audit-logged.</p>
        <div className="mt-4 grid gap-4"><div><label className="label">Employee</label><select className="field" name="employeeId" required defaultValue=""><option value="" disabled>Select employee</option>{activeEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} - {employee.employeeNumber}</option>)}</select></div><div className="grid gap-4 sm:grid-cols-2"><div><label className="label">Date</label><input className="field" name="date" type="date" required /></div><div><label className="label">Hours</label><input className="field" name="hours" type="number" min="0.25" max="24" step="0.25" required /></div></div><div><label className="label">OT source</label><select className="field" name="source" defaultValue="APPROVED_REQUEST"><option value="APPROVED_REQUEST">OT request (pending review)</option>{canManagePayroll && <option value="PAYROLL_MANAGER_ADJUSTMENT">Payroll Manager Adjustment</option>}</select></div><input type="hidden" name="status" value="PENDING" /><div><label className="label">Reason</label><textarea className="field min-h-24" name="reason" maxLength={500} required /></div></div>
        <SubmitButton className="mt-4">Save OT record</SubmitButton>
      </form> : <ReadOnlyNotice text="Your payroll role can view overtime records but cannot create them." />}
      <div className="table-wrap"><StandardTable><table className="data-table"><thead><tr><th>Date</th><th>Employee</th><th>Hours</th><th>Source</th><th>Status</th><th>Reason</th><th>Review</th></tr></thead><tbody>{overtimeRecords.map((item) => <tr key={item.id}><td>{shortDate(item.date)}</td><td><p className="font-bold">{item.employee.name}</p><p className="text-xs text-slate-400">{item.employee.employeeNumber}</p></td><td>{String(item.hours)}</td><td>{item.source === "PAYROLL_MANAGER_ADJUSTMENT" ? "Payroll Manager Adjustment" : "Approved OT Request"}</td><td><StatusBadge status={item.status} /></td><td className="max-w-xs whitespace-pre-line">{item.reason}</td><td>{item.status === "PENDING" && canManagePayroll ? <div className="flex gap-2"><form action={reviewOvertimeRecordAction}><input type="hidden" name="id" value={item.id} /><input type="hidden" name="decision" value="APPROVED" /><SubmitButton className="btn-secondary min-h-8 px-3 py-1 text-xs">Approve</SubmitButton></form><form action={reviewOvertimeRecordAction}><input type="hidden" name="id" value={item.id} /><input type="hidden" name="decision" value="REJECTED" /><SubmitButton className="btn-danger min-h-8 px-3 py-1 text-xs">Reject</SubmitButton></form></div> : item.reviewedBy?.name ?? "-"}</td></tr>)}{!overtimeRecords.length && <tr><td colSpan={7} className="py-10 text-center text-slate-500">No overtime records yet.</td></tr>}</tbody></table></StandardTable></div>
    </section>}

    {(section === "processing" || section === "adjustments" || section === "approval" || section === "payslips") && <section className="grid gap-6 xl:grid-cols-[320px_1fr]">
      <div className="card h-fit">
        <h2 className="mb-4 text-lg font-black">Payroll periods</h2>
        <div className="space-y-2">
          {periods.map((period) => {
            const periodTotal = period.payslips.reduce((sum, slip) => sum + Number(slip.netPay), 0);
            return <Link
              key={period.id}
              href={`${payrollSectionPath(section)}?period=${period.id}`}
              className={`block rounded-xl border p-3 transition ${selected?.id === period.id ? "border-pine-500 bg-pine-50" : "border-slate-100 hover:bg-slate-50"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold">{shortDate(period.startDate)} - {shortDate(period.endDate)}</p>
                <StatusBadge status={period.status} />
              </div>
              <p className="mt-1 text-xs text-slate-500">{period._count.payslips} payslips - Pay {shortDate(period.payDate)}</p>
              <p className="mt-1 text-xs font-bold text-pine-700">Net payroll: {money(periodTotal)}</p>
            </Link>;
          })}
          {!periods.length && <p className="text-sm text-slate-500">No payroll periods yet.</p>}
        </div>
      </div>

      <div>
        {selected ? <div className="space-y-4">
          <div className="card">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-pine-600">Selected payroll</p>
                <h2 className="mt-1 text-xl font-black">{shortDate(selected.startDate)} to {shortDate(selected.endDate)}</h2>
                <p className="text-sm text-slate-500">Pay date: {shortDate(selected.payDate)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {selected.status === "DRAFT" && <>
                  {canWritePayroll && <form action={recalculatePayrollAction}>
                    <input type="hidden" name="id" value={selected.id} />
                    <SubmitButton className="btn-secondary"><RotateCcw className="size-4" /> Recalculate</SubmitButton>
                  </form>}
                  {canApprovePayroll && <form action={finalizePayrollAction}>
                    <input type="hidden" name="id" value={selected.id} />
                    <SubmitButton><CheckCircle2 className="size-4" /> Finalize</SubmitButton>
                  </form>}
                  {canManagePayroll && <PayrollDeleteForm id={selected.id} paid={false} />}
                </>}
                {selected.status === "FINALIZED" && <>
                  {canApprovePayroll && <form action={returnPayrollToDraftAction}>
                    <input type="hidden" name="id" value={selected.id} />
                    <SubmitButton className="btn-secondary"><RotateCcw className="size-4" /> Return to draft</SubmitButton>
                  </form>}
                  {canApprovePayroll && <form action={markPayrollPaidAction}>
                    <input type="hidden" name="id" value={selected.id} />
                    <SubmitButton>Mark payroll paid</SubmitButton>
                  </form>}
                  {canManagePayroll && <PayrollDeleteForm id={selected.id} paid={false} />}
                </>}
                {selected.status === "PAID" && canManagePayroll && <PayrollDeleteForm id={selected.id} paid />}
                <StatusBadge status={selected.status} />
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-pine-100 bg-pine-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-pine-700">Total payroll amount</p>
                <p className="mt-1 text-2xl font-black text-pine-900">{money(selectedTotalPayroll)}</p>
                <p className="mt-1 text-xs text-slate-500">Net amount payable to employees</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Gross payroll</p>
                <p className="mt-1 text-xl font-black text-ink">{money(selectedGrossPay)}</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Deductions</p>
                <p className="mt-1 text-xl font-black text-ink">{money(selectedDeductions)}</p>
              </div>
            </div>

            {selected.status === "FINALIZED" && <div className="mt-4 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 size-5 shrink-0" />
              <p><strong>Finalized but not paid.</strong> You can return this payroll to draft for attendance or salary adjustments. Once it is marked paid, it will be locked.</p>
            </div>}
            {selected.status === "PAID" && <div className="mt-4 flex gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <LockKeyhole className="mt-0.5 size-5 shrink-0 text-slate-500" />
              <p><strong>Paid payroll period is locked for editing.</strong> Payroll Managers may archive and remove it from active lists using the high-risk confirmation above.</p>
            </div>}
          </div>

          {section === "adjustments" && <PayrollCutoffDeductionsPanel
            payrollId={selected.id}
            payrollStatus={selected.status}
            canWritePayroll={canWritePayroll}
            initialEmployeeId={initialDeductionEmployeeId}
            employees={activeEmployees.map((employee) => ({
              id: employee.id,
              name: employee.name,
              employeeNumber: employee.employeeNumber,
              salaryType: employee.salaryType,
            }))}
            deductionTypes={activeDeductionTypes.map((deduction) => ({
              id: deduction.id,
              name: deduction.name,
              amount: Number(deduction.amount),
              applyToMonthly: deduction.applyToMonthly,
              applyToDaily: deduction.applyToDaily,
            }))}
            loans={openEmployeeLoans.map((loan) => ({
              id: loan.id,
              employeeId: loan.employeeId,
              type: loan.type,
              description: loan.description,
              balance: Number(loan.balance),
            }))}
            deductions={selectedDeductionAssignments.map((deduction) => ({
              id: deduction.id,
              employeeId: deduction.employeeId,
              employeeName: deduction.employee.name,
              employeeNumber: deduction.employee.employeeNumber,
              deductionTypeId: deduction.deductionTypeId,
              deductionTypeName: deduction.deductionType.name,
              deductionTypeAmount: Number(deduction.deductionType.amount),
              employeeLoanId: deduction.employeeLoanId,
              employeeLoanType: deduction.employeeLoan?.type ?? null,
              employeeLoanDescription: deduction.employeeLoan?.description ?? null,
              employeeLoanBalance: deduction.employeeLoan ? Number(deduction.employeeLoan.balance) : null,
              amount: Number(deduction.amount),
              remarks: deduction.remarks,
            }))}
          />}

          {section === "approval" && <div className="card border-pine-100 bg-pine-50/40 text-sm leading-6 text-pine-900">
            <h2 className="mb-2 text-lg font-black">Payroll approval workflow</h2>
            <p>Use the action buttons above to finalize a draft payroll period, return a finalized period to draft for corrections, or mark the period as paid. Paid payroll periods remain locked for audit control.</p>
          </div>}

          {(section === "processing" || section === "payslips") && <div className="table-wrap">
            <StandardTable><table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Payable days</th>
                  <th>OT hours</th>
                  <th>OT source</th>
                  <th>Basic pay</th>
                  <th>Gross pay</th>
                  <th>Deductions</th>
                  <th>Net pay</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {selected.payslips.map((slip) => <tr key={slip.id}>
                  <td>
                    <p className="font-bold">{slip.employee.name}</p>
                    <p className="text-xs text-slate-400">{slip.employee.position}</p>
                  </td>
                  <td>{String(slip.payableDays)}</td>
                  <td>{String(slip.overtimeHours)}</td>
                  <td>{slip.overtimeSource}</td>
                  <td>{money(slip.basicPay)}</td>
                  <td>{money(slip.grossPay)}</td>
                  <td>{money(slip.deduction)}</td>
                  <td className="font-black text-pine-700">{money(slip.netPay)}</td>
                  <td>
                    <Link className="btn-secondary min-h-8 px-3 py-1" href={`/admin/payroll/${slip.id}/print`} target="_blank">
                      <Printer className="size-4" /> Payslip
                    </Link>
                  </td>
                </tr>)}
                {!selected.payslips.length && <tr><td colSpan={9} className="py-10 text-center text-slate-500">No active employees were available for this period.</td></tr>}
              </tbody>
            </table></StandardTable>
          </div>}
        </div> : <div className="card text-sm text-slate-500">Calculate the first payroll period to see payslips.</div>}
      </div>
    </section>}
  </>;
}

function payrollSectionPath(section: string) {
  return ({ processing: "/admin/payroll/periods", adjustments: "/admin/payroll/adjustments", approval: "/admin/payroll/approval", payslips: "/admin/payroll/payslips" } as Record<string, string>)[section] ?? "/admin/payroll";
}

function Metric({ label, value, currency = true }: { label: string; value: number; currency?: boolean }) {
  return <div className="rounded-2xl border border-slate-100 bg-white p-3">
    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
    <p className="mt-1 text-lg font-black text-ink">{currency ? money(value) : value.toLocaleString("en-PH")}</p>
  </div>;
}

function SectionLinkCard({ title, description, href, action }: { title: string; description: string; href: string; action: string }) {
  return <div className="card">
    <h2 className="text-lg font-black">{title}</h2>
    <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
    <div className="mt-5"><Link className="btn-primary" href={href}>{action}</Link></div>
  </div>;
}

function ReadOnlyNotice({ text }: { text: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-600">{text}</div>;
}

function dayName(day: number) {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day] ?? `Day ${day}`;
}

function loanTypeLabel(type: string) {
  return type.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function loanStatusLabel(status: string, balance: number | string | { toString(): string }) {
  if (status === "PAID" || Number(balance) <= 0) return "Fully Paid";
  if (status === "OPEN") return "Open";
  return "Cancelled";
}

function loanStatusClass(status: string, balance: number | string | { toString(): string }) {
  if (status === "PAID" || Number(balance) <= 0) return "bg-emerald-100 text-emerald-700";
  if (status === "OPEN") return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-600";
}
