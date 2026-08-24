import { TenantSubscriptionStatus } from "@prisma/client";
import { Bot, FolderLock, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PlatformTenantTabs } from "@/components/platform-tenant-tabs";
import { AI_ASSISTANCE_FEATURE_CODE, mergeAiCommercialConfiguration } from "@/lib/ai-assistance/commercial";
import { updateTenantFeatureEntitlementsAction } from "@/lib/actions/platform-feature-entitlements";
import { prisma } from "@/lib/db";
import { DOCUMENT_MANAGEMENT_FEATURE_CODE } from "@/lib/document-repository/constants";

const blockedStatuses = new Set<TenantSubscriptionStatus>(["SUSPENDED", "CANCELLED", "EXPIRED"]);

function restrictionMode(value: boolean | null | undefined) {
  return value === false ? "DISABLE" : "INHERIT";
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export default async function PlatformTenantFeaturesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ success?: string; error?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const tenant = await prisma.tenant.findUnique({
    where: { id },
    select: {
      id: true, name: true, subscriptionPlan: true, subscriptionStatus: true,
      subscriptions: { orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }], take: 1, select: { planId: true, status: true, plan: { select: { id: true, code: true, name: true, active: true, maximumStorageMb: true } } } },
    },
  });
  if (!tenant) notFound();

  const latest = tenant.subscriptions[0];
  const fallbackPlan = latest ? null : await prisma.subscriptionPlan.findFirst({ where: { code: tenant.subscriptionPlan } });
  const plan = latest?.plan ?? fallbackPlan;
  const [planFeatures, overrides] = await Promise.all([
    plan ? prisma.subscriptionPlanFeatureEntitlement.findMany({ where: { planId: plan.id, featureCode: { in: [DOCUMENT_MANAGEMENT_FEATURE_CODE, AI_ASSISTANCE_FEATURE_CODE] } } }) : Promise.resolve([]),
    prisma.tenantFeatureEntitlement.findMany({ where: { tenantId: tenant.id, featureCode: { in: [DOCUMENT_MANAGEMENT_FEATURE_CODE, AI_ASSISTANCE_FEATURE_CODE] } } }),
  ]);
  const documentPlan = planFeatures.find((item) => item.featureCode === DOCUMENT_MANAGEMENT_FEATURE_CODE);
  const aiPlan = planFeatures.find((item) => item.featureCode === AI_ASSISTANCE_FEATURE_CODE);
  const documentOverride = overrides.find((item) => item.featureCode === DOCUMENT_MANAGEMENT_FEATURE_CODE);
  const aiOverride = overrides.find((item) => item.featureCode === AI_ASSISTANCE_FEATURE_CODE);
  const subscriptionStatus = latest?.status ?? tenant.subscriptionStatus;
  const commerciallyActive = Boolean(plan?.active && !blockedStatuses.has(subscriptionStatus));
  const documentEnabled = Boolean(documentPlan?.enabled && documentOverride?.enabledOverride !== false && commerciallyActive);
  const aiEnabled = Boolean(aiPlan?.enabled && aiOverride?.enabledOverride !== false && commerciallyActive);
  const aiEffective = mergeAiCommercialConfiguration(aiPlan?.configuration, aiOverride?.configurationOverride);
  const aiOverrideConfig = jsonRecord(aiOverride?.configurationOverride);

  return <div>
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.16em] text-pine-700">Platform commercial controls</p><h1 className="mt-1 text-2xl font-black text-slate-950 sm:text-3xl">{tenant.name} · Feature controls</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">The active subscription plan is the capability ceiling. Tenant-specific controls can restrict an included capability or adjust Platform-managed limits, but cannot enable functionality excluded from the plan.</p></div><Link className="btn-secondary" href="/platform/plans">Manage plan catalog</Link></div>
    <PlatformTenantTabs tenantId={tenant.id} active="features" />
    {query.success && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{query.success}</p>}
    {query.error && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-800">{query.error}</p>}

    <section className="mt-5 grid gap-4 md:grid-cols-3">
      <article className="card"><p className="text-xs font-black uppercase text-slate-400">Subscribed plan</p><p className="mt-2 text-xl font-black">{plan?.name ?? tenant.subscriptionPlan}</p><p className="mt-1 text-sm text-slate-500">{subscriptionStatus.replaceAll("_", " ")} · {plan?.active ? "Plan active" : "Plan inactive"}</p></article>
      <article className="card"><p className="text-xs font-black uppercase text-slate-400">Document Management</p><p className={`mt-2 text-xl font-black ${documentEnabled ? "text-emerald-700" : "text-slate-500"}`}>{documentEnabled ? "Enabled" : "Disabled"}</p><p className="mt-1 text-sm text-slate-500">{documentPlan?.enabled ? documentOverride?.enabledOverride === false ? "Platform tenant restriction" : "Included by plan" : "Not included in plan"}</p></article>
      <article className="card"><p className="text-xs font-black uppercase text-slate-400">AI Assistance</p><p className={`mt-2 text-xl font-black ${aiEnabled ? "text-emerald-700" : "text-slate-500"}`}>{aiEnabled ? "Commercially enabled" : "Disabled"}</p><p className="mt-1 text-sm text-slate-500">{aiPlan?.enabled ? aiOverride?.enabledOverride === false ? "Platform tenant restriction" : "Included by plan" : "Not included in plan"}</p></article>
    </section>

    <form action={updateTenantFeatureEntitlementsAction} className="mt-6 space-y-6">
      <input type="hidden" name="tenantId" value={tenant.id} />
      <section className="rounded-3xl border bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-pine-50 text-pine-700"><FolderLock className="size-5" /></span><div><p className="text-xs font-black uppercase tracking-wider text-pine-700">Plan-controlled repository capability</p><h2 className="text-xl font-black">Document Management</h2><p className="mt-1 text-sm text-slate-500">Plan: {documentPlan?.enabled ? "included" : "not included"}. A tenant restriction can turn an included feature off, but cannot elevate the tenant above its plan.</p></div></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <label><span className="label">Tenant restriction</span><select className="field" name="documentEnabledOverride" defaultValue={restrictionMode(documentOverride?.enabledOverride)}><option value="INHERIT">Follow active plan</option><option value="DISABLE">Disable for this tenant</option></select></label>
          <label><span className="label">Storage override (MB)</span><input className="field" name="documentStorageLimitMbOverride" type="number" min="1" defaultValue={documentOverride?.storageLimitMbOverride ?? ""} placeholder={String(documentPlan?.storageLimitMb ?? plan?.maximumStorageMb ?? "Inherit")} /></label>
          <label><span className="label">Max file size override (MB)</span><input className="field" name="documentMaxFileSizeMbOverride" type="number" min="1" defaultValue={documentOverride?.maxFileSizeMbOverride ?? ""} placeholder={String(documentPlan?.maxFileSizeMb ?? 25)} /></label>
          <label><span className="label">Revision file retention</span><select className="field" name="documentRetainRevisionBinariesOverride" defaultValue={documentOverride?.retainRevisionBinariesOverride === true ? "ENABLE" : documentOverride?.retainRevisionBinariesOverride === false ? "DISABLE" : "INHERIT"}><option value="INHERIT">Inherit plan</option><option value="ENABLE">Retain files</option><option value="DISABLE">Metadata only</option></select></label>
          <label><span className="label">Max retained revisions</span><input className="field" name="documentMaxRevisionBinariesOverride" type="number" min="1" defaultValue={documentOverride?.maxRevisionBinariesOverride ?? ""} placeholder={String(documentPlan?.maxRevisionBinaries ?? "Inherit")} /></label>
        </div>
        <p className="mt-4 rounded-2xl bg-blue-50 p-4 text-xs leading-5 text-blue-800">Disabling or reducing quota never automatically deletes existing repository files. Access is restored when an eligible active plan includes Document Management and no tenant restriction blocks it.</p>
      </section>

      <section className="rounded-3xl border border-indigo-100 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-indigo-50 text-indigo-700"><Bot className="size-5" /></span><div><p className="text-xs font-black uppercase tracking-wider text-indigo-700">Plan-controlled AI capability</p><h2 className="text-xl font-black">HOAHub AI Assistance</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">AI must first be included in the tenant&apos;s active plan. Platform Admin may then restrict it or set tenant-specific operating limits. Tenant administrators cannot enable AI commercially.</p></div></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <label><span className="label">Tenant restriction</span><select className="field" name="aiEnabledOverride" defaultValue={restrictionMode(aiOverride?.enabledOverride)}><option value="INHERIT">Follow active plan</option><option value="DISABLE">Disable for this tenant</option></select></label>
          <label><span className="label">Monthly requests</span><input className="field" name="aiMonthlyRequestLimit" type="number" min="0" defaultValue={typeof aiOverrideConfig.monthlyRequestLimit === "number" ? aiOverrideConfig.monthlyRequestLimit : ""} placeholder={String(aiEffective.monthlyRequestLimit ?? "Unlimited")} /></label>
          <label><span className="label">Requests per minute</span><input className="field" name="aiRequestsPerMinute" type="number" min="1" defaultValue={typeof aiOverrideConfig.requestsPerMinute === "number" ? aiOverrideConfig.requestsPerMinute : ""} placeholder={String(aiEffective.requestsPerMinute)} /></label>
          <label><span className="label">AI knowledge index (MB)</span><input className="field" name="aiKnowledgeIndexMb" type="number" min="0" defaultValue={typeof aiOverrideConfig.knowledgeIndexMb === "number" ? aiOverrideConfig.knowledgeIndexMb : ""} placeholder={String(aiEffective.knowledgeIndexMb ?? "Unlimited")} /></label>
          <label><span className="label">Monthly input-token allowance</span><input className="field" name="aiMonthlyInputTokenLimit" type="number" min="0" defaultValue={typeof aiOverrideConfig.monthlyInputTokenLimit === "number" ? aiOverrideConfig.monthlyInputTokenLimit : ""} placeholder={String(aiEffective.monthlyInputTokenLimit ?? "Unlimited")} /></label>
          <label><span className="label">Monthly output-token allowance</span><input className="field" name="aiMonthlyOutputTokenLimit" type="number" min="0" defaultValue={typeof aiOverrideConfig.monthlyOutputTokenLimit === "number" ? aiOverrideConfig.monthlyOutputTokenLimit : ""} placeholder={String(aiEffective.monthlyOutputTokenLimit ?? "Unlimited")} /></label>
          <label><span className="label">Monthly provider budget (centavos)</span><input className="field" name="aiMonthlySpendLimitCentavos" type="number" min="0" defaultValue={typeof aiOverrideConfig.monthlySpendLimitCentavos === "number" ? aiOverrideConfig.monthlySpendLimitCentavos : ""} placeholder={String(aiEffective.monthlySpendLimitCentavos ?? "Unlimited")} /></label>
          <label><span className="label">Model/service tier</span><select className="field" name="aiModelTier" defaultValue={typeof aiOverrideConfig.modelTier === "string" ? aiOverrideConfig.modelTier : "INHERIT"}><option value="INHERIT">Inherit ({aiEffective.modelTier})</option><option value="ECONOMY">Economy</option><option value="STANDARD">Standard</option><option value="PREMIUM">Premium</option></select></label>
          <label><span className="label">Overage policy</span><select className="field" name="aiOveragePolicy" defaultValue={typeof aiOverrideConfig.overagePolicy === "string" ? aiOverrideConfig.overagePolicy : "INHERIT"}><option value="INHERIT">Inherit ({aiEffective.overagePolicy.replaceAll("_", " ")})</option><option value="HARD_STOP">Hard stop</option><option value="APPROVAL_REQUIRED">Approval required</option></select></label>
        </div>
        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><ShieldCheck className="mt-0.5 size-5 shrink-0" /><p><b>Privacy gate:</b> Commercial plan inclusion is necessary but not sufficient. Production AI also requires the tenant&apos;s approved lawful basis/PIA, privacy notice, provider and cross-border review, role/audience policy, retention settings, and tenant-isolation UAT.</p></div>
      </section>

      <button className="btn-primary min-h-12 w-full sm:w-auto">Save tenant feature restrictions</button>
    </form>
  </div>;
}
