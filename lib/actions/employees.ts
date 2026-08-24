"use server";

import { AttendancePolicy, CompensationBasis, PayFrequency, PayrollStatus, Prisma, Role } from "@prisma/client";
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

type PayrollConfigurationInput = {
  effectiveFrom: Date;
  compensationBasis: CompensationBasis;
  payFrequency: PayFrequency;
  attendancePolicy: AttendancePolicy;
  rate: number;
  standardWorkDays: number;
  standardHoursPerDay: number;
  fixedAllowance: number;
  fixedDeduction: number;
};

function legacySalaryType(basis: CompensationBasis) {
  return basis === CompensationBasis.DAILY || basis === CompensationBasis.HOURLY ? "DAILY" as const : "MONTHLY" as const;
}

function previousUtcDate(date: Date) {
  const value = new Date(date);
  value.setUTCDate(value.getUTCDate() - 1);
  return value;
}

function samePayrollConfiguration(current: {
  compensationBasis: CompensationBasis;
  payFrequency: PayFrequency;
  attendancePolicy: AttendancePolicy;
  rate: Prisma.Decimal;
  standardWorkDays: number;
  standardHoursPerDay: Prisma.Decimal;
  fixedAllowance: Prisma.Decimal;
  fixedDeduction: Prisma.Decimal;
}, next: PayrollConfigurationInput) {
  return current.compensationBasis === next.compensationBasis
    && current.payFrequency === next.payFrequency
    && current.attendancePolicy === next.attendancePolicy
    && Number(current.rate) === next.rate
    && current.standardWorkDays === next.standardWorkDays
    && Number(current.standardHoursPerDay) === next.standardHoursPerDay
    && Number(current.fixedAllowance) === next.fixedAllowance
    && Number(current.fixedDeduction) === next.fixedDeduction;
}

/**
 * @requirement PAY-COMP-001 PAY-COMP-002 PAY-COMP-003 PAY-SEC-001
 * @status IMPLEMENTED
 * @description Create a new immutable effective-dated payroll configuration version, close the prior version, and reject retroactive changes that overlap finalized/paid payroll history.
 */
async function persistEmployeeCompensationVersion(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; employeeId: string; hireDate: Date; actorId: string; configuration: PayrollConfigurationInput },
) {
  const { tenantId, employeeId, hireDate, actorId, configuration } = input;
  if (configuration.effectiveFrom < hireDate) {
    throw new Error("Payroll configuration cannot take effect before the employee hire date.");
  }

  const latest = await tx.employeeCompensation.findFirst({
    where: { tenantId, employeeId },
    orderBy: { effectiveFrom: "desc" },
  });

  if (latest && samePayrollConfiguration(latest, configuration)) {
    return { id: latest.id, created: false };
  }

  const latestLockedPayroll = await tx.payrollPeriod.findFirst({
    where: {
      tenantId,
      status: { in: [PayrollStatus.FINALIZED, PayrollStatus.PAID] },
      endDate: { gte: configuration.effectiveFrom },
      payslips: { some: { employeeId } },
    },
    orderBy: { endDate: "desc" },
    select: { endDate: true },
  });
  if (latestLockedPayroll) {
    throw new Error(`New payroll configuration must take effect after the latest finalized/paid payroll ending ${latestLockedPayroll.endDate.toISOString().slice(0, 10)}.`);
  }

  if (latest && configuration.effectiveFrom <= latest.effectiveFrom) {
    throw new Error(`Choose an effective date after the latest payroll configuration (${latest.effectiveFrom.toISOString().slice(0, 10)}).`);
  }

  if (latest) {
    await tx.employeeCompensation.update({
      where: { id: latest.id },
      data: { effectiveTo: previousUtcDate(configuration.effectiveFrom) },
    });
  }

  const created = await tx.employeeCompensation.create({
    data: {
      tenantId,
      employeeId,
      effectiveFrom: configuration.effectiveFrom,
      effectiveTo: null,
      compensationBasis: configuration.compensationBasis,
      payFrequency: configuration.payFrequency,
      attendancePolicy: configuration.attendancePolicy,
      rate: configuration.rate,
      standardWorkDays: configuration.standardWorkDays,
      standardHoursPerDay: configuration.standardHoursPerDay,
      fixedAllowance: configuration.fixedAllowance,
      fixedDeduction: configuration.fixedDeduction,
      createdById: actorId,
    },
  });
  return { id: created.id, created: true };
}

/**
 * @requirement PAY-COMP-001 PAY-COMP-002 PAY-COMP-003 PAY-SEC-001
 * @status IMPLEMENTED
 * @description Save employee master data while versioning payroll configuration instead of rewriting historical compensation rows.
 */
export async function saveEmployeeAction(formData: FormData) {
  const { user } = await requirePayrollAccess(payrollWriteRoles);
  const parsed = employeeSchema.safeParse(Object.fromEntries(formData.entries()));

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || "Invalid employee details.");
  }

  const {
    id, email, hireDate, compensationBasis, payFrequency, attendancePolicy, compensationEffectiveFrom,
    rate, standardHoursPerDay, standardWorkDays, fixedAllowance, fixedDeduction,
    ...identity
  } = parsed.data;
  const primaryRole = getPrimaryRole(formData);
  const createEmployeeLogin = formData.get("createEmployeeLogin") === "on";
  const loginEmail = String(formData.get("loginEmail") || email || "").trim().toLowerCase();
  const loginPassword = String(formData.get("loginPassword") || "ChangeMe123!");

  if ((createEmployeeLogin || primaryRole !== Role.EMPLOYEE) && !loginEmail) {
    throw new Error("Enter a login email before assigning system access.");
  }
  if (primaryRole !== Role.EMPLOYEE && !createEmployeeLogin && !id) {
    throw new Error("Enable login account before assigning an administrator role.");
  }
  if (createEmployeeLogin && loginPassword.length < 8) {
    throw new Error("Temporary password must be at least 8 characters.");
  }

  const employeeHireDate = new Date(`${hireDate}T00:00:00.000Z`);
  const configuration: PayrollConfigurationInput = {
    effectiveFrom: new Date(`${compensationEffectiveFrom}T00:00:00.000Z`),
    compensationBasis: compensationBasis as CompensationBasis,
    payFrequency: payFrequency as PayFrequency,
    attendancePolicy: attendancePolicy as AttendancePolicy,
    rate,
    standardWorkDays,
    standardHoursPerDay,
    fixedAllowance,
    fixedDeduction,
  };
  const profileValues = {
    ...identity,
    email: email || null,
    hireDate: employeeHireDate,
    salaryType: legacySalaryType(configuration.compensationBasis),
    baseRate: configuration.rate,
    standardWorkDays: configuration.standardWorkDays,
    fixedAllowance: configuration.fixedAllowance,
    fixedDeduction: configuration.fixedDeduction,
    tenantId: user.tenantId,
  };

  const result = await prisma.$transaction(async (tx) => {
    if (id) {
      const existing = await tx.employeeProfile.findFirst({ where: { id, tenantId: user.tenantId } });
      if (!existing) throw new Error("Employee not found.");
      await tx.employeeProfile.update({ where: { id }, data: profileValues });
      const version = await persistEmployeeCompensationVersion(tx, {
        tenantId: user.tenantId, employeeId: id, hireDate: employeeHireDate, actorId: user.id, configuration,
      });
      return { employeeId: id, existingUserId: existing.userId, version };
    }

    const employee = await tx.employeeProfile.create({ data: profileValues });
    const version = await persistEmployeeCompensationVersion(tx, {
      tenantId: user.tenantId, employeeId: employee.id, hireDate: employeeHireDate, actorId: user.id, configuration,
    });
    return { employeeId: employee.id, existingUserId: null, version };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  if (result.existingUserId || createEmployeeLogin) {
    await upsertEmployeeLogin(user.tenantId, result.employeeId, identity.name, loginEmail, loginPassword, primaryRole, result.existingUserId);
  }

  await writeAuditLog({
    actorId: user.id,
    module: "PAYROLL",
    action: id ? "UPDATE_EMPLOYEE_PROFILE" : "CREATE_EMPLOYEE_PROFILE",
    entityType: "EmployeeProfile",
    entityId: result.employeeId,
    metadata: {
      tenantId: user.tenantId,
      primaryRole,
      compensationVersionId: result.version.id,
      compensationVersionCreated: result.version.created,
      compensationEffectiveFrom,
    },
  });

  revalidatePath("/admin/employees");
  revalidatePath(`/admin/employees/${result.employeeId}`);

  redirect(
    id
      ? "/admin/employees?success=saved&message=Employee%20record%20updated%20successfully."
      : "/admin/employees?success=created&message=Employee%20record%20created%20successfully."
  );
}

export async function deleteEmployeeAction(formData: FormData) {
  const { user } = await requirePayrollAccess(payrollManageRoles);
  const id = String(formData.get("id") || "");

  const employee = await prisma.employeeProfile.findFirst({
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
