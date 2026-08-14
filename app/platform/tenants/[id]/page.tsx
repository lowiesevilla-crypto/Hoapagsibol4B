import { TenantModule } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { updateTenantAction } from "@/lib/actions/platform";
import { updateTenantHomeownerConvenienceFeeAction } from "@/lib/actions/platform-homeowner-fee";
import { updateTenantLogoAction } from "@/lib/actions/tenant-branding";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PlatformTenantTabs } from "@/components/platform-tenant-tabs";
import { AssociationLogo } from "@/components/association-logo";
import { getHomeownerPaymentConfig } from "@/lib/services/homeowner-payment-config";
import {
  DEFAULT_TENANT_LOGO_URL,
  tenantLogoFileField,
  tenantLogoRemoveField,
} from "@/lib/tenant-logo";

export default async function TenantDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string; message?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const actor = await requireUser();
  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: {
      moduleEntitlements: true,
      advisories: { where: { active: true }, take: 1 },
      _count: { select: { users: true } },
    },
  });
  if (!tenant) notFound();
  const homeownerPaymentConfig = await getHomeownerPaymentConfig(tenant.id);

  await prisma.auditLog.create({
    data: {
      tenantId: tenant.id,
      actorId: actor.id,
      module: "PLATFORM",
      action: "SUPER_ADMIN_TENANT_ACCESS",
      entityType: "Tenant",
      entityId: tenant.id,
    },
  });
  const enabled = new Set(
    tenant.moduleEntitlements.filter((item) => item.enabled).map((item) => item.module),
  );
  const logoUrl = tenant.logoUrl || DEFAULT_TENANT_LOGO_URL;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-5 rounded-3xl bg-gradient-to-r from-pine-900 to-pine-700 p-6 text-white sm:p-8">
        <div className="flex min-w-0 items-center gap-4">
          <AssociationLogo className="size-20 shrink-0" src={logoUrl} alt={`${tenant.name} logo`} />
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest text-leaf-100">Tenant profile</p>
            <h1 className="break-words text-2xl font-black sm:text-4xl">{tenant.name}</h1>
            <Link target="_blank" href={`/${tenant.slug}/login`} className="mt-2 block break-all text-sm font-bold text-blue-100 underline">
              /{tenant.slug}/login
            </Link>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="rounded-full bg-white/15 px-4 py-2 text-sm font-bold">{tenant.status}</span>
          <Link className="rounded-xl bg-white px-4 py-2 text-sm font-black text-pine-900" href={`/platform/tenants/${tenant.id}/billing`}>
            Subscription &amp; Billing
          </Link>
        </div>
      </div>

      <PlatformTenantTabs tenantId={tenant.id} active="overview" />
      {query.success && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-emerald-800">{query.message || "Tenant record updated successfully."}</p>}
      {query.error && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-rose-800">{query.error}</p>}

      <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Users", tenant._count.users],
          ["Plan", tenant.subscriptionPlan],
          ["Subscription", tenant.subscriptionStatus.replaceAll("_", " ")],
          ["Service status", tenant.status],
          ["SEC number", tenant.secRegistrationNumber || "Not configured"],
          ["TIN number", tenant.tinNumber || "Not configured"],
          ["Contact", tenant.contactNumber || "Not configured"],
          ["Email", tenant.email || "Not configured"],
          ["Created", tenant.createdAt.toLocaleDateString()],
          ["Updated", tenant.updatedAt.toLocaleDateString()],
        ].map(([label, value]) => (
          <article key={String(label)} className="min-w-0 rounded-2xl border bg-white p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
            <p className="mt-2 break-words font-black text-slate-900">{value}</p>
          </article>
        ))}
      </section>

      <form id="homeowner-convenience-fee" action={updateTenantHomeownerConvenienceFeeAction} className="mt-6 scroll-mt-28 space-y-5 rounded-2xl border border-blue-200 bg-blue-50/40 p-5 sm:p-7">
        <input type="hidden" name="tenantId" value={tenant.id} />
        <div>
          <p className="text-xs font-black uppercase tracking-[.16em] text-blue-700">HOAHub platform revenue</p>
          <h2 className="mt-1 text-xl font-black text-slate-950">Homeowner online convenience fee</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            This is a platform-owned fee charged only when homeowners use PayMongo Online. The HOA principal remains the tenant&apos;s money; HOAHub&apos;s fee is routed separately to the platform PayMongo account. Tenant administrators can see this policy but cannot change it.
          </p>
        </div>

        <label className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-white p-4">
          <input className="mt-1 size-5 accent-blue-700" type="checkbox" name="enabled" defaultChecked={homeownerPaymentConfig.platformFeeEnabled} />
          <span>
            <span className="block font-black text-slate-950">Charge an HOAHub convenience fee for this tenant</span>
            <span className="mt-1 block text-sm leading-6 text-slate-600">Disabled means HOAHub adds no platform convenience fee to new homeowner PayMongo checkouts.</span>
          </span>
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label>
            <span className="label">Convenience fee per online payment (PHP)</span>
            <input
              className="field"
              name="amountPesos"
              type="number"
              inputMode="decimal"
              min="0.01"
              max="10000"
              step="0.01"
              defaultValue={homeownerPaymentConfig.platformFeeAmountCentavos > 0 ? homeownerPaymentConfig.platformFeeAmountPesos.toFixed(2) : ""}
              placeholder="20.00"
            />
            <span className="mt-1 block text-xs leading-5 text-slate-500">Fixed amount per successful PayMongo checkout. The amount is stored in centavos to avoid floating-point billing errors.</span>
          </label>
          <div className="rounded-2xl border bg-white p-4 text-sm leading-6">
            <p className="text-xs font-black uppercase tracking-wider text-slate-400">PayMongo split readiness</p>
            <p className="mt-2 text-slate-700">HOAHub parent organization ID: <b>{homeownerPaymentConfig.paymongoParentAccountIdConfigured ? "Configured" : "Not configured"}</b></p>
            <p className="text-slate-700">Tenant child organization ID: <b>{homeownerPaymentConfig.paymongoLinkedAccountId ? "Configured" : "Not configured"}</b></p>
            {homeownerPaymentConfig.platformFeeEnabled && !homeownerPaymentConfig.platformFeeRoutingReady && (
              <p className="mt-2 rounded-xl bg-amber-50 p-3 font-semibold text-amber-900">The fee policy is saved, but HOAHub will fail closed and refuse fee-bearing checkout creation until the platform parent `org_...` ID is configured on the server.</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          PayMongo&apos;s own processing fee is separate from the HOAHub convenience fee. When this policy is enabled, HOAHub requests PayMongo to pass the provider processing fee to the payer and keeps it separate from both the tenant HOA principal and HOAHub platform revenue.
        </div>

        <button className="btn-primary min-h-12 w-full sm:w-auto">Save homeowner convenience fee</button>
      </form>

      <form action={updateTenantLogoAction} className="mt-6 space-y-4 rounded-2xl border bg-white p-5 sm:p-7">
        <input type="hidden" name="tenantId" value={tenant.id} />
        <div>
          <h2 className="text-xl font-black">Tenant branding</h2>
          <p className="text-sm text-slate-500">Platform administrators can upload or reset the tenant logo shown on the login page and sidebar.</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <AssociationLogo className="size-20" src={logoUrl} alt={`${tenant.name} logo`} />
          <label className="min-w-0 flex-1">
            <span className="label">Upload tenant logo</span>
            <input className="field" name={tenantLogoFileField} type="file" accept=".jpg,.jpeg,.png" />
            <span className="mt-1 block text-xs text-slate-500">JPG, JPEG, or PNG only.</span>
          </label>
        </div>
        <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
          <input className="size-5" type="checkbox" name={tenantLogoRemoveField} />
          Reset to default HOAHub logo
        </label>
        <button className="btn-primary min-h-12 w-full sm:w-auto">Save tenant logo</button>
      </form>

      <form id="settings" action={updateTenantAction} className="mt-6 space-y-6 rounded-2xl border bg-white p-5 sm:p-7">
        <input type="hidden" name="tenantId" value={tenant.id} />
        <input type="hidden" name="status" value={tenant.status} />
        <input type="hidden" name="subscriptionStatus" value={tenant.subscriptionStatus} />
        <input type="hidden" name="subscriptionPlan" value={tenant.subscriptionPlan} />
        <div>
          <h2 className="text-xl font-black">Tenant configuration</h2>
          <p className="text-sm text-slate-500">Commercial plan, subscription status, suspension, and reinstatement are controlled through Subscription &amp; Billing so those changes remain fully auditable.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <label>
            <span className="label">URL slug</span>
            <input className="field" name="slug" defaultValue={tenant.slug} required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" />
          </label>
          <div className="rounded-xl bg-slate-50 p-4 text-sm">
            <p className="text-xs font-black uppercase tracking-wider text-slate-400">Commercial lifecycle</p>
            <p className="mt-2 font-black text-slate-900">{tenant.subscriptionPlan} · {tenant.subscriptionStatus.replaceAll("_", " ")}</p>
            <Link className="mt-2 inline-block font-black text-pine-700 hover:underline" href={`/platform/tenants/${tenant.id}/billing`}>Manage billing</Link>
          </div>
        </div>

        <label id="advisory" className="block scroll-mt-28">
          <span className="label">Tenant advisory message</span>
          <textarea className="field min-h-28" name="advisory" defaultValue={tenant.advisories[0]?.message || ""} />
        </label>

        <div id="modules" className="scroll-mt-28">
          <span className="label">Module access</span>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Object.values(TenantModule).map((module) => (
              <label key={module} className="flex min-h-12 items-center gap-3 rounded-xl border p-3 text-sm">
                <input className="size-5" type="checkbox" name="modules" value={module} defaultChecked={enabled.has(module)} />
                {module.replaceAll("_", " ")}
              </label>
            ))}
          </div>
        </div>
        <button className="btn-primary min-h-12 w-full sm:w-auto">Save tenant configuration</button>
      </form>
    </div>
  );
}