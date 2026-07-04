import { notFound } from "next/navigation";
import { EmployeeForm } from "@/components/employee-form";
import { PageHeader } from "@/components/page-header";
import { DeleteButton } from "@/components/ui";
import { deleteEmployeeAction } from "@/lib/actions/employees";
import { prisma } from "@/lib/db";
import { requirePayrollAccess } from "@/lib/payroll-access";

export default async function EditEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requirePayrollAccess();
  const { id } = await params;
  const employee = await prisma.employeeProfile.findFirst({ where: { id, tenantId: user.tenantId }, include: { user: true } });
  if (!employee) notFound();
  return <><PageHeader eyebrow="Employees" title={employee.name} description={`${employee.employeeNumber} · ${employee.position}`} action={<form action={deleteEmployeeAction}><input type="hidden" name="id" value={employee.id} /><DeleteButton label="Delete employee" /></form>} /><EmployeeForm employee={employee} /></>;
}
