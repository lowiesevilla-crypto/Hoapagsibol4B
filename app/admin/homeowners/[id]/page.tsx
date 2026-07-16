import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { FileText } from "lucide-react";
import Link from "next/link";
import { DeleteButton } from "@/components/ui";
import { HomeownerForm } from "@/components/homeowner-form";
import { PageHeader } from "@/components/page-header";
import { saveAdminHouseholdMemberAction } from "@/lib/actions/documents";
import { deleteHomeownerAction } from "@/lib/actions/homeowners";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function EditHomeownerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; success?: string; message?: string }> }) {
  const user = await requireUser(Role.ADMIN);
  const { id } = await params;
  const query = await searchParams;
  const homeowner = await prisma.homeownerProfile.findFirst({ where: { id, tenantId: user.tenantId }, include: { user: true, householdMembers: { orderBy: [{ active: "desc" }, { fullName: "asc" }] } } });
  if (!homeowner) notFound();
  return <><PageHeader eyebrow="Homeowners" title={homeowner.user.name} description={`Block ${homeowner.block}, Lot ${homeowner.lot}`} action={<><Link className="btn-secondary" href={`/admin/homeowners/${homeowner.id}/soa`}><FileText className="size-4" /> Statement of Account</Link><form action={deleteHomeownerAction}><input type="hidden" name="id" value={homeowner.id} /><DeleteButton label="Delete profile" /></form></>} />
    {query.error && <Notice kind="error">{query.error}</Notice>}{query.success && <Notice kind="success">{query.message || "Saved."}</Notice>}
    <HomeownerForm homeowner={homeowner} />
    <section className="card mt-6"><h2 className="text-lg font-black">Household and family members</h2><p className="mb-4 text-sm text-slate-500">Admin edits are tenant-scoped. Existing request and generated-document snapshots are not changed.</p>{homeowner.householdMembers.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No household members registered.</p> : <div className="space-y-3">{homeowner.householdMembers.map((member) => <form key={member.id} action={saveAdminHouseholdMemberAction} className="grid gap-3 rounded-xl bg-slate-50 p-3 md:grid-cols-2 xl:grid-cols-4"><input type="hidden" name="homeownerId" value={homeowner.id} /><input type="hidden" name="id" value={member.id} /><label><span className="label">Full name</span><input className="field" name="fullName" defaultValue={member.fullName} required /></label><label><span className="label">Relationship</span><input className="field" name="relationship" defaultValue={member.relationship} required /></label><label><span className="label">Date of Birth</span><input className="field" name="birthDate" type="date" defaultValue={member.birthDate?.toISOString().slice(0, 10)} /><span className="mt-1 block text-xs text-slate-500">Optional. Used only when required by the selected document type.</span></label><label><span className="label">Civil status</span><input className="field" name="civilStatus" defaultValue={member.civilStatus || ""} /></label><label><span className="label">Nationality</span><input className="field" name="nationality" defaultValue={member.nationality || ""} /></label><label className="xl:col-span-2"><span className="label">Address</span><input className="field" name="address" defaultValue={member.address || ""} /></label><label className="flex min-h-11 items-center gap-2 rounded-xl border bg-white px-3 text-sm font-bold"><input type="checkbox" name="active" defaultChecked={member.active} /> Active</label><button className="btn-secondary">Save member</button></form>)}</div>}</section>
  </>;
}

function Notice({ kind, children }: { kind: "error" | "success"; children: React.ReactNode }) { return <div className={`mb-5 rounded-2xl border p-4 text-sm font-semibold ${kind === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{children}</div>; }
