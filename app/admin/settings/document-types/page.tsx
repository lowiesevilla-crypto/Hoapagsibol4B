import Link from "next/link";
import { DocumentDeliveryMode, DocumentFieldType } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/ui";
import { saveDocumentTypeConfigurationAction } from "@/lib/actions/documents";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { documentConfigurationStatus, getTenantDocumentConfigurations } from "@/lib/services/document-workflow";
import { documentTypeLabel } from "@/lib/services/documents";
import { money } from "@/lib/utils";

export default async function DocumentTypesSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string; message?: string }> }) {
  const user = await requireUser();
  const query = await searchParams;
  const [configs, templates, officers] = await Promise.all([
    getTenantDocumentConfigurations(user.tenantId),
    prisma.documentTemplate.findMany({ where: { tenantId: user.tenantId }, orderBy: [{ type: "asc" }, { title: "asc" }] }),
    prisma.organizationOfficer.findMany({ where: { tenantId: user.tenantId, active: true, archivedAt: null }, orderBy: [{ displayOrder: "asc" }, { fullName: "asc" }] }),
  ]);
  return <>
    <PageHeader eyebrow="Resident services settings" title="Legacy document types" description="Compatibility view for legacy request rules while document definitions remain the authoritative configuration system." action={<div className="flex flex-wrap gap-2"><Link className="btn-secondary" href="/admin/documents">Document Management</Link><Link className="btn-secondary" href="/admin/documents?section=templates">Templates</Link></div>} />
    {query.error && <Notice kind="error">{query.error}</Notice>}
    {query.success && <Notice kind="success">{query.message || "Document type saved."}</Notice>}
    <div className="space-y-5">
      {configs.map((config) => {
        const fieldsJson = JSON.stringify(config.fields.map((field) => ({ key: field.key, label: field.label, fieldType: field.fieldType, required: field.required, options: field.options ?? undefined, active: field.active })), null, 2);
        const matchingTemplates = templates.filter((template) => template.type === config.type);
        const status = documentConfigurationStatus(config);
        return <form key={config.id} action={saveDocumentTypeConfigurationAction} className="card">
          <input type="hidden" name="id" value={config.id} />
          <div className="mb-5 flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
            <div>
              <p className="text-xs font-black uppercase tracking-[.16em] text-pine-700">{documentTypeLabel(config.type)}</p>
              <h2 className="text-xl font-black">{config.displayName}</h2>
              <p className="text-sm text-slate-500">Current version {config.version} | Fee {money(Number(config.feeAmount))} | {config.deliveryMode.replaceAll("_", " ")}</p>
              <p className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-black ${status.requestable ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{status.label}</p>
            </div>
            <label className="flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-bold"><input type="checkbox" name="active" defaultChecked={config.active} /> Active</label>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Display name"><input className="field" name="displayName" defaultValue={config.displayName} required /></Field>
            <Field label="Fee amount"><input className="field" name="feeAmount" type="number" min={0} step="0.01" defaultValue={Number(config.feeAmount).toFixed(2)} /></Field>
            <Field label="Delivery mode"><select className="field" name="deliveryMode" defaultValue={config.deliveryMode}>{Object.values(DocumentDeliveryMode).map((mode) => <option key={mode} value={mode}>{mode.replaceAll("_", " ")}</option>)}</select></Field>
            <Field label="Max copies"><input className="field" name="maxCopies" type="number" min={1} max={25} defaultValue={config.maxCopies} /></Field>
            <Field label="Validity days"><input className="field" name="validityDays" type="number" min={1} defaultValue={config.validityDays ?? ""} placeholder="No default" /></Field>
            <Field label="Template"><select className="field" name="templateId" defaultValue={config.templateId || ""}><option value="">No template</option>{matchingTemplates.map((template) => <option key={template.id} value={template.id}>{template.title} v{template.version}{template.active ? "" : " (inactive)"}</option>)}</select></Field>
            <Field label="Signatory"><select className="field" name="signatoryOfficerId" defaultValue={config.signatoryOfficerId || ""}><option value="">Use approving officer</option>{officers.map((officer) => <option key={officer.id} value={officer.id}>{officer.fullName} - {officer.position}</option>)}</select></Field>
            <div className="md:col-span-2 xl:col-span-4"><label className="label">Description</label><textarea className="field min-h-20" name="description" defaultValue={config.description || ""} /></div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Check name="approvalRequired" label="Approval required" checked={config.approvalRequired} />
            <Check name="paymentRequired" label="Payment required" checked={config.paymentRequired} />
            <Check name="paymentBeforeApproval" label="Payment before approval" checked={config.paymentBeforeApproval} />
            <Check name="allowImmediateDownload" label="Allow immediate download" checked={config.allowImmediateDownload} />
            <Check name="allowRegeneration" label="Allow regeneration" checked={config.allowRegeneration} />
            <Check name="requiresAdminReview" label="Requires admin review" checked={config.requiresAdminReview} />
            <Check name="homeownerDownloadEnabled" label="Homeowner download enabled" checked={config.homeownerDownloadEnabled} />
            <Check name="allowPayLater" label="Allow pay later" checked={config.allowPayLater} />
          </div>
          <div className="mt-4">
            <label className="label">Field definitions JSON</label>
            <textarea className="field min-h-56 font-mono text-xs" name="fieldsJson" defaultValue={fieldsJson} spellCheck={false} />
            <p className="mt-2 text-xs text-slate-500">Allowed fieldType values: {Object.values(DocumentFieldType).join(", ")}. Keys are submitted as field_key and snapshotted per request.</p>
          </div>
          <div className="mt-4"><SubmitButton>Save document type</SubmitButton></div>
        </form>;
      })}
    </div>
  </>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label><span className="label">{label}</span>{children}</label>;
}

function Check({ name, label, checked }: { name: string; label: string; checked: boolean }) {
  return <label className="flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-bold"><input type="checkbox" name={name} defaultChecked={checked} /> {label}</label>;
}

function Notice({ kind, children }: { kind: "error" | "success"; children: React.ReactNode }) {
  return <div className={`mb-5 rounded-2xl border p-4 text-sm font-semibold ${kind === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{children}</div>;
}
