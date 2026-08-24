import Link from "next/link";
import { CalendarClock, Pause, Play, Square } from "lucide-react";
import { changePayrollDeductionScheduleStatusAction, savePayrollDeductionScheduleAction } from "@/lib/actions/payroll";
import { SubmitButton } from "@/components/ui";
import { money, shortDate } from "@/lib/utils";

type Schedule = {
  id: string;
  employeeId: string;
  employee: { name: string; employeeNumber: string };
  deductionType: { name: string };
  employeeLoan: { description: string; balance: number | string | { toString(): string } } | null;
  mode: string;
  amountPerCutoff: number | string | { toString(): string };
  effectiveFrom: Date;
  effectiveTo: Date | null;
  installmentLimit: number | null;
  status: string;
  reason: string;
  payrollDeductions: Array<{
    id: string;
    amount: number | string | { toString(): string };
    payroll: { startDate: Date; endDate: Date; payDate: Date; status: string };
  }>;
};

type PayrollDeductionSchedulesPanelProps = {
  canWritePayroll: boolean;
  canManagePayroll: boolean;
  defaultStartDate: string;
  employees: Array<{ id: string; name: string; employeeNumber: string }>;
  deductionTypes: Array<{ id: string; name: string; amount: number }>;
  loans: Array<{ id: string; employeeId: string; employeeName: string; description: string; balance: number }>;
  schedules: Schedule[];
};

/**
 * @requirement PAY-DED-002 PAY-LOAN-002 PAY-UX-001
 * @status IMPLEMENTED
 */
export function PayrollDeductionSchedulesPanel({ canWritePayroll, canManagePayroll, defaultStartDate, employees, deductionTypes, loans, schedules }: PayrollDeductionSchedulesPanelProps) {
  return <section className="space-y-5">
    <div className="card">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-pine-600">Automatic cutoff deductions</p>
          <h2 className="mt-1 text-lg font-black">Deduction and loan schedules</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">Use one-time for a single cutoff, recurring for a dated series, or until fully paid for a loan. Open payroll cutoffs are updated automatically; finalized and paid history stays locked.</p>
        </div>
        <Link className="btn-secondary shrink-0" href="/admin/payroll/adjustments">Assign one cutoff manually</Link>
      </div>

      {canWritePayroll ? <form action={savePayrollDeductionScheduleAction} className="mt-5 rounded-2xl border border-pine-100 bg-pine-50/40 p-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div><label className="label">Employee</label><select className="field" name="employeeId" required><option value="">Select employee</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} · {employee.employeeNumber}</option>)}</select></div>
          <div><label className="label">Deduction type</label><select className="field" name="deductionTypeId" required><option value="">Select deduction</option>{deductionTypes.map((type) => <option key={type.id} value={type.id}>{type.name} · default {money(type.amount)}</option>)}</select></div>
          <div><label className="label">Schedule</label><select className="field" name="mode" defaultValue="ONE_TIME" required><option value="ONE_TIME">One-time deduction</option><option value="RECURRING">Recurring deduction</option><option value="UNTIL_FULLY_PAID">Loan · until fully paid</option></select></div>
          <div><label className="label">Linked loan / cash advance</label><select className="field" name="employeeLoanId" defaultValue=""><option value="">Not linked to a loan</option>{loans.map((loan) => <option key={loan.id} value={loan.id}>{loan.employeeName} · {loan.description} · {money(loan.balance)}</option>)}</select></div>
          <div><label className="label">Amount per cutoff</label><input className="field" name="amountPerCutoff" type="number" min="0.01" step="0.01" required /></div>
          <div><label className="label">From</label><input className="field" name="effectiveFrom" type="date" defaultValue={defaultStartDate} required /></div>
          <div><label className="label">To <span className="font-normal text-slate-400">(optional)</span></label><input className="field" name="effectiveTo" type="date" /></div>
          <div><label className="label">Installments <span className="font-normal text-slate-400">(optional)</span></label><input className="field" name="installmentLimit" type="number" min="1" max="1200" placeholder="e.g. 6" /></div>
          <div className="md:col-span-2 xl:col-span-4"><label className="label">Reason / payroll note</label><input className="field" name="reason" maxLength={500} placeholder="Why this deduction applies" required /></div>
        </div>
        <div className="mt-4"><SubmitButton><CalendarClock className="size-4" /> Save schedule</SubmitButton></div>
      </form> : <p className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">Your payroll role can view schedules but cannot create or change them.</p>}
    </div>

    <div className="card">
      <h2 className="text-lg font-black">Active and historical schedules</h2>
      <div className="mt-4 space-y-3">
        {schedules.map((schedule) => {
          const generated = schedule.payrollDeductions.length;
          const generatedTotal = schedule.payrollDeductions.reduce((sum, deduction) => sum + Number(deduction.amount), 0);
          return <details key={schedule.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <summary className="cursor-pointer list-none">
              <div className="grid gap-3 sm:grid-cols-[1.2fr_1fr_auto] sm:items-center">
                <div><p className="font-black">{schedule.employee.name} · {schedule.deductionType.name}</p><p className="text-xs text-slate-500">{schedule.employee.employeeNumber}{schedule.employeeLoan ? ` · ${schedule.employeeLoan.description}` : ""}</p></div>
                <div><p className="text-sm font-bold">{scheduleModeLabel(schedule.mode)} · {money(schedule.amountPerCutoff)} / cutoff</p><p className="text-xs text-slate-500">{shortDate(schedule.effectiveFrom)}{schedule.effectiveTo ? ` to ${shortDate(schedule.effectiveTo)}` : " onward"}{schedule.installmentLimit ? ` · ${schedule.installmentLimit} max` : ""}</p></div>
                <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-black ${scheduleStatusClass(schedule.status)}`}>{schedule.status}</span>
              </div>
            </summary>
            <div className="mt-4 border-t border-slate-100 pt-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Metric label="Generated cutoffs" value={String(generated)} />
                <Metric label="Generated total" value={money(generatedTotal)} />
                <Metric label="Loan balance" value={schedule.employeeLoan ? money(schedule.employeeLoan.balance) : "Not loan-linked"} />
              </div>
              <p className="mt-3 text-sm text-slate-600"><strong>Reason:</strong> {schedule.reason}</p>
              {schedule.payrollDeductions.length > 0 && <div className="mt-3 space-y-2">{schedule.payrollDeductions.map((deduction) => <div key={deduction.id} className="flex flex-col justify-between gap-1 rounded-xl bg-slate-50 p-3 text-xs sm:flex-row sm:items-center"><span>{shortDate(deduction.payroll.startDate)}–{shortDate(deduction.payroll.endDate)} · pay {shortDate(deduction.payroll.payDate)}</span><span className="font-bold">{money(deduction.amount)} · {deduction.payroll.status}</span></div>)}</div>}
              {canManagePayroll && schedule.status !== "COMPLETED" && <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {schedule.status === "ACTIVE" ? <ScheduleStatusForm id={schedule.id} action="PAUSE" label="Pause future deductions" icon={<Pause className="size-4" />} /> : <ScheduleStatusForm id={schedule.id} action="RESUME" label="Resume schedule" icon={<Play className="size-4" />} />}
                <ScheduleStatusForm id={schedule.id} action="END" label="End schedule" danger icon={<Square className="size-4" />} />
              </div>}
            </div>
          </details>;
        })}
        {!schedules.length && <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">No deduction schedules yet. Manual cutoff deductions remain available.</p>}
      </div>
    </div>
  </section>;
}

function ScheduleStatusForm({ id, action, label, icon, danger = false }: { id: string; action: "PAUSE" | "RESUME" | "END"; label: string; icon: React.ReactNode; danger?: boolean }) {
  return <form action={changePayrollDeductionScheduleStatusAction} className="rounded-xl border border-slate-100 p-3">
    <input type="hidden" name="id" value={id} /><input type="hidden" name="scheduleAction" value={action} />
    <label className="label">Change reason</label><input className="field min-h-10 py-2" name="changeReason" maxLength={500} required />
    <div className="mt-2"><SubmitButton className={danger ? "btn-danger" : "btn-secondary"}>{icon}{label}</SubmitButton></div>
  </form>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] font-black uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 font-bold">{value}</p></div>; }
function scheduleModeLabel(mode: string) { return ({ ONE_TIME: "One time", RECURRING: "Recurring", UNTIL_FULLY_PAID: "Until fully paid" } as Record<string, string>)[mode] ?? mode; }
function scheduleStatusClass(status: string) { return status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : status === "PAUSED" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"; }
