import { TenantModule } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity, Building2, CreditCard, Layers3, ShieldCheck, UsersRound, WalletCards } from "lucide-react";
import { updateTenantAction } from "@/lib/actions/platform";
import { updateTenantHomeownerConvenienceFeeAction } from "@/lib/actions/platform-homeowner-fee";
import { updateTenantLogoAction } from "@/lib/actions/tenant-branding";
import { resolveAiAssistanceEntitlement } from "@/lib/ai-assistance/entitlement";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveDocumentManagementEntitlement } from "@/lib/document-repository/entitlement";
import { PlatformTenantTabs } from "@/components/platform-tenant-tabs";
import { AssociationLogo } from "@/components/association-logo";
import { MetricCard } from "@/components/ui/metric-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { WorkspaceCard } from "@/components/ui/workspace-card";
import { getHomeownerPaymentConfig } from "@/lib/services/homeowner-payment-config";
import { getEnabledTenantModules } from "@/lib/tenant";
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
      advisories: { where: { active: true }, take: 1 },
      _count: { select: { users: true } },
    },
  });
  if (!tenant) notFound();
  const [homeownerPaymentConfig, recentActivity, enabled, documentManagement, aiAssistance] = await Promise.all([
    getHomeownerPaymentConfig(tenant.id),
    prisma.auditLog.findMany({
      where: { tenantId: tenant.id },
      take: 4,
      orderBy: { createdAt: "desc" },
      select: { id: true, module: true, action: true, entityType: true, createdAt: true },
    }),
    getEnabledTenantModules(tenant.id),
    resolveDocumentManagementEntitlement(tenant.id),
    resolveAiAssistanceEntitlement(tenant.id),
  ]);

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

  const enabledLabels = [...enabled].map(String);
  const logoUrl = tenant.logoUrl || DEFAULT_TENANT_LOGO_URL;
  const serviceHealthy = tenant.status === "ACTIVE";
  const subscriptionHealthy = tenant.subscriptionStatus === "ACTIVE";
  const healthTone = serviceHealthy && subscriptionHealthy ? "success" as const : serviceHealthy ? "warning" as const : "critical" as const;
  const healthLabel = serviceHealthy && subscriptionHealthy ? "Healthy" : serviceHealthy ? "Watch" : "Risk";
  const paymentRoutingReady = Boolean(homeownerPaymentConfig.paymongoLinkedAccountId && homeownerPaymentConfig.paymongoParentAccountIdConfigured);

  const capabilityGroups = [
    { title: "Finance & Billing", description: "Billing, payments, collections and receipts", terms: ["BILL", "PAYMENT", "COLLECTION", "FINANCE"] },
    { title: "Resident Services", description: "Documents, repository, complaints and resident requests", terms: ["DOCUMENT", "COMPLAINT", "REQUEST"] },
    { title: "Community", description: "Announcements, events and chat", terms: ["ANNOUNCEMENT", "EVENT", "CHAT", "COMMUNITY"] },
    { title: "HRIS & Payroll", description: "Employees, attendance and payroll", terms: ["EMPLOYEE", "ATTENDANCE", "PAYROLL", "HRIS"] },
    { title: "Security & Access", description: "Vehicles, stickers, gate and move services", terms: ["VEHICLE", "STICKER", "GATE", "MOVE", "SECURITY"] },
    { title: "HOAHub AI", description: "Tenant-scoped staff intelligence", terms: ["AI"] },
  ];

  return (
    <div className="space-y-5">
      <section className="canva-platform-hero overflow-hidden rounded-[26px] p-6 text-white sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <AssociationLogo className="size-20 shrink-0 rounded-[22px] bg-white/10 p-1 ring-1 ring-white/10" src={logoUrl} alt={`${tenant.name} logo`} />
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[.2em] text-[#8fd6e9]">Tenant 360</p>
              <h1 className="mt-2 break-words text-[30px] font-black leading-[1.05] tracking-[-.04em] sm:text-[40px]">{tenant.name}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold text-[#d5e9ef]"><span>{tenant.subscriptionPlan.replaceAll("_", " ")} Plan</span><span className="text-white/30">•</span><span>{tenant._count.users} users</span><span className="text-white/30">•</span><span>{tenant.slug}</span></div>
              <div className="mt-3"><StatusBadge tone={healthTone} className="bg-white/90">{tenant.status.replaceAll("_", " ")} · {healthLabel}</StatusBadge></div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link target="_blank" className="inline-flex min-h-11 items-center rounded-[13px] border border-white/12 bg-white/8 px-4 text-sm font-black text-white hover:bg-white/12" href={`/${tenant.slug}/login`}>Open Tenant Portal ↗</Link>
            <Link className="inline-flex min-h-11 items-center rounded-[13px] bg-[#0b95d8] px-4 text-sm font-black text-white hover:bg-[#27b6ff]" href={`/platform/tenants/${tenant.id}/billing`}>Manage Subscription</Link>
          </div>
        </div>
      </section>

      <PlatformTenantTabs tenantId={tenant.id} active="overview" />
      {query.success && <p className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">{query.message || "Tenant record updated successfully."}</p>}
      {query.error && <p className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-rose-800">{query.error}</p>}

      <section className="grid gap-[15px] sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Users" value={tenant._count.users} note="Current tenant user records" icon={UsersRound} tone="blue" href={`/platform/tenants/${tenant.id}/users`} />
        <MetricCard label="Subscription" value={tenant.subscriptionPlan.replaceAll("_", " ")} note={tenant.subscriptionStatus.replaceAll("_", " ")} icon={CreditCard} tone={subscriptionHealthy ? "green" : "amber"} href={`/platform/tenants/${tenant.id}/billing`} />
        <MetricCard label="Plan modules" value={enabled.size} note={`${Object.values(TenantModule).length} platform modules available`} icon={Layers3} tone="violet" href={`/platform/tenants/${tenant.id}/features`} />
        <MetricCard label="Payment routing" value={paymentRoutingReady ? "Ready" : "Review"} note="PayMongo parent + tenant child configuration" icon={WalletCards} tone={paymentRoutingReady ? "green" : "amber"} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
        <WorkspaceCard title="Tenant capability map" description="Effective capabilities resolved from the active plan and Platform Admin restrictions." action={<Link className="text-xs font-black text-[#0872ae] hover:underline" href={`/platform/tenants/${tenant.id}/features`}>Feature controls →</Link>}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {capabilityGroups.map((group) => {
              const moduleEnabled = enabledLabels.some((value) => group.terms.some((term) => value.includes(term)));
              const enabledForTenant = group.title === "HOAHub AI"
                ? aiAssistance.enabled
                : group.title === "Resident Services"
                  ? moduleEnabled || documentManagement.enabled
                  : moduleEnabled;
              return <div key={group.title} className="rounded-[17px] border border-[#e3edf2] bg-[#f9fcfd] p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-black text-[#153c50]">{group.title}</h3><p className="mt-1 text-xs leading-5 text-[#7c8d9b]">{group.description}</p></div><StatusBadge tone={enabledForTenant ? "success" : "neutral"}>{enabledForTenant ? "Enabled" : "Not enabled"}</StatusBadge></div></div>;
            })}
          </div>
        </WorkspaceCard>

        <div className="space-y-4">
          <WorkspaceCard title="Integration readiness" description="Verified configuration available to the platform.">
            <div className="space-y-3">
              <IntegrationRow icon={WalletCards} label="PayMongo tenant child" value={homeownerPaymentConfig.paymongoLinkedAccountId ? "Connected" : "Not configured"} ready={Boolean(homeownerPaymentConfig.paymongoLinkedAccountId)} />
              <IntegrationRow icon={Building2} label="PayMongo platform parent" value={homeownerPaymentConfig.paymongoParentAccountIdConfigured ? "Configured" : "Not configured"} ready={homeownerPaymentConfig.paymongoParentAccountIdConfigured} />
              <IntegrationRow icon={ShieldCheck} label="Tenant service state" value={tenant.status.replaceAll("_", " ")} ready={serviceHealthy} />
            </div>
          </WorkspaceCard>

          <aside className="canva-intelligence-panel rounded-[22px] p-5">
            <p className="text-[10px] font-black uppercase tracking-[.18em] text-[#9edfd1]">Tenant Health Intelligence</p>
            <h2 className="mt-2 text-xl font-black">{healthLabel} operational health</h2>
            <p className="mt-3 text-sm leading-6">Service state is <strong>{tenant.status.replaceAll("_", " ")}</strong> and subscription state is <strong>{tenant.subscriptionStatus.replaceAll("_", " ")}</strong>. Payment routing is <strong>{paymentRoutingReady ? "ready" : "not fully configured"}</strong>.</p>
          </aside>
        </div>
      </section>

      <WorkspaceCard title="Recent platform activity" description="Auditable changes affecting this tenant." action={<Link className="text-xs font-black text-[#0872ae] hover:underline" href={`/platform/tenants/${tenant.id}/audit`}>View audit →</Link>}>
        <div className="grid gap-3 md:grid-cols-2">
          {recentActivity.map((event) => <div key={event.id} className="flex items-start gap-3 rounded-[16px] border border-[#e3edf2] bg-[#f9fcfd] p-4"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#eaf6ff] text-[#0b80be]"><Activity className="size-4" /></span><div className="min-w-0"><p className="break-words text-sm font-black text-[#153c50]">{event.action.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-[#7c8d9b]">{event.module} · {event.entityType || "Tenant"} · {event.createdAt.toLocaleString("en-PH")}</p></div></div>)}
          {!recentActivity.length && <p className="py-6 text-sm text-[#7c8d9b]">No tenant audit activity has been recorded yet.</p>}
        </div>
      </WorkspaceCard>

      <form id="homeowner-convenience-fee" action={updateTenantHomeownerConvenienceFeeAction} className="scroll-mt-28 space-y-5 rounded-[22px] border border-[#cfe2eb] bg-[#f5fbff] p-5 shadow-[0_8px_24px_rgba(22,65,87,.04)] sm:p-7">
        <input type="hidden" name="tenantId" value={tenant.id} />
        <div>
          <p className="text-xs font-black uppercase tracking-[.16em] text-[#0872ae]">HOAHub platform revenue</p>
          <h2 className="mt-1 text-xl font-black text-[#0d3349]">Homeowner online convenience fee</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#6f8294]">This platform-owned fee applies only to homeowner PayMongo Online checkout. Tenant principal remains the HOA&apos;s money and routing continues through the existing server-authoritative payment workflow.</p>
        </div>
        <label className="flex items-start gap-3 rounded-2xl border border-[#dbe7ee] bg-white p-4"><input className="mt-1 size-5 accent-[#0b95d8]" type="checkbox" name="enabled" defaultChecked={homeownerPaymentConfig.platformFeeEnabled} /><span><span className="block font-black text-[#153c50]">Charge an HOAHub convenience fee for this tenant</span><span className="mt-1 block text-sm leading-6 text-[#6f8294]">Disabled means HOAHub adds no platform convenience fee to new homeowner PayMongo checkouts.</span></span></label>
        <div className="grid gap-4 md:grid-cols-2">
          <label><span className="label">Convenience fee per online payment (PHP)</span><input className="field" name="amountPesos" type="number" inputMode="decimal" min="0.01" max="10000" step="0.01" defaultValue={homeownerPaymentConfig.platformFeeAmountCentavos > 0 ? homeownerPaymentConfig.platformFeeAmountPesos.toFixed(2) : ""} placeholder="20.00" /><span className="mt-1 block text-xs leading-5 text-slate-500">Fixed amount per successful PayMongo checkout. Stored in centavos.</span></label>
          <div className="rounded-2xl border border-[#dbe7ee] bg-white p-4 text-sm leading-6"><p className="text-xs font-black uppercase tracking-wider text-slate-400">PayMongo split readiness</p><p className="mt-2 text-slate-700">HOAHub parent organization ID: <b>{homeownerPaymentConfig.paymongoParentAccountIdConfigured ? "Configured" : "Not configured"}</b></p><p className="text-slate-700">Tenant child organization ID: <b>{homeownerPaymentConfig.paymongoLinkedAccountId ? "Configured" : "Not configured"}</b></p>{homeownerPaymentConfig.platformFeeEnabled && !homeownerPaymentConfig.platformFeeRoutingReady && <p className="mt-2 rounded-xl bg-amber-50 p-3 font-semibold text-amber-900">The fee policy is saved, but HOAHub will fail closed and refuse fee-bearing checkout creation until platform routing is configured.</p>}</div>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">PayMongo&apos;s own processing fee is separate from the HOAHub convenience fee and remains governed by the existing checkout workflow.</div>
        <button className="btn-primary min-h-12 w-full sm:w-auto">Save homeowner convenience fee</button>
      </form>

      <form action={updateTenantLogoAction} className="space-y-4 rounded-[22px] border border-[#dbe7ee] bg-white p-5 shadow-[0_8px_24px_rgba(22,65,87,.04)] sm:p-7">
        <input type="hidden" name="tenantId" value={tenant.id} />
        <div><h2 className="text-xl font-black text-[#0d3349]">Tenant branding</h2><p className="text-sm text-[#6f8294]">Platform administrators can upload or reset the tenant logo shown on the login page and sidebar.</p></div>
        <div className="flex flex-wrap items-center gap-4"><AssociationLogo className="size-20" src={logoUrl} alt={`${tenant.name} logo`} /><label className="min-w-0 flex-1"><span className="label">Upload tenant logo</span><input className="field" name={tenantLogoFileField} type="file" accept="image/png,image/jpeg,image/webp" /></label></div>
        <label className="flex items-center gap-3 text-sm font-semibold text-slate-700"><input className="size-5" type="checkbox" name={tenantLogoRemoveField} />Reset to default HOAHub logo</label>
        <button className="btn-primary min-h-12 w-full sm:w-auto">Save tenant logo</button>
      </form>

      <form id="settings" action={updateTenantAction} className="space-y-6 rounded-[22px] border border-[#dbe7ee] bg-white p-5 shadow-[0_8px_24px_rgba(22,65,87,.04)] sm:p-7">
        <input type="hidden" name="tenantId" value={tenant.id} /><input type="hidden" name="status" value={tenant.status} /><input type="hidden" name="subscriptionStatus" value={tenant.subscriptionStatus} /><input type="hidden" name="subscriptionPlan" value={tenant.subscriptionPlan} />
        <div><h2 className="text-xl font-black text-[#0d3349]">Tenant configuration</h2><p className="text-sm text-[#6f8294]">Commercial plan, subscription status, suspension, reinstatement, modules, AI, and Document Management are controlled by Platform Administration.</p></div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><label><span className="label">URL slug</span><input className="field" name="slug" defaultValue={tenant.slug} required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" /></label><div className="rounded-xl bg-[#f7fbfd] p-4 text-sm"><p className="text-xs font-black uppercase tracking-wider text-slate-400">Commercial lifecycle</p><p className="mt-2 font-black text-slate-900">{tenant.subscriptionPlan} · {tenant.subscriptionStatus.replaceAll("_", " ")}</p><Link className="mt-2 inline-block font-black text-[#0872ae] hover:underline" href={`/platform/tenants/${tenant.id}/billing`}>Manage billing</Link></div></div>
        <label id="advisory" className="block scroll-mt-28"><span className="label">Tenant advisory message</span><textarea className="field min-h-28" name="advisory" defaultValue={tenant.advisories[0]?.message || ""} /></label>
        <div id="modules" className="scroll-mt-28">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><span className="label">Effective plan modules</span><p className="mt-1 text-xs text-slate-500">Read-only here. Change module inclusion in Plans &amp; Features or assign another active plan.</p></div><Link className="btn-secondary" href="/platform/plans">Plans &amp; Features</Link></div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{Object.values(TenantModule).map((module) => <div key={module} className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-[#dbe7ee] p-3 text-sm"><span>{module.replaceAll("_", " ")}</span><StatusBadge tone={enabled.has(module) ? "success" : "neutral"}>{enabled.has(module) ? "Included" : "Excluded"}</StatusBadge></div>)}</div>
        </div>
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900"><b>Platform authority:</b> Tenant roles and local settings cannot activate a module or sellable capability that is excluded from the active subscription plan. Document Management and HOAHub AI are additionally governed from the tenant Feature Controls page.</div>
        <button className="btn-primary min-h-12 w-full sm:w-auto">Save tenant configuration</button>
      </form>
    </div>
  );
}

function IntegrationRow({ icon: Icon, label, value, ready }: { icon: typeof Building2; label: string; value: string; ready: boolean }) {
  return <div className="flex items-center gap-3 rounded-[16px] border border-[#e3edf2] bg-[#f9fcfd] p-3.5"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#eaf6ff] text-[#0b80be]"><Icon className="size-4" /></span><div className="min-w-0 flex-1"><p className="text-xs font-black text-[#153c50]">{label}</p><p className="mt-0.5 truncate text-[11px] text-[#7c8d9b]">{value}</p></div><StatusBadge tone={ready ? "success" : "warning"}>{ready ? "Ready" : "Review"}</StatusBadge></div>;
}
