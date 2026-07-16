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
    include: { templateSets: { include: { versions: { orderBy: [{ version: "desc" }] } }, orderBy: { createdAt: "desc" } }, assignedTemplateVersion: true },
  });
  if (!definition) return <p className="card">Document definition not found.</p>;
  return <>
    <PageHeader eyebrow="Document templates" title={definition.displayName} description="Manage draft and published template versions for this document definition." action={<Link className="btn-secondary" href="/admin/settings/document-definitions">Back to definitions</Link>} />
    {query.error && <Notice kind="error">{query.error}</Notice>}
    {query.success && <Notice kind="success">{query.message || "Template updated."}</Notice>}
    <section className="card mb-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div><h2 className="text-lg font-black">Template sets</h2><p className="text-sm text-slate-500">Published versions are immutable. Duplicate one to start a new draft.</p></div>
        <form action={saveDocumentTemplateVersionAction}><input type="hidden" name="definitionId" value={definition.id} /><button className="btn-primary" name="operation" value="createSet">Create template set</button></form>
      </div>
    </section>
    <div className="space-y-5">
      {definition.templateSets.map((set) => <section key={set.id} className="card">
        <div className="mb-4 flex flex-col justify-between gap-3 lg:flex-row lg:items-start"><div><h2 className="text-xl font-black">{set.name}</h2><p className="text-sm text-slate-500">{set.description || "No description"}</p></div><span className={`badge ${set.active ? "badge-paid" : "badge-info"}`}>{set.active ? "Active" : "Inactive"}</span></div>
        <div className="table-wrap rounded-none shadow-none"><table className="data-table min-w-[760px]"><thead><tr><th>Version</th><th>Status</th><th>Published</th><th>Assigned</th><th>Actions</th></tr></thead><tbody>{set.versions.map((version) => <tr key={version.id}><td className="font-bold">v{version.version}</td><td>{version.status}</td><td>{version.publishedAt ? shortDate(version.publishedAt) : "Draft"}</td><td>{definition.assignedTemplateVersionId === version.id ? "Assigned" : ""}</td><td><div className="flex flex-wrap gap-2"><Link className="btn-secondary min-h-8 px-3 py-1 text-xs" href={`/admin/settings/document-definitions/${definition.id}/templates/${version.id}/edit`}>{version.status === DocumentTemplateVersionStatus.DRAFT ? "Edit draft" : "View"}</Link><form action={saveDocumentTemplateVersionAction}><input type="hidden" name="definitionId" value={definition.id} /><input type="hidden" name="sourceVersionId" value={version.id} /><button className="btn-secondary min-h-8 px-3 py-1 text-xs" name="operation" value="duplicateVersion">Duplicate</button></form>{version.status === DocumentTemplateVersionStatus.PUBLISHED && <form action={saveDocumentTemplateVersionAction}><input type="hidden" name="definitionId" value={definition.id} /><input type="hidden" name="versionId" value={version.id} /><button className="btn-secondary min-h-8 px-3 py-1 text-xs" name="operation" value="retire">Retire</button></form>}</div></td></tr>)}{!set.versions.length && <tr><td colSpan={5} className="py-10 text-center text-slate-500">No versions yet.</td></tr>}</tbody></table></div>
      </section>)}
      {!definition.templateSets.length && <section className="card py-12 text-center text-sm text-slate-500">No template sets yet. Create one to begin a draft.</section>}
    </div>
  </>;
}

function Notice({ kind, children }: { kind: "error" | "success"; children: React.ReactNode }) {
  return <div className={`mb-5 rounded-2xl border p-4 text-sm font-semibold ${kind === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{children}</div>;
}
