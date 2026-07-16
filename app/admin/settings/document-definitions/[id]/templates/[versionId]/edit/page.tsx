import Link from "next/link";
import { DocumentTemplateVersionStatus } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { saveDocumentTemplateVersionAction } from "@/lib/actions/documents";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { allowedDocumentPlaceholders, documentTemplateBlockTypes, normalizeTemplateDefinition } from "@/lib/services/document-template-builder";

export default async function TemplateVersionEditorPage({ params, searchParams }: { params: Promise<{ id: string; versionId: string }>; searchParams: Promise<{ error?: string; success?: string; message?: string }> }) {
  const admin = await requireUser();
  const { id, versionId } = await params;
  const query = await searchParams;
  const version = await prisma.documentTemplateVersion.findFirst({ where: { id: versionId, tenantId: admin.tenantId }, include: { templateSet: { include: { definition: true } } } });
  if (!version || version.templateSet.definitionId !== id) return <p className="card">Template version not found.</p>;
  const definition = version.templateSet.definition;
  const template = normalizeTemplateDefinition(version.definitionJson, definition.displayName);
  const editable = version.status === DocumentTemplateVersionStatus.DRAFT;
  return <>
    <PageHeader eyebrow="Structured template editor" title={`${definition.displayName} v${version.version}`} description="Edit safe JSON-backed blocks with an A4 portrait live preview. Published versions are immutable." action={<Link className="btn-secondary" href={`/admin/settings/document-definitions/${id}/templates`}>Version history</Link>} />
    {query.error && <Notice kind="error">{query.error}</Notice>}
    {query.success && <Notice kind="success">{query.message || "Template saved."}</Notice>}
    <form action={saveDocumentTemplateVersionAction} className="grid gap-6 xl:grid-cols-[1.05fr_.95fr]">
      <input type="hidden" name="definitionId" value={id} />
      <input type="hidden" name="versionId" value={version.id} />
      <section className="card">
        <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div><h2 className="text-lg font-black">Blocks</h2><p className="text-sm text-slate-500">Add, remove, reorder, and bind placeholders. Free-position drag-and-drop is not implemented.</p></div>
          <span className={`badge ${editable ? "badge-info" : "badge-paid"}`}>{version.status}</span>
        </div>
        <fieldset disabled={!editable} className="space-y-3 disabled:opacity-70">
          {template.blocks.map((block) => <div key={block.id} className="rounded-xl border bg-slate-50 p-3">
            <input type="hidden" name="blockId" value={block.id} />
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
              <label><span className="label">Block type</span><select className="field" name="blockType" defaultValue={block.type}>{documentTemplateBlockTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
              <label><span className="label">Placeholder binding</span><select className="field" name="blockBinding" defaultValue={block.binding || ""}><option value="">No binding</option>{allowedDocumentPlaceholders.map((placeholder) => <option key={placeholder} value={placeholder}>{placeholder}</option>)}</select></label>
              <label className="flex min-h-11 items-center gap-2 rounded-xl border bg-white px-3 text-sm font-bold self-end"><input type="checkbox" name="blockVisible" value={block.id} defaultChecked={block.visible} /> Visible</label>
              <label><span className="label">Label</span><input className="field" name="blockLabel" defaultValue={block.label || ""} /></label>
              <label className="md:col-span-2"><span className="label">Text</span><textarea className="field min-h-20 font-mono text-xs" name="blockText" defaultValue={block.text || ""} placeholder="Use the placeholder selector instead of typing unknown expressions." /></label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <button className="btn-secondary min-h-8 px-3 py-1" name="operation" value={`move:${block.id}:up`}>Move up</button>
              <button className="btn-secondary min-h-8 px-3 py-1" name="operation" value={`move:${block.id}:down`}>Move down</button>
              <label className="flex min-h-8 items-center gap-2 rounded-xl border bg-white px-3 font-bold"><input type="checkbox" name="blockRemove" value={block.id} /> Remove on save</label>
            </div>
          </div>)}
          <div className="rounded-xl border border-dashed p-3">
            <label><span className="label">Add block</span><select className="field" name="addBlockType"><option value="">No new block</option>{documentTemplateBlockTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
          </div>
        </fieldset>
        <div className="mt-4 flex flex-wrap gap-2">
          {editable && <><button className="btn-secondary" name="operation" value="saveDraft">Save draft</button><button className="btn-primary" name="operation" value="publish">Validate and publish</button></>}
          {!editable && <span className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-600">Published versions are immutable. Duplicate this version to edit a new draft.</span>}
          <a className="btn-secondary" href="#preview">Preview print</a>
          <a className="btn-secondary" href="#preview">Preview PDF</a>
        </div>
      </section>
      <section className="card" id="preview">
        <h2 className="text-lg font-black">A4 live preview</h2>
        <p className="mb-4 text-sm text-slate-500">Sample data preview. Generated documents use immutable snapshots.</p>
        <div className="mx-auto aspect-[210/297] w-full max-w-[560px] overflow-hidden border bg-white p-8 shadow-sm">
          {template.blocks.filter((block) => block.visible).map((block) => <div key={block.id} className={`mb-3 ${block.type === "divider" ? "border-t" : ""} ${block.type === "documentTitle" ? "text-center text-xl font-black" : ""} ${block.type === "footer" ? "mt-8 border-t pt-3 text-center text-xs text-slate-500" : ""}`}>
            {block.type === "spacer" ? <div className="h-6" /> : <PreviewText block={block} />}
          </div>)}
        </div>
        <div className="mt-5">
          <h3 className="font-black">Placeholder library</h3>
          <div className="mt-3 flex flex-wrap gap-2">{allowedDocumentPlaceholders.map((placeholder) => <code key={placeholder} className="rounded-lg bg-slate-100 px-2 py-1 text-xs">{`{{${placeholder}}}`}</code>)}</div>
        </div>
      </section>
    </form>
  </>;
}

function PreviewText({ block }: { block: ReturnType<typeof normalizeTemplateDefinition>["blocks"][number] }) {
  const sample: Record<string, string> = {
    "tenant.name": "Test HOA",
    "tenant.address": "Sample HOA Address",
    "tenant.tin": "000-000-000",
    "tenant.secRegistration": "SEC-000000",
    "tenant.contactNumber": "0917 000 0000",
    "tenant.email": "admin@example.test",
    "document.number": "COR-2026-000001",
    "document.title": "Certificate of Residency",
    "document.issueDate": "July 16, 2026",
    "document.validUntil": "July 16, 2027",
    "subject.fullName": "Juan Dela Cruz",
    "subject.relationship": "Homeowner",
    "subject.address": "Block 1 Lot 2",
    "request.purpose": "For official purposes",
    "request.remarks": "No remarks",
    "request.copies": "1",
    "signatory.name": "HOA President",
    "signatory.position": "President",
    "verification.url": "https://example.test/verify",
    "verification.code": "VERIFY123",
  };
  const text = block.text || (block.binding ? `{{${block.binding}}}` : block.label || block.type);
  return <p className="whitespace-pre-wrap text-sm leading-6">{text.replace(/\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g, (_, key) => sample[key] || `{{${key}}}`)}</p>;
}

function Notice({ kind, children }: { kind: "error" | "success"; children: React.ReactNode }) {
  return <div className={`mb-5 rounded-2xl border p-4 text-sm font-semibold ${kind === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{children}</div>;
}
