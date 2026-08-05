import {
  Permission,
  type Permission as PermissionValue,
} from "@/lib/authorization/permissions";

export const highRiskPermissions = new Set<PermissionValue>([
  Permission.PLATFORM_TENANTS_MANAGE,
  Permission.PLATFORM_USERS_MANAGE,
  Permission.SETTINGS_MANAGE,
  Permission.USERS_MANAGE,
  Permission.ROLES_MANAGE,
  Permission.DATA_IMPORT,
  Permission.DATA_MIGRATE,
  Permission.BILLING_GENERATE,
  Permission.BILLING_ADJUST,
  Permission.PAYMENTS_RECORD,
  Permission.PAYMENTS_ALLOCATE,
  Permission.PAYMENTS_VOID,
  Permission.PAYMENTS_REFUND,
  Permission.COLLECTIONS_REFUND,
  Permission.COLLECTIONS_FORFEIT,
  Permission.RECEIPTS_ISSUE,
  Permission.DOCUMENTS_APPROVE,
  Permission.DOCUMENTS_CONFIGURE,
  Permission.DOCUMENTS_GENERATE,
  Permission.DOCUMENTS_ARCHIVE,
  Permission.DOCUMENTS_BALANCE_OVERRIDE,
]);

export function isHighRiskPermission(permission: PermissionValue) {
  return highRiskPermissions.has(permission);
}

export function highRiskPermissionSelection(permissions: readonly PermissionValue[]) {
  return permissions.filter(isHighRiskPermission).sort((left, right) => left.localeCompare(right));
}

export function requireAuthorizationChangeReason(value: FormDataEntryValue | null) {
  const reason = String(value || "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  if (reason.length < 10) throw new Error("Enter a reason with at least 10 characters.");
  return reason.slice(0, 500);
}

export function requireAuthorizationConfirmation(value: FormDataEntryValue | null) {
  if (String(value || "") !== "yes") {
    throw new Error("Confirm that you reviewed the permission impact and session revocation.");
  }
}
