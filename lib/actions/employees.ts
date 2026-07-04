"use server";

import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hash } from "bcryptjs";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
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
  const selectedRoles = formData.getAll("assignedRoles")
    .map((value) => String(value).trim())
    .filter(Boolean)
    .filter((value): value is Role => Object.values(Role).includes(value as Role)) as Role[];
  const values = { ...data, email: email || null, hireDate: new Date(`${hireDate}T00:00:00.000Z`), tenantId: user.tenantId };
  let employeeId = id;
  if (id) {
    const existing = await prisma.employeeProfile.findUnique({ where: { id, tenantId: user.tenantId } });
    if (!existing) throw new Error("Employee not found.");
    if (selectedRoles.length && !existing.userId && !createEmployeeLogin) throw new Error("Enable employee login before assigning tenant roles.");
    await prisma.employeeProfile.update({ where: { id }, data: values });
    employeeId = existing.id;
    if (createEmployeeLogin) await upsertEmployeeLogin(user.tenantId, employeeId, data.name, loginEmail, loginPassword, existing.userId);
    await syncEmployeeRoles(user.tenantId, employeeId, selectedRoles, user.id);
    await writeAuditLog({ actorId: user.id, module: "PAYROLL", action: "UPDATE_EMPLOYEE_PROFILE", entityType: "EmployeeProfile", entityId: employeeId, metadata: { tenantId: user.tenantId, roles: selectedRoles } });
  } else {
    const employee = await prisma.employeeProfile.create({ data: values });
    employeeId = employee.id;
    if (selectedRoles.length && !createEmployeeLogin) throw new Error("Enable employee login before assigning tenant roles.");
    if (createEmployeeLogin) await upsertEmployeeLogin(user.tenantId, employeeId, data.name, loginEmail, loginPassword);
    await syncEmployeeRoles(user.tenantId, employeeId, selectedRoles, user.id);
    await writeAuditLog({ actorId: user.id, module: "PAYROLL", action: "CREATE_EMPLOYEE_PROFILE", entityType: "EmployeeProfile", entityId: employeeId, metadata: { tenantId: user.tenantId, roles: selectedRoles } });
  }
  revalidatePath("/admin/employees");
  redirect(id ? "/admin/employees?success=saved&message=Employee%20record%20updated%20successfully." : "/admin/employees?success=created&message=Employee%20record%20created%20successfully.");
}

export async function deleteEmployeeAction(formData: FormData) {
  const { user } = await requirePayrollAccess(payrollManageRoles);
  const id = String(formData.get("id") || "");
  const employee = await prisma.employeeProfile.findUnique({ where: { id, tenantId: user.tenantId }, select: { _count: { select: { attendance: true, payslips: true } } } });
  if (!employee) throw new Error("Employee not found.");
  if (employee._count.attendance || employee._count.payslips) throw new Error("An employee with attendance or payroll history cannot be deleted. Mark the profile inactive instead.");
  await prisma.employeeProfile.delete({ where: { id } });
  await writeAuditLog({ actorId: user.id, module: "PAYROLL", action: "DELETE_EMPLOYEE_PROFILE", entityType: "EmployeeProfile", entityId: id });
  revalidatePath("/admin/employees");
  redirect("/admin/employees?success=deleted");
}

export async function updateEmployeeRolesAction(formData: FormData) {
  const currentUser = await requireUser();
  const tenantId = String(formData.get("tenantId") || currentUser.tenantId);
  const userId = String(formData.get("userId") || "");
  const selectedRoles = formData.getAll("roles")
    .map((value) => String(value).trim())
    .filter(Boolean)
    .filter((value): value is Role => Object.values(Role).includes(value as Role)) as Role[];
  if (!userId) throw new Error("User not found.");
  if (currentUser.tenantId !== tenantId) throw new Error("Cross-tenant access blocked.");
  await syncEmployeeRoles(tenantId, userId, selectedRoles, currentUser.id);
  revalidatePath(`/admin/employees/${userId}`);
  redirect(`/admin/employees?success=updated&message=Employee%20roles%20updated%20successfully.`);
}

async function syncEmployeeRoles(tenantId: string, employeeId: string, roles: Role[], actorId: string) {
  const employee = await prisma.employeeProfile.findFirst({ where: { id: employeeId, tenantId } });
  if (!employee) throw new Error("Employee not found.");
  const currentRoles = await prisma.userRoleAssignment.findMany({ where: { userId: employee.userId ?? "", tenantId, active: true }, select: { role: true } });
  const requested: Role[] = roles.filter((role) => role !== Role.SUPER_ADMIN && role !== Role.PLATFORM_ADMIN);
  const current = new Set<Role>(currentRoles.map((item) => item.role));
  const next = new Set<Role>(requested);
  const toRemove = [...current].filter((role) => !next.has(role));
  const toAdd = [...next].filter((role) => !current.has(role));
  for (const role of toRemove) {
    await prisma.userRoleAssignment.updateMany({ where: { tenantId, userId: employee.userId ?? "", role, active: true }, data: { active: false } });
  }
  for (const role of toAdd) {
    await prisma.userRoleAssignment.upsert({
      where: { tenantId_userId_role: { tenantId, userId: employee.userId ?? "", role } },
      update: { active: true, assignedBy: actorId, assignedAt: new Date() },
      create: { tenantId, userId: employee.userId ?? "", role, assignedBy: actorId, assignedAt: new Date(), active: true },
    });
  }
  await writeAuditLog({ actorId, module: "PAYROLL", action: "UPDATE_EMPLOYEE_ROLES", entityType: "UserRoleAssignment", entityId: employee.userId ?? employee.id, metadata: { tenantId, added: toAdd, removed: toRemove } });
}

async function upsertEmployeeLogin(tenantId: string, employeeId: string, name: string, email: string, password: string, currentUserId?: string | null) {
  const passwordHash = await hash(password, 12);
  const loginEmail = email || `employee-${employeeId}@local.invalid`;
  if (currentUserId) {
    await prisma.user.update({ where: { id: currentUserId }, data: { name, email: loginEmail, role: Role.EMPLOYEE, ...(password ? { passwordHash } : {}) } });
    return;
  }
  const user = await prisma.user.upsert({
    where: { tenantId_email: { tenantId, email: loginEmail } },
    update: { name, role: Role.EMPLOYEE, passwordHash },
    create: { tenantId, name, email: loginEmail, role: Role.EMPLOYEE, passwordHash },
  });
  await prisma.employeeProfile.update({ where: { id: employeeId }, data: { userId: user.id } });
}
