import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/ui";
import { saveDocumentTemplateAction } from "@/lib/actions/documents";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { documentPlaceholders, documentTypeOptions } from "@/lib/services/documents";

export default async function DocumentTemplatesPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string; message?: string }> }) {
  const user = await requireUser();
  const query = await searchParams;
  const templates = await prisma.documentTemplate.findMany({ where: { tenantId: user.tenantId } });
  const byType = new Map(templates.map((item) => [item.type, item]));
  return <>
    <PageHeader eyebrow="Administration" title="Document templates" description="Edit the wording used for future generated documents. Previously generated snapshots remain unchanged." action={<Link className="btn-secondary" href="/admin/documents">Back to requests</Link>} />
    {query.error && <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">{query.error}</div>}
    {query.success && <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{query.message}</div>}
    <section className="card mb-6"><h2 className="font-black">Available placeholders</h2><p className="mt-1 text-sm text-slate-500">Insert placeholders exactly as shown. They are filled when the administrator approves a request.</p><div className="mt-3 flex flex-wrap gap-2">{documentPlaceholders.map((item) => <code key={item} className="rounded-lg bg-slate-100 px-2 py-1 text-xs">{`{{${item}}}`}</code>)}</div></section>
    <div className="grid gap-5 xl:grid-cols-2">{documentTypeOptions.map((option) => { const template = byType.get(option.value); return <form action={saveDocumentTemplateAction} className="card" key={option.value}><input type="hidden" name="type" value={option.value} /><div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-black">{option.label}</h2><p className="text-xs text-slate-500">Version {template?.version ?? 1}</p></div><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="active" defaultChecked={template?.active ?? true} /> Active</label></div><label className="label">Document title</label><input className="field mb-3" name="title" defaultValue={template?.title || option.label} required /><label className="label">Template body</label><textarea className="field min-h-64 font-mono text-sm" name="body" defaultValue={template?.body || ""} required /><div className="mt-4"><SubmitButton>Save new template version</SubmitButton></div></form>; })}</div>
  </>;
}
