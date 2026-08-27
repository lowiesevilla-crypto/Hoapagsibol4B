import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { prisma } from "@/lib/db";
import { employeeDirectoryPageSize, employeeDirectoryWhere } from "@/lib/employee-directory";
import { requirePayrollAccess } from "@/lib/payroll-access";
import { shortDate } from "@/lib/utils";
import { roleLabelMap } from "@/lib/tenant-role-access";

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const { user } = await requirePayrollAccess();
  const query = await searchParams;
  const q = query.q?.trim() || "";
  const page = Math.max(1, Number(query.page) || 1);
  const where = employeeDirectoryWhere(user.tenantId, q);
  const [employees, total] = await Promise.all([
    prisma.employeeProfile.findMany({ where, include: { user: true, _count: { select: { attendance: true, payslips: true } } }, orderBy: [{ name: "asc" }, { employeeNumber: "asc" }], skip: (page - 1) * employeeDirectoryPageSize, take: employeeDirectoryPageSize }),
    prisma.employeeProfile.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / employeeDirectoryPageSize));
  return <><PageHeader eyebrow="Human resources" title="Employees" description={`${total} matching employee profile${total === 1 ? "" : "s"} available for attendance and payroll.`} action={<Link className="btn-primary" href="/admin/employees/new"><Plus className="size-4" /> Add employee</Link>} />
    <form className="mb-4 flex flex-col gap-3 sm:flex-row" action="/admin/employees">
      <label className="flex-1"><span className="label">Search employees</span><input className="field min-h-11" name="q" defaultValue={q} placeholder="Employee, position, number, email or phone" /></label>
      <div className="flex items-end gap-2"><button className="btn-primary min-h-11" type="submit"><Search className="size-4" /> Search</button>{q && <Link className="btn-secondary min-h-11" href="/admin/employees">Clear</Link>}</div>
    </form>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600"><span>Showing {total ? ((page - 1) * employeeDirectoryPageSize) + 1 : 0}-{Math.min(page * employeeDirectoryPageSize, total)} of {total}</span><Pagination page={page} totalPages={totalPages} q={q} /></div>
    <div className="table-wrap"><table className="data-table"><thead><tr><th>Employee</th><th>Position</th><th>Assigned roles</th><th>Status</th><th>Last login</th><th></th></tr></thead><tbody>{employees.map((employee) => <tr key={employee.id} data-search={`${employee.employeeNumber} ${employee.name} ${employee.position} ${employee.email ?? ""}`.toLowerCase()}><td><p className="font-bold">{employee.name}</p><p className="text-xs text-slate-400">{employee.employeeNumber}</p><p className="text-xs text-slate-500">{employee.email}</p></td><td>{employee.position}</td><td>{employee.user ? <span className="text-sm text-slate-600">{employee.user.role === "EMPLOYEE" ? "Employee" : roleLabelMap[employee.user.role as keyof typeof roleLabelMap] ?? employee.user.role}</span> : "No login"}</td><td><StatusBadge status={employee.status} /></td><td>{employee.user?.lastLoginAt ? shortDate(employee.user.lastLoginAt) : "Never"}</td><td className="text-right"><Link className="font-bold text-pine-600 hover:underline" href={`/admin/employees/${employee.id}`}>Manage</Link></td></tr>)}{!employees.length && <tr><td colSpan={6} className="py-12 text-center text-slate-500">No employees yet. Add a profile to start attendance tracking.</td></tr>}</tbody></table></div>
  </>;
}

function Pagination({ page, totalPages, q }: { page: number; totalPages: number; q: string }) {
  if (totalPages <= 1) return null;
  const href = (nextPage: number) => {
    const params = new URLSearchParams({ page: String(nextPage) });
    if (q) params.set("q", q);
    return `/admin/employees?${params.toString()}`;
  };
  return <div className="flex items-center gap-2 font-bold"><Link aria-disabled={page <= 1} className={`rounded-xl px-3 py-2 ${page <= 1 ? "pointer-events-none bg-slate-100 text-slate-400" : "bg-pine-50 text-pine-700"}`} href={href(page - 1)}>Prev</Link><span>{page}/{totalPages}</span><Link aria-disabled={page >= totalPages} className={`rounded-xl px-3 py-2 ${page >= totalPages ? "pointer-events-none bg-slate-100 text-slate-400" : "bg-pine-50 text-pine-700"}`} href={href(page + 1)}>Next</Link></div>;
}
