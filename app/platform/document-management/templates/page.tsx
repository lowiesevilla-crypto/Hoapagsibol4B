import { Role } from "@prisma/client";
import { CheckCircle2, FileBadge2, LibraryBig, QrCode, RefreshCw, ShieldCheck, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/ui";
import { assignFreeDocumentTemplateAction, assignFreeDocumentTemplateLibraryAction } from "@/lib/actions/platform-document-template-library";
import { requireUser } from "@/lib/auth";
import { platformPrisma } from "@/lib/db";
import { freeDocumentTemplateBlueprints } from "@/lib/services/platform-document-template-catalog";
import { getFreeDocumentTemplateTenantStatus } from "@/lib/services/platform-document-template-library";

type Query = { tenantId?: string; error?: string; success?: string; message?: string };

export default async function PlatformFreeDocumentTemplateLibraryPage({ searchParams }: { searchParams: Promise<Query> }) {
  await requireUser(Role.PLATFORM_ADMIN);
  const query = await searchParams;
  const tenants = await platformPrisma.tenant.findMany({ orderBy: [{ status: "asc" }, { name: "asc" }], select: { id: true, name: true, slug: true, status: true, subscriptionStatus: true } });
  const selectedTenantId = tenants.some((tenant) => tenant.id === query.tenantId) ? query.tenantId! : tenants[0]?.id ?? "";
  const selectedTenant = tenants.find((tenant) => tenant.id === selectedTenantId) ?? null;
  const statuses = selectedTenantId ? await getFreeDocumentTemplateTenantStatus(selectedTenantId) : [];
  const statusByKey = new Map(statuses.map((status) => [status.key, status]));
  const currentCount = statuses.filter((status) => status.current).length;

  return <>
    <PageHeader
      eyebrow="Platform document services"
      title="Free professional document template library"
      description="Assign production-ready HOA document starting templates to a tenant. Assignment publishes the new template safely, retires only the previously assigned published version when an upgrade is needed, and preserves historical issued documents."
      action={<Link className="btn-secondary" href="/platform/document-management">Document Management</Link>}
    />

    {query.error && <Notice kind="error">{query.error}</Notice>}
    {query.success && <Notice kind="success">{query.message || "Document template assignment completed."}</Notice>}

    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[.16em] text-pine-700">Target tenant</p>
            <h2 className="mt-1 text-xl font-black text-slate-950">Choose where to install the library</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Nothing is assigned across tenants automatically. Every installation is explicitly tenant-scoped and audited.</p>
          </div>
          {selectedTenant && <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">{currentCount} / {freeDocumentTemplateBlueprints.length} current</span>}
        </div>
        <form className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]" method="get">
          <select className="field" name="tenantId" defaultValue={selectedTenantId} aria-label="Tenant">
            {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name} · {tenant.status} · {tenant.subscriptionStatus}</option>)}
          </select>
          <button className="btn-primary">Load tenant</button>
        </form>
        {selectedTenant && <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
          <p className="font-black text-slate-900">{selectedTenant.name}</p>
          <p className="mt-1 text-xs text-slate-500">/{selectedTenant.slug} · Tenant ID {selectedTenant.id}</p>
        </div>}
      </div>

      <aside className="card border-pine-100 bg-pine-50/40">
        <div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white text-pine-700"><SlidersHorizontal className="size-5" /></span><div><h2 className="font-black text-slate-950">Tenant remains in control</h2><p className="mt-1 text-sm leading-6 text-slate-600">The assigned template is tenant-owned and editable. After assignment, authorized tenant administrators can still change the document definition, fields, workflow, approver, fee/payment policy, validity, signatory, and create their own template versions.</p></div></div>
      </aside>
    </section>

    {selectedTenant && <form action={assignFreeDocumentTemplateLibraryAction} className="card mt-5 border-blue-100 bg-blue-50/30">
      <input type="hidden" name="tenantId" value={selectedTenant.id} />
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <div className="flex items-center gap-2"><LibraryBig className="size-5 text-blue-700" /><h2 className="text-lg font-black text-slate-950">Assign complete free library</h2></div>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">Installs or upgrades all {freeDocumentTemplateBlueprints.length} templates in one serializable transaction. If any document cannot be installed safely, the full-library assignment rolls back instead of leaving a partially configured tenant.</p>
          <label className="mt-4 flex items-start gap-3 rounded-xl border border-blue-100 bg-white p-3 text-sm font-semibold text-slate-700"><input className="mt-1 size-4" type="checkbox" name="applyRecommendedWorkflow" defaultChecked /><span><strong>Apply recommended workflow.</strong> Use HOAHub's free Approval Required starting workflow. Clear this only when you want existing tenant workflow configuration preserved. If no workflow exists, HOAHub still creates a safe approval workflow so the document is requestable.</span></label>
        </div>
        <SubmitButton className="btn-primary shrink-0"><LibraryBig className="size-4" /> Assign all templates</SubmitButton>
      </div>
    </form>}

    <section className="mt-5 grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
      {freeDocumentTemplateBlueprints.map((blueprint) => {
        const status = statusByKey.get(blueprint.key);
        const installed = status?.current ?? false;
        const actionLabel = installed ? "Re-apply current" : status?.hasExistingDefinition ? "Upgrade & assign" : "Create & assign";
        return <article className="card flex h-full flex-col" key={blueprint.key}>
          <div className="flex items-start justify-between gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-700"><FileBadge2 className="size-5" /></span>
            <span className={`rounded-full px-2.5 py-1 text-xs font-black ${installed ? "bg-emerald-100 text-emerald-800" : status?.hasExistingDefinition ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-600"}`}>{installed ? "CURRENT" : status?.hasExistingDefinition ? "UPDATE AVAILABLE" : "NOT INSTALLED"}</span>
          </div>
          <p className="mt-4 font-mono text-[11px] font-bold text-slate-400">{blueprint.code}</p>
          <h2 className="mt-1 text-lg font-black text-slate-950">{blueprint.displayName}</h2>
          <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">{blueprint.description}</p>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-bold text-slate-600">
            <Feature icon={QrCode}>QR verification</Feature>
            <Feature icon={ShieldCheck}>Approval workflow</Feature>
            <Feature icon={CheckCircle2}>Fee ₱0 default</Feature>
            <Feature icon={SlidersHorizontal}>Tenant editable</Feature>
          </div>
          {status?.definitionId && <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-500"><p><strong>Tenant definition:</strong> {status.definitionCode}</p><p className="mt-1"><strong>Assigned template:</strong> {status.assignedVersion ? `v${status.assignedVersion} · ${status.assignedStatus}` : "None"}</p></div>}
          {selectedTenant && <form action={assignFreeDocumentTemplateAction} className="mt-4 border-t pt-4">
            <input type="hidden" name="tenantId" value={selectedTenant.id} />
            <input type="hidden" name="templateKey" value={blueprint.key} />
            <label className="mb-3 flex items-start gap-2 text-xs font-semibold text-slate-600"><input className="mt-0.5 size-4" type="checkbox" name="applyRecommendedWorkflow" defaultChecked /><span>Apply recommended workflow. Clear to preserve an existing tenant workflow.</span></label>
            <SubmitButton className="btn-secondary w-full"><RefreshCw className="size-4" /> {actionLabel}</SubmitButton>
          </form>}
        </article>;
      })}
    </section>

    <section className="card mt-5">
      <h2 className="text-lg font-black text-slate-950">Assignment safety model</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Safety title="No historical rewrite">Existing requests and issued document versions keep their definition/template snapshots.</Safety>
        <Safety title="Controlled replacement">Only the previously assigned published template is retired when a newer library template is assigned.</Safety>
        <Safety title="Fail closed">Duplicate document identities or invalid template packages block assignment before tenant state is changed.</Safety>
        <Safety title="Tenant customization preserved">Existing tenant fields are not deleted. Recommended workflow replacement is explicit, and assigned template sets remain editable.</Safety>
      </div>
    </section>
  </>;
}

function Feature({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return <span className="flex items-center gap-1.5 rounded-xl bg-slate-50 px-2.5 py-2"><Icon className="size-3.5 text-pine-700" />{children}</span>;
}

function Safety({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-2xl border bg-slate-50 p-4"><p className="font-black text-slate-900">{title}</p><p className="mt-1 text-sm leading-6 text-slate-600">{children}</p></div>;
}

function Notice({ kind, children }: { kind: "error" | "success"; children: React.ReactNode }) {
  return <div className={`mb-5 rounded-2xl border p-4 text-sm font-semibold ${kind === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{children}</div>;
}
