import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db";
import { paymentCoverageDisplay } from "@/lib/payment-coverage";
import { collectionLabel, money, shortDate } from "@/lib/utils";

export default async function ReceiptRegisterPage({ searchParams }: { searchParams: Promise<{ q?: string; series?: string }> }) {
  const query = await searchParams;
  const q = query.q?.trim() || "";
  const series = ["MD", "CB", "CTB", "OC"].includes(query.series || "") ? query.series! : "";
  const prefix = series ? `AR-${series}-` : q.toUpperCase().startsWith("AR-") ? q.toUpperCase() : "";
  const [payments, collections] = await Promise.all([
    prisma.payment.findMany({ where: { status: "ACTIVE", ...(prefix ? { receiptNumber: { contains: prefix } } : q ? { OR: [{ receiptNumber: { contains: q } }, { referenceNumber: { contains: q } }, { homeowner: { user: { name: { contains: q } } } }] } : {}) }, include: { homeowner: { include: { user: true } }, bill: true, processedBy: true }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.collection.findMany({ where: { ...(prefix ? { receiptNumber: { contains: prefix } } : q ? { OR: [{ receiptNumber: { contains: q } }, { referenceNumber: { contains: q } }, { homeowner: { user: { name: { contains: q } } } }, { contractor: { companyName: { contains: q } } }] } : {}) }, include: { homeowner: { include: { user: true } }, contractor: true, createdBy: true }, orderBy: { createdAt: "desc" }, take: 200 }),
  ]);
  const rows = [
    ...payments.map((item) => ({ id: item.id, kind: "payment", receipt: item.receiptNumber, series: "MD", date: item.paymentDate, payer: item.homeowner.user.name, purpose: paymentCoverageDisplay(item), amount: item.amount, reference: item.referenceNumber, processor: item.processedBy?.name || "Legacy / unspecified" })),
    ...collections.map((item) => ({ id: item.id, kind: "collection", receipt: item.receiptNumber, series: item.type === "CONSTRUCTION_BOND" ? "CB" : item.type === "CONTRACTOR_BOND" ? "CTB" : "OC", date: item.collectionDate, payer: item.homeowner?.user.name ?? item.contractor?.companyName ?? "Unknown", purpose: collectionLabel(item.type, item.description), amount: item.amount, reference: item.referenceNumber, processor: item.createdBy.name })),
  ].filter((item) => !series || item.series === series).sort((a, b) => b.date.valueOf() - a.date.valueOf());
  return <>
    <PageHeader eyebrow="Finance" title="Acknowledgement receipt register" description="Search, review, print, and audit monthly dues, bond, and other collection receipt series." />
    <form className="card mb-6 grid gap-3 sm:grid-cols-[1fr_220px_auto]"><input className="field" name="q" defaultValue={q} placeholder="Receipt number, reference, or payer" /><select className="field" name="series" defaultValue={series}><option value="">All receipt series</option><option value="MD">AR-MD - Monthly dues</option><option value="CB">AR-CB - Construction bond</option><option value="CTB">AR-CTB - Contractor bond</option><option value="OC">AR-OC - Other collections</option></select><button className="btn-primary">Search receipts</button></form>
    <div className="table-wrap"><table className="data-table"><thead><tr><th>Receipt number</th><th>Date</th><th>Payer</th><th>Particulars</th><th>Reference</th><th>Processed by</th><th className="text-right">Amount</th><th></th></tr></thead><tbody>{rows.map((item) => <tr key={`${item.kind}-${item.id}`}><td className="font-mono text-xs font-black text-pine-700">{item.receipt || "Legacy receipt pending"}</td><td>{shortDate(item.date)}</td><td className="font-bold">{item.payer}</td><td>{item.purpose}</td><td className="font-mono text-xs">{item.reference || "-"}</td><td>{item.processor}</td><td className="text-right font-black">{money(item.amount)}</td><td><Link className="btn-secondary min-h-8 px-3 py-1 text-xs" href={`/receipts/${item.kind}/${item.id}`} target="_blank">View / Print</Link></td></tr>)}{rows.length === 0 && <tr><td colSpan={8} className="py-12 text-center text-slate-500">No receipts match the selected search.</td></tr>}</tbody></table></div>
  </>;
}
