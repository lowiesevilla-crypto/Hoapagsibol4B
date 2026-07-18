import Link from "next/link";
import { DocumentDefinitionStatus, DocumentRequestStatus, DocumentTemplateVersionStatus, DocumentType, type Prisma } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { PaginationFocusTarget } from "@/components/pagination-focus";
import { changeDocumentDefinitionStatusAction, repairDocumentDefinitionAction, saveDocumentTemplateVersionAction } from "@/lib/actions/documents";
import { requireDocumentTemplateAdmin } from "@/lib/document-template-admin";
import { prisma } from "@/lib/db";
import { evaluateDocumentDefinitionVisibility, workflowPresetForDefinition } from "@/lib/services/document-definitions";
import { documentOutstandingBalancePolicyOptions } from "@/lib/services/document-balance-policy";
import { documentTypeLabel, documentTypeOptions } from "@/lib/services/documents";
import { money, shortDate } from "@/lib/utils";

type Query = {
  section?: string;
  notice?: string;
  q?: string;
  status?: string;
  type?: string;
  date?: string;
  page?: string;
  error?: string;
  success?: string;
  message?: string;
};

type DefinitionRow = Prisma.DocumentDefinitionGetPayload<{
  include: {
    fields: true;
    assignedTemplateVersion: { include: { templateSet: true; publishedBy: true; createdBy: true } };
    signatoryOfficer: true;
    templateSets: { include: { versions: { include: { publishedBy: true; createdBy: true } } } };
  };
}>;
type RequestRow = Prisma.DocumentRequestGetPayload<{
  include: { homeowner: { include: { user: true } }; definition: true; configuration: true };
}>;

const requestPageSize = 15;
const expectedDefinitions = [
  { code: "CERTIFICATE_OF_RESIDENCY", label: "Certificate of Residency", legacyType: DocumentType.CERTIFICATE_OF_RESIDENCY },
  { code: "CERTIFICATE_OF_INDIGENCY", label: "Certificate of Indigency", legacyType: null, aliases: ["CERTIFICATE_OF_IDIGENCY", "Certificate of Idigency"] },
  { code: "CERTIFICATE_OF_GOOD_STANDING", label: "Certificate of Good Standing", legacyType: DocumentType.CERTIFICATE_OF_GOOD_STANDING },
  { code: "CLEARANCE_CERTIFICATE", label: "Clearance Certificate", legacyType: DocumentType.CLEARANCE_CERTIFICATE },
  { code: "PAYMENT_CERTIFICATION", label: "Payment Certification", legacyType: DocumentType.PAYMENT_CERTIFICATION },
  { code: "CONSTRUCTION_BOND_CERTIFICATION", label: "Construction Bond Certification", legacyType: DocumentType.CONSTRUCTION_BOND_CERTIFICATION },
  { code: "CONTRACTOR_BOND_CERTIFICATION", label: "Contractor Bond Certification", legacyType: DocumentType.CONTRACTOR_BOND_CERTIFICATION },
  { code: "GATE_PASS", label: "Gate Pass", legacyType: DocumentType.GATE_PASS },
  { code: "MOVE_IN_PASS", label: "Move-In Pass", legacyType: null },
  { code: "MOVE_OUT_PASS", label: "Move-Out Pass", legacyType: null },
];

export default async function AdminDocumentsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const user = await requireDocumentTemplateAdmin();
  const query = await searchParams;
  const section = ["types", "templates", "requests", "issued"].includes(query.section || "") ? query.section! : "types";
  const q = query.q?.trim() || "";
  const status = Object.values(DocumentRequestStatus).includes(query.status as DocumentRequestStatus) ? query.status as DocumentRequestStatus : undefined;
  const type = Object.values(DocumentType).includes(query.type as DocumentType) ? query.type as DocumentType : undefined;
  const page = Math.max(1, Number(query.page) || 1);
  const requestWhere = { tenantId: user.tenantId, archivedAt: null, ...(status ? { status } : {}), ...(type ? { type } : {}), ...(query.date && /^\d{4}-\d{2}-\d{2}$/.test(query.date) ? { requestedAt: { gte: new Date(`${query.date}T00:00:00.000Z`), lt: new Date(`${query.date}T23:59:59.999Z`) } } : {}), ...(q ? { OR: [{ documentNumber: { contains: q } }, { homeowner: { user: { name: { contains: q } } } }, { homeowner: { block: { contains: q } } }, { homeowner: { lot: { contains: q } } }] } : {}) };
  const [definitions, legacyConfigs, legacyTemplates, requests, requestCount, issued] = await Promise.all([
    prisma.documentDefinition.findMany({
      where: { tenantId: user.tenantId },
      include: {
        fields: { orderBy: [{ displayOrder: "asc" }, { label: "asc" }] },
        assignedTemplateVersion: { include: { templateSet: true, publishedBy: true, createdBy: true } },
        signatoryOfficer: true,
        templateSets: { include: { versions: { include: { publishedBy: true, createdBy: true }, orderBy: [{ version: "desc" }] } }, orderBy: [{ updatedAt: "desc" }] },
      },
      orderBy: [{ displayOrder: "asc" }, { displayName: "asc" }],
    }),
    prisma.documentTypeConfiguration.findMany({ where: { tenantId: user.tenantId }, include: { template: true } }),
    prisma.documentTemplate.findMany({ where: { tenantId: user.tenantId } }),
    prisma.documentRequest.findMany({ where: requestWhere, include: { homeowner: { include: { user: true } }, definition: true, configuration: true }, orderBy: { requestedAt: "desc" }, skip: (page - 1) * requestPageSize, take: requestPageSize }),
    prisma.documentRequest.count({ where: requestWhere }),
    prisma.documentRequest.findMany({ where: { tenantId: user.tenantId, archivedAt: null, generatedContent: { not: null } }, include: { homeowner: { include: { user: true } }, definition: true, configuration: true }, orderBy: { generatedAt: "desc" }, take: 12 }),
  ]);
  const inventory = buildInventory(definitions, legacyConfigs, legacyTemplates);
  const requestPages = Math.max(1, Math.ceil(requestCount / requestPageSize));
  const filters = new URLSearchParams(Object.entries({ section: "requests", q, status: status || "", type: type || "", date: query.date || "" }).filter(([, value]) => value));
  return <>
    <PageHeader eyebrow="Resident services" title="Document Management" description="Manage document types, templates, homeowner requests, and issued HOA documents from one tenant-scoped workspace." action={<div className="flex flex-wrap gap-2"><Link className="btn-primary" href="/admin/documents/new">Create Walk-In / Office Request</Link><Link className="btn-secondary" href="/admin/documents/archive">Archive</Link></div>} />
    {query.notice === "legacy-templates" && <Notice kind="success">The legacy template screen now redirects here. Use Templates for draft, publishing, and version history.</Notice>}
    {query.error && <Notice kind="error">{query.error}</Notice>}
    {query.success && <Notice kind="success">{query.message || "Document request updated."}</Notice>}
    <nav className="mb-5 flex flex-wrap gap-2" aria-label="Document management sections">
      <Tab href="/admin/documents?section=types" active={section === "types"}>Document Types</Tab>
      <Tab href="/admin/documents?section=templates" active={section === "templates"}>Templates</Tab>
      <Tab href="/admin/documents?section=requests" active={section === "requests"}>Requests</Tab>
      <Tab href="/admin/documents?section=issued" active={section === "issued"}>Issued Documents</Tab>
    </nav>
    {section === "types" && <DocumentTypesSection definitions={definitions} inventory={inventory} />}
    {section === "templates" && <TemplatesSection definitions={definitions} />}
    {section === "requests" && <RequestsSection requests={requests} count={requestCount} page={page} pages={requestPages} filters={filters} query={query} status={status} type={type} q={q} />}
    {section === "issued" && <IssuedSection issued={issued} />}
  </>;
}

function DocumentTypesSection({ definitions, inventory }: { definitions: DefinitionRow[]; inventory: ReturnType<typeof buildInventory> }) {
  return <>
    <details className="card mb-5">
      <summary className="cursor-pointer text-lg font-black">Document Definition Diagnostics</summary>
      <p className="mt-2 text-sm text-slate-500">Administrator-only inventory health checks. Repair actions preserve historical relationships and seed missing definitions inactive for review.</p>
      <div className="mt-4 divide-y divide-slate-200">{inventory.map((item) => <div key={item.code} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-black">{item.label}</p><p className="text-xs font-bold text-slate-500">{item.code}</p><p className={`mt-1 text-sm font-black ${item.status === "present and complete" ? "text-emerald-700" : item.status === "missing" ? "text-rose-700" : "text-amber-700"}`}>{item.status}</p>{item.reason && <p className="text-xs text-slate-500">{item.reason}</p>}</div><div className="flex flex-wrap gap-2"><Link className="btn-secondary min-h-8 px-3 py-1 text-xs" href={`/admin/settings/document-definitions?${item.definitionId ? `edit=${item.definitionId}` : ""}`}>{item.definitionId ? "Configure" : "Review catalog"}</Link>{(item.status === "missing" || item.status === "legacy-only" || item.alias) && <form action={repairDocumentDefinitionAction}><input type="hidden" name="code" value={item.code} /><input type="hidden" name="displayName" value={item.label} /><button className="btn-secondary min-h-8 px-3 py-1 text-xs">Repair or seed</button></form>}</div></div>)}</div>
    </details>
    <PaginationFocusTarget id="document-type-catalog" label="Document type catalog" />
    <section className="card p-0 sm:p-0">
      <div className="table-wrap rounded-none shadow-none">
        <table className="data-table min-w-[1520px]"><thead><tr><th>Document type</th><th>Code</th><th>Category</th><th>Status</th><th>Homeowner visibility</th><th>Walk-In availability</th><th>Workflow</th><th>Fee</th><th>Balance policy</th><th>Active published template</th><th>Completeness</th><th>Requestability</th><th>Actions</th></tr></thead><tbody>
          {definitions.map((definition) => {
            const visibility = evaluateDocumentDefinitionVisibility(definition);
            const archived = definition.status === DocumentDefinitionStatus.ARCHIVED || Boolean(definition.archivedAt);
            return <tr key={definition.id}><td><p className="font-black">{definition.displayName}</p><p className="max-w-72 truncate text-xs text-slate-500">{definition.description || "No description"}</p></td><td className="font-mono text-xs font-bold">{definition.code}</td><td>{definition.category || "General"}</td><td><span className={`badge ${definition.active && !definition.archivedAt ? "badge-paid" : "badge-info"}`}>{definition.status.replaceAll("_", " ")}</span></td><td>{definition.homeownerDownloadEnabled ? "Visible" : "Hidden"}</td><td>{definition.walkInEnabled ? "Walk-In Enabled" : "Walk-In Disabled"}</td><td>{workflowLabel(workflowPresetForDefinition(definition))}</td><td>{money(Number(definition.feeAmount))}</td><td>{balancePolicyLabel(definition.outstandingBalancePolicy)}</td><td>{definition.assignedTemplateVersion ? `Published v${definition.assignedTemplateVersion.version}` : "None"}</td><td><p className={visibility.requestable ? "font-bold text-emerald-700" : "font-bold text-amber-700"}>{visibility.status}</p>{[...visibility.errors, ...visibility.warnings].slice(0, 2).map((item) => <p key={item} className="max-w-56 text-xs text-slate-500">{item}</p>)}</td><td>{visibility.visibleToHomeowners ? <span className="font-bold text-emerald-700">Requestable</span> : <div>{visibility.hiddenReasons.length ? visibility.hiddenReasons.map((reason) => <p key={reason} className="text-xs font-bold text-amber-700">{reason}</p>) : <p className="text-xs font-bold text-amber-700">Not requestable</p>}</div>}</td><td><div className="flex flex-wrap gap-2"><Link className="btn-secondary min-h-8 px-3 py-1 text-xs" href={`/admin/settings/document-definitions?edit=${definition.id}`}>Configure</Link><Link className="btn-secondary min-h-8 px-3 py-1 text-xs" href={`/admin/settings/document-definitions/${definition.id}/templates`}>Edit Template</Link><Link className="btn-secondary min-h-8 px-3 py-1 text-xs" href={`/admin/settings/document-definitions/${definition.id}/templates`}>Preview</Link>{!archived && <form action={changeDocumentDefinitionStatusAction}><input type="hidden" name="id" value={definition.id} /><input type="hidden" name="operation" value={definition.active ? "DEACTIVATE" : "ACTIVATE"} /><button className="btn-secondary min-h-8 px-3 py-1 text-xs">{definition.active ? "Deactivate" : "Activate"}</button></form>}{!archived && <form action={changeDocumentDefinitionStatusAction}><input type="hidden" name="id" value={definition.id} /><input type="hidden" name="operation" value="ARCHIVE" /><button className="btn-danger min-h-8 px-3 py-1 text-xs">Archive</button></form>}</div></td></tr>;
          })}
          {!definitions.length && <tr><td colSpan={13} className="py-12 text-center text-slate-500">No document types found.</td></tr>}
        </tbody></table>
      </div>
    </section>
  </>;
}

function TemplatesSection({ definitions }: { definitions: DefinitionRow[] }) {
  return <div className="space-y-5">
    {definitions.map((definition) => {
      const versions = definition.templateSets.flatMap((set) => set.versions.map((version) => ({ ...version, setName: set.name }))).sort((a, b) => b.version - a.version);
      const published = definition.assignedTemplateVersion || versions.find((version) => version.status === DocumentTemplateVersionStatus.PUBLISHED) || null;
      const draft = versions.find((version) => version.status === DocumentTemplateVersionStatus.DRAFT) || null;
      const history = versions.filter((version) => version.status !== DocumentTemplateVersionStatus.DRAFT);
      return <section key={definition.id} className="card">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><h2 className="text-xl font-black">{definition.displayName}</h2><p className="text-sm text-slate-500">{definition.code} | {definition.category || "General"}</p></div><Link className="btn-secondary" href={`/admin/settings/document-definitions/${definition.id}/templates`}>Open template workspace</Link></div>
        <div className="grid gap-4 xl:grid-cols-3">
          <Panel title="Current Published Template">{published ? <><Info label="Version" value={`v${published.version}`} /><Info label="Published date" value={published.publishedAt ? shortDate(published.publishedAt) : "Not recorded"} /><Info label="Published by" value={published.publishedBy?.name || "System"} /><div className="mt-3 flex flex-wrap gap-2"><Link className="btn-secondary min-h-9 px-3 py-1.5 text-xs" href={`/admin/settings/document-definitions/${definition.id}/templates/${published.id}/edit`}>Preview</Link><Link className="btn-secondary min-h-9 px-3 py-1.5 text-xs" href={`/admin/settings/document-definitions/${definition.id}/templates`}>Create/edit draft</Link></div></> : <p className="text-sm text-slate-500">No published template is assigned.</p>}</Panel>
          <Panel title="Current Draft">{draft ? <><Info label="Draft version" value={`v${draft.version}`} /><Info label="Last edited" value={shortDate(draft.updatedAt)} /><Info label="Edited by" value={draft.createdBy?.name || "System"} /><div className="mt-3 flex flex-wrap gap-2"><Link className="btn-secondary min-h-9 px-3 py-1.5 text-xs" href={`/admin/settings/document-definitions/${definition.id}/templates/${draft.id}/edit`}>Continue editing</Link></div></> : <p className="text-sm text-slate-500">No current draft. Duplicate a published version to start changes.</p>}</Panel>
          <Panel title="Version History">{history.length ? <div className="space-y-2">{history.slice(0, 4).map((version) => <div key={version.id} className="rounded-xl bg-slate-50 p-3 text-sm"><p className="font-black">v{version.version} <span className="font-normal text-slate-500">({version.status.toLowerCase()})</span></p><p className="text-xs text-slate-500">{version.publishedAt ? shortDate(version.publishedAt) : "Not published"} | {version.publishedBy?.name || version.createdBy?.name || "System"}</p><div className="mt-2 flex flex-wrap gap-2"><Link className="btn-secondary min-h-8 px-3 py-1 text-xs" href={`/admin/settings/document-definitions/${definition.id}/templates/${version.id}/edit`}>Preview</Link><form action={saveDocumentTemplateVersionAction}><input type="hidden" name="definitionId" value={definition.id} /><input type="hidden" name="sourceVersionId" value={version.id} /><button className="btn-secondary min-h-8 px-3 py-1 text-xs" name="operation" value="duplicateVersion">Restore as draft</button></form></div></div>)}</div> : <p className="text-sm text-slate-500">No published history yet.</p>}</Panel>
        </div>
      </section>;
    })}
    {!definitions.length && <section className="card py-12 text-center text-sm text-slate-500">No document types are available.</section>}
  </div>;
}

function RequestsSection({ requests, count, page, pages, filters, query, status, type, q }: { requests: RequestRow[]; count: number; page: number; pages: number; filters: URLSearchParams; query: Query; status?: DocumentRequestStatus; type?: DocumentType; q: string }) {
  return <>
    <form className="card mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_180px_230px_170px_auto]" method="get"><input type="hidden" name="section" value="requests" /><input className="field" type="search" name="q" defaultValue={q} placeholder="Homeowner, document no., block, lot" /><select className="field" name="status" defaultValue={status || ""}><option value="">All statuses</option>{Object.values(DocumentRequestStatus).map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select><select className="field" name="type" defaultValue={type || ""}><option value="">All document types</option>{documentTypeOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><input className="field" type="date" name="date" defaultValue={query.date} /><button className="btn-secondary">Apply filters</button></form>
    <PaginationFocusTarget id="document-request-table" label="Document request table" />
    <section className="card overflow-hidden p-0 sm:p-0"><div className="flex flex-col gap-1 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-black">Requests</h2><p className="text-sm text-slate-500">{count} request{count === 1 ? "" : "s"} found</p></div><p className="text-xs font-bold text-slate-500">Select View request to review or generate</p></div>
      {requests.length === 0 ? <div className="py-14 text-center text-sm text-slate-500">No document requests match the selected filters.</div> : <div className="table-wrap rounded-none shadow-none"><table className="data-table min-w-[1050px]"><thead><tr><th>Request / Homeowner</th><th>Origin</th><th>Document type</th><th>Date requested</th><th>Balance at request</th><th>Status</th><th>Document no.</th><th>Action</th></tr></thead><tbody>{requests.map((item) => <tr key={item.id} className="hover:bg-pine-50/60"><td><Link className="font-black text-pine-800 hover:underline" href={`/admin/documents/${item.id}`}>{item.homeowner.user.name}</Link><p className="text-xs text-slate-500">Block {item.homeowner.block}, Lot {item.homeowner.lot}</p></td><td><span className="badge badge-info">{item.origin === "ADMIN" ? "Admin / walk-in" : "Homeowner"}</span></td><td><p className="font-bold">{item.definition?.displayName || item.configuration?.displayName || documentTypeLabel(item.type)}</p><p className="max-w-52 truncate text-xs text-slate-500">{item.purpose || "No purpose supplied"}</p></td><td>{shortDate(item.requestedAt)}</td><td>{money(item.outstandingBalanceAtRequest)}</td><td><Status value={item.status} /></td><td className="font-mono text-xs">{item.documentNumber || "Not generated"}</td><td><Link className="btn-secondary min-h-9 px-3 py-1.5 text-xs" href={`/admin/documents/${item.id}`}>{item.generatedContent ? "Open document" : "View request"}</Link></td></tr>)}</tbody></table></div>}
    </section>
    {count > requestPageSize && <nav className="mt-5 flex items-center justify-between"><Link className={`btn-secondary ${page <= 1 ? "pointer-events-none opacity-50" : ""}`} href={`?${filters.toString()}&page=${page - 1}#document-request-table`}>Previous</Link><span className="text-sm font-bold">Page {page} of {pages}</span><Link className={`btn-secondary ${page >= pages ? "pointer-events-none opacity-50" : ""}`} href={`?${filters.toString()}&page=${page + 1}#document-request-table`}>Next</Link></nav>}
  </>;
}

function IssuedSection({ issued }: { issued: RequestRow[] }) {
  return <section className="card p-0 sm:p-0"><div className="table-wrap rounded-none shadow-none"><table className="data-table min-w-[900px]"><thead><tr><th>Document no.</th><th>Homeowner</th><th>Document type</th><th>Status</th><th>Generated</th><th>Actions</th></tr></thead><tbody>{issued.map((item) => <tr key={item.id}><td className="font-mono text-xs font-bold">{item.documentNumber}</td><td>{item.homeowner.user.name}</td><td>{item.definition?.displayName || item.configuration?.displayName || documentTypeLabel(item.type)}</td><td><Status value={item.status} /></td><td>{item.generatedAt ? shortDate(item.generatedAt) : "Not recorded"}</td><td><div className="flex flex-wrap gap-2"><Link className="btn-secondary min-h-9 px-3 py-1.5 text-xs" href={`/admin/documents/${item.id}`}>Manage</Link><a className="btn-primary min-h-9 px-3 py-1.5 text-xs" href={`/documents/${item.id}/pdf`}>PDF</a></div></td></tr>)}{!issued.length && <tr><td colSpan={6} className="py-12 text-center text-slate-500">No issued documents found.</td></tr>}</tbody></table></div></section>;
}

function buildInventory(definitions: DefinitionRow[], legacyConfigs: { type: DocumentType; active: boolean; templateId: string | null }[], legacyTemplates: { type: DocumentType; active: boolean }[]) {
  return expectedDefinitions.map((expected) => {
    const exactMatches = definitions.filter((definition) => definition.code === expected.code || definition.displayName.toLowerCase() === expected.label.toLowerCase() || (expected.legacyType && definition.legacyType === expected.legacyType));
    const aliasMatches = definitions.filter((definition) => (expected.aliases ?? []).some((alias) => definition.code === alias || definition.displayName.toLowerCase() === alias.toLowerCase()));
    const matches = exactMatches.length ? exactMatches : aliasMatches;
    const aliasWarning = !exactMatches.length && aliasMatches.length ? `Possible typo: found ${aliasMatches[0].displayName} (${aliasMatches[0].code}).` : "";
    const legacyConfig = expected.legacyType ? legacyConfigs.find((config) => config.type === expected.legacyType) : null;
    const legacyTemplate = expected.legacyType ? legacyTemplates.find((template) => template.type === expected.legacyType) : null;
    if (matches.length > 1) return { ...expected, status: "duplicate", reason: `${matches.length} definitions match this expected type.`, definitionId: matches[0]?.id, alias: false };
    const definition = matches[0];
    if (!definition) {
      if (legacyConfig || legacyTemplate) return { ...expected, status: "legacy-only", reason: "Legacy configuration or template exists without a document definition.", definitionId: undefined, alias: false };
      return { ...expected, status: "missing", reason: expected.legacyType ? "No definition found for the legacy type." : "No custom definition found.", definitionId: undefined, alias: false };
    }
    const visibility = evaluateDocumentDefinitionVisibility(definition);
    if (definition.archivedAt || definition.status === DocumentDefinitionStatus.ARCHIVED) return { ...expected, status: "present but hidden", reason: [aliasWarning, "Archived."].filter(Boolean).join(" "), definitionId: definition.id, alias: Boolean(aliasWarning) };
    if (!definition.active || definition.status === DocumentDefinitionStatus.INACTIVE) return { ...expected, status: "present but inactive", reason: [aliasWarning, "Inactive."].filter(Boolean).join(" "), definitionId: definition.id, alias: Boolean(aliasWarning) };
    if (!definition.homeownerDownloadEnabled) return { ...expected, status: "present but hidden", reason: [aliasWarning, "Homeowner visibility disabled."].filter(Boolean).join(" "), definitionId: definition.id, alias: Boolean(aliasWarning) };
    if (!visibility.requestable) return { ...expected, status: "present but incomplete", reason: [aliasWarning, [...visibility.errors, ...visibility.warnings][0] || "Not requestable."].filter(Boolean).join(" "), definitionId: definition.id, alias: Boolean(aliasWarning) };
    return { ...expected, status: "present and complete", reason: aliasWarning, definitionId: definition.id, alias: Boolean(aliasWarning) };
  });
}

function Tab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return <Link className={`rounded-xl px-4 py-2 text-sm font-black ${active ? "bg-pine-800 text-white" : "bg-white text-pine-900 shadow-sm ring-1 ring-slate-200"}`} href={href} aria-current={active ? "page" : undefined}>{children}</Link>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><h3 className="font-black">{title}</h3><div className="mt-3">{children}</div></section>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <p className="text-sm"><span className="font-bold text-slate-500">{label}:</span> <span className="font-black">{value}</span></p>;
}

function Status({ value }: { value: DocumentRequestStatus }) {
  return <span className={`badge ${value === "GENERATED" || value === "READY_FOR_DOWNLOAD" || value === "DOWNLOADED" ? "badge-paid" : value === "REJECTED" ? "badge-overdue" : "badge-info"}`}>{value.replaceAll("_", " ")}</span>;
}

function Notice({ kind, children }: { kind: "error" | "success"; children: React.ReactNode }) {
  return <div className={`mb-5 rounded-2xl border p-4 text-sm font-semibold ${kind === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{children}</div>;
}

function workflowLabel(value: string) {
  return value.replace("FREE_INSTANT", "Free + Instant").replace("FREE_APPROVAL", "Free + Approval").replace("PAID_INSTANT", "Paid + Instant").replace("PAID_APPROVAL", "Paid + Approval").replace("REQUEST_ONLY", "Request Only");
}

function balancePolicyLabel(value: string) {
  return documentOutstandingBalancePolicyOptions.find((option) => option.value === value)?.label || value.replaceAll("_", " ");
}
