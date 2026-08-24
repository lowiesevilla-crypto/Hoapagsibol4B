import { PasswordInput } from "@/components/password-input";
import { createTenantAction } from "@/lib/actions/platform";
import { prisma } from "@/lib/db";
import { roleLabel, tenantAccessRoles } from "@/lib/tenant-roles";

export default async function NewTenantPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const plans = await prisma.subscriptionPlan.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { code: true, name: true },
  });

  return <div className="mx-auto max-w-4xl">
    <h1 className="text-3xl font-black text-slate-900">Tenant Onboarding</h1>
    <p className="mt-2 text-slate-600">Creates the HOA, its isolated settings, active-plan capability boundary, and first tenant administrator.</p>
    {error && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-rose-800">{error}</p>}
    <form action={createTenantAction} className="mt-6 grid gap-5 rounded-2xl border bg-white p-6 sm:grid-cols-2">
      <Field name="name" label="Association name" />
      <Field name="shortName" label="Short name" />
      <Field name="slug" label="Tenant URL slug" placeholder="sample-hoa" />
      <label><span className="label">Initial subscription plan</span><select className="field" name="subscriptionPlan" required defaultValue=""><option value="" disabled>Select active plan</option>{plans.map((plan) => <option key={plan.code} value={plan.code}>{plan.name} ({plan.code})</option>)}</select><span className="mt-1 block text-xs leading-5 text-slate-500">Tenant modules, Document Management, and HOAHub AI are limited by this Platform Admin plan until Subscription &amp; Billing assigns another active plan.</span></label>
      <Field name="address" label="Address" />
      <Field name="contactNumber" label="Contact number" />
      <Field name="email" label="Association email" type="email" />
      <Field name="secRegistrationNumber" label="SEC registration number" />
      <Field name="tinNumber" label="TIN number" />
      <div />
      <div className="border-t pt-5 sm:col-span-2"><h2 className="font-black text-slate-900">First tenant administrator</h2><p className="mt-1 text-sm text-slate-500">Administrator roles govern what a user may do inside capabilities already authorized by the Platform Admin plan; roles cannot enable excluded capabilities.</p></div>
      <Field name="adminName" label="Administrator name" />
      <Field name="adminEmail" label="Administrator email" type="email" />
      <Field name="password" label="Temporary password" type="password" />
      <label><span className="label">Administrator access</span><select className="field" name="adminRole" defaultValue="SYSTEM_ADMIN">{tenantAccessRoles.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</select></label>
      <div className="sm:col-span-2 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900"><b>Platform-controlled capabilities:</b> Module access is not selected separately during onboarding. The selected active plan is the commercial source of truth. Use Plans &amp; Features to change plan inclusions, and tenant Feature Controls only to restrict an included sellable capability.</div>
      <button className="btn-primary sm:col-span-2" disabled={!plans.length}>Create tenant</button>
      {!plans.length && <p className="sm:col-span-2 text-sm font-semibold text-amber-800">Create or activate a subscription plan before onboarding a tenant.</p>}
    </form>
  </div>;
}

function Field({ name, label, type = "text", placeholder }: { name: string; label: string; type?: string; placeholder?: string }) {
  const required = ["name", "shortName", "slug", "adminName", "adminEmail", "password"].includes(name);
  return <label><span className="label">{label}</span>{type === "password" ? <PasswordInput className="field" name={name} placeholder={placeholder} minLength={10} autoComplete="new-password" required={required} /> : <input className="field" name={name} type={type} placeholder={placeholder} required={required} />}</label>;
}
