import { StandardTable } from "@/components/standard-table";
import { Role } from "@prisma/client";
import { Download, FileArchive, FileCheck2, FileClock, FileLock2, Search, Upload } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { RepositoryDocumentCard } from "@/components/document-repository/document-card";
import { RepositoryStatusBadge, RepositoryVisibilityBadge } from "@/components/document-repository/status-badge";
import { RepositoryStorageMeter } from "@/components/document-repository/storage-meter";
import { requireUser } from "@/lib/auth";
import { Permission } from "@/lib/authorization/permissions";
import { canRepositoryPermission, requireRepositoryRead } from "@/lib/document-repository/access";
import {
  repositoryDocumentStatus,
  repositoryDocumentVisibility,
  type RepositoryDocumentStatus,
  type RepositoryDocumentVisibility,
} from "@/lib/document-repository/constants";
import { formatRepositoryStorage } from "@/lib/document-repository/quota";
import {
  ensureRepositoryDefaultCategories,
  getRepositoryDashboard,
  listRepositoryCategories,
  listRepositoryDocuments,
} from "@/lib/document-repository/repository";

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function parseStatus(value: string): RepositoryDocumentStatus | undefined {
  return repositoryDocumentStatus.includes(value as RepositoryDocumentStatus)
    ? value as RepositoryDocumentStatus
    : undefined;
}

function parseVisibility(value: string): RepositoryDocumentVisibility | undefined {
  return repositoryDocumentVisibility.includes(value as RepositoryDocumentVisibility)
    ? value as RepositoryDocumentVisibility
    : undefined;
}

function optionLabel(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/(^|\s)\S/g, (character) => character.toUpperCase());
}

function dateLabel(value: Date) {
  return value.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

function pageHref(input: Record<string, string>, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) if (value) params.set(key, value);
  params.set("page", String(page));
  return `/admin/document-management?${params.toString()}`;
}

function Metric({ label, value, detail, icon }: { label: string; value: string | number; detail: string; icon: React.ReactNode }) {
  return <article className="card flex min-h-36 items-start justify-between gap-4">
    <div>
      <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-black text-ink">{value}</p>
      <p className="mt-2 text-sm leading-5 text-slate-500">{detail}</p>
    </div>
    <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-pine-50 text-pine-700">{icon}</span>
  </article>;
}

export default async function DocumentManagementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser(Role.ADMIN);
  const { entitlement } = await requireRepositoryRead();
  await ensureRepositoryDefaultCategories();

  const query = await searchParams;
  const search = one(query.search).trim();
  const categoryId = one(query.categoryId);
  const status = parseStatus(one(query.status));
  const visibility = parseVisibility(one(query.visibility));
  const page = Math.max(1, Number(one(query.page)) || 1);
  const [canUpload, canDownload] = await Promise.all([
    canRepositoryPermission(Permission.DOCUMENT_REPOSITORY_UPLOAD),
    canRepositoryPermission(Permission.DOCUMENT_REPOSITORY_DOWNLOAD_INTERNAL),
  ]);

  const [dashboard, categories, result] = await Promise.all([
    getRepositoryDashboard(),
    listRepositoryCategories(),
    listRepositoryDocuments({ search, categoryId, status, visibility, page, pageSize: 25 }),
  ]);

  const filters = {
    search,
    categoryId,
    status: status || "",
    visibility: visibility || "",
  };
  const success = one(query.success);
  const error = one(query.error);

  return <>
    <PageHeader
      eyebrow="Association records"
      title="Document Management"
      description="Manage governance, policy, compliance, communication, and community documents in your tenant’s secure repository. Homeowners only see documents you intentionally publish as Tenant public."
      action={canUpload ? <Link className="btn-primary inline-flex items-center gap-2" href="/admin/document-management/upload"><Upload className="size-4" /> Upload document</Link> : undefined}
    />

    {success && <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{success}</div>}
    {error && <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{error}</div>}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <Metric label="Total documents" value={dashboard.total} detail="All managed records in this tenant." icon={<FileArchive className="size-5" />} />
      <Metric label="Homeowner library" value={dashboard.publishedPublic} detail="Published Tenant public documents." icon={<FileCheck2 className="size-5" />} />
      <Metric label="Drafts" value={dashboard.drafts} detail="Not yet published to homeowners." icon={<FileClock className="size-5" />} />
      <Metric label="Protected" value={dashboard.protectedCount} detail="Internal or restricted records." icon={<FileLock2 className="size-5" />} />
      <RepositoryStorageMeter usedBytes={dashboard.quota.usedBytes} limitBytes={dashboard.quota.limitBytes} state={dashboard.quota.state} />
    </section>

    <section className="mt-6 rounded-3xl border bg-white p-4 shadow-sm sm:p-5">
      <form className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_220px_180px_180px_auto]" method="get">
        <label className="relative block">
          <span className="sr-only">Search documents</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input className="field pl-10" name="search" defaultValue={search} placeholder="Search title, reference, filename or keywords" />
        </label>
        <label><span className="sr-only">Category</span><select className="field" name="categoryId" defaultValue={categoryId}><option value="">All categories</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label><span className="sr-only">Status</span><select className="field" name="status" defaultValue={status || ""}><option value="">All statuses</option>{repositoryDocumentStatus.map((item) => <option key={item} value={item}>{optionLabel(item)}</option>)}</select></label>
        <label><span className="sr-only">Visibility</span><select className="field" name="visibility" defaultValue={visibility || ""}><option value="">All visibility</option>{repositoryDocumentVisibility.map((item) => <option key={item} value={item}>{optionLabel(item)}</option>)}</select></label>
        <div className="flex gap-2"><button className="btn-primary flex-1 lg:flex-none">Apply</button><Link className="btn-secondary grid place-items-center" href="/admin/document-management">Clear</Link></div>
      </form>
    </section>

    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
      <p><span className="font-black text-slate-800">{result.total}</span> document{result.total === 1 ? "" : "s"}</p>
      <p>Plan: <span className="font-bold text-slate-700">{entitlement.planCode || "Configured plan"}</span>{entitlement.storageLimitMb != null ? ` · ${entitlement.storageLimitMb.toLocaleString()} MB repository limit` : " · no configured storage limit"}</p>
    </div>

    {result.documents.length ? <>
      <section className="mt-4 hidden overflow-hidden rounded-3xl border bg-white shadow-sm lg:block">
        <div className="overflow-x-auto">
          <StandardTable><table className="w-full min-w-[1180px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-extrabold uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Document</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Visibility</th><th className="px-4 py-3">Revision</th><th className="px-4 py-3">File</th><th className="px-4 py-3">Updated</th><th className="px-4 py-3">Actions</th></tr></thead>
            <tbody>{result.documents.map((document) => <tr key={document.id} className="border-t align-top hover:bg-slate-50/70">
              <td className="max-w-xs px-4 py-4"><Link className="font-black text-ink hover:text-pine-700 hover:underline" href={`/admin/document-management/${document.id}`}>{document.title}</Link><p className="mt-1 truncate text-xs text-slate-500" title={document.originalFileName}>{document.description || document.originalFileName}</p></td>
              <td className="px-4 py-4"><p className="font-bold text-slate-700">{document.category.name}</p>{document.category.governanceControlled && <p className="mt-1 text-xs font-bold text-pine-700">Governed record</p>}</td>
              <td className="px-4 py-4 font-semibold text-slate-600">{document.documentReference || "—"}</td>
              <td className="px-4 py-4"><RepositoryStatusBadge status={document.status} /></td>
              <td className="px-4 py-4"><RepositoryVisibilityBadge visibility={document.visibility} /></td>
              <td className="px-4 py-4 font-bold text-slate-700">Rev {document.currentRevision}</td>
              <td className="px-4 py-4"><p className="font-bold uppercase text-slate-700">{document.fileExtension.replace(".", "")}</p><p className="mt-1 text-xs text-slate-500">{formatRepositoryStorage(document.fileSizeBytes)}</p></td>
              <td className="px-4 py-4 text-slate-600">{dateLabel(document.updatedAt)}</td>
              <td className="px-4 py-4"><div className="flex flex-wrap gap-2"><Link className="btn-secondary inline-flex min-h-10 items-center px-3 py-2" href={`/admin/document-management/${document.id}`}>Manage</Link>{canDownload && <a className="btn-secondary inline-flex min-h-10 items-center gap-2 px-3 py-2" href={`/api/admin/document-management/documents/${document.id}/download`}><Download className="size-4" /> Download</a>}</div></td>
            </tr>)}</tbody>
          </table></StandardTable>
        </div>
      </section>

      <section className="mt-4 grid gap-4 sm:grid-cols-2 lg:hidden">
        {result.documents.map((document) => <RepositoryDocumentCard
          key={document.id}
          title={document.title}
          description={document.description}
          category={document.category.name}
          reference={document.documentReference}
          revision={`Rev ${document.currentRevision}`}
          fileLabel={`${document.fileExtension.replace(".", "").toUpperCase()} · ${formatRepositoryStorage(document.fileSizeBytes)}`}
          updatedLabel={dateLabel(document.updatedAt)}
          status={document.status}
          visibility={document.visibility}
          actions={<div className="flex flex-wrap gap-2"><Link className="btn-primary min-h-11" href={`/admin/document-management/${document.id}`}>Manage</Link>{canDownload && <a className="btn-secondary inline-flex min-h-11 items-center gap-2" href={`/api/admin/document-management/documents/${document.id}/download`}><Download className="size-4" /> Download</a>}</div>}
        />)}
      </section>
    </> : <section className="mt-5 rounded-3xl border border-dashed bg-white px-6 py-14 text-center shadow-sm">
      <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-pine-50 text-pine-700"><FileArchive className="size-6" /></span>
      <h2 className="mt-4 text-xl font-black text-ink">{search || categoryId || status || visibility ? "No documents match these filters" : "Your document repository is ready"}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">{search || categoryId || status || visibility ? "Clear or adjust the filters to find another record." : "Upload bylaws, resolutions, policies, memoranda, permits, community rules, and other association records. New uploads default to safe internal/draft controls unless you intentionally change them."}</p>
      {canUpload && !search && !categoryId && !status && !visibility && <Link className="btn-primary mt-5 inline-flex items-center gap-2" href="/admin/document-management/upload"><Upload className="size-4" /> Upload first document</Link>}
    </section>}

    {result.pageCount > 1 && <nav className="mt-6 flex items-center justify-between gap-3" aria-label="Document repository pages">
      {result.page > 1 ? <Link className="btn-secondary" href={pageHref(filters, result.page - 1)}>Previous</Link> : <span />}
      <p className="text-sm font-bold text-slate-600">Page {result.page} of {result.pageCount}</p>
      {result.page < result.pageCount ? <Link className="btn-secondary" href={pageHref(filters, result.page + 1)}>Next</Link> : <span />}
    </nav>}
  </>;
}
