import { ShieldCheck } from "lucide-react";
import { savePayrollStatutoryApplicabilityAction } from "@/lib/actions/payroll";
import { SubmitButton } from "@/components/ui";
import { shortDate } from "@/lib/utils";

type ApplicabilityVersion = {
  id: string;
  employee: { name: string; employeeNumber: string } | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  statutoryEnabled: boolean;
  sssEnabled: boolean;
  philHealthEnabled: boolean;
  pagIbigEnabled: boolean;
  withholdingTaxEnabled: boolean;
  reason: string;
};

/**
 * @requirement PAY-STAT-003 PAY-UX-001
 * @status IMPLEMENTED
 */
export function PayrollStatutoryControlsPanel({ canManagePayroll, defaultEffectiveDate, employees, versions }: { canManagePayroll: boolean; defaultEffectiveDate: string; employees: Array<{ id: string; name: string; employeeNumber: string }>; versions: ApplicabilityVersion[] }) {
  return <section className="mt-5 grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
    <div className="rounded-2xl border border-pine-100 bg-pine-50/40 p-4">
      <div className="flex gap-3"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-pine-700" /><div><h3 className="font-black text-pine-900">Deduction applicability</h3><p className="mt-1 text-sm leading-6 text-slate-600">Payroll administrators control whether government deductions apply. Legal rates and formulas remain system-controlled and cannot be edited here.</p></div></div>
      {canManagePayroll ? <form action={savePayrollStatutoryApplicabilityAction} className="mt-4 space-y-4">
        <div><label className="label">Applies to</label><select className="field" name="employeeId" defaultValue=""><option value="">Tenant default · all employees</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>Employee override · {employee.name} · {employee.employeeNumber}</option>)}</select></div>
        <div><label className="label">Effective from</label><input className="field" name="effectiveFrom" type="date" defaultValue={defaultEffectiveDate} required /></div>
        <div className="space-y-2 rounded-xl bg-white p-3 text-sm">
          <Control name="statutoryEnabled" label="Enable statutory deductions" description="Master switch. When off, every component below is disabled." />
          <Control name="sssEnabled" label="SSS" description="Employee contribution plus employer and EC shares." />
          <Control name="philHealthEnabled" label="PhilHealth" description="Employee and employer premium shares." />
          <Control name="pagIbigEnabled" label="Pag-IBIG" description="Employee and employer fund contributions." />
          <Control name="withholdingTaxEnabled" label="Withholding tax" description="BIR withholding based on the effective payroll table." />
        </div>
        <div><label className="label">Reason</label><textarea className="field min-h-20" name="reason" minLength={3} maxLength={500} placeholder="Policy or employee eligibility reason" required /></div>
        <SubmitButton>Save new effective version</SubmitButton>
      </form> : <p className="mt-4 rounded-xl bg-white p-3 text-sm text-slate-600">Your payroll role can view applicability history but cannot change it.</p>}
    </div>

    <div>
      <h3 className="font-black">Applicability history</h3>
      <p className="mt-1 text-sm text-slate-500">The newest applicable tenant version is combined with an employee override. A tenant master-off decision cannot be bypassed by an employee override.</p>
      <div className="mt-4 space-y-3">
        {versions.map((version) => <article key={version.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div><p className="font-black">{version.employee ? `${version.employee.name} · employee override` : "Tenant default · all employees"}</p><p className="text-xs text-slate-500">Effective {shortDate(version.effectiveFrom)}{version.effectiveTo ? ` to ${shortDate(version.effectiveTo)}` : " until superseded"}</p></div>
            <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-black ${version.statutoryEnabled ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>{version.statutoryEnabled ? "MASTER ON" : "MASTER OFF"}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2"><Flag label="SSS" enabled={version.statutoryEnabled && version.sssEnabled} /><Flag label="PhilHealth" enabled={version.statutoryEnabled && version.philHealthEnabled} /><Flag label="Pag-IBIG" enabled={version.statutoryEnabled && version.pagIbigEnabled} /><Flag label="Withholding" enabled={version.statutoryEnabled && version.withholdingTaxEnabled} /></div>
          <p className="mt-3 text-sm text-slate-600"><strong>Reason:</strong> {version.reason}</p>
        </article>)}
        {!versions.length && <div className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-600"><strong>Default behavior:</strong> all statutory components are enabled. Save a tenant or employee version only when an authorized applicability decision is required.</div>}
      </div>
    </div>
  </section>;
}

function Control({ name, label, description }: { name: string; label: string; description: string }) { return <label className="flex items-start gap-3 rounded-xl p-2 hover:bg-slate-50"><input className="mt-1 accent-pine-600" type="checkbox" name={name} defaultChecked /><span><span className="block font-bold">{label}</span><span className="block text-xs text-slate-500">{description}</span></span></label>; }
function Flag({ label, enabled }: { label: string; enabled: boolean }) { return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${enabled ? "bg-pine-50 text-pine-700" : "bg-slate-100 text-slate-500"}`}>{label}: {enabled ? "Enabled" : "Disabled"}</span>; }
