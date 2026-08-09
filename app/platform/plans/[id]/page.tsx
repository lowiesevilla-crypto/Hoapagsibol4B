import { TenantModule } from "@prisma/client";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { updateSubscriptionPlanAction } from "@/lib/actions/platform-plan-edit";
import { prisma } from "@/lib/db";

export default async function EditSubscriptionPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const plan = await prisma.subscriptionPlan.findUnique({ where: { id }, include: { modules: true } });
  if (!plan) notFound();
  const enabled = new Set(plan.modules.filter((item) => item.enabled).map((item) => item.module));

  return <>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs font-black uppercase tracking-[.16em] text-pine-700">Platform revenue</p><h1 className="mt-1 text-2xl font-black text-slate-950">Edit subscription plan</h1><p className="mt-1 text-sm text-slate-500">Changes affect future commercial assignments and agreements. Historical issued agreements and invoices keep their saved snapshots.</p></div>
      <Link className="btn-secondary inline-flex items-center gap-2" href="/platform/plans"><ArrowLeft className="size-4" /> Back to plans</Link>
    </div>
    {query.success && <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{query.success}</p>}
    {query.error && <p className="mb-4 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-800">{query.error}</p>}

    <form action={updateSubscriptionPlanAction} className="rounded-3xl border bg-white p-5 shadow-sm sm:p-7">
      <input type="hidden" name="planId" value={plan.id} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <label><span className="label">Plan code</span><input className="field" name="code" defaultValue={plan.code} required /></label>
        <label><span className="label">Plan name</span><input className="field" name="name" defaultValue={plan.name} required /></label>
        <label><span className="label">Currency</span><input className="field" name="currency" defaultValue={plan.currency} maxLength={3} required /></label>
        <label><span className="label">Trial days</span><input className="field" name="trialDays" type="number" min="0" max="365" defaultValue={plan.trialDays} /></label>
        <label><span className="label">Monthly price</span><input className="field" name="monthlyPrice" type="number" min="0" step="0.01" defaultValue={plan.monthlyPrice?.toString() ?? ""} /></label>
        <label><span className="label">Annual price</span><input className="field" name="annualPrice" type="number" min="0" step="0.01" defaultValue={plan.annualPrice?.toString() ?? ""} /></label>
        <label><span className="label">One-time setup fee</span><input className="field" name="setupFee" type="number" min="0" step="0.01" defaultValue={plan.setupFee.toString()} /><span className="mt-1 block text-xs text-slate-500">Captured into new agreement commercial terms.</span></label>
        <label><span className="label">Maximum users</span><input className="field" name="maximumUsers" type="number" min="1" defaultValue={plan.maximumUsers ?? ""} /></label>
        <label><span className="label">Maximum homeowners</span><input className="field" name="maximumHomeowners" type="number" min="1" defaultValue={plan.maximumHomeowners ?? ""} /></label>
        <label><span className="label">Storage limit (MB)</span><input className="field" name="maximumStorageMb" type="number" min="1" defaultValue={plan.maximumStorageMb ?? ""} /></label>
        <label className="sm:col-span-2"><span className="label">Description</span><textarea className="field min-h-24" name="description" defaultValue={plan.description ?? ""} /></label>
      </div>
      <div className="mt-5"><span className="label">Included modules</span><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{Object.values(TenantModule).map((module) => <label key={module} className="flex min-h-12 items-center gap-3 rounded-xl border p-3 text-sm font-semibold"><input className="size-5" type="checkbox" name="modules" value={module} defaultChecked={enabled.has(module)} />{module.replaceAll("_", " ")}</label>)}</div></div>
      <button className="btn-primary mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 sm:w-auto"><Save className="size-4" /> Save plan changes</button>
    </form>
  </>;
}
