import Link from "next/link";
import { DocumentRequestStatus, DocumentType } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { documentTypeLabel, documentTypeOptions } from "@/lib/services/documents";
import { money, shortDate } from "@/lib/utils";

type Query = { q?: string; status?: string; type?: string; date?: string; page?: string; error?: string; success?: string; message?: string };

export default async function AdminDocumentsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const user = await requireUser();
  const query = await searchParams;
  const q = query.q?.trim() || "";
  const status = Object.values(DocumentRequestStatus).includes(query.status as DocumentRequestStatus) ? query.status as DocumentRequestStatus : undefined;
  const type = Object.values(DocumentType).includes(query.type as DocumentType) ? query.type as DocumentType : undefined;
  const page = Math.max(1, Number(query.page) || 1);
  const where = { tenantId: user.tenantId, archivedAt: null, ...(status ? { status } : {}), ...(type ? { type } : {}), ...(query.date && /^\d{4}-\d{2}-\d{2}$/.test(query.date) ? { requestedAt: { gte: new Date(`${query.date}T00:00:00.000Z`), lt: new Date(`${query.date}T23:59:59.999Z`) } } : {}), ...(q ? { OR: [{ documentNumber: { contains: q } }, { homeowner: { user: { name: { contains: q } } } }, { homeowner: { block: { contains: q } } }, { homeowner: { lot: { contains: q } } }] } : {}) };
  const [requests, count] = await Promise.all([
    prisma.documentRequest.findMany({ where, include: { homeowner: { include: { user: true } }, definition: true, configuration: true }, orderBy: { requestedAt: "desc" }, skip: (page - 1) * 15, take: 15 }),
    prisma.documentRequest.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(count / 15));
  const filters = new URLSearchParams(Object.entries({ q, status: status || "", type: type || "", date: query.date || "" }).filter(([, value]) => value));
  return <>
    <PageHeader eyebrow="Document management" title="Document requests" description="Search active requests, then open one to review, generate, edit, regenerate, or archive it." action={<div className="flex flex-wrap gap-2"><Link className="btn-primary" href="/admin/documents/new">Generate new document</Link><Link className="btn-secondary" href="/admin/documents/generated">Generated documents</Link><Link className="btn-secondary" href="/admin/document-templates">Templates</Link><Link className="btn-secondary" href="/admin/documents/archive">Archive</Link></div>} />
    {query.error && <Notice kind="error">{query.error}</Notice>}{query.success && <Notice kind="success">{query.message || "Document request updated."}</Notice>}
    <form className="card mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_180px_230px_170px_auto]"><input className="field" type="search" name="q" defaultValue={q} placeholder="Homeowner, document no., block, lot" /><select className="field" name="status" defaultValue={status || ""}><option value="">All statuses</option>{Object.values(DocumentRequestStatus).map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select><select className="field" name="type" defaultValue={type || ""}><option value="">All document types</option>{documentTypeOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><input className="field" type="date" name="date" defaultValue={query.date} /><button className="btn-secondary">Apply filters</button></form>
    <section className="card overflow-hidden p-0 sm:p-0"><div className="flex flex-col gap-1 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-black">All document requests</h2><p className="text-sm text-slate-500">{count} request{count === 1 ? "" : "s"} found</p></div><p className="text-xs font-bold text-slate-500">Select a homeowner or use View request</p></div>
        {requests.length === 0 ? <div className="py-14 text-center text-sm text-slate-500">No document requests match the selected filters.</div> : <div className="table-wrap rounded-none shadow-none"><table className="data-table min-w-[1050px]"><thead><tr><th>Request / Homeowner</th><th>Origin</th><th>Document type</th><th>Date requested</th><th>Balance at request</th><th>Status</th><th>Document no.</th><th>Action</th></tr></thead><tbody>{requests.map((item) => <tr key={item.id} className="hover:bg-pine-50/60"><td><Link className="font-black text-pine-800 hover:underline" href={`/admin/documents/${item.id}`}>{item.homeowner.user.name}</Link><p className="text-xs text-slate-500">Block {item.homeowner.block}, Lot {item.homeowner.lot}</p></td><td><span className="badge badge-info">{item.origin === "ADMIN" ? "Admin / walk-in" : "Homeowner"}</span></td><td><p className="font-bold">{item.definition?.displayName || item.configuration?.displayName || documentTypeLabel(item.type)}</p><p className="max-w-52 truncate text-xs text-slate-500">{item.purpose || "No purpose supplied"}</p></td><td>{shortDate(item.requestedAt)}</td><td>{money(item.outstandingBalanceAtRequest)}</td><td><Status value={item.status} /></td><td className="font-mono text-xs">{item.documentNumber || "Not generated"}</td><td><Link className="btn-secondary min-h-9 px-3 py-1.5 text-xs" href={`/admin/documents/${item.id}`}>{item.generatedContent ? "Open document" : "View request"}</Link></td></tr>)}</tbody></table></div>}
    </section>
    {count > 15 && <nav className="mt-5 flex items-center justify-between"><Link className={`btn-secondary ${page <= 1 ? "pointer-events-none opacity-50" : ""}`} href={`?${filters.toString()}&page=${page - 1}`}>Previous</Link><span className="text-sm font-bold">Page {page} of {pages}</span><Link className={`btn-secondary ${page >= pages ? "pointer-events-none opacity-50" : ""}`} href={`?${filters.toString()}&page=${page + 1}`}>Next</Link></nav>}
  </>;
}

function Status({ value }: { value: DocumentRequestStatus }) { return <span className={`badge ${value === "GENERATED" || value === "READY_FOR_DOWNLOAD" || value === "DOWNLOADED" ? "badge-paid" : value === "REJECTED" ? "badge-overdue" : "badge-info"}`}>{value.replaceAll("_", " ")}</span>; }
function Notice({ kind, children }: { kind: "error" | "success"; children: React.ReactNode }) { return <div className={`mb-5 rounded-2xl border p-4 text-sm font-semibold ${kind === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{children}</div>; }
