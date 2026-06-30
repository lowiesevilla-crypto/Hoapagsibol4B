import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SearchInput } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { prisma } from "@/lib/db";
import { requirePayrollAccess } from "@/lib/payroll-access";
import { money, shortDate } from "@/lib/utils";

export default async function EmployeesPage() {
  await requirePayrollAccess();
  const employees = await prisma.employeeProfile.findMany({ include: { _count: { select: { attendance: true, payslips: true } } }, orderBy: { name: "asc" } });
  return <><PageHeader eyebrow="Human resources" title="Employees" description={`${employees.length} employee profile${employees.length === 1 ? "" : "s"} available for attendance and payroll.`} action={<Link className="btn-primary" href="/admin/employees/new"><Plus className="size-4" /> Add employee</Link>} />
    <div className="mb-4"><SearchInput placeholder="Search employee, position or number" /></div>
    <div className="table-wrap"><table className="data-table"><thead><tr><th>Employee</th><th>Position</th><th>Hire date</th><th>Salary basis</th><th>Attendance records</th><th>Status</th><th></th></tr></thead><tbody>{employees.map((employee) => <tr key={employee.id} data-search={`${employee.employeeNumber} ${employee.name} ${employee.position}`.toLowerCase()}><td><p className="font-bold">{employee.name}</p><p className="text-xs text-slate-400">{employee.employeeNumber}</p></td><td>{employee.position}</td><td>{shortDate(employee.hireDate)}</td><td><p className="font-bold">{money(employee.baseRate)}</p><p className="text-xs text-slate-400">{employee.salaryType.toLowerCase()}</p></td><td>{employee._count.attendance}</td><td><StatusBadge status={employee.status} /></td><td className="text-right"><Link className="font-bold text-pine-600 hover:underline" href={`/admin/employees/${employee.id}`}>View & edit</Link></td></tr>)}{!employees.length && <tr><td colSpan={7} className="py-12 text-center text-slate-500">No employees yet. Add a profile to start attendance tracking.</td></tr>}</tbody></table></div>
  </>;
}
