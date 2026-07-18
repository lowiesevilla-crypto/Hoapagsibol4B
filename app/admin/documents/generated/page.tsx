import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { documentTypeLabel } from "@/lib/services/documents";
import { shortDate } from "@/lib/utils";

export default async function GeneratedDocumentsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const user = await requireUser();
  const query = await searchParams;
  const q = query.q?.trim() || "";
  const page = Math.max(1, Number(query.page) || 1);
  const where = { tenantId: user.tenantId, archivedAt: null, generatedContent: { not: null }, ...(q ? { OR: [{ documentNumber: { contains: q } }, { homeowner: { user: { name: { contains: q } } } }] } : {}) };
  const [items, count] = await Promise.all([
    prisma.documentRequest.findMany({ where, include: { homeowner: { include: { user: true } }, definition: true, configuration: true }, orderBy: { generatedAt: "desc" }, skip: (page - 1) * 15, take: 15 }),
    prisma.documentRequest.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(count / 15));
  return <>
    <PageHeader eyebrow="Document management" title="Generated documents" description="Latest active versions available to administrators and their respective homeowners." action={<div className="flex gap-2"><Link className="btn-primary" href="/admin/documents/new">Generate new</Link><Link className="btn-secondary" href="/admin/documents?section=issued">Document Management</Link></div>} />
    <form className="card mb-5 flex gap-2"><input className="field" name="q" defaultValue={q} placeholder="Document number or homeowner" /><button className="btn-secondary">Search</button></form>
    <section className="card p-0 sm:p-0"><div className="table-wrap rounded-none shadow-none"><table className="data-table min-w-[850px]"><thead><tr><th>Document no.</th><th>Homeowner</th><th>Type</th><th>Origin</th><th>Version</th><th>Generated</th><th>Actions</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td className="font-mono font-bold">{item.documentNumber}</td><td>{item.homeowner.user.name}</td><td>{item.definition?.displayName || item.configuration?.displayName || documentTypeLabel(item.type)}</td><td>{item.origin === "ADMIN" ? "Admin / walk-in" : "Homeowner request"}</td><td>v{item.currentVersion}</td><td>{shortDate(item.generatedAt!)}</td><td><div className="flex gap-2"><Link className="btn-secondary min-h-9 px-3 py-1 text-xs" href={`/admin/documents/${item.id}`}>Manage</Link><a className="btn-primary min-h-9 px-3 py-1 text-xs" href={`/documents/${item.id}/pdf`}>PDF</a></div></td></tr>)}{!items.length && <tr><td colSpan={7} className="py-12 text-center text-slate-500">No generated documents found.</td></tr>}</tbody></table></div></section>
    {count > 15 && <div className="mt-4 flex justify-between"><Link className={`btn-secondary ${page <= 1 ? "pointer-events-none opacity-50" : ""}`} href={`?q=${encodeURIComponent(q)}&page=${page - 1}`}>Previous</Link><span>Page {page} of {pages}</span><Link className={`btn-secondary ${page >= pages ? "pointer-events-none opacity-50" : ""}`} href={`?q=${encodeURIComponent(q)}&page=${page + 1}`}>Next</Link></div>}
  </>;
}
