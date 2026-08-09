import { TenantModule } from "@prisma/client";
import { ArrowLeft, FolderLock, Save } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { updateSubscriptionPlanAction } from "@/lib/actions/platform-plan-edit";
import { prisma } from "@/lib/db";
import { DOCUMENT_MANAGEMENT_FEATURE_CODE } from "@/lib/document-repository/constants";

export default async function EditSubscriptionPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const [plan, documentManagement] = await Promise.all([
    prisma.subscriptionPlan.findUnique({ where: { id }, include: { modules: true } }),
    prisma.subscriptionPlanFeatureEntitlement.findUnique({
      where: { planId_featureCode: { planId: id, featureCode: DOCUMENT_MANAGEMENT_FEATURE_CODE } },
    }),
  ]);
  if (!plan) notFound();
  const enabled = new Set(plan.modules.filter((item) => item.enabled).map((item) => item.module));

  return <>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs font-black uppercase tracking-[.16em] text-pine-700">Platform revenue</p><h1 className="mt-1 text-2xl font-black text-slate-950">Edit subscription plan</h1><p className="mt-1 text-sm text-slate-500">Configure commercial limits and sellable HOAHub capabilities. Historical issued agreements and invoices keep their saved snapshots.</p></div>
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
        <label><span className="label">Overall storage limit (MB)</span><input className="field" name="maximumStorageMb" type="number" min="1" defaultValue={plan.maximumStorageMb ?? ""} /></label>
        <label className="sm:col-span-2"><span className="label">Description</span><textarea className="field min-h-24" name="description" defaultValue={plan.description ?? ""} /></label>
      </div>

      <div className="mt-6 border-t pt-6"><span className="label">Included modules</span><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{Object.values(TenantModule).map((module) => <label key={module} className="flex min-h-12 items-center gap-3 rounded-xl border p-3 text-sm font-semibold"><input className="size-5" type="checkbox" name="modules" value={module} defaultChecked={enabled.has(module)} />{module.replaceAll("_", " ")}</label>)}</div></div>

      <section className="mt-7 rounded-3xl border border-pine-100 bg-pine-50/35 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white text-pine-700 shadow-sm"><FolderLock className="size-5" /></span><div><p className="text-xs font-black uppercase tracking-wider text-pine-700">Sellable platform capability</p><h2 className="mt-1 text-xl font-black text-ink">Document Management</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">Tenant-isolated repository for bylaws, policies, memoranda, resolutions, permits, community rules, and other association records. This is separate from generated/requested HOA documents.</p></div></div>
          <label className="flex min-h-12 shrink-0 items-center gap-3 rounded-2xl border bg-white px-4 py-3 text-sm font-black text-slate-800 shadow-sm"><input className="size-5" type="checkbox" name="documentManagementEnabled" defaultChecked={documentManagement?.enabled ?? false} /> Include in this plan</label>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <label><span className="label">Repository storage (MB)</span><input className="field bg-white" name="documentStorageLimitMb" type="number" min="1" defaultValue={documentManagement?.storageLimitMb ?? ""} placeholder={plan.maximumStorageMb ? String(plan.maximumStorageMb) : "Unlimited"} /><span className="mt-1 block text-xs text-slate-500">Blank inherits the plan’s overall storage limit.</span></label>
          <label><span className="label">Max file size (MB)</span><input className="field bg-white" name="documentMaxFileSizeMb" type="number" min="1" defaultValue={documentManagement?.maxFileSizeMb ?? 25} /></label>
          <label className="flex min-h-20 items-center gap-3 rounded-2xl border bg-white p-4 text-sm font-semibold"><input className="size-5" type="checkbox" name="retainRevisionBinaries" defaultChecked={documentManagement?.retainRevisionBinaries ?? false} /><span><strong className="block text-slate-900">Retain revision files</strong><span className="mt-1 block text-xs font-normal leading-5 text-slate-500">Keep historical governed-document binaries instead of audit metadata only.</span></span></label>
          <label><span className="label">Max retained revisions</span><input className="field bg-white" name="maxRevisionBinaries" type="number" min="1" defaultValue={documentManagement?.maxRevisionBinaries ?? ""} placeholder="No explicit limit" /></label>
        </div>
        <p className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-800">Disabling Document Management does not delete tenant files. The tenant repository remains preserved for later re-enable, migration, export, or administrative resolution.</p>
      </section>

      <button className="btn-primary mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 sm:w-auto"><Save className="size-4" /> Save plan changes</button>
    </form>
  </>;
}
