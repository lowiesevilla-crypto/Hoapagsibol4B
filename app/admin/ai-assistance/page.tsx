import { Role } from "@prisma/client";
import { Bot, FileCheck2, LockKeyhole, Scale, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { saveTenantAiGovernanceAction } from "@/lib/actions/ai-assistance-governance";
import { resolveAiAssistanceEntitlement } from "@/lib/ai-assistance/entitlement";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function statusClass(ready: boolean) {
  return ready ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900";
}

function gate(label: string, ready: boolean) {
  return <div className="flex items-center justify-between gap-3 rounded-2xl border bg-white px-4 py-3"><span className="text-sm font-bold text-slate-700">{label}</span><span className={`rounded-full px-2.5 py-1 text-xs font-black ${statusClass(ready)}`}>{ready ? "RECORDED" : "REQUIRED"}</span></div>;
}

export default async function AdminAiAssistancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser(Role.ADMIN);
  const query = await searchParams;
  const [entitlement, configuration, indexedCount, eligibleCount] = await Promise.all([
    resolveAiAssistanceEntitlement(user.tenantId),
    prisma.tenantAiConfiguration.findUnique({ where: { tenantId: user.tenantId } }),
    prisma.aiKnowledgeBinding.count({ where: { tenantId: user.tenantId, indexStatus: "INDEXED" } }),
    prisma.repositoryDocument.count({ where: { tenantId: user.tenantId, aiEnabled: true, status: "PUBLISHED" } }),
  ]);
  const globalRuntimeEnabled = process.env.AI_RUNTIME_ENABLED === "true";
  const success = one(query.success);
  const error = one(query.error);
  const privacyNoticeReady = Boolean(configuration?.privacyNoticePublishedAt && configuration.privacyNoticeVersion);
  const requiredGates = [
    Boolean(configuration?.boardApprovedAt),
    Boolean(configuration?.piaApprovedAt),
    Boolean(configuration?.dpoApprovedAt),
    Boolean(configuration?.providerApprovedAt),
    Boolean(configuration?.crossBorderReviewApprovedAt),
    privacyNoticeReady,
    Boolean(configuration?.lawfulBasis),
    Boolean(configuration?.dataSubjectRightsContact),
  ];
  const tenantGovernanceReady = requiredGates.every(Boolean);
  const operational = entitlement.enabled && globalRuntimeEnabled && Boolean(configuration?.runtimeEnabled) && tenantGovernanceReady;

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.16em] text-indigo-700">Tenant AI governance</p><h1 className="mt-1 text-3xl font-black text-slate-950">HOAHub AI Assistance</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Control whether this tenant may use AI, record required privacy/governance evidence, and manage the approved knowledge boundary. Commercial entitlement alone never activates AI processing.</p></div><Link className="btn-secondary" href="/admin/ai-assistance/knowledge">Manage AI knowledge</Link></div>

    {success && <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{success}</p>}
    {error && <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{error}</p>}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <article className="card"><span className="grid size-11 place-items-center rounded-2xl bg-indigo-50 text-indigo-700"><Bot className="size-5" /></span><p className="mt-4 text-xs font-black uppercase tracking-wider text-slate-400">Tenant AI status</p><p className={`mt-1 text-xl font-black ${operational ? "text-emerald-700" : "text-amber-800"}`}>{operational ? "Ready" : "Gated"}</p></article>
      <article className="card"><span className="grid size-11 place-items-center rounded-2xl bg-pine-50 text-pine-700"><Scale className="size-5" /></span><p className="mt-4 text-xs font-black uppercase tracking-wider text-slate-400">Commercial entitlement</p><p className="mt-1 text-xl font-black">{entitlement.enabled ? "Included" : "Not included"}</p><p className="mt-1 text-xs text-slate-500">{entitlement.enabledSource.replaceAll("_", " ")}</p></article>
      <article className="card"><span className="grid size-11 place-items-center rounded-2xl bg-blue-50 text-blue-700"><FileCheck2 className="size-5" /></span><p className="mt-4 text-xs font-black uppercase tracking-wider text-slate-400">AI-approved documents</p><p className="mt-1 text-xl font-black">{eligibleCount}</p><p className="mt-1 text-xs text-slate-500">{indexedCount} indexed</p></article>
      <article className="card"><span className="grid size-11 place-items-center rounded-2xl bg-slate-100 text-slate-700"><LockKeyhole className="size-5" /></span><p className="mt-4 text-xs font-black uppercase tracking-wider text-slate-400">Platform release switch</p><p className="mt-1 text-xl font-black">{globalRuntimeEnabled ? "Enabled" : "Disabled"}</p><p className="mt-1 text-xs text-slate-500">Platform-controlled; tenant users cannot override it.</p></article>
    </section>

    <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 sm:p-6">
      <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-amber-800" /><div><h2 className="font-black text-amber-950">Philippine data-privacy release gate</h2><p className="mt-1 text-sm leading-6 text-amber-900">These fields record HOAHub operational evidence required by the BRD. Checking an item does not itself constitute legal or DPO approval; retain the underlying signed PIA, lawful-basis analysis, privacy notice, vendor/subprocessor review, and governance evidence outside this screen according to your records policy.</p></div></div>
    </section>

    <form action={saveTenantAiGovernanceAction} className="rounded-3xl border bg-white p-5 shadow-sm sm:p-7">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)]">
        <div>
          <h2 className="text-xl font-black text-slate-950">Governance evidence</h2><p className="mt-1 text-sm text-slate-500">All required gates must be recorded before the tenant runtime can be enabled.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="flex min-h-14 items-center gap-3 rounded-2xl border p-4 text-sm font-bold"><input className="size-5" type="checkbox" name="boardApproved" defaultChecked={Boolean(configuration?.boardApprovedAt)} /> Board / HOA AI policy approved</label>
            <label className="flex min-h-14 items-center gap-3 rounded-2xl border p-4 text-sm font-bold"><input className="size-5" type="checkbox" name="piaApproved" defaultChecked={Boolean(configuration?.piaApprovedAt)} /> Privacy Impact Assessment approved</label>
            <label className="flex min-h-14 items-center gap-3 rounded-2xl border p-4 text-sm font-bold"><input className="size-5" type="checkbox" name="dpoApproved" defaultChecked={Boolean(configuration?.dpoApprovedAt)} /> DPO / privacy review approved</label>
            <label className="flex min-h-14 items-center gap-3 rounded-2xl border p-4 text-sm font-bold"><input className="size-5" type="checkbox" name="providerApproved" defaultChecked={Boolean(configuration?.providerApprovedAt)} /> AI provider/vendor review approved</label>
            <label className="flex min-h-14 items-center gap-3 rounded-2xl border p-4 text-sm font-bold"><input className="size-5" type="checkbox" name="crossBorderReviewApproved" defaultChecked={Boolean(configuration?.crossBorderReviewApprovedAt)} /> Cross-border/subprocessor review approved</label>
            <label className="flex min-h-14 items-center gap-3 rounded-2xl border p-4 text-sm font-bold"><input className="size-5" type="checkbox" name="privacyNoticePublished" defaultChecked={Boolean(configuration?.privacyNoticePublishedAt)} /> AI privacy notice published</label>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label><span className="label">Privacy notice version</span><input className="field" name="privacyNoticeVersion" maxLength={80} defaultValue={configuration?.privacyNoticeVersion ?? ""} placeholder="AI-PRIVACY-v1.0" /></label>
            <label><span className="label">Documented lawful basis</span><input className="field" name="lawfulBasis" maxLength={120} defaultValue={configuration?.lawfulBasis ?? ""} placeholder="Record approved lawful basis / reference" /></label>
            <label><span className="label">Conversation retention (days)</span><input className="field" name="retentionDays" type="number" min="1" max="3650" defaultValue={configuration?.retentionDays ?? 30} required /></label>
            <label><span className="label">Data-subject rights contact</span><input className="field" name="dataSubjectRightsContact" maxLength={190} defaultValue={configuration?.dataSubjectRightsContact ?? ""} placeholder="DPO/privacy contact or process reference" /></label>
          </div>
        </div>
        <aside>
          <h2 className="text-xl font-black text-slate-950">Release readiness</h2>
          <div className="mt-5 space-y-2">{gate("Board / HOA approval", Boolean(configuration?.boardApprovedAt))}{gate("PIA approval", Boolean(configuration?.piaApprovedAt))}{gate("DPO / privacy approval", Boolean(configuration?.dpoApprovedAt))}{gate("Provider/vendor review", Boolean(configuration?.providerApprovedAt))}{gate("Cross-border review", Boolean(configuration?.crossBorderReviewApprovedAt))}{gate("Privacy notice", privacyNoticeReady)}{gate("Lawful basis", Boolean(configuration?.lawfulBasis))}{gate("Rights contact", Boolean(configuration?.dataSubjectRightsContact))}</div>
        </aside>
      </div>

      <div className="mt-7 border-t pt-6"><h2 className="text-xl font-black text-slate-950">Tenant AI experiences</h2><p className="mt-1 text-sm text-slate-500">These controls remain subordinate to plan entitlement, role permissions, data classification, and the platform kill switch.</p><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="flex min-h-16 items-center gap-3 rounded-2xl border p-4 text-sm font-bold"><input className="size-5" type="checkbox" name="runtimeEnabled" defaultChecked={configuration?.runtimeEnabled ?? false} /> Enable tenant AI runtime</label>
        <label className="flex min-h-16 items-center gap-3 rounded-2xl border p-4 text-sm font-bold"><input className="size-5" type="checkbox" name="residentAssistantEnabled" defaultChecked={configuration?.residentAssistantEnabled ?? false} /> Resident assistant</label>
        <label className="flex min-h-16 items-center gap-3 rounded-2xl border p-4 text-sm font-bold"><input className="size-5" type="checkbox" name="staffCopilotEnabled" defaultChecked={configuration?.staffCopilotEnabled ?? false} /> Staff copilot</label>
        <label className="flex min-h-16 items-center gap-3 rounded-2xl border p-4 text-sm font-bold"><input className="size-5" type="checkbox" name="documentRequestActionsEnabled" defaultChecked={configuration?.documentRequestActionsEnabled ?? false} /> AI-assisted document requests</label>
      </div><label className="mt-4 block"><span className="label">Kill-switch / disabled reason</span><textarea className="field min-h-20" name="killSwitchReason" defaultValue={configuration?.killSwitchReason ?? ""} placeholder="Reason for keeping AI disabled, suspension, incident response, or remediation." /></label></div>
      <button className="btn-primary mt-6 min-h-12 w-full sm:w-auto">Save AI governance controls</button>
    </form>
  </div>;
}
