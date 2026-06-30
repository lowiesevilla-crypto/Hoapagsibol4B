import { Role } from "@prisma/client";
import { OrganizationImage } from "@/components/organization-image";
import { OrganizationImageUpload } from "@/components/organization-image-upload";
import { PageHeader } from "@/components/page-header";
import { ConfirmSubmitButton, SubmitButton } from "@/components/ui";
import { changeOrganizationOfficerStatusAction, saveOrganizationOfficerAction } from "@/lib/actions/organization";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { shortDate } from "@/lib/utils";

export default async function OrganizationSettingsPage({ searchParams }: { searchParams: Promise<{ edit?: string; error?: string; success?: string }> }) {
  await requireUser(Role.SYSTEM_ADMIN);
  const query = await searchParams;
  const [officers, editing] = await Promise.all([
    prisma.organizationOfficer.findMany({ include: { histories: { include: { actor: true }, orderBy: { createdAt: "desc" }, take: 8 } }, orderBy: [{ archivedAt: "asc" }, { displayOrder: "asc" }, { fullName: "asc" }] }),
    query.edit ? prisma.organizationOfficer.findUnique({ where: { id: query.edit } }) : null,
  ]);
  return <>
    <PageHeader eyebrow="System administration" title="Organization structure" description="Maintain officers, committees, display order, photos, and electronic signatures used across the portal and official documents." />
    {query.error && <Notice kind="error">{query.error}</Notice>}{query.success && <Notice kind="success">{query.success}</Notice>}
    <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
      <form action={saveOrganizationOfficerAction} encType="multipart/form-data" className="card h-fit">
        {editing && <input type="hidden" name="id" value={editing.id} />}
        <h2 className="text-lg font-black">{editing ? "Edit officer" : "Add officer"}</h2>
        <p className="mb-5 text-sm text-slate-500">Changes affect future documents only. Generated records keep their saved snapshots.</p>
        <div className="grid gap-4">
          <Field label="Full name"><input className="field" name="fullName" defaultValue={editing?.fullName} required /></Field>
          <Field label="Position"><input className="field" name="position" defaultValue={editing?.position} required /></Field>
          <Field label="Committee"><input className="field" name="committee" defaultValue={editing?.committee || ""} /></Field>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Contact number"><input className="field" name="contactNumber" defaultValue={editing?.contactNumber || ""} /></Field><Field label="Email"><input className="field" type="email" name="email" defaultValue={editing?.email || ""} /></Field></div>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Effective date"><input className="field" type="date" name="effectiveDate" defaultValue={(editing?.effectiveDate || new Date()).toISOString().slice(0, 10)} required /></Field><Field label="End date"><input className="field" type="date" name="endDate" defaultValue={editing?.endDate?.toISOString().slice(0, 10)} /></Field></div>
          <Field label="Display order"><input className="field" type="number" min="0" name="displayOrder" defaultValue={editing?.displayOrder || officers.length + 1} /></Field>
          <OrganizationImageUpload kind="photo" currentUrl={editing?.photoUrl} />
          <OrganizationImageUpload kind="signature" currentUrl={editing?.signatureUrl} />
          <label className="flex min-h-11 items-center gap-3 rounded-xl bg-slate-50 px-3 text-sm font-bold"><input type="checkbox" name="active" defaultChecked={editing?.active ?? true} /> Active officer</label>
        </div>
        <div className="mt-5 flex flex-wrap gap-2"><SubmitButton>{editing ? "Save changes" : "Add officer"}</SubmitButton>{editing && <a className="btn-secondary" href="/admin/settings/organization">Cancel</a>}</div>
      </form>
      <section className="space-y-4">
        {officers.length === 0 ? <div className="card py-12 text-center text-sm text-slate-500">No organization officers configured yet.</div> : officers.map((officer) => <article key={officer.id} className={`card ${officer.archivedAt ? "opacity-65" : ""}`}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-pine-50 text-2xl font-black text-pine-700"><OrganizationImage src={officer.photoUrl} alt={officer.fullName} className="size-full object-cover" fallback={officer.fullName.slice(0, 1)} /></div>
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-black">{officer.fullName}</h2><span className={`badge ${officer.active && !officer.archivedAt ? "badge-paid" : "badge-overdue"}`}>{officer.archivedAt ? "Archived" : officer.active ? "Active" : "Inactive"}</span><span className="badge badge-info">Order {officer.displayOrder}</span></div><p className="font-bold text-pine-800">{officer.position}{officer.committee ? ` | ${officer.committee}` : ""}</p><p className="mt-1 break-words text-xs text-slate-500">{[officer.contactNumber, officer.email].filter(Boolean).join(" | ") || "No contact information"}</p><p className="mt-1 text-xs text-slate-500">Effective {shortDate(officer.effectiveDate)}{officer.endDate ? ` to ${shortDate(officer.endDate)}` : ""} | Signature: {officer.signatureUrl ? "uploaded" : "not uploaded"}</p></div>
            <div className="flex flex-col gap-2 sm:items-end"><div className="grid h-14 w-32 place-items-center overflow-hidden rounded-xl border bg-white p-2"><OrganizationImage src={officer.signatureUrl} alt={`${officer.fullName} signature`} className="max-h-full max-w-full object-contain" fallback={<span className="text-center text-[10px] font-bold text-slate-400">No signature uploaded</span>} /></div><div className="flex flex-wrap gap-2 sm:justify-end"><a className="btn-secondary min-h-9 px-3 py-1.5 text-xs" href={`/admin/settings/organization?edit=${officer.id}`}>Edit</a>{!officer.archivedAt && <form action={changeOrganizationOfficerStatusAction}><input type="hidden" name="id" value={officer.id} /><ConfirmSubmitButton className="btn-secondary min-h-9 px-3 py-1.5 text-xs" name="operation" value={officer.active ? "deactivate" : "activate"} message={`${officer.active ? "Deactivate" : "Activate"} this officer?`}>{officer.active ? "Deactivate" : "Activate"}</ConfirmSubmitButton></form>}<form action={changeOrganizationOfficerStatusAction}><input type="hidden" name="id" value={officer.id} /><ConfirmSubmitButton className="btn-danger min-h-9 px-3 py-1.5 text-xs" name="operation" value="archive" message="Archive this officer? History and existing document snapshots will be preserved.">Archive</ConfirmSubmitButton></form></div></div>
          </div>
          <details className="mt-4 rounded-xl bg-slate-50 p-3 text-xs"><summary className="cursor-pointer font-bold">Change history ({officer.histories.length})</summary><div className="mt-2 space-y-1">{officer.histories.map((item) => <p key={item.id}><b>{item.action}</b> - {shortDate(item.createdAt)} by {item.actor?.name || "System"}</p>)}</div></details>
        </article>)}
      </section>
    </div>
  </>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label><span className="label">{label}</span>{children}</label>; }
function Notice({ kind, children }: { kind: "error" | "success"; children: React.ReactNode }) { return <div className={`mb-5 rounded-2xl border p-4 text-sm font-semibold ${kind === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{children}</div>; }
