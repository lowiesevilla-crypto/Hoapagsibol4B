import Link from "next/link";
import { Role } from "@prisma/client";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { SearchInput } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { homeownerAccountNumber } from "@/lib/homeowner-account";
import { money } from "@/lib/utils";

export default async function HomeownersPage() {
  const user = await requireUser(Role.ADMIN);
  const homeowners = await prisma.homeownerProfile.findMany({ where: { tenantId: user.tenantId }, include: { user: true, _count: { select: { bills: true } } }, orderBy: { user: { name: "asc" } } });
  return <><PageHeader eyebrow="Directory" title="Homeowners" description={`${homeowners.length} registered household${homeowners.length === 1 ? "" : "s"}.`} action={<Link className="btn-primary" href="/admin/homeowners/new"><Plus className="size-4" /> Add homeowner</Link>} />
    <div className="mb-4"><SearchInput placeholder="Search name, email, account number, block or lot" /></div>
    <div className="table-wrap"><table className="data-table"><thead><tr><th>Homeowner</th><th>Account</th><th>Property</th><th>Contact</th><th>Monthly dues</th><th>Status</th><th></th></tr></thead><tbody>
      {homeowners.map((homeowner) => {
        const accountNumber = homeownerAccountNumber(homeowner);
        return <tr key={homeowner.id} data-search={`${homeowner.user.name} ${homeowner.user.email} ${accountNumber} ${homeowner.block} ${homeowner.lot}`.toLowerCase()}><td><p className="font-bold">{homeowner.user.name}</p><p className="text-xs text-slate-400">{homeowner.user.email}</p></td><td className="font-mono text-xs font-bold">{accountNumber}</td><td>Block {homeowner.block}, Lot {homeowner.lot}</td><td>{homeowner.phone}</td><td className="font-bold">{money(homeowner.monthlyDuesAmount)}</td><td><StatusBadge status={homeowner.status} /></td><td className="text-right"><Link className="font-bold text-pine-600 hover:underline" href={`/admin/homeowners/${homeowner.id}`}>View & edit</Link></td></tr>;
      })}
      {!homeowners.length && <tr><td colSpan={7} className="py-12 text-center text-slate-500">No homeowners yet. Add the first profile to begin.</td></tr>}
    </tbody></table></div>
  </>;
}
