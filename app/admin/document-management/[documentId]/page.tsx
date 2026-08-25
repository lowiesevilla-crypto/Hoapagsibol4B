import { StandardTable } from "@/components/standard-table";
import { Role } from "@prisma/client";
import { Download, FileLock2, History, RefreshCw, Save, ShieldAlert, Trash2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { RepositoryStatusBadge, RepositoryVisibilityBadge } from "@/components/document-repository/status-badge";
import { requireUser } from "@/lib/auth";
import { Permission } from "@/lib/authorization/permissions";
import { permanentlyDeleteRepositoryDocumentAction, updateRepositoryDocumentAction } from "@/lib/actions/document-management";
import { canRepositoryPermission } from "@/lib/document-repository/access";
import {
  repositoryDocumentStatus,
  repositoryDocumentVisibility,
  type RepositoryDocumentStatus,
} from "@/lib/document-repository/constants";
import { formatRepositoryStorage } from "@/lib/document-repository/quota";
import { ensureRepositoryDefaultCategories, getRepositoryDocumentForAdmin, listRepositoryCategories } from "@/lib/document-repository/repository";
import { repositoryAllowedFileExtensions } from "@/lib/document-repository/validation";

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function dateInput(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function dateLabel(value: Date | null) {
  return value ? value.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }) : "Not set";
}

function optionLabel(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/(^|\s)\S/g, (character) => character.toUpperCase());
}

function statusOptionDisabled(input: {
  option: RepositoryDocumentStatus;
  current: RepositoryDocumentStatus;
  canPublish: boolean;
  canArchive: boolean;
}) {
  if (input.option === input.current) return false;
  if (!input.canPublish && (input.option === "PUBLISHED" || input.current === "PUBLISHED")) return true;
  const controlledArchiveStates: readonly RepositoryDocumentStatus[] = ["ARCHIVED", "INACTIVE"];
  if (!input.canArchive && (controlledArchiveStates.includes(input.option) || controlledArchiveStates.includes(input.current))) return true;
  return false;
}

export default async function RepositoryDocumentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ documentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser(Role.ADMIN);
  await ensureRepositoryDefaultCategories();
  const { documentId } = await params;
  const query = await searchParams;
  const [document, categories] = await Promise.all([
    getRepositoryDocumentForAdmin(documentId),
    listRepositoryCategories(),
  ]);
  if (!document) notFound();

  const [canEdit, canManageVisibility, canPublish, canArchive, canDelete, canDownload, canReplacePermission] = await Promise.all([
    canRepositoryPermission(Permission.DOCUMENT_REPOSITORY_UPDATE_METADATA),
    canRepositoryPermission(Permission.DOCUMENT_REPOSITORY_MANAGE_VISIBILITY),
    canRepositoryPermission(Permission.DOCUMENT_REPOSITORY_PUBLISH),
    canRepositoryPermission(Permission.DOCUMENT_REPOSITORY_ARCHIVE),
    canRepositoryPermission(Permission.DOCUMENT_REPOSITORY_DELETE),
    canRepositoryPermission(Permission.DOCUMENT_REPOSITORY_DOWNLOAD_INTERNAL),
    canRepositoryPermission(Permission.DOCUMENT_REPOSITORY_REPLACE),
  ]);
  const canReplace = canReplacePermission && (document.status !== "PUBLISHED" || canPublish);
  const success = one(query.success);
  const error = one(query.error);

  return <>
    <PageHeader
      eyebrow={optionLabel(document.category.categoryGroup)}
      title={document.title}
      description="Review the official repository record, publication controls, governance metadata, revision lineage, and file evidence for this tenant."
      action={<div className="flex flex-wrap gap-2"><Link className="btn-secondary" href="/admin/document-management">Back to repository</Link>{canDownload && <a className="btn-primary inline-flex items-center gap-2" href={`/api/admin/document-management/documents/${document.id}/download`}><Download className="size-4" /> Download</a>}</div>}
    />

    {success && <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{success}</div>}
    {error && <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{error}</div>}

    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <article className="card"><p className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Status</p><div className="mt-3"><RepositoryStatusBadge status={document.status} /></div><p className="mt-3 text-sm text-slate-500">{document.publishedAt ? `Published ${dateLabel(document.publishedAt)}` : "Not currently published."}</p></article>
      <article className="card"><p className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Visibility</p><div className="mt-3"><RepositoryVisibilityBadge visibility={document.visibility} /></div><p className="mt-3 text-sm text-slate-500">Tenant public is still limited to authenticated homeowners in this tenant.</p></article>
      <article className="card"><p className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Revision</p><p className="mt-2 text-2xl font-black text-ink">Rev {document.currentRevision}</p><p className="mt-2 text-sm text-slate-500">{document.revisionPolicy === "KEEP_HISTORY" ? "Controlled revision lineage" : "Replace-current policy with audit metadata"}</p></article>
      <article className="card"><p className="text-xs font-extrabold uppercase tracking-wider text-slate-500">File</p><p className="mt-2 text-lg font-black uppercase text-ink">{document.fileExtension.replace(".", "")}</p><p className="mt-1 text-sm text-slate-500">{formatRepositoryStorage(document.fileSizeBytes)} · {optionLabel(document.malwareScanStatus)}</p></article>
    </section>

    <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-3xl border bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-start gap-3 border-b pb-5"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-pine-50 text-pine-700"><FileLock2 className="size-5" /></span><div><h2 className="text-xl font-black text-ink">Repository metadata</h2><p className="mt-1 text-sm leading-6 text-slate-500">Changes are tenant-scoped and audited. Use a reason when altering official publication, visibility, or governance information.</p></div></div>

        {canEdit ? <form action={updateRepositoryDocumentAction} className="mt-6">
          <input type="hidden" name="documentId" value={document.id} />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2"><span className="label">Document title</span><input className="field" name="title" defaultValue={document.title} maxLength={191} required /></label>
            <label><span className="label">Category</span><select className="field" name="categoryId" defaultValue={document.categoryId} required>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}{category.governanceControlled ? " · governed" : ""}</option>)}</select></label>
            <label><span className="label">Document / reference number</span><input className="field" name="documentReference" defaultValue={document.documentReference ?? ""} maxLength={120} /></label>
            <label className="sm:col-span-2"><span className="label">Description</span><textarea className="field min-h-24" name="description" defaultValue={document.description ?? ""} maxLength={4000} /></label>
            <label><span className="label">Visibility</span><select className="field" name="visibility" defaultValue={document.visibility}>{repositoryDocumentVisibility.map((visibility) => <option key={visibility} value={visibility} disabled={!canManageVisibility && visibility !== document.visibility}>{optionLabel(visibility)}</option>)}</select></label>
            <label><span className="label">Status</span><select className="field" name="status" defaultValue={document.status}>{repositoryDocumentStatus.map((status) => <option key={status} value={status} disabled={statusOptionDisabled({ option: status, current: document.status, canPublish, canArchive })}>{optionLabel(status)}</option>)}</select></label>
            <label><span className="label">Issuing body / committee</span><input className="field" name="issuingBody" defaultValue={document.issuingBody ?? ""} maxLength={191} /></label>
            <label><span className="label">Policy owner</span><input className="field" name="policyOwner" defaultValue={document.policyOwner ?? ""} maxLength={191} /></label>
            <label><span className="label">Resolution number</span><input className="field" name="resolutionNumber" defaultValue={document.resolutionNumber ?? ""} maxLength={120} /></label>
            <label><span className="label">Memorandum number</span><input className="field" name="memoNumber" defaultValue={document.memoNumber ?? ""} maxLength={120} /></label>
            <label><span className="label">Approval / adoption date</span><input className="field" name="approvalDate" type="date" defaultValue={dateInput(document.approvalDate)} /></label>
            <label><span className="label">Effective date</span><input className="field" name="effectiveAt" type="date" defaultValue={dateInput(document.effectiveAt)} /></label>
            <label><span className="label">Expiration / review date</span><input className="field" name="expiresAt" type="date" defaultValue={dateInput(document.expiresAt)} /></label>
            <label className="sm:col-span-2"><span className="label">Search keywords</span><input className="field" name="searchableKeywords" defaultValue={document.searchableKeywords ?? ""} maxLength={4000} /></label>
            <label className="sm:col-span-2"><span className="label">Remarks</span><textarea className="field min-h-20" name="remarks" defaultValue={document.remarks ?? ""} /></label>
            <label className="sm:col-span-2"><span className="label">Reason for this update</span><input className="field" name="reason" maxLength={500} placeholder="Recommended for publication, visibility, or governance changes" /></label>
          </div>
          <div className="mt-6 flex justify-end"><button className="btn-primary inline-flex min-h-11 items-center gap-2"><Save className="size-4" /> Save changes</button></div>
        </form> : <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          <div><dt className="label">Category</dt><dd className="mt-1 font-bold text-slate-800">{document.category.name}</dd></div>
          <div><dt className="label">Reference</dt><dd className="mt-1 font-bold text-slate-800">{document.documentReference || "Not set"}</dd></div>
          <div><dt className="label">Approval / adoption</dt><dd className="mt-1 font-bold text-slate-800">{dateLabel(document.approvalDate)}</dd></div>
          <div><dt className="label">Effective</dt><dd className="mt-1 font-bold text-slate-800">{dateLabel(document.effectiveAt)}</dd></div>
          <div><dt className="label">Expires / review</dt><dd className="mt-1 font-bold text-slate-800">{dateLabel(document.expiresAt)}</dd></div>
        </dl>}
      </section>

      <aside className="space-y-4">
        <section className="card">
          <h2 className="font-black text-ink">File evidence</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-400">Original filename</dt><dd className="mt-1 break-words font-semibold text-slate-700">{document.originalFileName}</dd></div>
            <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-400">SHA-256</dt><dd className="mt-1 break-all font-mono text-xs text-slate-600">{document.checksumSha256}</dd></div>
            <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-400">Uploaded</dt><dd className="mt-1 font-semibold text-slate-700">{dateLabel(document.createdAt)}</dd></div>
            <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-400">Last updated</dt><dd className="mt-1 font-semibold text-slate-700">{dateLabel(document.updatedAt)}</dd></div>
          </dl>
          <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">Internal storage keys and physical paths are intentionally not exposed in the Tenant Admin UI.</p>
        </section>

        {document.category.governanceControlled && <section className="card border-pine-100 bg-pine-50/40"><h2 className="font-black text-pine-900">Governed record</h2><p className="mt-2 text-sm leading-6 text-pine-900/70">This category enforces controlled revision lineage. File replacement creates a revision event with the previous checksum, filename, file size, actor, reason, and revision metadata rather than silently overwriting the official record.</p></section>}

        {canReplace && <section className="rounded-3xl border bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-700"><RefreshCw className="size-5" /></span><div><h2 className="font-black text-ink">Replace file / new revision</h2><p className="mt-1 text-sm leading-6 text-slate-500">Replace the current binary while preserving this document’s identity. Current revision: <strong>Rev {document.currentRevision}</strong>; successful replacement becomes <strong>Rev {document.currentRevision + 1}</strong>.</p></div></div>
          <form action={`/api/admin/document-management/documents/${document.id}/replace`} method="post" encType="multipart/form-data" className="mt-4 space-y-3">
            <label><span className="label">Replacement file</span><input className="block w-full text-sm" name="file" type="file" accept={repositoryAllowedFileExtensions.join(",")} required /></label>
            <label><span className="label">Archived revision label</span><input className="field" name="revisionLabel" maxLength={60} placeholder={`Rev ${document.currentRevision}`} /></label>
            <label><span className="label">Revision reason</span><textarea className="field min-h-20" name="reason" maxLength={1000} placeholder="Describe what changed and why this file supersedes the current revision." required /></label>
            <p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">Historical binary retention follows the tenant’s subscribed Document Management plan. Even when an older binary is purged, its immutable revision metadata and audit evidence remain.</p>
            <button className="btn-primary inline-flex min-h-11 w-full items-center justify-center gap-2"><RefreshCw className="size-4" /> Create next revision</button>
          </form>
        </section>}

        {canDelete && <section className="rounded-3xl border border-rose-200 bg-rose-50/60 p-5 shadow-sm">
          <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white text-rose-700"><ShieldAlert className="size-5" /></span><div><h2 className="font-black text-rose-950">Permanent deletion</h2><p className="mt-1 text-sm leading-6 text-rose-800">Deletes the repository record, current file, and retained revision files. HOAHub keeps an audit tombstone, but the application has no recycle bin or restore action.</p></div></div>
          <form action={permanentlyDeleteRepositoryDocumentAction} className="mt-4 space-y-3">
            <input type="hidden" name="documentId" value={document.id} />
            <label><span className="label text-rose-900">Deletion reason</span><input className="field border-rose-200 bg-white" name="reason" maxLength={500} placeholder="Why this record may be permanently removed" /></label>
            <label><span className="label text-rose-900">Type DELETE to confirm</span><input className="field border-rose-200 bg-white font-mono" name="confirmation" autoComplete="off" required /></label>
            <button className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-black text-white hover:bg-rose-800"><Trash2 className="size-4" /> Permanently delete</button>
          </form>
        </section>}
      </aside>
    </div>

    <section className="mt-5 rounded-3xl border bg-white p-5 shadow-sm sm:p-7">
      <div className="flex items-start gap-3 border-b pb-5"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-700"><History className="size-5" /></span><div><h2 className="text-xl font-black text-ink">Revision ledger</h2><p className="mt-1 text-sm leading-6 text-slate-500">Historical entries are tenant-scoped evidence. Retained binary availability depends on plan retention policy; internal storage locations are never displayed.</p></div></div>
      {document.revisions.length ? <div className="mt-5 overflow-x-auto"><StandardTable><table className="w-full min-w-[760px] text-sm"><thead className="bg-slate-50 text-left text-xs font-extrabold uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Revision</th><th className="px-4 py-3">File</th><th className="px-4 py-3">Size</th><th className="px-4 py-3">Created</th><th className="px-4 py-3">Binary</th><th className="px-4 py-3">Reason</th></tr></thead><tbody>{document.revisions.map((revision) => <tr key={revision.id} className="border-t align-top"><td className="px-4 py-4"><p className="font-black text-slate-800">Rev {revision.revision}</p>{revision.revisionLabel && <p className="mt-1 text-xs text-slate-500">{revision.revisionLabel}</p>}</td><td className="px-4 py-4"><p className="font-semibold text-slate-700">{revision.originalFileName}</p><p className="mt-1 break-all font-mono text-[11px] text-slate-400">{revision.checksumSha256}</p></td><td className="px-4 py-4 text-slate-600">{formatRepositoryStorage(revision.fileSizeBytes)}</td><td className="px-4 py-4 text-slate-600">{dateLabel(revision.createdAt)}</td><td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${revision.storageKey ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{revision.storageKey ? "Retained" : "Metadata only"}</span></td><td className="max-w-sm px-4 py-4 text-slate-600">{revision.reason || "—"}</td></tr>)}</tbody></table></StandardTable></div> : <div className="mt-5 rounded-2xl border border-dashed bg-slate-50 px-5 py-8 text-center"><p className="font-bold text-slate-700">No prior revisions yet</p><p className="mt-1 text-sm text-slate-500">The first controlled replacement will archive the current file as revision evidence.</p></div>}
    </section>
  </>;
}
