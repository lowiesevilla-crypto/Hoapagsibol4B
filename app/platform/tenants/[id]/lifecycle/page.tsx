import { Role, TenantStatus } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { PlatformTenantTabs } from "@/components/platform-tenant-tabs";
import {
  deactivateTenantLifecycleAction,
  deleteTenantLifecycleAction,
  reactivateTenantLifecycleAction,
} from "@/lib/actions/platform-tenant-lifecycle";
import { requireUser } from "@/lib/auth";
import { platformPrisma as prisma } from "@/lib/db";

export default async function TenantLifecyclePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const actor = await requireUser();
  if (!actor.roles.includes(Role.SUPER_ADMIN) && !actor.roles.includes(Role.PLATFORM_ADMIN)) redirect("/admin/dashboard");

  const { id } = await params;
  const query = await searchParams;
  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: { _count: { select: { users: true } } },
  });
  if (!tenant) notFound();

  const [homeowners, invoices, payments, auditEvents] = await Promise.all([
    prisma.homeownerProfile.count({ where: { tenantId: tenant.id } }),
    prisma.platformInvoice.count({ where: { tenantId: tenant.id } }),
    prisma.platformPayment.count({ where: { tenantId: tenant.id } }),
    prisma.auditLog.count({ where: { tenantId: tenant.id } }),
  ]);

  const inactive = tenant.status === TenantStatus.INACTIVE;
  const protectedControlTenant = tenant.id === actor.tenantId;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-black uppercase tracking-wider text-leaf-700">{tenant.name}</p>
          <h1 className="text-3xl font-black text-slate-950">Tenant Lifecycle</h1>
          <p className="mt-2 max-w-3xl text-slate-600">Deactivate access without losing data, reactivate an inactive tenant, or permanently purge an offboarded tenant.</p>
        </div>
        <span className={`rounded-full px-4 py-2 text-sm font-black ${inactive ? "bg-slate-200 text-slate-800" : "bg-emerald-100 text-emerald-800"}`}>{tenant.status}</span>
      </div>

      <PlatformTenantTabs tenantId={tenant.id} active="lifecycle" />

      {query.success && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{query.success}</p>}
      {query.error && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">{query.error}</p>}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Tenant users" value={tenant._count.users} />
        <Metric label="Homeowners" value={homeowners} />
        <Metric label="Platform invoices" value={invoices} />
        <Metric label="Platform payments" value={payments} />
        <Metric label="Audit events" value={auditEvents} />
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <article className="rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
          <p className="text-xs font-black uppercase tracking-[.16em] text-sky-700">Safe service control</p>
          <h2 className="mt-1 text-xl font-black text-slate-950">{inactive ? "Reactivate tenant" : "Deactivate tenant"}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {inactive
              ? "Reactivation restores tenant service access. Existing users, transactions, documents, billing history, configuration, and subscription records stay exactly where they were."
              : "Deactivation immediately blocks tenant service access and revokes active sessions. Users, transactions, documents, billing history, setup, configuration, and subscription records are retained."}
          </p>
          <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
            <p><b>Current service state:</b> {tenant.status}</p>
            <p className="mt-1"><b>Subscription state retained:</b> {tenant.subscriptionStatus.replaceAll("_", " ")}</p>
          </div>
          {inactive ? (
            <form action={reactivateTenantLifecycleAction} className="mt-5">
              <input type="hidden" name="tenantId" value={tenant.id} />
              <button className="btn-primary min-h-11">Reactivate tenant</button>
            </form>
          ) : (
            <form action={deactivateTenantLifecycleAction} className="mt-5">
              <input type="hidden" name="tenantId" value={tenant.id} />
              <button className="min-h-11 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-black text-white hover:bg-amber-700">Deactivate tenant</button>
            </form>
          )}
        </article>

        <article className="rounded-2xl border-2 border-rose-300 bg-rose-50/50 p-5 shadow-sm sm:p-6">
          <p className="text-xs font-black uppercase tracking-[.16em] text-rose-700">Danger zone</p>
          <h2 className="mt-1 text-xl font-black text-rose-950">Permanently delete tenant</h2>
          <p className="mt-2 text-sm leading-6 text-rose-900">
            This is irreversible. HOAHub will permanently delete the tenant and tenant-owned database records including transactions, billing and payment records, setup/configuration, users, homeowner records, documents/requests represented in the tenant data model, and tenant audit history. Normal foreign-key protections remain enabled outside this explicit Platform Admin purge.
          </p>
          {!inactive && <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-950">Deactivate the tenant first. Permanent deletion is blocked while the tenant is active or suspended.</p>}
          {protectedControlTenant && <p className="mt-4 rounded-xl border border-rose-300 bg-white p-3 text-sm font-bold text-rose-900">This is your Platform Admin control tenant and cannot delete itself.</p>}

          <form action={deleteTenantLifecycleAction} className="mt-5 space-y-3">
            <input type="hidden" name="tenantId" value={tenant.id} />
            <label>
              <span className="label">Type tenant slug: <b>{tenant.slug}</b></span>
              <input className="field" name="confirmationSlug" autoComplete="off" required disabled={!inactive || protectedControlTenant} />
            </label>
            <label>
              <span className="label">Type DELETE</span>
              <input className="field" name="confirmationWord" autoComplete="off" required disabled={!inactive || protectedControlTenant} />
            </label>
            <button disabled={!inactive || protectedControlTenant} className="min-h-11 rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-black text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-40">Permanently delete tenant and all tenant data</button>
          </form>
        </article>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-2xl border bg-white p-4 shadow-sm"><p className="text-xs font-black uppercase tracking-wider text-slate-400">{label}</p><p className="mt-2 text-2xl font-black text-slate-950">{value}</p></div>;
}
