import { Role } from "@prisma/client";
import { FilePlus2, Info, ShieldCheck, Upload } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { Permission } from "@/lib/authorization/permissions";
import { canRepositoryPermission, requireRepositoryUpload } from "@/lib/document-repository/access";
import { ensureRepositoryDefaultCategories, listRepositoryCategories } from "@/lib/document-repository/repository";
import { repositoryAllowedFileExtensions } from "@/lib/document-repository/validation";

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export default async function UploadDocumentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser(Role.ADMIN);
  const { entitlement } = await requireRepositoryUpload();
  await ensureRepositoryDefaultCategories();
  const [categories, canManageVisibility, canPublish] = await Promise.all([
    listRepositoryCategories(),
    canRepositoryPermission(Permission.DOCUMENT_REPOSITORY_MANAGE_VISIBILITY),
    canRepositoryPermission(Permission.DOCUMENT_REPOSITORY_PUBLISH),
  ]);
  const query = await searchParams;
  const error = one(query.error);

  return <>
    <PageHeader
      eyebrow="Association records"
      title="Upload document"
      description="Add an official tenant record with clear classification, access controls, and governance metadata. HOAHub keeps the physical storage path private and tenant-isolated."
      action={<Link className="btn-secondary" href="/admin/document-management">Back to repository</Link>}
    />

    {error && <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{error}</div>}

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
      <form action="/api/admin/document-management/documents" method="post" encType="multipart/form-data" className="rounded-3xl border bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-start gap-3 border-b pb-5">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-pine-50 text-pine-700"><FilePlus2 className="size-5" /></span>
          <div><h2 className="text-xl font-black text-ink">Document details</h2><p className="mt-1 text-sm leading-6 text-slate-500">Use the official title and reference people will recognize. The original filename is preserved separately.</p></div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2"><span className="label">Document title</span><input className="field" name="title" maxLength={191} placeholder="e.g. Amended Association Bylaws 2026" required /></label>
          <label><span className="label">Category</span><select className="field" name="categoryId" required defaultValue=""><option value="" disabled>Select a category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}{category.governanceControlled ? " · governed" : ""}</option>)}</select></label>
          <label><span className="label">Document / reference number</span><input className="field" name="documentReference" maxLength={120} placeholder="e.g. RES-2026-014" /></label>
          <label className="sm:col-span-2"><span className="label">Description</span><textarea className="field min-h-28" name="description" maxLength={4000} placeholder="Briefly explain what this document covers and when residents should use it." /></label>
        </div>

        <div className="mt-7 border-t pt-6">
          <h3 className="font-black text-ink">Access and publication</h3>
          <p className="mt-1 text-sm text-slate-500">Safe defaults are Internal and Draft. Tenant public means authenticated homeowners in this tenant may see the document after it is published and effective.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label><span className="label">Visibility</span><select className="field" name="visibility" defaultValue="INTERNAL"><option value="INTERNAL">Internal — tenant staff only</option>{canManageVisibility && <option value="TENANT_PUBLIC">Tenant public — homeowners in this tenant</option>}{canManageVisibility && <option value="RESTRICTED">Restricted — privileged staff only</option>}</select></label>
            <label><span className="label">Status</span><select className="field" name="status" defaultValue="DRAFT"><option value="DRAFT">Draft</option>{canPublish && <option value="PUBLISHED">Published</option>}</select></label>
          </div>
        </div>

        <div className="mt-7 border-t pt-6">
          <h3 className="font-black text-ink">Governance metadata</h3>
          <p className="mt-1 text-sm text-slate-500">Complete what applies. These fields make bylaws, policies, memoranda, resolutions, permits, and other official records easier to govern and find.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label><span className="label">Issuing body / committee</span><input className="field" name="issuingBody" maxLength={191} placeholder="Board of Directors" /></label>
            <label><span className="label">Policy owner</span><input className="field" name="policyOwner" maxLength={191} placeholder="Security Committee" /></label>
            <label><span className="label">Resolution number</span><input className="field" name="resolutionNumber" maxLength={120} placeholder="Resolution 2026-014" /></label>
            <label><span className="label">Memorandum number</span><input className="field" name="memoNumber" maxLength={120} placeholder="MEMO-2026-08" /></label>
            <label><span className="label">Approval / adoption date</span><input className="field" name="approvalDate" type="date" /></label>
            <label><span className="label">Effective date</span><input className="field" name="effectiveAt" type="date" /></label>
            <label><span className="label">Expiration / review date</span><input className="field" name="expiresAt" type="date" /></label>
            <label className="sm:col-span-2"><span className="label">Search keywords</span><input className="field" name="searchableKeywords" maxLength={4000} placeholder="parking, vehicle, sticker, gate access" /></label>
          </div>
        </div>

        <div className="mt-7 border-t pt-6">
          <h3 className="font-black text-ink">Document file</h3>
          <p className="mt-1 text-sm text-slate-500">Files are validated server-side and stored under a randomized tenant-specific key. The browser never chooses the tenant storage path.</p>
          <label className="mt-4 block rounded-2xl border border-dashed border-pine-200 bg-pine-50/40 p-5">
            <span className="label">Choose file</span>
            <input className="mt-2 block w-full text-sm" name="file" type="file" accept={repositoryAllowedFileExtensions.join(",")} required />
            <span className="mt-2 block text-xs leading-5 text-slate-500">Maximum file size for this plan: {entitlement.maxFileSizeMb} MB. Supported: PDF, JPG, JPEG, PNG, DOCX, XLSX, and PPTX only.</span>
          </label>
        </div>

        <div className="mt-7 flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-end">
          <Link className="btn-secondary text-center" href="/admin/document-management">Cancel</Link>
          <button className="btn-primary inline-flex min-h-11 items-center justify-center gap-2"><Upload className="size-4" /> Upload document</button>
        </div>
      </form>

      <aside className="space-y-4">
        <section className="card">
          <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><ShieldCheck className="size-5" /></span><div><h2 className="font-black text-ink">Tenant-isolated by design</h2><p className="mt-1 text-sm leading-6 text-slate-500">HOAHub derives the tenant from your authenticated session. Uploaded files, categories, metadata, search results and downloads cannot switch tenants through a form value or guessed URL.</p></div></div>
        </section>
        <section className="card">
          <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-700"><Info className="size-5" /></span><div><h2 className="font-black text-ink">Publishing guidance</h2><p className="mt-1 text-sm leading-6 text-slate-500">Keep working records Internal + Draft. Use Tenant public only for records homeowners are permitted to receive, then publish intentionally. Governed categories automatically use revision-history policy for later replacements.</p></div></div>
        </section>
      </aside>
    </div>
  </>;
}
