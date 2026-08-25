import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SearchInput } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { prisma } from "@/lib/db";
import { requirePayrollAccess } from "@/lib/payroll-access";
import { shortDate } from "@/lib/utils";
import { roleLabelMap } from "@/lib/tenant-role-access";

export default async function EmployeesPage() {
  const { user } = await requirePayrollAccess();
  const employees = await prisma.employeeProfile.findMany({ where: { tenantId: user.tenantId }, include: { user: true, _count: { select: { attendance: true, payslips: true } } }, orderBy: { name: "asc" } });
  return <><PageHeader eyebrow="Human resources" title="Employees" description={`${employees.length} employee profile${employees.length === 1 ? "" : "s"} available for attendance and payroll.`} action={<Link className="btn-primary" href="/admin/employees/new"><Plus className="size-4" /> Add employee</Link>} />
    <div className="mb-4"><SearchInput placeholder="Search employee, position or number" /></div>
    <div className="table-wrap"><table className="data-table"><thead><tr><th>Employee</th><th>Position</th><th>Assigned roles</th><th>Status</th><th>Last login</th><th></th></tr></thead><tbody>{employees.map((employee) => <tr key={employee.id} data-search={`${employee.employeeNumber} ${employee.name} ${employee.position} ${employee.email ?? ""}`.toLowerCase()}><td><p className="font-bold">{employee.name}</p><p className="text-xs text-slate-400">{employee.employeeNumber}</p><p className="text-xs text-slate-500">{employee.email}</p></td><td>{employee.position}</td><td>{employee.user ? <span className="text-sm text-slate-600">{employee.user.role === "EMPLOYEE" ? "Employee" : roleLabelMap[employee.user.role as keyof typeof roleLabelMap] ?? employee.user.role}</span> : "No login"}</td><td><StatusBadge status={employee.status} /></td><td>{employee.user?.lastLoginAt ? shortDate(employee.user.lastLoginAt) : "Never"}</td><td className="text-right"><Link className="font-bold text-pine-600 hover:underline" href={`/admin/employees/${employee.id}`}>Manage</Link></td></tr>)}{!employees.length && <tr><td colSpan={6} className="py-12 text-center text-slate-500">No employees yet. Add a profile to start attendance tracking.</td></tr>}</tbody></table></div>
  </>;
}
