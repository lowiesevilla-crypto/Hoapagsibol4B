import Link from "next/link";
import { Banknote, HandCoins, Landmark, Printer, RotateCcw } from "lucide-react";
import { CollectionType, Prisma, RecurringChargeType, RefundStatus } from "@prisma/client";
import { BondRefundForm } from "@/components/bond-refund-form";
import { CollectionForm } from "@/components/collection-form";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { DeleteButton, SearchInput, SubmitButton } from "@/components/ui";
import { deleteCollectionAction, forfeitBondAction } from "@/lib/actions/collections";
import { requirePermission } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import { BOND_DUES_CREDIT_PREFIX, bondDuesCreditCollectionId } from "@/lib/bond-dues-credit";
import { effectiveBondRefundStatus, isRefundableBondType } from "@/lib/bond-rules";
import { prisma } from "@/lib/db";
import { collectionLabel, inputDate, money, shortDate } from "@/lib/utils";

type BondCreditRow = { paymentBatchId: string | null; amount: Prisma.Decimal | number | string };

export default async function CollectionsPage() {
  const admin = await requirePermission(Permission.COLLECTIONS_MANAGE);
  const [homeowners, contractors, collections, refunds, bondCreditRows, openDuesRows] = await Promise.all([
    prisma.homeownerProfile.findMany({ where: { tenantId: admin.tenantId }, include: { user: true }, orderBy: { user: { name: "asc" } } }),
    prisma.contractorProfile.findMany({ where: { tenantId: admin.tenantId, status: "ACTIVE" }, orderBy: { companyName: "asc" } }),
    prisma.collection.findMany({ where: { tenantId: admin.tenantId }, include: { homeowner: { include: { user: true } }, contractor: true, refunds: true }, orderBy: [{ collectionDate: "desc" }, { createdAt: "desc" }] }),
    prisma.bondRefund.findMany({ where: { tenantId: admin.tenantId }, take: 10, include: { collection: { include: { homeowner: { include: { user: true } }, contractor: true } }, processedBy: true }, orderBy: [{ refundDate: "desc" }, { createdAt: "desc" }] }),
    prisma.$queryRaw<BondCreditRow[]>(Prisma.sql`SELECT paymentBatchId,amount FROM Payment WHERE tenantId=${admin.tenantId} AND status='ACTIVE' AND paymentBatchId LIKE ${`${BOND_DUES_CREDIT_PREFIX}%`}`),
    prisma.bill.groupBy({ by: ["homeownerId"], where: { tenantId: admin.tenantId, archivedAt: null, recurringChargeType: RecurringChargeType.MONTHLY_DUES, balance: { gt: 0 } }, _sum: { balance: true } }),
  ]);
  const appliedByCollection = new Map<string, number>();
  for (const row of bondCreditRows) {
    const collectionId = bondDuesCreditCollectionId(row);
    if (collectionId) appliedByCollection.set(collectionId, (appliedByCollection.get(collectionId) ?? 0) + Number(row.amount));
  }
  const openDuesByHomeowner = new Map(openDuesRows.map((row) => [row.homeownerId, Number(row._sum.balance ?? 0)]));
  const bondApplied = (collectionId: string) => appliedByCollection.get(collectionId) ?? 0;
  const bondBalance = (item: (typeof collections)[number]) => Math.max(0, Number(item.amount) - Number(item.amountRefunded) - Number(item.amountForfeited) - bondApplied(item.id));
  const feeIncome = collections.filter((item) => !isRefundableBondType(item.type)).reduce((sum, item) => sum + Number(item.amount), 0);
  const forfeitedIncome = collections.reduce((sum, item) => sum + Number(item.amountForfeited), 0);
  const refunded = collections.reduce((sum, item) => sum + Number(item.amountRefunded), 0);
  const appliedToDues = collections.reduce((sum, item) => sum + bondApplied(item.id), 0);
  const bondsHeld = collections.filter((item) => isRefundableBondType(item.type)).reduce((sum, item) => sum + bondBalance(item), 0);
  const openBonds = collections.filter((item) => {
    if (!isRefundableBondType(item.type)) return false;
    const status = effectiveBondRefundStatus(item.type, item.refundStatus);
    return status !== RefundStatus.FORFEITED && bondBalance(item) > 0;
  });
  const payerInfo = (item: (typeof collections)[number]) => ({
    name: item.payerName || item.homeowner?.user.name || item.contractor?.companyName || "Unknown payer",
    category: item.payerType,
  });

  return <><PageHeader eyebrow="Income and liabilities" title="Other collections & bonds" description="Record association income separately from refundable homeowner and contractor bonds. Construction Bonds may be refunded or applied as a non-cash credit to the homeowner’s Monthly Dues." />
    <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><StatCard label="Fee income" value={money(feeIncome)} note="Gate passes, stickers, memberships and other" icon={Banknote} /><StatCard label="Forfeited bond income" value={money(forfeitedIncome)} note="Recognized after a recorded violation" icon={Landmark} /><StatCard label="Refundable bonds held" value={money(bondsHeld)} note={`${openBonds.length} open bond${openBonds.length === 1 ? "" : "s"}`} icon={HandCoins} /><StatCard label="Bonds refunded" value={money(refunded)} note="Cash/transfer bond returns" icon={RotateCcw} /><StatCard label="Applied to Monthly Dues" value={money(appliedToDues)} note="Non-cash Construction Bond credits" icon={HandCoins} /></section>
    <section className="mb-6 grid gap-5 xl:grid-cols-2"><CollectionForm today={inputDate(new Date())} homeowners={homeowners.map((item) => ({ id: item.id, label: `${item.user.name} - Block ${item.block}, Lot ${item.lot}${item.status === "ACTIVE" ? "" : ` - ${item.status}`}`, search: `${item.user.name} ${item.user.email} ${item.accountNumber ?? ""} block ${item.block} lot ${item.lot} ${item.phase ?? ""} ${item.address} ${item.status}`.toLowerCase() }))} contractors={contractors.map((item) => ({ id: item.id, label: `${item.companyName} - ${item.contactPerson}`, search: `${item.companyName} ${item.contactPerson} ${item.phone} ${item.address}`.toLowerCase() }))} />
      <BondRefundForm today={inputDate(new Date())} bonds={openBonds.map((item) => { const balance = bondBalance(item); const payer = payerInfo(item).name; const property = item.homeowner ? `Block ${item.homeowner.block} Lot ${item.homeowner.lot}` : ""; const openDuesBalance = item.homeownerId ? openDuesByHomeowner.get(item.homeownerId) ?? 0 : 0; return { id: item.id, kind: item.type === CollectionType.CONSTRUCTION_BOND ? "CONSTRUCTION_BOND" as const : "CONTRACTOR_BOND" as const, availableBalance: balance, openDuesBalance, label: `${payer} - ${collectionLabel(item.type)} (${money(balance)} bond available${item.type === CollectionType.CONSTRUCTION_BOND ? `; ${money(openDuesBalance)} dues due` : ""})`, search: `${payer} ${property} ${item.contractor?.contactPerson ?? ""} ${collectionLabel(item.type)} ${item.referenceNumber ?? ""}`.toLowerCase() }; })} />
    </section>
    <div className="mb-4"><SearchInput placeholder="Search payer, renter, collection type or status" /></div>
    <div className="table-wrap"><table className="data-table"><thead><tr><th>Payer</th><th>Collection</th><th>Date / method</th><th>Amount</th><th>Refunded</th><th>Applied to dues</th><th>Balance held</th><th>Status</th><th></th></tr></thead><tbody>{collections.map((item) => { const isBond = isRefundableBondType(item.type); const applied = isBond ? bondApplied(item.id) : 0; const balance = isBond ? bondBalance(item) : 0; const baseStatus = isBond ? effectiveBondRefundStatus(item.type, item.refundStatus) : "INCOME"; const status = isBond && balance <= 0 && applied > 0 && baseStatus !== RefundStatus.FORFEITED ? "SETTLED" : baseStatus; const payer = payerInfo(item); return <tr key={item.id} data-search={`${payer.name} ${payer.category} ${item.type} ${status} ${item.referenceNumber ?? ""}`.toLowerCase()}><td><p className="font-bold">{payer.name}</p><p className="text-xs text-slate-400">{payer.category.toLowerCase().replaceAll("_", " ")}</p></td><td><p className="font-bold">{collectionLabel(item.type, item.description)}</p><p className="text-xs text-slate-400">{isBond ? "Refundable bond" : "Association income"}</p></td><td><p>{shortDate(item.collectionDate)}</p><p className="text-xs text-slate-400">{item.method.replaceAll("_", " ")}</p></td><td className="font-black">{money(item.amount)}</td><td>{money(item.amountRefunded)}</td><td>{money(applied)}</td><td>{money(balance)}</td><td><StatusBadge status={status} /></td><td><div className="flex min-w-32 flex-col gap-2"><Link className="btn-secondary min-h-8 px-3 py-1" href={`/receipts/collection/${item.id}`} target="_blank"><Printer className="size-4" /> Receipt</Link>{isBond && balance > 0 && <details><summary className="cursor-pointer text-xs font-bold text-rose-700">Forfeit balance</summary><form action={forfeitBondAction} className="mt-2 space-y-2"><input type="hidden" name="collectionId" value={item.id} /><input className="field min-w-44" name="reason" placeholder="Violation reason" required /><SubmitButton className="btn-danger w-full">Confirm forfeiture</SubmitButton></form></details>}<form action={deleteCollectionAction}><input type="hidden" name="id" value={item.id} /><DeleteButton /></form></div></td></tr>; })}{!collections.length && <tr><td colSpan={9} className="py-12 text-center text-slate-500">No other collections have been recorded.</td></tr>}</tbody></table></div>
    <section className="card mt-6"><h2 className="text-lg font-black">Recent bond refunds</h2><p className="mb-4 text-sm text-slate-500">Audit trail for cash/transfer returns of homeowner and contractor bonds. Construction Bond credits applied to Monthly Dues are recorded separately as non-cash payment allocations.</p><div className="table-wrap shadow-none"><table className="data-table"><thead><tr><th>Payer</th><th>Bond type</th><th>Refund date</th><th>Method</th><th>Reference</th><th>Processed by</th><th className="text-right">Amount</th></tr></thead><tbody>{refunds.map((refund) => { const owner = refund.collection.homeowner?.user.name ?? refund.collection.contractor?.companyName ?? "Unknown"; return <tr key={refund.id}><td className="font-bold">{owner}</td><td>{collectionLabel(refund.collection.type)}</td><td>{shortDate(refund.refundDate)}</td><td>{refund.method.replaceAll("_", " ")}</td><td>{refund.referenceNumber || "-"}</td><td>{refund.processedBy.name}</td><td className="text-right font-black">{money(refund.amount)}</td></tr>; })}{!refunds.length && <tr><td colSpan={7} className="py-10 text-center text-slate-500">No bond refunds processed yet.</td></tr>}</tbody></table></div></section>
  </>;
}