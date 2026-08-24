import "server-only";

import { PayrollAccessRole, Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const payrollWriteRoles = [
  PayrollAccessRole.PAYROLL_MANAGER,
  PayrollAccessRole.PAYROLL_STAFF,
  PayrollAccessRole.HR_ADMIN,
  PayrollAccessRole.SYSTEM_ADMINISTRATOR,
] as const;

export const payrollApprovalRoles = [
  PayrollAccessRole.PAYROLL_MANAGER,
  PayrollAccessRole.FINANCE_APPROVER,
  PayrollAccessRole.SYSTEM_ADMINISTRATOR,
] as const;

export const payrollManageRoles = [
  PayrollAccessRole.PAYROLL_MANAGER,
  PayrollAccessRole.SYSTEM_ADMINISTRATOR,
] as const;

export const leaveApprovalRoles = [
  PayrollAccessRole.PAYROLL_MANAGER,
  PayrollAccessRole.HR_ADMIN,
  PayrollAccessRole.SYSTEM_ADMINISTRATOR,
] as const;

export const leaveConfigurationRoles = leaveApprovalRoles;

export async function getPayrollAccessForUser(userId: string) {
  return prisma.payrollAccess.findMany({ where: { userId, active: true }, orderBy: { role: "asc" } });
}

export async function userCanAccessPayroll(userId: string, role: Role) {
  if (role === Role.SYSTEM_ADMIN || role === Role.SUPER_ADMIN || role === Role.PLATFORM_ADMIN || role === Role.HOA_ADMIN || role === Role.PAYROLL_MANAGER) return true;
  const count = await prisma.payrollAccess.count({ where: { userId, active: true } });
  return count > 0;
}

export async function requirePayrollAccess(allowedRoles?: readonly PayrollAccessRole[]) {
  const user = await requireUser();
  if (user.roles.some((role) => role === Role.SYSTEM_ADMIN || role === Role.SUPER_ADMIN || role === Role.PLATFORM_ADMIN || role === Role.HOA_ADMIN)) return { user, roles: [PayrollAccessRole.SYSTEM_ADMINISTRATOR] };
  if (user.roles.includes(Role.PAYROLL_MANAGER)) return { user, roles: [PayrollAccessRole.PAYROLL_MANAGER] };
  const isAdminCandidate = user.roles.includes(Role.ADMIN);
  const isEmployeeCandidate = user.roles.includes(Role.EMPLOYEE);
  if (!isAdminCandidate && !isEmployeeCandidate) redirect(user.roles.includes(Role.HOMEOWNER) ? "/portal/dashboard" : "/login");
  const access = await getPayrollAccessForUser(user.id);
  if (!access.length) redirect(isEmployeeCandidate && !isAdminCandidate ? "/employee/attendance" : "/admin/dashboard");
  const roles = access.map((item) => item.role);
  if (allowedRoles?.length && !roles.some((role) => allowedRoles.includes(role))) {
    redirect(isEmployeeCandidate && !isAdminCandidate ? "/employee/attendance" : "/admin/dashboard");
  }
  return { user, roles };
}

export function hasPayrollRole(currentRoles: readonly PayrollAccessRole[], allowedRoles: readonly PayrollAccessRole[]) {
  return currentRoles.some((role) => allowedRoles.includes(role));
}

export function payrollRoleLabel(role: PayrollAccessRole) {
  return role.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}
