"use server";

import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hash } from "bcryptjs";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { payrollManageRoles, payrollWriteRoles, requirePayrollAccess } from "@/lib/payroll-access";
import { employeeSchema } from "@/lib/validation";

export async function saveEmployeeAction(formData: FormData) {
  const { user } = await requirePayrollAccess(payrollWriteRoles);
  const parsed = employeeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Invalid employee details.");
  const { id, email, hireDate, ...data } = parsed.data;
  const createEmployeeLogin = formData.get("createEmployeeLogin") === "on";
  const loginEmail = String(formData.get("loginEmail") || email || "").trim().toLowerCase();
  const loginPassword = String(formData.get("loginPassword") || "ChangeMe123!");
  if (createEmployeeLogin && !loginEmail) throw new Error("Enter an employee login email.");
  if (createEmployeeLogin && loginPassword.length < 8) throw new Error("Employee login password must be at least 8 characters.");
  const values = { ...data, email: email || null, hireDate: new Date(`${hireDate}T00:00:00.000Z`) };
  if (id) {
    const existing = await prisma.employeeProfile.findUnique({ where: { id } });
    if (!existing) throw new Error("Employee not found.");
    await prisma.employeeProfile.update({ where: { id }, data: values });
    if (createEmployeeLogin) await upsertEmployeeLogin(id, data.name, loginEmail, loginPassword, existing.userId);
    await writeAuditLog({ actorId: user.id, module: "PAYROLL", action: "UPDATE_EMPLOYEE_PROFILE", entityType: "EmployeeProfile", entityId: id });
  } else {
    const employee = await prisma.employeeProfile.create({ data: values });
    if (createEmployeeLogin) await upsertEmployeeLogin(employee.id, data.name, loginEmail, loginPassword);
    await writeAuditLog({ actorId: user.id, module: "PAYROLL", action: "CREATE_EMPLOYEE_PROFILE", entityType: "EmployeeProfile", entityId: employee.id });
  }
  revalidatePath("/admin/employees");
  redirect("/admin/employees?success=saved");
}

export async function deleteEmployeeAction(formData: FormData) {
  const { user } = await requirePayrollAccess(payrollManageRoles);
  const id = String(formData.get("id") || "");
  const employee = await prisma.employeeProfile.findUnique({ where: { id }, select: { _count: { select: { attendance: true, payslips: true } } } });
  if (!employee) throw new Error("Employee not found.");
  if (employee._count.attendance || employee._count.payslips) throw new Error("An employee with attendance or payroll history cannot be deleted. Mark the profile inactive instead.");
  await prisma.employeeProfile.delete({ where: { id } });
  await writeAuditLog({ actorId: user.id, module: "PAYROLL", action: "DELETE_EMPLOYEE_PROFILE", entityType: "EmployeeProfile", entityId: id });
  revalidatePath("/admin/employees");
  redirect("/admin/employees?success=deleted");
}

async function upsertEmployeeLogin(employeeId: string, name: string, email: string, password: string, currentUserId?: string | null) {
  const passwordHash = await hash(password, 12);
  if (currentUserId) {
    await prisma.user.update({ where: { id: currentUserId }, data: { name, email, role: Role.EMPLOYEE, ...(password ? { passwordHash } : {}) } });
    return;
  }
  const user = await prisma.user.upsert({
    where: { email },
    update: { name, role: Role.EMPLOYEE, passwordHash },
    create: { name, email, role: Role.EMPLOYEE, passwordHash },
  });
  await prisma.employeeProfile.update({ where: { id: employeeId }, data: { userId: user.id } });
}
