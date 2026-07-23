import Link from "next/link";
import { Printer } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { prisma } from "@/lib/db";
import { requireHomeownerProfile } from "@/lib/portal";
import { collectionLabel, money, shortDate } from "@/lib/utils";

export default async function PortalCollectionsPage() {
  const profile = await requireHomeownerProfile();
  const collections = await prisma.collection.findMany({ where: { tenantId: profile.tenantId, homeownerId: profile.id }, include: { refunds: { where: { tenantId: profile.tenantId }, orderBy: { refundDate: "desc" } } }, orderBy: [{ collectionDate: "desc" }, { createdAt: "desc" }] });
  return <><PageHeader eyebrow="My account" title="Other collections & bonds" description="Your gate passes, stickers, memberships, other fees, and refundable construction bonds." /><div className="table-wrap"><table className="data-table"><thead><tr><th>Type / remarks</th><th>Collection date</th><th>Amount</th><th>Refunded</th><th>Balance held</th><th>Status</th><th>Receipt / reference</th><th></th></tr></thead><tbody>{collections.map((item) => {
    const balance = item.refundable ? Number(item.amount) - Number(item.amountRefunded) - Number(item.amountForfeited) : 0;
    return <tr key={item.id}><td><p className="font-bold">{collectionLabel(item.type, item.description)}</p><p className="text-xs text-slate-400">{item.refundable ? "Refundable bond" : "Association fee"}</p>{item.remarks && <p className="mt-1 max-w-sm whitespace-pre-wrap text-xs text-slate-600">{item.remarks}</p>}</td><td>{shortDate(item.collectionDate)}</td><td className="font-black">{money(item.amount)}</td><td>{money(item.amountRefunded)}</td><td>{money(balance)}</td><td><StatusBadge status={item.refundable ? item.refundStatus : "INCOME"} /></td><td><p className="font-mono text-xs font-bold">{item.receiptNumber || "-"}</p><p className="font-mono text-[10px] text-slate-400">Ref: {item.referenceNumber || "-"}</p></td><td><Link className="btn-secondary min-h-8 px-3 py-1" href={`/receipts/collection/${item.id}`} target="_blank"><Printer className="size-4" /> Receipt</Link></td></tr>;
  })}{!collections.length && <tr><td colSpan={8} className="py-12 text-center text-slate-500">No other collections are associated with your account.</td></tr>}</tbody></table></div></>;
}
