import Link from "next/link";
import { notFound } from "next/navigation";
import { PasswordInput } from "@/components/password-input";
import { removeTenantUserAction, resetTenantUserPasswordAction, toggleTenantUserAction } from "@/lib/actions/platform";
import {
  replaceTenantUserRolesAction,
  updateTenantUserProfileAction,
} from "@/lib/actions/user-role-assignments";
import { effectiveRolesForUser } from "@/lib/authorization/effective-access";
import { defaultRolePermissions } from "@/lib/authorization/permissions";
import { prisma } from "@/lib/db";
import { roleLabel, tenantUserRoles } from "@/lib/tenant-roles";

export default async function TenantUserDetailPage({ params, searchParams }: { params: Promise<{ id: string; userId: string }>; searchParams: Promise<{ success?: string; error?: string; message?: string }> }) {
  const { id, userId } = await params;
  const query = await searchParams;
  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId: id },
    include: {
      tenant: true,
      homeownerProfile: true,
      employeeProfile: true,
      userRoleAssignments: true,
    },
  });
  if (!user) notFound();
  const roles = effectiveRolesForUser(user.role, user.userRoleAssignments);

  return <div className="mx-auto max-w-4xl">
    <Link className="text-sm font-bold text-pine-700" href={`/platform/tenants/${id}/users`}>Back to tenant users</Link>
    <div className="mt-4 rounded-3xl bg-pine-900 p-6 text-white"><p className="text-sm font-bold uppercase tracking-wider text-leaf-100">{user.tenant.name}</p><h1 className="mt-1 text-3xl font-black">{user.name}</h1><p className="mt-2 break-all text-blue-100">{user.email} · {user.active ? "Active" : "Inactive"}</p><p className="mt-3 text-sm text-blue-100">Active roles: {roles.map(roleLabel).join(", ")}</p></div>
    {query.success && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-emerald-800">{query.message || "User record updated successfully."}</p>}{query.error && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-rose-800">{query.error}</p>}
    <form action={updateTenantUserProfileAction} className="mt-5 grid gap-4 rounded-2xl border bg-white p-5 sm:grid-cols-2 sm:p-7">
      <input type="hidden" name="tenantId" value={id}/><input type="hidden" name="userId" value={user.id}/>
      <label><span className="label">Full name</span><input className="field" name="name" defaultValue={user.name} required/></label>
      <label><span className="label">Email</span><input className="field" type="email" name="email" defaultValue={user.email} required/></label>
      <label className="sm:col-span-2"><span className="label">Username</span><input className="field" name="username" defaultValue={user.username || ""}/></label>
      <div className="grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:col-span-2 sm:grid-cols-3"><p><span className="text-slate-500">User ID</span><br/><span className="break-all font-mono text-xs">{user.id}</span></p><p><span className="text-slate-500">User type</span><br/><strong>{user.homeownerProfile ? "Homeowner" : user.employeeProfile ? "Employee" : "HOA Personnel"}</strong></p><p><span className="text-slate-500">Last login</span><br/><strong>{user.lastLoginAt?.toLocaleString() || "Never"}</strong></p></div>
      <button className="btn-primary sm:col-span-2">Save User Profile</button>
    </form>
    <form action={replaceTenantUserRolesAction} className="mt-5 rounded-2xl border bg-white p-5 sm:p-7">
      <input type="hidden" name="tenantId" value={id}/><input type="hidden" name="userId" value={user.id}/>
      <h2 className="text-xl font-black">Role assignments</h2>
      <p className="mt-1 text-sm text-slate-500">Permissions are additive across all selected roles. Saving changes revokes the user&apos;s active sessions immediately.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {tenantUserRoles.map((role) => <label key={role} className="flex min-h-12 items-start gap-3 rounded-xl border p-3 hover:bg-slate-50"><input className="mt-1 h-5 w-5" type="checkbox" name="roles" value={role} defaultChecked={roles.includes(role)}/><span><strong>{roleLabel(role)}</strong><span className="mt-1 block text-xs leading-5 text-slate-500">{defaultRolePermissions[role].join(", ")}</span></span></label>)}
      </div>
      <button className="btn-primary mt-5 w-full">Save Role Assignments</button>
    </form>
    <section className="mt-5 grid gap-5 md:grid-cols-2">
      <form action={resetTenantUserPasswordAction} className="rounded-2xl border bg-white p-5"><input type="hidden" name="tenantId" value={id}/><input type="hidden" name="userId" value={user.id}/><h2 className="font-black">Reset temporary password</h2><p className="mt-1 text-sm text-slate-500">Use at least 10 characters and share it securely.</p><div className="mt-4"><PasswordInput className="field" name="password" minLength={10} autoComplete="new-password" required/></div><button className="btn-secondary mt-3 w-full">Reset Password</button></form>
      <div className="space-y-3 rounded-2xl border bg-white p-5"><h2 className="font-black">Account controls</h2><form action={toggleTenantUserAction}><input type="hidden" name="tenantId" value={id}/><input type="hidden" name="userId" value={user.id}/><button className="btn-secondary w-full">{user.active ? "Deactivate User" : "Activate User"}</button></form><form action={removeTenantUserAction}><input type="hidden" name="tenantId" value={id}/><input type="hidden" name="userId" value={user.id}/><button className="min-h-11 w-full rounded-xl bg-rose-50 px-4 font-bold text-rose-800 hover:bg-rose-100">Remove From Tenant</button></form><p className="text-xs leading-5 text-slate-500">Homeowner and employee accounts with linked records cannot be removed. Deactivate them to preserve history.</p></div>
    </section>
  </div>;
}
