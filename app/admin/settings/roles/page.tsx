import { Role } from "@prisma/client";
import { requirePermission } from "@/lib/authorization/guards";
import {
  tenantAssignablePermissions,
} from "@/lib/authorization/custom-roles";
import { highRiskPermissions } from "@/lib/authorization/permission-risk";
import {
  Permission,
  defaultRolePermissions,
  type Permission as PermissionValue,
} from "@/lib/authorization/permissions";
import {
  archiveTenantCustomRoleAction,
  replaceTenantUserCustomRolesAction,
  saveTenantCustomRoleAction,
} from "@/lib/actions/custom-roles";
import { effectiveRolesForUser } from "@/lib/authorization/effective-access";
import { prisma } from "@/lib/db";
import { roleLabel } from "@/lib/tenant-roles";

const permissionGroups: readonly [string, readonly PermissionValue[]][] = [
  ["Administration", [
    Permission.ADMIN_ACCESS,
    Permission.TENANT_SETTINGS_MANAGE,
    Permission.SETTINGS_MANAGE,
    Permission.USERS_MANAGE,
    Permission.ROLES_MANAGE,
    Permission.AUDIT_READ,
    Permission.DATA_EXPORT,
    Permission.DATA_IMPORT,
    Permission.DATA_MIGRATE,
  ]],
  ["Residents and properties", [
    Permission.HOMEOWNERS_READ,
    Permission.HOMEOWNERS_MANAGE,
    Permission.PROPERTIES_READ,
    Permission.PROPERTIES_MANAGE,
  ]],
  ["Finance", [
    Permission.BILLING_READ,
    Permission.BILLING_MANAGE,
    Permission.BILLING_CONFIGURE,
    Permission.BILLING_PREVIEW,
    Permission.BILLING_GENERATE,
    Permission.BILLING_ADJUST,
    Permission.PAYMENTS_READ,
    Permission.PAYMENTS_MANAGE,
    Permission.PAYMENTS_REQUEST,
    Permission.PAYMENTS_RECORD,
    Permission.PAYMENTS_ALLOCATE,
    Permission.PAYMENTS_VOID,
    Permission.PAYMENTS_REFUND,
    Permission.COLLECTIONS_MANAGE,
    Permission.COLLECTIONS_RECORD,
    Permission.COLLECTIONS_REFUND,
    Permission.COLLECTIONS_FORFEIT,
    Permission.RECEIPTS_ISSUE,
    Permission.EXPENSES_MANAGE,
    Permission.REPORTS_VIEW,
    Permission.REPORTS_FINANCIAL,
  ]],
  ["People operations", [Permission.PAYROLL_MANAGE, Permission.ATTENDANCE_MANAGE]],
  ["Documents", [
    Permission.DOCUMENTS_READ,
    Permission.DOCUMENTS_REQUEST,
    Permission.DOCUMENTS_MANAGE,
    Permission.DOCUMENTS_APPROVE,
    Permission.DOCUMENTS_CONFIGURE,
    Permission.DOCUMENTS_GENERATE,
    Permission.DOCUMENTS_ARCHIVE,
    Permission.DOCUMENTS_BALANCE_OVERRIDE,
  ]],
  ["Community", [
    Permission.COMMUNITY_MANAGE,
    Permission.ANNOUNCEMENTS_PUBLISH,
    Permission.COMPLAINTS_MANAGE,
    Permission.CHAT_USE,
  ]],
  ["Portal access", [Permission.HOMEOWNER_PORTAL_ACCESS, Permission.EMPLOYEE_PORTAL_ACCESS]],
];

function label(permission: PermissionValue) {
  return permission
    .split(".")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" · ");
}

function PermissionChecklist({ selected }: { selected?: ReadonlySet<string> }) {
  return <div className="grid gap-4 lg:grid-cols-2">
    {permissionGroups.map(([group, permissions]) => {
      const available = permissions.filter((permission) => tenantAssignablePermissions.includes(permission));
      if (!available.length) return null;
      return <fieldset key={group} className="rounded-2xl border border-slate-200 p-4">
        <legend className="px-2 text-sm font-black text-slate-800">{group}</legend>
        <div className="mt-2 space-y-2">
          {available.map((permission) => {
            const risk = highRiskPermissions.has(permission);
            return <label key={permission} className="flex items-start gap-3 rounded-xl p-2 hover:bg-slate-50">
              <input className="mt-1 h-5 w-5" type="checkbox" name="permissions" value={permission} defaultChecked={selected?.has(permission)}/>
              <span className="min-w-0"><span className="block font-bold text-slate-800">{label(permission)}</span><code className="block break-all text-xs text-slate-500">{permission}</code>{risk && <span className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-black uppercase tracking-wide text-amber-900">High risk</span>}</span>
            </label>;
          })}
        </div>
      </fieldset>;
    })}
  </div>;
}

function ConfirmationFields() {
  return <div className="grid gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
    <label><span className="label">Business reason</span><textarea className="field min-h-24" name="reason" minLength={10} maxLength={500} required placeholder="Explain why this role or assignment is required."/></label>
    <label className="flex items-start gap-3 text-sm font-bold text-amber-950"><input className="mt-1 h-5 w-5" type="checkbox" name="confirmed" value="yes" required/><span>I reviewed the permission impact. Saving will revoke affected active sessions.</span></label>
  </div>;
}

export default async function RolesAndPermissionsPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const actor = await requirePermission(Permission.ROLES_MANAGE);
  const query = await searchParams;
  const [roles, users] = await Promise.all([
    prisma.tenantCustomRole.findMany({
      where: { tenantId: actor.tenantId },
      include: {
        permissions: { orderBy: { permission: "asc" } },
        assignments: { where: { active: true }, select: { userId: true } },
      },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
    prisma.user.findMany({
      where: { tenantId: actor.tenantId, active: true },
      include: {
        userRoleAssignments: { where: { active: true } },
        tenantCustomRoleAssignments: { where: { active: true }, select: { roleId: true } },
      },
      orderBy: { name: "asc" },
      take: 250,
    }),
  ]);
  const activeRoles = roles.filter((role) => role.active);

  return <div className="mx-auto max-w-7xl space-y-6">
    <section className="rounded-3xl bg-pine-900 p-6 text-white sm:p-8">
      <p className="text-sm font-black uppercase tracking-widest text-leaf-100">Authorization</p>
      <h1 className="mt-2 text-3xl font-black">Roles &amp; permissions</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-blue-100">Create tenant-specific roles, assign them alongside built-in roles, and apply least privilege. Platform permissions are never available to tenant roles.</p>
    </section>
    {query.success && <p className="rounded-2xl bg-emerald-50 p-4 font-bold text-emerald-900">{query.success}</p>}
    {query.error && <p className="rounded-2xl bg-rose-50 p-4 font-bold text-rose-900">{query.error}</p>}

    <details className="rounded-3xl border bg-white p-5 sm:p-7" open={!roles.length}>
      <summary className="cursor-pointer text-xl font-black">Create a custom role</summary>
      <form action={saveTenantCustomRoleAction} className="mt-5 space-y-5">
        <input type="hidden" name="tenantId" value={actor.tenantId}/><input type="hidden" name="returnTo" value="/admin/settings/roles"/>
        <div className="grid gap-4 sm:grid-cols-2"><label><span className="label">Role name</span><input className="field" name="name" minLength={3} maxLength={100} required/></label><label><span className="label">Stable key</span><input className="field" name="key" maxLength={80} placeholder="Generated from the name when blank"/></label></div>
        <label><span className="label">Description</span><textarea className="field min-h-20" name="description" maxLength={500}/></label>
        <PermissionChecklist/>
        <ConfirmationFields/>
        <button className="btn-primary w-full">Create Custom Role</button>
      </form>
    </details>

    <section className="space-y-4">
      <h2 className="text-2xl font-black">Tenant custom roles</h2>
      {!roles.length && <p className="rounded-2xl border bg-white p-5 text-slate-600">No custom roles have been created.</p>}
      {roles.map((role) => {
        const selected = new Set(role.permissions.map((item) => item.permission));
        return <details key={role.id} className={`rounded-3xl border bg-white p-5 sm:p-7 ${role.active ? "" : "opacity-70"}`}>
          <summary className="cursor-pointer"><span className="text-lg font-black">{role.name}</span><span className="ml-3 rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">{role.active ? `${role.assignments.length} assigned` : "Archived"}</span><code className="ml-3 text-xs text-slate-500">{role.key}</code></summary>
          <form action={saveTenantCustomRoleAction} className="mt-5 space-y-5">
            <input type="hidden" name="tenantId" value={actor.tenantId}/><input type="hidden" name="returnTo" value="/admin/settings/roles"/><input type="hidden" name="id" value={role.id}/>
            <div className="grid gap-4 sm:grid-cols-2"><label><span className="label">Role name</span><input className="field" name="name" defaultValue={role.name} minLength={3} maxLength={100} required/></label><label><span className="label">Stable key</span><input className="field" name="key" defaultValue={role.key} maxLength={80} required/></label></div>
            <label><span className="label">Description</span><textarea className="field min-h-20" name="description" defaultValue={role.description || ""} maxLength={500}/></label>
            <PermissionChecklist selected={selected}/>
            <ConfirmationFields/>
            <button className="btn-primary w-full" disabled={!role.active}>Save Role Changes</button>
          </form>
          {role.active && <form action={archiveTenantCustomRoleAction} className="mt-5 grid gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
            <input type="hidden" name="tenantId" value={actor.tenantId}/><input type="hidden" name="returnTo" value="/admin/settings/roles"/><input type="hidden" name="id" value={role.id}/>
            <label><span className="label">Archive reason</span><input className="field" name="reason" minLength={10} maxLength={500} required/></label>
            <label className="flex items-start gap-3 text-sm font-bold text-rose-900"><input className="mt-1 h-5 w-5" type="checkbox" name="confirmed" value="yes" required/><span>Archive this role, remove active assignments, and revoke affected sessions.</span></label>
            <button className="min-h-11 rounded-xl bg-rose-700 px-4 font-black text-white hover:bg-rose-800">Archive Custom Role</button>
          </form>}
        </details>;
      })}
    </section>

    <section className="space-y-4">
      <div><h2 className="text-2xl font-black">User assignments</h2><p className="mt-1 text-sm text-slate-500">Custom roles are additive to built-in roles. A user must sign in again after any change.</p></div>
      <div className="grid gap-4 lg:grid-cols-2">
        {users.map((user) => {
          const builtInRoles = effectiveRolesForUser(user.role, user.userRoleAssignments);
          const assigned = new Set(user.tenantCustomRoleAssignments.map((assignment) => assignment.roleId));
          return <details key={user.id} className="rounded-2xl border bg-white p-5">
            <summary className="cursor-pointer"><span className="font-black">{user.name}</span><span className="ml-2 text-sm text-slate-500">{user.email}</span><span className="mt-2 block text-xs text-slate-500">Built-in: {builtInRoles.map(roleLabel).join(", ")}</span></summary>
            <form action={replaceTenantUserCustomRolesAction} className="mt-4 space-y-4">
              <input type="hidden" name="tenantId" value={actor.tenantId}/><input type="hidden" name="userId" value={user.id}/><input type="hidden" name="returnTo" value="/admin/settings/roles"/>
              <div className="space-y-2">{activeRoles.map((role) => <label key={role.id} className="flex items-start gap-3 rounded-xl border p-3"><input className="mt-1 h-5 w-5" type="checkbox" name="customRoleIds" value={role.id} defaultChecked={assigned.has(role.id)}/><span><strong>{role.name}</strong><span className="block text-xs text-slate-500">{role.permissions.length} permissions</span></span></label>)}{!activeRoles.length && <p className="text-sm text-slate-500">Create an active custom role first.</p>}</div>
              <ConfirmationFields/>
              <button className="btn-secondary w-full" disabled={user.id === actor.id}>Save Custom Role Assignments</button>
              {user.id === actor.id && <p className="text-xs text-amber-800">Another authorized administrator must change your assignments.</p>}
            </form>
          </details>;
        })}
      </div>
    </section>

    <section className="rounded-3xl border bg-white p-5 sm:p-7"><h2 className="text-xl font-black">Built-in role reference</h2><div className="mt-4 grid gap-4 md:grid-cols-2">{Object.values(Role).map((role) => <div key={role} className="rounded-2xl bg-slate-50 p-4"><strong>{roleLabel(role)}</strong><p className="mt-2 break-words text-xs leading-5 text-slate-500">{defaultRolePermissions[role].join(", ")}</p></div>)}</div></section>
  </div>;
}
