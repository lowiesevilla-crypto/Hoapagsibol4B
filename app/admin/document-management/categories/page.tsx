import { Role } from "@prisma/client";
import { FolderCog, Plus, Save, ShieldCheck, Trash2 } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import {
  createRepositoryCategoryAction,
  deleteRepositoryCategoryAction,
  updateRepositoryCategoryAction,
} from "@/lib/actions/document-management-categories";
import { requireUser } from "@/lib/auth";
import { Permission } from "@/lib/authorization/permissions";
import { requireRepositoryPermission } from "@/lib/document-repository/access";
import { ensureRepositoryDefaultCategories } from "@/lib/document-repository/repository";
import { listRepositoryCategoriesForManagement } from "@/lib/document-repository/category-management";

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function groupLabel(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/(^|\s)\S/g, (character) => character.toUpperCase());
}

export default async function DocumentCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser(Role.ADMIN);
  await requireRepositoryPermission(Permission.DOCUMENT_REPOSITORY_MANAGE_CATEGORIES);
  await ensureRepositoryDefaultCategories();
  const [categories, query] = await Promise.all([
    listRepositoryCategoriesForManagement(),
    searchParams,
  ]);
  const success = one(query.success);
  const error = one(query.error);

  return <>
    <PageHeader
      eyebrow="Repository taxonomy"
      title="Document categories"
      description="Maintain tenant-specific classification for governance, policy, compliance, finance, community, security, and other association records. Categories never cross tenant boundaries."
      action={<Link className="btn-secondary" href="/admin/document-management">Back to repository</Link>}
    />

    {success && <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{success}</div>}
    {error && <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{error}</div>}

    <section className="grid gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
      <form action={createRepositoryCategoryAction} className="h-fit rounded-3xl border bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3 border-b pb-5">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-pine-50 text-pine-700"><Plus className="size-5" /></span>
          <div><h2 className="text-lg font-black text-ink">Create custom category</h2><p className="mt-1 text-sm leading-6 text-slate-500">Custom categories belong only to this tenant and can be governed when revisions need formal lineage.</p></div>
        </div>
        <div className="mt-5 space-y-4">
          <label><span className="label">Category name</span><input className="field" name="name" maxLength={191} placeholder="e.g. Election Committee Records" required /></label>
          <label><span className="label">Category code</span><input className="field font-mono" name="code" maxLength={100} placeholder="Optional; generated from name" /><span className="mt-1 block text-xs text-slate-500">Uppercase tenant-local code used for stable classification.</span></label>
          <label><span className="label">Group</span><input className="field" name="categoryGroup" maxLength={60} placeholder="e.g. GOVERNANCE" required /></label>
          <label><span className="label">Description</span><textarea className="field min-h-24" name="description" maxLength={4000} /></label>
          <label><span className="label">Sort order</span><input className="field" name="sortOrder" type="number" min="0" max="9999" defaultValue="500" /></label>
          <label className="flex items-start gap-3 rounded-2xl border bg-slate-50 p-4 text-sm"><input className="mt-0.5 size-5" name="governanceControlled" type="checkbox" /><span><strong className="block text-slate-900">Governed category</strong><span className="mt-1 block leading-5 text-slate-500">Files in this category use controlled revision lineage and cannot silently use replace-current behavior.</span></span></label>
        </div>
        <button className="btn-primary mt-5 inline-flex w-full min-h-11 items-center justify-center gap-2"><Plus className="size-4" /> Create category</button>
      </form>

      <div className="space-y-4">
        <div className="rounded-3xl border border-blue-100 bg-blue-50/70 p-4 text-sm leading-6 text-blue-900">
          <div className="flex gap-3"><ShieldCheck className="mt-0.5 size-5 shrink-0" /><p><strong>System defaults are protected.</strong> Their stable codes cannot change, they cannot be permanently deleted, and built-in governance protection cannot be weakened. You can rename, reorder, describe, or deactivate them for this tenant.</p></div>
        </div>

        {categories.map((category) => <article key={category.id} className="rounded-3xl border bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-pine-50 text-pine-700"><FolderCog className="size-5" /></span>
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-black text-ink">{category.name}</h2>{category.systemDefault && <span className="rounded-full bg-pine-50 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-pine-700">System default</span>}{category.governanceControlled && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-amber-700">Governed</span>}{!category.active && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-slate-600">Inactive</span>}</div><p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">{category.code} · {groupLabel(category.categoryGroup)} · {category._count.documents} document{category._count.documents === 1 ? "" : "s"}</p></div>
            </div>
          </div>

          <form action={updateRepositoryCategoryAction} className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(180px,1.2fr)_180px_minmax(220px,1.6fr)_110px]">
            <input type="hidden" name="categoryId" value={category.id} />
            <label><span className="label">Name</span><input className="field" name="name" defaultValue={category.name} maxLength={191} required /></label>
            <label><span className="label">Group</span><input className="field" name="categoryGroup" defaultValue={category.categoryGroup} maxLength={60} required /></label>
            <label><span className="label">Description</span><input className="field" name="description" defaultValue={category.description ?? ""} maxLength={4000} /></label>
            <label><span className="label">Order</span><input className="field" name="sortOrder" type="number" min="0" max="9999" defaultValue={category.sortOrder} /></label>
            <div className="sm:col-span-2 xl:col-span-4 flex flex-col gap-3 rounded-2xl bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-5">
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input className="size-5" name="active" type="checkbox" defaultChecked={category.active} /> Active</label>
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input className="size-5" name="governanceControlled" type="checkbox" defaultChecked={category.governanceControlled} disabled={category.systemDefault} /> Governed revisions{category.systemDefault && <span className="text-xs font-normal text-slate-400">(locked)</span>}</label>
              </div>
              <button className="btn-secondary inline-flex min-h-10 items-center justify-center gap-2"><Save className="size-4" /> Save category</button>
            </div>
          </form>

          {!category.systemDefault && <details className="mt-4 rounded-2xl border border-rose-100 bg-rose-50/40 p-4">
            <summary className="cursor-pointer text-sm font-black text-rose-800">Permanent category deletion</summary>
            <p className="mt-2 text-xs leading-5 text-rose-700">Deletion is allowed only when this category contains zero documents. Otherwise reclassify the documents or deactivate the category.</p>
            <form action={deleteRepositoryCategoryAction} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
              <input type="hidden" name="categoryId" value={category.id} />
              <label className="flex-1"><span className="label text-rose-900">Type DELETE to confirm</span><input className="field border-rose-200 bg-white font-mono" name="confirmation" autoComplete="off" required /></label>
              <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-black text-white hover:bg-rose-800"><Trash2 className="size-4" /> Delete category</button>
            </form>
          </details>}
        </article>)}
      </div>
    </section>
  </>;
}
