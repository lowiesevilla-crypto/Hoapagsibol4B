import { Role } from "@prisma/client";
import { Download, FileCheck2, FolderOpen, Search } from "lucide-react";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { formatRepositoryStorage } from "@/lib/document-repository/quota";
import {
  listRepositoryCategoriesForHomeowner,
  listRepositoryDocumentsForHomeowner,
} from "@/lib/document-repository/queries";

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function dateLabel(value: Date | null) {
  return value ? value.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }) : "—";
}

function pageHref(filters: { search: string; categoryId: string }, page: number) {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.categoryId) params.set("categoryId", filters.categoryId);
  params.set("page", String(page));
  return `/portal/document-library?${params.toString()}`;
}

export default async function HomeownerDocumentLibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser(Role.HOMEOWNER);
  const query = await searchParams;
  const search = one(query.search).trim();
  const categoryId = one(query.categoryId);
  const page = Math.max(1, Number(one(query.page)) || 1);

  const [categories, result] = await Promise.all([
    listRepositoryCategoriesForHomeowner(),
    listRepositoryDocumentsForHomeowner({ search, categoryId, page, pageSize: 20 }),
  ]);

  return <div className="space-y-5">
    <section className="rounded-3xl border bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div><p className="text-xs font-black uppercase tracking-[.16em] text-pine-700">Association records</p><h1 className="mt-1 text-2xl font-black text-ink sm:text-3xl">Document Library</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Official documents your association has published for homeowners in this community. This library is isolated to your currently selected tenant.</p></div>
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-pine-50 text-pine-700"><FolderOpen className="size-6" /></span>
      </div>
    </section>

    <form className="grid gap-3 rounded-3xl border bg-white p-4 shadow-sm sm:grid-cols-[minmax(0,1fr)_240px_auto] sm:p-5" method="get">
      <label className="relative block"><span className="sr-only">Search homeowner documents</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input className="field pl-10" name="search" defaultValue={search} placeholder="Search title, reference or keywords" /></label>
      <label><span className="sr-only">Document category</span><select className="field" name="categoryId" defaultValue={categoryId}><option value="">All categories</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      <div className="flex gap-2"><button className="btn-primary flex-1 sm:flex-none">Search</button>{(search || categoryId) && <Link className="btn-secondary grid place-items-center" href="/portal/document-library">Clear</Link>}</div>
    </form>

    <div className="flex items-center justify-between gap-3 px-1 text-sm text-slate-500"><p><span className="font-black text-slate-800">{result.pagination.total}</span> available document{result.pagination.total === 1 ? "" : "s"}</p><p>Page {result.pagination.page} of {result.pagination.totalPages}</p></div>

    {result.documents.length ? <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {result.documents.map((document) => <article key={document.id} className="flex min-h-64 flex-col rounded-3xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
        <div className="flex items-start justify-between gap-3"><span className="rounded-full bg-pine-50 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-pine-700">{document.category.name}</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black uppercase text-slate-600">{document.fileExtension.replace(".", "")}</span></div>
        <h2 className="mt-4 text-lg font-black leading-6 text-ink">{document.title}</h2>
        {document.documentReference && <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">{document.documentReference}</p>}
        <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-500">{document.description || "Published association document."}</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><dt className="font-bold uppercase tracking-wide text-slate-400">Effective</dt><dd className="mt-1 font-semibold text-slate-700">{dateLabel(document.effectiveAt)}</dd></div><div><dt className="font-bold uppercase tracking-wide text-slate-400">File size</dt><dd className="mt-1 font-semibold text-slate-700">{formatRepositoryStorage(document.fileSizeBytes)}</dd></div></dl>
        <div className="mt-auto pt-5"><a className="btn-primary inline-flex min-h-11 w-full items-center justify-center gap-2" href={`/api/portal/document-library/${document.id}/download`}><Download className="size-4" /> Download document</a></div>
      </article>)}
    </section> : <section className="rounded-3xl border border-dashed bg-white px-6 py-14 text-center shadow-sm"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-pine-50 text-pine-700"><FileCheck2 className="size-6" /></span><h2 className="mt-4 text-xl font-black text-ink">{search || categoryId ? "No published documents match your filters" : "No homeowner documents are published yet"}</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">{search || categoryId ? "Try another search or category. Only documents currently published for homeowners in this community appear here." : "When your association publishes bylaws, policies, memoranda, resolutions, community rules or other homeowner records, they will appear here."}</p></section>}

    {result.pagination.totalPages > 1 && <nav className="flex items-center justify-between gap-3" aria-label="Document Library pages">{result.pagination.page > 1 ? <Link className="btn-secondary" href={pageHref({ search, categoryId }, result.pagination.page - 1)}>Previous</Link> : <span />}{result.pagination.page < result.pagination.totalPages ? <Link className="btn-secondary" href={pageHref({ search, categoryId }, result.pagination.page + 1)}>Next</Link> : <span />}</nav>}
  </div>;
}
