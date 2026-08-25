import { StandardTable } from "@/components/standard-table";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { DataMigrationPanel } from "@/components/data-migration-panel";
import { prisma } from "@/lib/db";
import { money, shortDate } from "@/lib/utils";

export default async function DataMigrationsPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string; message?: string }> }) {
  const query = await searchParams;
  const [homeowners, contractors, migrations] = await Promise.all([
    prisma.homeownerProfile.findMany({ include: { user: true }, orderBy: { user: { name: "asc" } } }),
    prisma.contractorProfile.findMany({ orderBy: { companyName: "asc" } }),
    prisma.dataMigration.findMany({ include: { homeowner: { include: { user: true } }, contractor: true, createdBy: true }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  return <>
    <PageHeader eyebrow="Administration" title="Previous balances and collections" description="Migrate opening balances, historical collections, bond refunds, and forfeitures with validation, audit tags, and ledger recalculation." action={<Link className="btn-secondary" href="/admin/data">Master data</Link>} />
    {query.error && <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">{query.error}</div>}
    {query.success && <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{query.message || "Migration posted successfully."}</div>}
    <DataMigrationPanel homeowners={homeowners.map((item) => ({ id: item.id, label: `${item.user.name} - Block ${item.block}, Lot ${item.lot}` }))} contractors={contractors.map((item) => ({ id: item.id, label: `${item.companyName} - ${item.contactPerson}` }))} />
    <section className="card mt-6">
      <div className="mb-4"><h2 className="text-lg font-black">Migration history</h2><p className="text-sm text-slate-500">Posted entries are immutable and traceable to the source ledger record.</p></div>
      {migrations.length === 0 ? <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">No migration entries have been posted.</p> : <StandardTable><div className="table-wrap"><table><thead><tr><th>Posted</th><th>Type / Tag</th><th>Payer</th><th>Period</th><th>Amount</th><th>Remarks</th><th>Ledger record</th><th>Posted by</th></tr></thead><tbody>{migrations.map((item) => { const href = item.postedRecordType === "Payment" ? `/receipts/payment/${item.postedRecordId}` : item.postedRecordType === "Collection" ? `/receipts/collection/${item.postedRecordId}` : null; return <tr key={item.id}><td>{shortDate(item.createdAt)}</td><td><p className="font-bold">{item.kind.replaceAll("_", " ")}</p><span className="badge badge-info">{item.tag.replaceAll("_", " ")}</span></td><td>{item.homeowner?.user.name ?? item.contractor?.companyName ?? "Related bond payer"}</td><td>{item.period ? shortDate(item.period) : "-"}</td><td className="font-black">{money(item.amount)}</td><td className="max-w-xs whitespace-normal">{item.remarks}</td><td>{href ? <Link className="font-bold text-pine-700 underline" href={href}>View receipt</Link> : item.postedRecordType || "-"}</td><td>{item.createdBy.name}</td></tr>; })}</tbody></table></div></StandardTable>}
    </section>
  </>;
}
