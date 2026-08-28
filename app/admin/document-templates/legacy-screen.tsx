import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/ui";
import { saveDocumentTemplateAction } from "@/lib/actions/documents";
import { prisma } from "@/lib/db";
import { documentPlaceholders, documentTypeOptions } from "@/lib/services/documents";

export async function LegacyDocumentTemplatesScreen({ tenantId, query }: { tenantId: string; query: { error?: string; success?: string; message?: string } }) {
  const templates = await prisma.documentTemplate.findMany({ where: { tenantId } });
  const byType = new Map(templates.map((item) => [item.type, item]));
  const configuredCount = documentTypeOptions.filter((option) => byType.has(option.value)).length;
  const activeCount = documentTypeOptions.filter((option) => byType.get(option.value)?.active ?? true).length;

  return <>
    <PageHeader
      eyebrow="Administration"
      title="Document templates"
      description="Maintain the wording used for future generated documents. Saving creates a new template version; previously generated document snapshots remain unchanged."
      action={<Link className="btn-secondary" href="/admin/documents">Back to requests</Link>}
    />

    {query.error && <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">{query.error}</div>}
    {query.success && <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{query.message}</div>}

    <section className="mb-6 grid gap-4 md:grid-cols-3">
      <article className="card">
        <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Template types</p>
        <p className="mt-2 text-3xl font-black text-ink">{documentTypeOptions.length}</p>
        <p className="mt-2 text-sm leading-5 text-slate-500">Supported document formats available to administrators.</p>
      </article>
      <article className="card">
        <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Configured</p>
        <p className="mt-2 text-3xl font-black text-ink">{configuredCount}</p>
        <p className="mt-2 text-sm leading-5 text-slate-500">Template types with a saved tenant-specific version.</p>
      </article>
      <article className="card">
        <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Active</p>
        <p className="mt-2 text-3xl font-black text-ink">{activeCount}</p>
        <p className="mt-2 text-sm leading-5 text-slate-500">Document types currently available for future generation.</p>
      </article>
    </section>

    <section className="card mb-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-black text-ink">Available placeholders</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Insert placeholders exactly as shown. Values are filled by the existing document workflow when an administrator approves a request.</p>
        </div>
        <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{documentPlaceholders.length} placeholders</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">{documentPlaceholders.map((item) => <code key={item} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700">{`{{${item}}}`}</code>)}</div>
    </section>

    <section aria-labelledby="template-editor-heading">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="template-editor-heading" className="text-lg font-black text-ink">Template editor</h2>
          <p className="mt-1 text-sm text-slate-500">Review each document type independently. Saving preserves the existing versioning workflow.</p>
        </div>
        <p className="text-xs font-semibold text-slate-500">Changes apply only to future generated documents.</p>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">{documentTypeOptions.map((option) => {
        const template = byType.get(option.value);
        return <form action={saveDocumentTemplateAction} className="card flex h-full flex-col" key={option.value}>
          <input type="hidden" name="type" value={option.value} />
          <div className="mb-5 flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="font-black text-ink">{option.label}</h3>
              <p className="mt-1 text-xs font-semibold text-slate-500">Current version {template?.version ?? 1}{template ? " · tenant configured" : " · default configuration"}</p>
            </div>
            <label className="flex w-fit items-center gap-2 rounded-full bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
              <input type="checkbox" name="active" defaultChecked={template?.active ?? true} /> Active
            </label>
          </div>

          <label className="label" htmlFor={`template-title-${option.value}`}>Document title</label>
          <input id={`template-title-${option.value}`} className="field mb-4" name="title" defaultValue={template?.title || option.label} required />

          <label className="label" htmlFor={`template-body-${option.value}`}>Template body</label>
          <textarea id={`template-body-${option.value}`} className="field min-h-72 flex-1 font-mono text-sm leading-6" name="body" defaultValue={template?.body || ""} required />

          <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-slate-500">Saving creates the next version without modifying previously generated snapshots.</p>
            <SubmitButton>Save new template version</SubmitButton>
          </div>
        </form>;
      })}</div>
    </section>
  </>;
}
