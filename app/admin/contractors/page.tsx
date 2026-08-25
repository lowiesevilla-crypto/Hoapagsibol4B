import { StandardTable } from "@/components/standard-table";
import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";

import { StatusBadge } from "@/components/status-badge";
import { prisma } from "@/lib/db";
import { money } from "@/lib/utils";

export default async function ContractorsPage() {
  const contractors = await prisma.contractorProfile.findMany({ include: { collections: { where: { type: "CONTRACTOR_BOND" } } }, orderBy: { companyName: "asc" } });
  return <><PageHeader eyebrow="Directory" title="Contractors" description={`${contractors.length} contractor profile${contractors.length === 1 ? "" : "s"} for bond tracking.`} action={<Link className="btn-primary" href="/admin/contractors/new"><Plus className="size-4" /> Add contractor</Link>} />
    <div className="table-wrap"><StandardTable><table className="data-table"><thead><tr><th>Company / contractor</th><th>Contact</th><th>License</th><th>Bond balance held</th><th>Status</th><th></th></tr></thead><tbody>{contractors.map((contractor) => { const held = contractor.collections.reduce((sum, item) => sum + Number(item.amount) - Number(item.amountRefunded) - Number(item.amountForfeited), 0); return <tr key={contractor.id} data-search={`${contractor.companyName} ${contractor.contactPerson} ${contractor.licenseNumber ?? ""}`.toLowerCase()}><td><p className="font-bold">{contractor.companyName}</p><p className="text-xs text-slate-400">{contractor.address}</p></td><td><p>{contractor.contactPerson}</p><p className="text-xs text-slate-400">{contractor.phone}</p></td><td>{contractor.licenseNumber || "-"}</td><td className="font-black">{money(held)}</td><td><StatusBadge status={contractor.status} /></td><td className="text-right"><Link className="font-bold text-pine-600 hover:underline" href={`/admin/contractors/${contractor.id}`}>View & edit</Link></td></tr>; })}{!contractors.length && <tr><td colSpan={6} className="py-12 text-center text-slate-500">No contractors yet. Add a profile before accepting a contractor bond.</td></tr>}</tbody></table></StandardTable></div>
  </>;
}
