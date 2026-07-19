import Link from "next/link";
import { DocumentDefinitionStatus, DocumentOutstandingBalancePolicy, DocumentSequenceScope, DocumentType, type Prisma } from "@prisma/client";
import { DocumentBalancePolicyControls } from "@/components/document-balance-policy-controls";
import { DocumentDefinitionFieldBuilder } from "@/components/document-definition-field-builder";
import { DocumentDefinitionWorkflowControls } from "@/components/document-definition-workflow-controls";
import { PageHeader } from "@/components/page-header";
import { PaginationFocusTarget } from "@/components/pagination-focus";
import { SubmitButton } from "@/components/ui";
import { changeDocumentDefinitionStatusAction, duplicateDocumentDefinitionAction, saveDocumentDefinitionAction } from "@/lib/actions/documents";
import { requireDocumentTemplateAdmin } from "@/lib/document-template-admin";
import { prisma } from "@/lib/db";
import { defaultNumberingFormat, evaluateDefinitionCompleteness, workflowPresetForDefinition } from "@/lib/services/document-definitions";
import { documentOutstandingBalancePolicyOptions } from "@/lib/services/document-balance-policy";
import { money, shortDate } from "@/lib/utils";

type Query = { q?: string; status?: string; page?: string; sort?: string; edit?: string; error?: string; success?: string; message?: string };
type EditableDefinition = Prisma.DocumentDefinitionGetPayload<{
  include: { fields: true; assignedTemplateVersion: { include: { templateSet: true } }; signatoryOfficer: true; requests: { select: { id: true } }; documentVersions: { select: { id: true } } };
}>;

const pageSize = 12;
const catalogTargetId = "definition-catalog";

export default async function DocumentDefinitionsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const user = await requireDocumentTemplateAdmin();
  const query = await searchParams;
  const page = Math.max(1, Number(query.page) || 1);
  const q = query.q?.trim() || "";
  const where = {
    tenantId: user.tenantId,
    ...(q ? { OR: [{ code: { contains: q } }, { displayName: { contains: q } }, { category: { contains: q } }] } : {}),
    ...(query.status && Object.values(DocumentDefinitionStatus).includes(query.status as DocumentDefinitionStatus) ? { status: query.status as DocumentDefinitionStatus } : {}),
  };
  const orderBy = query.sort === "code" ? [{ code: "asc" as const }] : query.sort === "updated" ? [{ updatedAt: "desc" as const }] : [{ displayOrder: "asc" as const }, { displayName: "asc" as const }];
  const [definitions, count, officers, editing] = await Promise.all([
    prisma.documentDefinition.findMany({ where, include: { fields: { orderBy: [{ displayOrder: "asc" }, { label: "asc" }] }, assignedTemplateVersion: { include: { templateSet: true } }, signatoryOfficer: true }, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.documentDefinition.count({ where }),
    prisma.organizationOfficer.findMany({ where: { tenantId: user.tenantId, active: true, archivedAt: null }, orderBy: [{ displayOrder: "asc" }, { fullName: "asc" }] }),
    query.edit ? prisma.documentDefinition.findFirst({ where: { tenantId: user.tenantId, id: query.edit }, include: { fields: { orderBy: [{ displayOrder: "asc" }, { label: "asc" }] }, assignedTemplateVersion: { include: { templateSet: true } }, signatoryOfficer: true, requests: { select: { id: true }, take: 1 }, documentVersions: { select: { id: true }, take: 1 } } }) : null,
  ]);
  const pages = Math.max(1, Math.ceil(count / pageSize));
  const editFields = (editing?.fields ?? []).map((field) => ({ key: field.key, label: field.label, fieldType: field.fieldType, required: field.required, options: field.options ?? undefined, validation: field.validation ?? undefined, defaultValue: field.defaultValue ?? undefined, active: field.active }));
  const pageHref = (targetPage: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (query.status) params.set("status", query.status);
    if (query.sort) params.set("sort", query.sort);
    params.set("page", String(targetPage));
    return `/admin/settings/document-definitions?${params.toString()}#${catalogTargetId}`;
  };
  return <>
    <PageHeader eyebrow="Document platform" title="Document definitions" description="Create tenant-owned certificates, forms, permits, passes, workflows, fields, and template publishing rules." action={<div className="flex flex-wrap gap-2"><Link className="btn-secondary" href="/admin/documents">Document Management</Link><Link className="btn-secondary" href="/admin/documents?section=templates">Templates</Link></div>} />
    {query.error && <Notice kind="error">{query.error}</Notice>}
    {query.success && <Notice kind="success">{query.message || "Document definition saved."}</Notice>}
    <section className="card mb-5">
      <details open={Boolean(editing) || !definitions.length}>
        <summary className="cursor-pointer text-lg font-black">{editing ? `Edit ${editing.displayName}` : "Create document definition"}</summary>
        {editing && <PersistedDefinitionSummary definition={editing} />}
        {editing && <DefinitionConfigurationNav definitionId={editing.id} />}
        <DefinitionForm definition={editing} officers={officers} />
        {editing && <div className="mt-6 border-t pt-5"><h3 className="font-black">Dynamic fields</h3><p className="mt-1 text-sm text-slate-500">Keys are immutable once requests exist. Deactivate fields instead of deleting them when historical snapshots depend on them.</p><DocumentDefinitionFieldBuilder definitionId={editing.id} fields={editFields} hasHistoricalReferences={editing.requests.length > 0 || editing.documentVersions.length > 0} /></div>}
      </details>
    </section>
    <form className="card mb-5 grid gap-3 md:grid-cols-[1fr_auto_auto_auto]" method="get" action={`/admin/settings/document-definitions#${catalogTargetId}`}>
      <input type="hidden" name="page" value="1" />
      <input className="field" name="q" defaultValue={q} placeholder="Search code, name, category" />
      <select className="field" name="status" defaultValue={query.status || ""}><option value="">All statuses</option>{Object.values(DocumentDefinitionStatus).map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select>
      <select className="field" name="sort" defaultValue={query.sort || ""}><option value="">Display order</option><option value="code">Code</option><option value="updated">Recently updated</option></select>
      <button className="btn-secondary">Apply</button>
    </form>
    <PaginationFocusTarget id={catalogTargetId} label="Document definition catalog" />
    <section className="card p-0 sm:p-0">
      <div className="table-wrap rounded-none shadow-none">
        <table className="data-table min-w-[1320px]"><thead><tr><th>Code</th><th>Display name</th><th>Category</th><th>Workflow</th><th>Fee</th><th>Balance policy</th><th>Status</th><th>Completeness</th><th>Published template</th><th>Updated</th><th>Actions</th></tr></thead><tbody>
          {definitions.map((definition) => {
            const completeness = evaluateDefinitionCompleteness(definition);
            const archived = definition.status === DocumentDefinitionStatus.ARCHIVED || Boolean(definition.archivedAt);
            return <tr key={definition.id}><td className="font-mono text-xs font-bold">{definition.code}</td><td><p className="font-black">{definition.displayName}</p><p className="max-w-72 truncate text-xs text-slate-500">{definition.description || "No description"}</p></td><td>{definition.category || "General"}</td><td>{definition.deliveryMode.replaceAll("_", " ")}</td><td>{money(Number(definition.feeAmount))}</td><td>{balancePolicyLabel(definition.outstandingBalancePolicy)}</td><td><span className={`badge ${definition.active && !definition.archivedAt ? "badge-paid" : "badge-info"}`}>{definition.status}</span></td><td><p className={completeness.requestable ? "font-bold text-emerald-700" : "font-bold text-amber-700"}>{completeness.status}</p>{[...completeness.errors, ...completeness.warnings].slice(0, 2).map((item) => <p key={item} className="max-w-56 text-xs text-slate-500">{item}</p>)}</td><td>{definition.assignedTemplateVersion ? `v${definition.assignedTemplateVersion.version}` : "None"}</td><td>{shortDate(definition.updatedAt)}</td><td><div className="flex flex-wrap gap-2"><Link className="btn-secondary min-h-8 px-3 py-1 text-xs" href={`/admin/settings/document-definitions?edit=${definition.id}`}>Edit</Link><Link className="btn-secondary min-h-8 px-3 py-1 text-xs" href={`/admin/settings/document-definitions/${definition.id}/templates`}>Templates</Link><form action={duplicateDocumentDefinitionAction}><input type="hidden" name="id" value={definition.id} /><button className="btn-secondary min-h-8 px-3 py-1 text-xs">Duplicate</button></form>{archived ? <form action={changeDocumentDefinitionStatusAction}><input type="hidden" name="id" value={definition.id} /><input type="hidden" name="operation" value="RESTORE" /><button className="btn-secondary min-h-8 px-3 py-1 text-xs">Restore</button></form> : <form action={changeDocumentDefinitionStatusAction}><input type="hidden" name="id" value={definition.id} /><input type="hidden" name="operation" value={definition.active ? "DEACTIVATE" : "ACTIVATE"} /><button className="btn-secondary min-h-8 px-3 py-1 text-xs">{definition.active ? "Deactivate" : "Activate"}</button></form>}{!archived && <form action={changeDocumentDefinitionStatusAction}><input type="hidden" name="id" value={definition.id} /><input type="hidden" name="operation" value="ARCHIVE" /><button className="btn-danger min-h-8 px-3 py-1 text-xs">Archive</button></form>}</div></td></tr>;
          })}
          {!definitions.length && <tr><td colSpan={11} className="py-12 text-center text-slate-500">No document definitions found.</td></tr>}
        </tbody></table>
      </div>
    </section>
    {count > pageSize && <div className="mt-4 flex items-center justify-between text-sm"><Link className={`btn-secondary ${page <= 1 ? "pointer-events-none opacity-50" : ""}`} href={pageHref(page - 1)}>Previous</Link><span>Page {page} of {pages}</span><Link className={`btn-secondary ${page >= pages ? "pointer-events-none opacity-50" : ""}`} href={pageHref(page + 1)}>Next</Link></div>}
  </>;
}

function DefinitionForm({ definition, officers }: { definition: EditableDefinition | null; officers: { id: string; fullName: string; position: string }[] }) {
  const code = definition?.code || "";
  return <form action={saveDocumentDefinitionAction} className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
    {definition && <input type="hidden" name="id" value={definition.id} />}
    <Field label="Code"><input className="field" name="code" defaultValue={code} placeholder="CERTIFICATE_OF_RESIDENCY" required /></Field>
    <Field label="Display name"><input className="field" name="displayName" defaultValue={definition?.displayName || ""} required /></Field>
    <Field label="Category"><input className="field" name="category" defaultValue={definition?.category || ""} placeholder="Certificate" /></Field>
    <Field label="Display order"><input className="field" name="displayOrder" type="number" defaultValue={definition?.displayOrder ?? 0} /></Field>
    <div className="md:col-span-2 xl:col-span-4"><label className="label">Description</label><textarea className="field min-h-20" name="description" defaultValue={definition?.description || ""} /></div>
    <DocumentDefinitionWorkflowControls defaultPreset={definition ? workflowPresetForDefinition(definition) : "FREE_APPROVAL"} defaultFeeAmount={Number(definition?.feeAmount ?? 0).toFixed(2)} />
    <DocumentBalancePolicyControls defaultPolicy={definition?.outstandingBalancePolicy || DocumentOutstandingBalancePolicy.BLOCK_DOWNLOAD} />
    <Field label="Currency"><input className="field" name="currency" defaultValue={definition?.currency || "PHP"} /></Field>
    <Field label="Finance classification"><input className="field" name="financeClassification" defaultValue={definition?.financeClassification || ""} /></Field>
    <Field label="Numbering format"><input className="field" name="numberingFormat" defaultValue={definition?.numberingFormat || defaultNumberingFormat(code || "DOC")} /></Field>
    <Field label="Sequence scope"><select className="field" name="sequenceScope" defaultValue={definition?.sequenceScope || DocumentSequenceScope.ANNUAL}>{Object.values(DocumentSequenceScope).map((scope) => <option key={scope} value={scope}>{scope}</option>)}</select></Field>
    <Field label="Validity days"><input className="field" name="validityDays" type="number" min={1} defaultValue={definition?.validityDays ?? ""} placeholder="No default" /></Field>
    <Field label="Maximum copies"><input className="field" name="maxCopies" type="number" min={1} max={25} defaultValue={definition?.maxCopies ?? 1} /></Field>
    <Field label="Legacy compatibility type"><select className="field" name="legacyType" defaultValue={definition?.legacyType || ""}><option value="">None yet</option>{Object.values(DocumentType).map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select></Field>
    <Field label="Signatory officer"><select className="field" name="signatoryOfficerId" defaultValue={definition?.signatoryOfficerId || ""}><option value="">Use approving officer</option>{officers.map((officer) => <option key={officer.id} value={officer.id}>{officer.fullName} - {officer.position}</option>)}</select></Field>
    <div className="md:col-span-2 xl:col-span-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Check name="active" label="Active" checked={definition?.active ?? false} />
      <Check name="receiptRequired" label="Receipt required" checked={definition?.receiptRequired ?? false} />
      <Check name="allowPayLater" label="Allow pay later" checked={definition?.allowPayLater ?? false} />
      <Check name="releaseRequired" label="Release required" checked={definition?.releaseRequired ?? false} />
      <Check name="homeownerDownloadEnabled" label="Homeowner visible/download enabled" checked={definition?.homeownerDownloadEnabled ?? true} />
      <Check name="walkInEnabled" label="Walk-in enabled" checked={definition?.walkInEnabled ?? false} />
      <Check name="householdMemberEnabled" label="Household member subjects" checked={definition?.householdMemberEnabled ?? true} />
      <Check name="manualSubjectEnabled" label="Manual subject enabled" checked={definition?.manualSubjectEnabled ?? false} />
      <Check name="allowRegeneration" label="Regeneration allowed" checked={definition?.allowRegeneration ?? true} />
      <Check name="qrEnabled" label="QR enabled" checked={definition?.qrEnabled ?? true} />
      <Check name="watermarkEnabled" label="Watermark enabled" checked={definition?.watermarkEnabled ?? false} />
    </div>
    <div className="md:col-span-2 xl:col-span-4"><SubmitButton>{definition ? "Save definition" : "Create definition"}</SubmitButton></div>
  </form>;
}

function DefinitionConfigurationNav({ definitionId }: { definitionId: string }) {
  const links = [
    ["General", "#general"],
    ["Workflow and Fees", "#workflow"],
    ["Request Policy", "#request-policy"],
    ["Required Information", "#required-information"],
    ["Template", `/admin/settings/document-definitions/${definitionId}/templates`],
    ["Preview", `/admin/settings/document-definitions/${definitionId}/templates`],
    ["Version History", `/admin/settings/document-definitions/${definitionId}/templates`],
    ["Advanced", "#advanced"],
  ] as const;
  return <nav className="mt-5 flex flex-wrap gap-2 border-y border-slate-200 py-3" aria-label="Document definition configuration sections">{links.map(([label, href]) => href.startsWith("#") ? <a key={label} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-200" href={href}>{label}</a> : <Link key={label} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-200" href={href}>{label}</Link>)}</nav>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label><span className="label">{label}</span>{children}</label>;
}

function Check({ name, label, checked }: { name: string; label: string; checked: boolean }) {
  return <label className="flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-bold"><input type="hidden" name={name} value="false" /><input type="checkbox" name={name} value="true" defaultChecked={checked} /> {label}</label>;
}

function Notice({ kind, children }: { kind: "error" | "success"; children: React.ReactNode }) {
  return <div className={`mb-5 rounded-2xl border p-4 text-sm font-semibold ${kind === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{children}</div>;
}

function PersistedDefinitionSummary({ definition }: { definition: EditableDefinition }) {
  const completeness = evaluateDefinitionCompleteness(definition);
  return <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
    <h3 className="text-sm font-black uppercase tracking-[.16em] text-slate-500">Persisted configuration</h3>
    <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
      <SummaryItem label="Workflow" value={workflowPresetForDefinition(definition).replaceAll("_", " + ").replace("PAID + INSTANT", "Paid + Instant").replace("PAID + APPROVAL", "Paid + Approval").replace("FREE + INSTANT", "Free + Instant").replace("FREE + APPROVAL", "Free + Approval").replace("REQUEST + ONLY", "Request Only")} />
      <SummaryItem label="Fee" value={money(Number(definition.feeAmount))} />
      <SummaryItem label="Balance policy" value={balancePolicyLabel(definition.outstandingBalancePolicy)} />
      <SummaryItem label="Status" value={definition.status} />
      <SummaryItem label="Active" value={definition.active ? "Yes" : "No"} />
      <SummaryItem label="Published template" value={definition.assignedTemplateVersion ? `v${definition.assignedTemplateVersion.version}` : "None"} />
      <SummaryItem label="Completeness" value={completeness.status} />
      <SummaryItem label="Requestable" value={completeness.requestable ? "Yes" : "No"} />
      <SummaryItem label="Last updated" value={shortDate(definition.updatedAt)} />
    </div>
  </div>;
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-white p-3"><p className="text-xs font-bold uppercase tracking-[.12em] text-slate-500">{label}</p><p className="mt-1 font-black text-slate-950">{value}</p></div>;
}

function balancePolicyLabel(policy: DocumentOutstandingBalancePolicy) {
  return documentOutstandingBalancePolicyOptions.find((option) => option.value === policy)?.label || policy.replaceAll("_", " ");
}
