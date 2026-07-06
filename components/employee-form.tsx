import { Role, type EmployeeProfile } from "@prisma/client";
import Link from "next/link";
import { saveEmployeeAction } from "@/lib/actions/employees";
import { SubmitButton } from "@/components/ui";
import { PasswordInput } from "@/components/password-input";
import { inputDate } from "@/lib/utils";
import { roleLabelMap } from "@/lib/tenant-role-access";

const primaryRoleOptions = [
  Role.HOA_ADMIN,
  Role.BILLING_MANAGER,
  Role.PAYROLL_MANAGER,
  Role.STAFF,
  Role.ADMIN,
  Role.EMPLOYEE,
] as const;

export function EmployeeForm({
  employee,
}: {
  employee?: EmployeeProfile & { user?: { email: string; role: Role } | null };
}) {
  return (
    <form action={saveEmployeeAction} className="card max-w-4xl space-y-6">
      {employee && <input type="hidden" name="id" value={employee.id} />}

      <div>
        <h2 className="text-lg font-black">Employee information</h2>
        <p className="text-sm text-slate-500">Employment details used for attendance and payroll calculations.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Employee number" name="employeeNumber" defaultValue={employee?.employeeNumber} required />
        <Field label="Full name" name="name" defaultValue={employee?.name} required />
        <Field label="Position" name="position" defaultValue={employee?.position} required />
        <Field label="Phone" name="phone" type="tel" defaultValue={employee?.phone} required />
        <Field label="Email" name="email" type="email" defaultValue={employee?.email ?? ""} />
        <Field label="Hire date" name="hireDate" type="date" defaultValue={employee ? inputDate(employee.hireDate) : inputDate(new Date())} required />
        <div className="sm:col-span-2">
          <Field label="Address" name="address" defaultValue={employee?.address} required />
        </div>
      </div>

      <div className="border-t border-slate-100 pt-6">
        <h2 className="text-lg font-black">Salary configuration</h2>
        <p className="text-sm text-slate-500">Monthly rates are converted to a daily rate using standard workdays.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div>
          <label className="label">Salary type</label>
          <select className="field" name="salaryType" defaultValue={employee?.salaryType ?? "MONTHLY"}>
            <option value="MONTHLY">Monthly</option>
            <option value="DAILY">Daily</option>
          </select>
        </div>
        <Field label="Base rate (PHP)" name="baseRate" type="number" min="0.01" step="0.01" defaultValue={employee ? String(employee.baseRate) : "18000"} required />
        <Field label="Standard workdays" name="standardWorkDays" type="number" min="1" max="31" defaultValue={employee?.standardWorkDays ?? 26} required />
        <Field label="Fixed allowance" name="fixedAllowance" type="number" min="0" step="0.01" defaultValue={employee ? String(employee.fixedAllowance) : "0"} required />
        <Field label="Fixed deduction" name="fixedDeduction" type="number" min="0" step="0.01" defaultValue={employee ? String(employee.fixedDeduction) : "0"} required />
        <div>
          <label className="label">Status</label>
          <select className="field" name="status" defaultValue={employee?.status ?? "ACTIVE"}>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>
      </div>

      <div className="border-t border-slate-100 pt-6">
        <h2 className="text-lg font-black">Primary tenant role</h2>
        <p className="text-sm text-slate-500">Version 1.0 supports one primary role per user. Select the role that controls system access.</p>
      </div>

      <div>
        <label className="label">Primary role</label>
        <select className="field" name="primaryRole" defaultValue={employee?.user?.role ?? Role.EMPLOYEE}>
          {primaryRoleOptions.map((role) => (
            <option key={role} value={role}>
              {roleLabelMap[role] ?? role.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </div>

      <div className="border-t border-slate-100 pt-6">
        <h2 className="text-lg font-black">Login access</h2>
        <p className="text-sm text-slate-500">Enable login so this employee can access the system using the selected primary role.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm font-bold">
          <input type="checkbox" name="createEmployeeLogin" defaultChecked={Boolean(employee?.userId)} className="accent-pine-600" />
          Enable login account
        </label>
        <Field label="Login email" name="loginEmail" type="email" defaultValue={employee?.user?.email ?? employee?.email ?? ""} />
        <Field label="Temporary password" name="loginPassword" type="password" defaultValue="ChangeMe123!" autoComplete="new-password" />
        {employee?.userId && (
          <p className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
            Login account is linked. Keep login enabled to synchronize this user&apos;s role.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-5">
        <SubmitButton>{employee ? "Save changes" : "Create employee"}</SubmitButton>
        <Link className="btn-secondary" href="/admin/employees">Cancel</Link>
      </div>
    </form>
  );
}

function Field({ label, name, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }) {
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      {props.type === "password" ? <PasswordInput id={name} name={name} {...props} /> : <input className="field" id={name} name={name} {...props} />}
    </div>
  );
}