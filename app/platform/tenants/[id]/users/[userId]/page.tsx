import { Role } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PasswordInput } from "@/components/password-input";
import { removeTenantUserAction, resetTenantUserPasswordAction, toggleTenantUserAction } from "@/lib/actions/platform";
import {
  convertTenantUserToHomeownerAction,
  repairTenantHomeownerConfigurationAction,
  replaceTenantUserRolesAction,
  updateTenantUserProfileAction,
} from "@/lib/actions/user-role-assignments";
import { effectiveRolesForUser } from "@/lib/authorization/effective-access";
import { defaultRolePermissions } from "@/lib/authorization/permissions";
import { prisma } from "@/lib/db";
import { isValidHomeownerAccountNumber } from "@/lib/services/homeowner-account-number";
import { digitalActivationLabel, maskAccountNumber } from "@/lib/services/homeowner-digital-activation";
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
  const pureHomeowner = roles.length === 1 && roles[0] === Role.HOMEOWNER;
  const homeownerProfile = user.homeownerProfile;
  const homeownerNeedsRepair = Boolean(
    homeownerProfile
    && pureHomeowner
    && (
      !isValidHomeownerAccountNumber(homeownerProfile.accountNumber)
      || homeownerProfile.activationStatus === "NOT_INVITED"
    )
  );

  return <div className="mx-auto max-w-4xl">
    <Link className="text-sm font-bold text-pine-700" href={`/platform/tenants/${id}/users`}>Back to tenant users</Link>
    <div className="mt-4 rounded-3xl bg-pine-900 p-6 text-white"><p className="text-sm font-bold uppercase tracking-wider text-leaf-100">{user.tenant.name}</p><h1 className="mt-1 text-3xl font-black">{user.name}</h1><p className="mt-2 break-all text-blue-100">{user.email} · {user.active ? "Active" : "Inactive"}</p><p className="mt-3 text-sm text-blue-100">Active roles: {roles.map(roleLabel).join(", ")}</p></div>
    {query.success && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-emerald-800">{query.message || query.success}</p>}{query.error && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-rose-800">{query.error}</p>}

    <form action={updateTenantUserProfileAction} className="mt-5 grid gap-4 rounded-2xl border bg-white p-5 sm:grid-cols-2 sm:p-7">
      <input type="hidden" name="tenantId" value={id}/><input type="hidden" name="userId" value={user.id}/>
      <label><span className="label">Full name</span><input className="field" name="name" defaultValue={user.name} required/></label>
      <label><span className="label">Email</span><input className="field" type="email" name="email" defaultValue={user.email} required/></label>
      <label className="sm:col-span-2"><span className="label">Username</span><input className="field" name="username" defaultValue={user.username || ""}/></label>
      <div className="grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:col-span-2 sm:grid-cols-3"><p><span className="text-slate-500">User ID</span><br/><span className="break-all font-mono text-xs">{user.id}</span></p><p><span className="text-slate-500">User type</span><br/><strong>{homeownerProfile ? "Homeowner" : user.employeeProfile ? "Employee" : "HOA Personnel"}</strong></p><p><span className="text-slate-500">Last login</span><br/><strong>{user.lastLoginAt?.toLocaleString() || "Never"}</strong></p></div>
      <button className="btn-primary sm:col-span-2">Save User Profile</button>
    </form>

    {homeownerProfile ? <section className={`mt-5 rounded-2xl border p-5 sm:p-7 ${homeownerNeedsRepair ? "border-amber-300 bg-amber-50" : "bg-white"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-xl font-black">Homeowner configuration</h2><p className="mt-1 text-sm text-slate-600">The linked homeowner profile, account number, operational state, and digital activation must remain consistent with the assigned role.</p></div>
        <span className={`rounded-full px-3 py-1 text-xs font-black ${homeownerNeedsRepair ? "bg-amber-200 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>{homeownerNeedsRepair ? "REPAIR REQUIRED" : "CONFIGURED"}</span>
      </div>
      <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <p className="rounded-xl bg-white/80 p-3"><span className="text-xs font-bold uppercase text-slate-500">Account number</span><br/><strong>{maskAccountNumber(homeownerProfile.accountNumber)}</strong></p>
        <p className="rounded-xl bg-white/80 p-3"><span className="text-xs font-bold uppercase text-slate-500">Property</span><br/><strong>Block {homeownerProfile.block}, Lot {homeownerProfile.lot}</strong></p>
        <p className="rounded-xl bg-white/80 p-3"><span className="text-xs font-bold uppercase text-slate-500">Operational status</span><br/><strong>{homeownerProfile.status}</strong></p>
        <p className="rounded-xl bg-white/80 p-3"><span className="text-xs font-bold uppercase text-slate-500">Digital activation</span><br/><strong>{digitalActivationLabel(homeownerProfile.activationStatus)}</strong></p>
      </div>
      {pureHomeowner && <form action={repairTenantHomeownerConfigurationAction} className="mt-4">
        <input type="hidden" name="tenantId" value={id}/><input type="hidden" name="userId" value={user.id}/>
        <button className={homeownerNeedsRepair ? "btn-primary w-full" : "btn-secondary w-full"}>{homeownerNeedsRepair ? "Repair Homeowner Configuration" : "Regenerate Incomplete Homeowner Access"}</button>
        <p className="mt-2 text-xs leading-5 text-slate-500">A missing account number is generated automatically. A valid existing number is preserved. For an incomplete activation, previous personnel credentials are invalidated and a new activation invitation is prepared when eligible.</p>
      </form>}
    </section> : <section className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-5 sm:p-7">
      <h2 className="text-xl font-black text-amber-950">Convert this user to a homeowner</h2>
      <p className="mt-1 text-sm leading-6 text-amber-900">The HOMEOWNER role cannot be assigned until the required property and dues information is supplied. Conversion replaces all personnel roles with HOMEOWNER, revokes previous sessions and incomplete credentials, creates the linked profile, assigns an account number, and prepares activation when eligible.</p>
      <form action={convertTenantUserToHomeownerAction} className="mt-5 grid gap-4 sm:grid-cols-2">
        <input type="hidden" name="tenantId" value={id}/><input type="hidden" name="userId" value={user.id}/>
        <label><span className="label">Phone</span><input className="field" name="phone" maxLength={30} required/></label>
        <label><span className="label">Monthly dues</span><input className="field" type="number" name="monthlyDuesAmount" min="0.01" max="10000000" step="0.01" required/></label>
        <label className="sm:col-span-2"><span className="label">Property address</span><input className="field" name="address" maxLength={250} required/></label>
        <label><span className="label">Block</span><input className="field" name="block" maxLength={30} required/></label>
        <label><span className="label">Lot</span><input className="field" name="lot" maxLength={30} required/></label>
        <label><span className="label">Phase</span><input className="field" name="phase" maxLength={100}/></label>
        <label><span className="label">Property type</span><input className="field" name="propertyType" maxLength={80}/></label>
        <label><span className="label">Occupancy status</span><input className="field" name="occupancyStatus" maxLength={80}/></label>
        <label><span className="label">Operational status</span><select className="field" name="status" defaultValue="ACTIVE"><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></label>
        <label className="sm:col-span-2"><span className="label">Existing account number <span className="font-normal text-slate-400">(optional)</span></span><input className="field" inputMode="numeric" name="accountNumber" pattern="[1-9][0-9]{10}" maxLength={11} placeholder="Leave blank to auto-generate"/><span className="mt-1 block text-xs text-slate-500">A valid existing 11-digit number is used as entered. Otherwise, leave this blank and the system will generate a unique number.</span></label>
        <button className="btn-primary sm:col-span-2">Convert and Configure Homeowner</button>
      </form>
    </section>}

    <form action={replaceTenantUserRolesAction} className="mt-5 rounded-2xl border bg-white p-5 sm:p-7">
      <input type="hidden" name="tenantId" value={id}/><input type="hidden" name="userId" value={user.id}/>
      <h2 className="text-xl font-black">Role assignments</h2>
      <p className="mt-1 text-sm text-slate-500">Permissions are additive across all selected roles. Saving changes revokes the user&apos;s active sessions immediately. The Homeowner role additionally requires a complete linked homeowner profile.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {tenantUserRoles.map((role) => {
          const homeownerUnavailable = role === Role.HOMEOWNER && !homeownerProfile;
          return <label key={role} className={`flex min-h-12 items-start gap-3 rounded-xl border p-3 ${homeownerUnavailable ? "cursor-not-allowed bg-slate-100 opacity-60" : "hover:bg-slate-50"}`}><input className="mt-1 h-5 w-5" type="checkbox" name="roles" value={role} defaultChecked={roles.includes(role)} disabled={homeownerUnavailable}/><span><strong>{roleLabel(role)}</strong><span className="mt-1 block text-xs leading-5 text-slate-500">{homeownerUnavailable ? "Complete the homeowner conversion form above before assigning this role." : defaultRolePermissions[role].join(", ")}</span></span></label>;
        })}
      </div>
      <button className="btn-primary mt-5 w-full">Save Role Assignments</button>
    </form>

    <section className="mt-5 grid gap-5 md:grid-cols-2">
      {pureHomeowner ? <div className="rounded-2xl border bg-slate-50 p-5"><h2 className="font-black">Homeowner password management</h2><p className="mt-1 text-sm leading-6 text-slate-600">Platform staff do not set a homeowner&apos;s permanent password. Use the homeowner activation or secure password-reset workflow after the profile is configured.</p></div> : <form action={resetTenantUserPasswordAction} className="rounded-2xl border bg-white p-5"><input type="hidden" name="tenantId" value={id}/><input type="hidden" name="userId" value={user.id}/><h2 className="font-black">Reset temporary password</h2><p className="mt-1 text-sm text-slate-500">Use at least 10 characters and share it securely.</p><div className="mt-4"><PasswordInput className="field" name="password" minLength={10} autoComplete="new-password" required/></div><button className="btn-secondary mt-3 w-full">Reset Password</button></form>}
      <div className="space-y-3 rounded-2xl border bg-white p-5"><h2 className="font-black">Account controls</h2><form action={toggleTenantUserAction}><input type="hidden" name="tenantId" value={id}/><input type="hidden" name="userId" value={user.id}/><button className="btn-secondary w-full">{user.active ? "Deactivate User" : "Activate User"}</button></form><form action={removeTenantUserAction}><input type="hidden" name="tenantId" value={id}/><input type="hidden" name="userId" value={user.id}/><button className="min-h-11 w-full rounded-xl bg-rose-50 px-4 font-bold text-rose-800 hover:bg-rose-100">Remove From Tenant</button></form><p className="text-xs leading-5 text-slate-500">Homeowner and employee accounts with linked records cannot be removed. Deactivate them to preserve history.</p></div>
    </section>
  </div>;
}
