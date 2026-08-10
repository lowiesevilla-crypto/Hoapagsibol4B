import { TenantModule } from "@prisma/client";
import Link from "next/link";
import { Bot, FolderLock, Layers3, Pencil, Plus, UsersRound } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { createSubscriptionPlanAction } from "@/lib/actions/platform-commercial-plans";
import { toggleSubscriptionPlanAction } from "@/lib/actions/platform-billing";
import { listPlatformPlans } from "@/lib/services/platform-billing";

function money(value: number | { toString(): string } | null, currency = "PHP") {
  if (value == null) return "Custom";
  return new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value));
}

export default async function PlatformPlansPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const query = await searchParams;
  const plans = await listPlatformPlans();
  return <>
    <PageHeader eyebrow="Platform revenue" title="Subscription plan catalog" description="Control pricing, commercial limits, modules, Document Management, and HOAHub AI Assistance as independently sellable capabilities." action={<Link className="btn-secondary" href="/platform/tenants">Back to tenants</Link>} />
    {query.success && <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{query.success}</p>}
    {query.error && <p className="mb-4 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-800">{query.error}</p>}

    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {plans.map((plan) => <article key={plan.id} className="card flex min-h-64 flex-col">
        <div className="flex items-start justify-between gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-pine-50 text-pine-700"><Layers3 className="size-5" /></span>
          <span className={`rounded-full px-3 py-1 text-xs font-black ${plan.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{plan.active ? "ACTIVE" : "INACTIVE"}</span>
        </div>
        <p className="mt-4 text-xs font-black uppercase tracking-wider text-slate-400">{plan.code}</p>
        <h2 className="text-xl font-black text-slate-900">{plan.name}</h2>
        <p className="mt-2 min-h-12 text-sm leading-6 text-slate-500">{plan.description || "No plan description configured."}</p>
        <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-4 text-sm">
          <div><p className="text-xs font-bold uppercase text-slate-400">Monthly</p><p className="font-black text-pine-900">{money(plan.monthlyPrice, plan.currency)}</p></div>
          <div><p className="text-xs font-bold uppercase text-slate-400">Annual</p><p className="font-black text-pine-900">{money(plan.annualPrice, plan.currency)}</p></div>
          <div><p className="text-xs font-bold uppercase text-slate-400">One-time fee</p><p className="font-black text-pine-900">{money(plan.setupFee, plan.currency)}</p></div>
          <div><p className="text-xs font-bold uppercase text-slate-400">Trial</p><p className="font-bold">{plan.trialDays} days</p></div>
          <div><p className="text-xs font-bold uppercase text-slate-400">Subscriptions</p><p className="font-bold">{plan._count.subscriptions}</p></div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">{plan.modules.length ? plan.modules.map(({ module }) => <span key={module} className="rounded-full border bg-white px-2.5 py-1 text-xs font-bold text-slate-600">{module.replaceAll("_", " ")}</span>) : <span className="text-sm text-slate-400">No modules assigned.</span>}</div>
        <div className="mt-auto grid gap-2 pt-5 sm:grid-cols-2">
          <Link className="btn-secondary inline-flex min-h-11 items-center justify-center gap-2" href={`/platform/plans/${plan.id}`}><Pencil className="size-4" /> Edit plan</Link>
          <form action={toggleSubscriptionPlanAction}><input type="hidden" name="planId" value={plan.id} /><button className="btn-secondary min-h-11 w-full">{plan.active ? "Deactivate plan" : "Activate plan"}</button></form>
        </div>
      </article>)}
      {!plans.length && <article className="card md:col-span-2 xl:col-span-3"><div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-slate-100 text-slate-500"><UsersRound className="size-5" /></span><div><h2 className="font-black">No commercial plans yet</h2><p className="text-sm text-slate-500">Create the first plan below. Existing tenants remain unaffected until a plan is explicitly assigned.</p></div></div></article>}
    </section>

    <form action={createSubscriptionPlanAction} className="mt-6 rounded-3xl border bg-white p-5 shadow-sm sm:p-7">
      <div className="flex items-start gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-pine-50 text-pine-700"><Plus className="size-5" /></span><div><h2 className="text-xl font-black">Create subscription plan</h2><p className="mt-1 text-sm text-slate-500">Define pricing, modules, and independent sellable capabilities before assigning the plan to a tenant.</p></div></div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <label><span className="label">Plan code</span><input className="field" name="code" placeholder="PROFESSIONAL" required /></label>
        <label><span className="label">Plan name</span><input className="field" name="name" placeholder="Professional" required /></label>
        <label><span className="label">Currency</span><input className="field" name="currency" defaultValue="PHP" maxLength={3} required /></label>
        <label><span className="label">Trial days</span><input className="field" name="trialDays" type="number" min="0" max="365" defaultValue="14" /></label>
        <label><span className="label">Monthly price</span><input className="field" name="monthlyPrice" type="number" min="0" step="0.01" placeholder="5000.00" /></label>
        <label><span className="label">Annual price</span><input className="field" name="annualPrice" type="number" min="0" step="0.01" placeholder="55000.00" /></label>
        <label><span className="label">One-time setup fee</span><input className="field" name="setupFee" type="number" min="0" step="0.01" defaultValue="0" /></label>
        <label><span className="label">Maximum users</span><input className="field" name="maximumUsers" type="number" min="1" /></label>
        <label><span className="label">Maximum homeowners</span><input className="field" name="maximumHomeowners" type="number" min="1" /></label>
        <label><span className="label">Overall storage limit (MB)</span><input className="field" name="maximumStorageMb" type="number" min="1" /></label>
        <label className="sm:col-span-2"><span className="label">Description</span><textarea className="field min-h-24" name="description" placeholder="Who this plan is for and the commercial value it includes." /></label>
      </div>

      <div className="mt-6 border-t pt-6"><span className="label">Included modules</span><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{Object.values(TenantModule).map((module) => <label key={module} className="flex min-h-12 items-center gap-3 rounded-xl border p-3 text-sm font-semibold"><input className="size-5" type="checkbox" name="modules" value={module} defaultChecked />{module.replaceAll("_", " ")}</label>)}</div></div>

      <section className="mt-7 rounded-3xl border border-pine-100 bg-pine-50/35 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="flex items-start gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-white text-pine-700"><FolderLock className="size-5" /></span><div><p className="text-xs font-black uppercase tracking-wider text-pine-700">Sellable capability</p><h3 className="text-xl font-black">Document Management</h3><p className="mt-1 text-sm text-slate-600">Private tenant repository and homeowner Document Library.</p></div></div><label className="flex min-h-12 items-center gap-3 rounded-2xl border bg-white px-4 py-3 text-sm font-black"><input className="size-5" type="checkbox" name="documentManagementEnabled" /> Include in plan</label></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><label><span className="label">Repository storage (MB)</span><input className="field bg-white" name="documentStorageLimitMb" type="number" min="1" placeholder="Inherit overall storage" /></label><label><span className="label">Max file size (MB)</span><input className="field bg-white" name="documentMaxFileSizeMb" type="number" min="1" defaultValue="25" /></label><label className="flex min-h-20 items-center gap-3 rounded-2xl border bg-white p-4 text-sm font-semibold"><input className="size-5" type="checkbox" name="retainRevisionBinaries" /><span><strong className="block">Retain revision files</strong><span className="text-xs font-normal text-slate-500">Keep governed historical binaries.</span></span></label><label><span className="label">Max retained revisions</span><input className="field bg-white" name="maxRevisionBinaries" type="number" min="1" /></label></div>
      </section>

      <section className="mt-6 rounded-3xl border border-indigo-100 bg-indigo-50/35 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="flex items-start gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-white text-indigo-700"><Bot className="size-5" /></span><div><p className="text-xs font-black uppercase tracking-wider text-indigo-700">Sellable capability</p><h3 className="text-xl font-black">HOAHub AI Assistance</h3><p className="mt-1 max-w-2xl text-sm text-slate-600">Commercial entitlement and usage ceilings. Runtime remains subject to tenant AI governance, privacy, authorization, and provider gates.</p></div></div><label className="flex min-h-12 items-center gap-3 rounded-2xl border bg-white px-4 py-3 text-sm font-black"><input className="size-5" type="checkbox" name="aiAssistanceEnabled" /> Include in plan</label></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <label><span className="label">Monthly requests</span><input className="field bg-white" name="aiMonthlyRequestLimit" type="number" min="0" defaultValue="1000" /></label>
          <label><span className="label">Requests/minute</span><input className="field bg-white" name="aiRequestsPerMinute" type="number" min="1" defaultValue="10" /></label>
          <label><span className="label">Monthly input tokens</span><input className="field bg-white" name="aiMonthlyInputTokenLimit" type="number" min="0" /></label>
          <label><span className="label">Monthly output tokens</span><input className="field bg-white" name="aiMonthlyOutputTokenLimit" type="number" min="0" /></label>
          <label><span className="label">Provider budget (centavos)</span><input className="field bg-white" name="aiMonthlySpendLimitCentavos" type="number" min="0" /></label>
          <label><span className="label">AI knowledge index (MB)</span><input className="field bg-white" name="aiKnowledgeIndexMb" type="number" min="0" /></label>
          <label><span className="label">Model/service tier</span><select className="field bg-white" name="aiModelTier" defaultValue="STANDARD"><option value="ECONOMY">Economy</option><option value="STANDARD">Standard</option><option value="PREMIUM">Premium</option></select></label>
          <label><span className="label">Overage policy</span><select className="field bg-white" name="aiOveragePolicy" defaultValue="HARD_STOP"><option value="HARD_STOP">Hard stop</option><option value="APPROVAL_REQUIRED">Approval required</option></select></label>
        </div>
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">Including AI in a commercial plan does not by itself permit model processing of personal data. Tenant-specific PIA/lawful-basis/provider approval and runtime policy are separate release gates.</p>
      </section>

      <button className="btn-primary mt-6 w-full sm:w-auto">Create plan</button>
    </form>
  </>;
}
