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

const allowedPrimaryRoles = new Set<Role>([
  Role.HOA_ADMIN,
  Role.BILLING_MANAGER,
  Role.PAYROLL_MANAGER,
  Role.STAFF,
  Role.ADMIN,
  Role.EMPLOYEE,
]);

function getPrimaryRole(formData: FormData): Role {
  const direct = String(formData.get("primaryRole") || "").trim();

  if (allowedPrimaryRoles.has(direct as Role)) {
    return direct as Role;
  }

  const legacy = formData
    .getAll("assignedRoles")
    .map((value) => String(value).trim())
    .find((value) => allowedPrimaryRoles.has(value as Role));

  return (legacy as Role) || Role.EMPLOYEE;
}

export async function saveEmployeeAction(formData: FormData) {
  const { user } = await requirePayrollAccess(payrollWriteRoles);
  const parsed = employeeSchema.safeParse(Object.fromEntries(formData.entries()));

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || "Invalid employee details.");
  }

  const { id, email, hireDate, ...data } = parsed.data;
  const primaryRole = getPrimaryRole(formData);
  const createEmployeeLogin = formData.get("createEmployeeLogin") === "on";
  const loginEmail = String(formData.get("loginEmail") || email || "").trim().toLowerCase();
  const loginPassword = String(formData.get("loginPassword") || "ChangeMe123!");

  if ((createEmployeeLogin || primaryRole !== Role.EMPLOYEE) && !loginEmail) {
    throw new Error("Enter a login email before assigning system access.");
  }

  if (createEmployeeLogin && loginPassword.length < 8) {
    throw new Error("Temporary password must be at least 8 characters.");
  }

  const values = {
    ...data,
    email: email || null,
    hireDate: new Date(`${hireDate}T00:00:00.000Z`),
    tenantId: user.tenantId,
  };

  let employeeId = id;

  if (id) {
    const existing = await prisma.employeeProfile.findUnique({
      where: { id, tenantId: user.tenantId },
    });

    if (!existing) throw new Error("Employee not found.");

    await prisma.employeeProfile.update({
      where: { id },
      data: values,
    });

    employeeId = existing.id;

    if (existing.userId || createEmployeeLogin) {
      await upsertEmployeeLogin(user.tenantId, employeeId, data.name, loginEmail, loginPassword, primaryRole, existing.userId);
    }

    await writeAuditLog({
      actorId: user.id,
      module: "PAYROLL",
      action: "UPDATE_EMPLOYEE_PROFILE",
      entityType: "EmployeeProfile",
      entityId: employeeId,
      metadata: { tenantId: user.tenantId, primaryRole },
    });
  } else {
    const employee = await prisma.employeeProfile.create({
      data: values,
    });

    employeeId = employee.id;

    if (primaryRole !== Role.EMPLOYEE && !createEmployeeLogin) {
      throw new Error("Enable login account before assigning an administrator role.");
    }

    if (createEmployeeLogin) {
      await upsertEmployeeLogin(user.tenantId, employeeId, data.name, loginEmail, loginPassword, primaryRole);
    }

    await writeAuditLog({
      actorId: user.id,
      module: "PAYROLL",
      action: "CREATE_EMPLOYEE_PROFILE",
      entityType: "EmployeeProfile",
      entityId: employeeId,
      metadata: { tenantId: user.tenantId, primaryRole },
    });
  }

  revalidatePath("/admin/employees");

  redirect(
    id
      ? "/admin/employees?success=saved&message=Employee%20record%20updated%20successfully."
      : "/admin/employees?success=created&message=Employee%20record%20created%20successfully."
  );
}

export async function deleteEmployeeAction(formData: FormData) {
  const { user } = await requirePayrollAccess(payrollManageRoles);
  const id = String(formData.get("id") || "");

  const employee = await prisma.employeeProfile.findUnique({
    where: { id, tenantId: user.tenantId },
    select: { _count: { select: { attendance: true, payslips: true } } },
  });

  if (!employee) throw new Error("Employee not found.");
  if (employee._count.attendance || employee._count.payslips) {
    throw new Error("An employee with attendance or payroll history cannot be deleted. Mark the profile inactive instead.");
  }

  await prisma.employeeProfile.delete({ where: { id } });

  await writeAuditLog({
    actorId: user.id,
    module: "PAYROLL",
    action: "DELETE_EMPLOYEE_PROFILE",
    entityType: "EmployeeProfile",
    entityId: id,
  });

  revalidatePath("/admin/employees");
  redirect("/admin/employees?success=deleted");
}

export async function updateEmployeeRolesAction(formData: FormData) {
  const currentUser = await requireUser();
  const tenantId = String(formData.get("tenantId") || currentUser.tenantId);
  const userId = String(formData.get("userId") || "");
  const primaryRole = getPrimaryRole(formData);

  if (!userId) throw new Error("User not found.");
  if (currentUser.tenantId !== tenantId) throw new Error("Cross-tenant access blocked.");

  const targetUser = await prisma.user.findFirst({
    where: { id: userId, tenantId },
  });

  if (!targetUser) throw new Error("User not found.");

  await prisma.user.update({
    where: { id: userId },
    data: { role: primaryRole },
  });

  await writeAuditLog({
    actorId: currentUser.id,
    module: "PAYROLL",
    action: "UPDATE_EMPLOYEE_PRIMARY_ROLE",
    entityType: "User",
    entityId: userId,
    metadata: { tenantId, oldRole: targetUser.role, newRole: primaryRole },
  });

  revalidatePath("/admin/employees");
  redirect("/admin/employees?success=updated&message=Employee%20primary%20role%20updated%20successfully.");
}

async function upsertEmployeeLogin(
  tenantId: string,
  employeeId: string,
  name: string,
  email: string,
  password: string,
  primaryRole: Role,
  currentUserId?: string | null
) {
  const loginEmail = email || `employee-${employeeId}@local.invalid`;

  if (currentUserId) {
    const data: { name: string; email: string; role: Role; passwordHash?: string } = {
      name,
      email: loginEmail,
      role: primaryRole,
    };

    if (password) {
      data.passwordHash = await hash(password, 12);
    }

    await prisma.user.update({
      where: { id: currentUserId },
      data,
    });

    return;
  }

  const user = await prisma.user.create({
    data: {
      tenantId,
      name,
      email: loginEmail,
      role: primaryRole,
      passwordHash: await hash(password, 12),
    },
  });

  await prisma.employeeProfile.update({
    where: { id: employeeId },
    data: { userId: user.id },
  });
}