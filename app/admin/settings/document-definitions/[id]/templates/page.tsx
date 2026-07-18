import Link from "next/link";
import { DocumentTemplateVersionStatus } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { saveDocumentTemplateVersionAction } from "@/lib/actions/documents";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { shortDate } from "@/lib/utils";

export default async function DefinitionTemplatesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; success?: string; message?: string }> }) {
  const admin = await requireUser();
  const { id } = await params;
  const query = await searchParams;
  const definition = await prisma.documentDefinition.findFirst({
    where: { id, tenantId: admin.tenantId },
    include: { templateSets: { include: { versions: { include: { publishedBy: true, createdBy: true }, orderBy: [{ version: "desc" }] } }, orderBy: { createdAt: "desc" } }, assignedTemplateVersion: true },
  });
  if (!definition) return <p className="card">Document definition not found.</p>;
  const versions = definition.templateSets.flatMap((set) => set.versions.map((version) => ({ ...version, set }))).sort((a, b) => b.version - a.version);
  const published = definition.assignedTemplateVersion ? versions.find((version) => version.id === definition.assignedTemplateVersionId) ?? null : versions.find((version) => version.status === DocumentTemplateVersionStatus.PUBLISHED) ?? null;
  const draft = versions.find((version) => version.status === DocumentTemplateVersionStatus.DRAFT) ?? null;
  const history = versions.filter((version) => version.status !== DocumentTemplateVersionStatus.DRAFT);
  return <>
    <PageHeader eyebrow="Document templates" title={definition.displayName} description="Manage the draft, published version, and immutable version history for this document type." action={<div className="flex flex-wrap gap-2"><Link className="btn-secondary" href="/admin/documents?section=templates">Document Management</Link><Link className="btn-secondary" href="/admin/settings/document-definitions">Back to definitions</Link></div>} />
    {query.error && <Notice kind="error">{query.error}</Notice>}
    {query.success && <Notice kind="success">{query.message || "Template updated."}</Notice>}
    <div className="grid gap-5 xl:grid-cols-3">
      <section className="card">
        <h2 className="text-lg font-black">Current Published Template</h2>
        <p className="mt-1 text-sm text-slate-500">This is the version assigned to new requests and generation.</p>
        {published ? <div className="mt-4 space-y-2 text-sm"><Info label="Version" value={`v${published.version}`} /><Info label="Published date" value={published.publishedAt ? shortDate(published.publishedAt) : "Not recorded"} /><Info label="Published by" value={published.publishedBy?.name || "System"} /><Info label="Template" value={published.set.name} /><div className="flex flex-wrap gap-2 pt-2"><Link className="btn-secondary min-h-9 px-3 py-1.5 text-xs" href={`/admin/settings/document-definitions/${definition.id}/templates/${published.id}/edit`}>Preview</Link><form action={saveDocumentTemplateVersionAction}><input type="hidden" name="definitionId" value={definition.id} /><input type="hidden" name="sourceVersionId" value={published.id} /><button className="btn-secondary min-h-9 px-3 py-1.5 text-xs" name="operation" value="duplicateVersion">Create draft from published</button></form></div></div> : <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm font-bold text-amber-900">No published template is assigned. Create a draft and publish it before this document type can be requestable.</div>}
      </section>
      <section className="card">
        <h2 className="text-lg font-black">Current Draft</h2>
        <p className="mt-1 text-sm text-slate-500">Draft changes do not affect published or generated documents.</p>
        {draft ? <div className="mt-4 space-y-2 text-sm"><Info label="Draft version" value={`v${draft.version}`} /><Info label="Last edited" value={shortDate(draft.updatedAt)} /><Info label="Edited by" value={draft.createdBy?.name || "System"} /><Info label="Template" value={draft.set.name} /><div className="flex flex-wrap gap-2 pt-2"><Link className="btn-secondary min-h-9 px-3 py-1.5 text-xs" href={`/admin/settings/document-definitions/${definition.id}/templates/${draft.id}/edit`}>Continue editing</Link><form action={saveDocumentTemplateVersionAction}><input type="hidden" name="definitionId" value={definition.id} /><input type="hidden" name="versionId" value={draft.id} /><button className="btn-secondary min-h-9 px-3 py-1.5 text-xs" name="operation" value="discardDraft">Discard draft</button></form></div></div> : <div className="mt-4 space-y-3"><p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No current draft.</p>{published ? <form action={saveDocumentTemplateVersionAction}><input type="hidden" name="definitionId" value={definition.id} /><input type="hidden" name="sourceVersionId" value={published.id} /><button className="btn-primary" name="operation" value="duplicateVersion">Create draft from published</button></form> : <form action={saveDocumentTemplateVersionAction}><input type="hidden" name="definitionId" value={definition.id} /><button className="btn-primary" name="operation" value="createSet">Create first draft</button></form>}</div>}
      </section>
      <section className="card">
        <h2 className="text-lg font-black">Version History</h2>
        <p className="mt-1 text-sm text-slate-500">Historical versions are retained. Restore creates a new draft.</p>
        <div className="mt-4 space-y-3">{history.length ? history.map((version) => <article key={version.id} className="rounded-xl bg-slate-50 p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-black">v{version.version}</p><span className="badge badge-info">{definition.assignedTemplateVersionId === version.id ? "Published Version" : version.status.replaceAll("_", " ")}</span></div><p className="mt-1 text-xs text-slate-500">{version.publishedAt ? shortDate(version.publishedAt) : "Not published"} | {version.publishedBy?.name || version.createdBy?.name || "System"}</p><div className="mt-3 flex flex-wrap gap-2"><Link className="btn-secondary min-h-8 px-3 py-1 text-xs" href={`/admin/settings/document-definitions/${definition.id}/templates/${version.id}/edit`}>Preview</Link><form action={saveDocumentTemplateVersionAction}><input type="hidden" name="definitionId" value={definition.id} /><input type="hidden" name="sourceVersionId" value={version.id} /><button className="btn-secondary min-h-8 px-3 py-1 text-xs" name="operation" value="duplicateVersion">Restore as new draft</button></form>{version.status === DocumentTemplateVersionStatus.PUBLISHED && definition.assignedTemplateVersionId !== version.id && <form action={saveDocumentTemplateVersionAction}><input type="hidden" name="definitionId" value={definition.id} /><input type="hidden" name="versionId" value={version.id} /><button className="btn-secondary min-h-8 px-3 py-1 text-xs" name="operation" value="retire">Retire</button></form>}</div></article>) : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No version history yet.</p>}</div>
      </section>
    </div>
  </>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <p><span className="font-bold text-slate-500">{label}:</span> <span className="font-black">{value}</span></p>;
}

function Notice({ kind, children }: { kind: "error" | "success"; children: React.ReactNode }) {
  return <div className={`mb-5 rounded-2xl border p-4 text-sm font-semibold ${kind === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{children}</div>;
}
