import Link from "next/link";
import { Banknote, HandCoins, Landmark, Printer, RotateCcw } from "lucide-react";
import { BondRefundForm } from "@/components/bond-refund-form";
import { CollectionForm } from "@/components/collection-form";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { DeleteButton, SearchInput, SubmitButton } from "@/components/ui";
import { deleteCollectionAction, forfeitBondAction } from "@/lib/actions/collections";
import { prisma } from "@/lib/db";
import { collectionLabel, inputDate, money, shortDate } from "@/lib/utils";

export default async function CollectionsPage() {
  const [homeowners, contractors, collections, refunds] = await Promise.all([
    prisma.homeownerProfile.findMany({ include: { user: true }, orderBy: { user: { name: "asc" } } }),
    prisma.contractorProfile.findMany({ where: { status: "ACTIVE" }, orderBy: { companyName: "asc" } }),
    prisma.collection.findMany({ include: { homeowner: { include: { user: true } }, contractor: true, refunds: true }, orderBy: [{ collectionDate: "desc" }, { createdAt: "desc" }] }),
    prisma.bondRefund.findMany({ take: 10, include: { collection: { include: { homeowner: { include: { user: true } }, contractor: true } }, processedBy: true }, orderBy: [{ refundDate: "desc" }, { createdAt: "desc" }] }),
  ]);
  const feeIncome = collections.filter((item) => !item.refundable).reduce((sum, item) => sum + Number(item.amount), 0);
  const forfeitedIncome = collections.reduce((sum, item) => sum + Number(item.amountForfeited), 0);
  const refunded = collections.reduce((sum, item) => sum + Number(item.amountRefunded), 0);
  const bondsHeld = collections.filter((item) => item.refundable).reduce((sum, item) => sum + Number(item.amount) - Number(item.amountRefunded) - Number(item.amountForfeited), 0);
  const openBonds = collections.filter((item) => item.refundable && Number(item.amount) - Number(item.amountRefunded) - Number(item.amountForfeited) > 0);
  const payerInfo = (item: (typeof collections)[number]) => ({
    name: item.payerName || item.homeowner?.user.name || item.contractor?.companyName || "Unknown payer",
    category: item.payerType,
  });

  return <><PageHeader eyebrow="Income and liabilities" title="Other collections & bonds" description="Record association income separately from refundable homeowner and contractor bonds." />
    <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Fee income" value={money(feeIncome)} note="Gate passes, stickers, memberships and other" icon={Banknote} /><StatCard label="Forfeited bond income" value={money(forfeitedIncome)} note="Recognized after a recorded violation" icon={Landmark} /><StatCard label="Refundable bonds held" value={money(bondsHeld)} note={`${openBonds.length} open bond${openBonds.length === 1 ? "" : "s"}`} icon={HandCoins} /><StatCard label="Bonds refunded" value={money(refunded)} note="All processed bond returns" icon={RotateCcw} /></section>
    <section className="mb-6 grid gap-5 xl:grid-cols-2"><CollectionForm today={inputDate(new Date())} homeowners={homeowners.map((item) => ({ id: item.id, label: `${item.user.name} - Block ${item.block}, Lot ${item.lot}${item.status === "ACTIVE" ? "" : ` - ${item.status}`}`, search: `${item.user.name} ${item.user.email} ${item.accountNumber ?? ""} block ${item.block} lot ${item.lot} ${item.phase ?? ""} ${item.address} ${item.status}`.toLowerCase() }))} contractors={contractors.map((item) => ({ id: item.id, label: `${item.companyName} - ${item.contactPerson}`, search: `${item.companyName} ${item.contactPerson} ${item.phone} ${item.address}`.toLowerCase() }))} />
      <BondRefundForm today={inputDate(new Date())} bonds={openBonds.map((item) => { const balance = Number(item.amount) - Number(item.amountRefunded) - Number(item.amountForfeited); const payer = payerInfo(item).name; const property = item.homeowner ? `Block ${item.homeowner.block} Lot ${item.homeowner.lot}` : ""; return { id: item.id, label: `${payer} - ${collectionLabel(item.type)} (${money(balance)} available)`, search: `${payer} ${property} ${item.contractor?.contactPerson ?? ""} ${collectionLabel(item.type)} ${item.referenceNumber ?? ""}`.toLowerCase() }; })} />
    </section>
    <div className="mb-4"><SearchInput placeholder="Search payer, renter, collection type or status" /></div>
    <div className="table-wrap"><table className="data-table"><thead><tr><th>Payer</th><th>Collection</th><th>Date / method</th><th>Amount</th><th>Refunded</th><th>Balance held</th><th>Status</th><th></th></tr></thead><tbody>{collections.map((item) => { const balance = item.refundable ? Number(item.amount) - Number(item.amountRefunded) - Number(item.amountForfeited) : 0; const payer = payerInfo(item); return <tr key={item.id} data-search={`${payer.name} ${payer.category} ${item.type} ${item.refundStatus} ${item.referenceNumber ?? ""}`.toLowerCase()}><td><p className="font-bold">{payer.name}</p><p className="text-xs text-slate-400">{payer.category.toLowerCase().replaceAll("_", " ")}</p></td><td><p className="font-bold">{collectionLabel(item.type, item.description)}</p><p className="text-xs text-slate-400">{item.refundable ? "Refundable bond" : "Association income"}</p></td><td><p>{shortDate(item.collectionDate)}</p><p className="text-xs text-slate-400">{item.method.replaceAll("_", " ")}</p></td><td className="font-black">{money(item.amount)}</td><td>{money(item.amountRefunded)}</td><td>{money(balance)}</td><td><StatusBadge status={item.refundable ? item.refundStatus : "INCOME"} /></td><td><div className="flex min-w-32 flex-col gap-2"><Link className="btn-secondary min-h-8 px-3 py-1" href={`/receipts/collection/${item.id}`} target="_blank"><Printer className="size-4" /> Receipt</Link>{item.refundable && balance > 0 && <details><summary className="cursor-pointer text-xs font-bold text-rose-700">Forfeit balance</summary><form action={forfeitBondAction} className="mt-2 space-y-2"><input type="hidden" name="collectionId" value={item.id} /><input className="field min-w-44" name="reason" placeholder="Violation reason" required /><SubmitButton className="btn-danger w-full">Confirm forfeiture</SubmitButton></form></details>}<form action={deleteCollectionAction}><input type="hidden" name="id" value={item.id} /><DeleteButton /></form></div></td></tr>; })}{!collections.length && <tr><td colSpan={8} className="py-12 text-center text-slate-500">No other collections have been recorded.</td></tr>}</tbody></table></div>
    <section className="card mt-6"><h2 className="text-lg font-black">Recent bond refunds</h2><p className="mb-4 text-sm text-slate-500">Audit trail for returned homeowner and contractor bonds.</p><div className="table-wrap shadow-none"><table className="data-table"><thead><tr><th>Payer</th><th>Bond type</th><th>Refund date</th><th>Method</th><th>Reference</th><th>Processed by</th><th className="text-right">Amount</th></tr></thead><tbody>{refunds.map((refund) => { const owner = refund.collection.homeowner?.user.name ?? refund.collection.contractor?.companyName ?? "Unknown"; return <tr key={refund.id}><td className="font-bold">{owner}</td><td>{collectionLabel(refund.collection.type)}</td><td>{shortDate(refund.refundDate)}</td><td>{refund.method.replaceAll("_", " ")}</td><td>{refund.referenceNumber || "-"}</td><td>{refund.processedBy.name}</td><td className="text-right font-black">{money(refund.amount)}</td></tr>; })}{!refunds.length && <tr><td colSpan={7} className="py-10 text-center text-slate-500">No bond refunds processed yet.</td></tr>}</tbody></table></div></section>
  </>;
}
