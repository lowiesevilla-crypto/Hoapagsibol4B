import Link from "next/link";
import { BadgeCheck, BriefcaseBusiness, Plus, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SearchInput } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { prisma } from "@/lib/db";
import { money } from "@/lib/utils";

export default async function ContractorsPage() {
  const contractors = await prisma.contractorProfile.findMany({ include: { collections: { where: { type: "CONTRACTOR_BOND" } } }, orderBy: { companyName: "asc" } });
  const activeContractors = contractors.filter((contractor) => contractor.status === "ACTIVE").length;
  const contractorsWithLicense = contractors.filter((contractor) => contractor.licenseNumber).length;
  const totalBondHeld = contractors.reduce((total, contractor) => total + contractor.collections.reduce((sum, item) => sum + Number(item.amount) - Number(item.amountRefunded) - Number(item.amountForfeited), 0), 0);

  return <>
    <PageHeader eyebrow="Directory" title="Contractors" description="Maintain the contractor directory and review bond balances without changing collection authority." action={<Link className="btn-primary" href="/admin/contractors/new"><Plus className="size-4" /> Add contractor</Link>} />

    <div className="mb-6 grid gap-3 sm:grid-cols-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2 text-sm font-semibold text-slate-500"><BriefcaseBusiness className="size-4 text-pine-600" /> Registered contractors</div><p className="mt-2 text-2xl font-black text-slate-900">{contractors.length}</p><p className="mt-1 text-xs text-slate-500">{activeContractors} active profile{activeContractors === 1 ? "" : "s"}</p></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2 text-sm font-semibold text-slate-500"><BadgeCheck className="size-4 text-pine-600" /> License coverage</div><p className="mt-2 text-2xl font-black text-slate-900">{contractorsWithLicense}</p><p className="mt-1 text-xs text-slate-500">Profiles with a recorded license number</p></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2 text-sm font-semibold text-slate-500"><ShieldCheck className="size-4 text-pine-600" /> Bond balance held</div><p className="mt-2 text-2xl font-black text-slate-900">{money(totalBondHeld)}</p><p className="mt-1 text-xs text-slate-500">Derived from existing contractor-bond collections</p></div>
    </div>

    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div><h2 className="font-black text-slate-900">Contractor directory</h2><p className="text-sm text-slate-500">Search company, contact person, or license number.</p></div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{contractors.length} record{contractors.length === 1 ? "" : "s"}</p>
      </div>
      <div className="mb-4"><SearchInput placeholder="Search company, contact or license" /></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Company / contractor</th><th>Contact</th><th>License</th><th>Bond balance held</th><th>Status</th><th></th></tr></thead><tbody>{contractors.map((contractor) => { const held = contractor.collections.reduce((sum, item) => sum + Number(item.amount) - Number(item.amountRefunded) - Number(item.amountForfeited), 0); return <tr key={contractor.id} data-search={`${contractor.companyName} ${contractor.contactPerson} ${contractor.licenseNumber ?? ""}`.toLowerCase()}><td><p className="font-bold">{contractor.companyName}</p><p className="text-xs text-slate-400">{contractor.address}</p></td><td><p>{contractor.contactPerson}</p><p className="text-xs text-slate-400">{contractor.phone}</p></td><td>{contractor.licenseNumber || "-"}</td><td className="font-black">{money(held)}</td><td><StatusBadge status={contractor.status} /></td><td className="text-right"><Link className="inline-flex min-h-9 items-center rounded-lg px-3 font-bold text-pine-600 hover:bg-pine-50 hover:underline" href={`/admin/contractors/${contractor.id}`}>View & edit</Link></td></tr>; })}{!contractors.length && <tr><td colSpan={6} className="py-12 text-center"><p className="font-bold text-slate-700">No contractors registered yet.</p><p className="mt-1 text-sm text-slate-500">Add a contractor profile before accepting a contractor bond.</p><Link className="btn-secondary mt-4 inline-flex" href="/admin/contractors/new"><Plus className="size-4" /> Add contractor</Link></td></tr>}</tbody></table></div>
    </section>
  </>;
}
