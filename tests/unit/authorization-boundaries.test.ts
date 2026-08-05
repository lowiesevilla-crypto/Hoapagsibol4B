import assert from "node:assert/strict";
import test from "node:test";
import { Role } from "@prisma/client";
import {
  canAccessProtectedPath,
  isProtectedApplicationPath,
  protectedPathRedirect,
} from "../../lib/authorization/protected-route-policy";
import { tenantRecord, tenantWhere } from "../../lib/authorization/tenant-scope";
import { canAccessAdminPath } from "../../lib/role-access";

const protectedRouteCases = [
  { boundary: "tenant administration", role: Role.ADMIN, path: "/platform/tenants", redirect: "/admin/dashboard" },
  { boundary: "tenant administration", role: Role.BILLING_MANAGER, path: "/platform/tenants/tenant-b/users", redirect: "/admin/dashboard" },
  { boundary: "tenant administration", role: Role.STAFF, path: "/platform/audit", redirect: "/admin/dashboard" },
  { boundary: "admin portal", role: Role.HOMEOWNER, path: "/admin/dashboard", redirect: "/portal/dashboard" },
  { boundary: "admin portal", role: Role.PLATFORM_ADMIN, path: "/admin/settings", redirect: "/platform/tenants" },
  { boundary: "homeowner portal", role: Role.STAFF, path: "/portal/soa", redirect: "/admin/dashboard" },
  { boundary: "employee portal", role: Role.HOMEOWNER, path: "/employee/payslips", redirect: "/portal/dashboard" },
] as const;

test("protected application routes enforce the role boundary matrix", () => {
  for (const scenario of protectedRouteCases) {
    assert.equal(isProtectedApplicationPath(scenario.path), true, scenario.path);
    assert.equal(
      protectedPathRedirect(scenario.role, scenario.path),
      scenario.redirect,
      `${scenario.boundary}: ${scenario.role} unexpectedly accessed ${scenario.path}`,
    );
    assert.equal(canAccessProtectedPath(scenario.role, scenario.path), false);
  }

  const allowedControls = [
    [Role.PLATFORM_ADMIN, "/platform/tenants"],
    [Role.SUPER_ADMIN, "/platform/audit"],
    [Role.SYSTEM_ADMIN, "/admin/settings"],
    [Role.HOMEOWNER, "/portal/soa"],
    [Role.EMPLOYEE, "/employee/payslips"],
  ] as const;
  for (const [role, path] of allowedControls) {
    assert.equal(protectedPathRedirect(role, path), null, `${role} should access ${path}`);
    assert.equal(canAccessProtectedPath(role, path), true);
  }

  assert.equal(isProtectedApplicationPath("/login"), false);
  assert.equal(protectedPathRedirect(Role.HOMEOWNER, "/login"), null);
});

const adminModuleCases = [
  { boundary: "finance", role: Role.STAFF, path: "/admin/billing", allowed: false },
  { boundary: "finance", role: Role.STAFF, path: "/admin/payments/record", allowed: false },
  { boundary: "finance", role: Role.PAYROLL_MANAGER, path: "/admin/receipts/receipt-1", allowed: false },
  { boundary: "finance", role: Role.BILLING_MANAGER, path: "/admin/payments/record?source=e2e", allowed: true },
  { boundary: "finance", role: Role.BILLING_MANAGER, path: "/admin/reports/dashboard/pdf", allowed: true },
  { boundary: "documents", role: Role.BILLING_MANAGER, path: "/admin/documents/request-1", allowed: false },
  { boundary: "documents", role: Role.PAYROLL_MANAGER, path: "/admin/documents", allowed: false },
  { boundary: "documents", role: Role.STAFF, path: "/admin/documents/request-1", allowed: true },
  { boundary: "payroll", role: Role.BILLING_MANAGER, path: "/admin/payroll/periods", allowed: false },
  { boundary: "payroll", role: Role.PAYROLL_MANAGER, path: "/admin/payroll/periods", allowed: true },
] as const;

test("admin module paths enforce finance, document, and payroll separation", () => {
  for (const scenario of adminModuleCases) {
    assert.equal(
      canAccessAdminPath(scenario.role, scenario.path),
      scenario.allowed,
      `${scenario.boundary}: ${scenario.role} access mismatch for ${scenario.path}`,
    );
  }

  for (const path of ["/admin/billing", "/admin/documents", "/admin/payroll"]) {
    assert.equal(canAccessAdminPath(Role.ADMIN, path), true, `ADMIN should access ${path}`);
  }
});

test("trusted tenant scoping overrides attacker supplied tenant identifiers for writes", () => {
  const resources = [
    { kind: "bill", where: { id: "tenant-b-bill", tenantId: "tenant-b", status: "VOIDED" } },
    { kind: "payment", where: { id: "tenant-b-payment", tenantId: "tenant-b", referenceNumber: "ATTACK" } },
    { kind: "document", where: { id: "tenant-b-document", tenantId: "tenant-b", status: "APPROVED" } },
    { kind: "tenant user", where: { id: "tenant-b-user", tenantId: "tenant-b", active: false } },
  ] as const;

  for (const resource of resources) {
    const scoped = tenantWhere("tenant-a", resource.where);
    assert.equal(scoped.tenantId, "tenant-a", `${resource.kind} retained an attacker tenant ID`);
    assert.equal(scoped.id, resource.where.id);
  }
});

test("non-platform actors cannot resolve records from another tenant", () => {
  const tenantBRecord = { id: "tenant-b-record", tenantId: "tenant-b" };
  for (const role of [Role.ADMIN, Role.BILLING_MANAGER, Role.PAYROLL_MANAGER, Role.STAFF, Role.HOMEOWNER]) {
    assert.throws(
      () => tenantRecord({ tenantId: "tenant-a", role }, tenantBRecord),
      /Record not found or access denied/,
      `${role} unexpectedly resolved a cross-tenant record`,
    );
  }

  assert.equal(
    tenantRecord({ tenantId: "platform", role: Role.PLATFORM_ADMIN }, tenantBRecord),
    tenantBRecord,
  );
});
