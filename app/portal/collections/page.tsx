import { StandardTable } from "@/components/standard-table";
import Link from "next/link";
import { Printer, WalletCards } from "lucide-react";
import { CollectionCard, PaymentAreaNavigation, PaymentEmptyState, PaymentMetricCard } from "@/components/homeowner/payments/payment-cards";
import { PortalPageContainer, PortalSectionHeader } from "@/components/portal-mobile-shell";
import { StatusBadge } from "@/components/status-badge";
import { prisma } from "@/lib/db";
import { requireHomeownerProfile } from "@/lib/portal";
import { collectionLabel, money, shortDate } from "@/lib/utils";

const PAGE_SIZE = 12;

export default async function PortalCollectionsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const profile = await requireHomeownerProfile();
  const query = await searchParams;
  const page = Math.max(1, Number(query.page || "1") || 1);
  const where = { tenantId: profile.tenantId, homeownerId: profile.id };
  const [collections, totalCollections, refundableCount] = await Promise.all([
    prisma.collection.findMany({
      where,
      include: { refunds: { where: { tenantId: profile.tenantId }, orderBy: { refundDate: "desc" } } },
      orderBy: [{ collectionDate: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.collection.count({ where }),
    prisma.collection.count({ where: { ...where, refundable: true } }),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalCollections / PAGE_SIZE));

  return (
    <PortalPageContainer className="space-y-6">
      <PaymentAreaNavigation active="collections" />
      <section className="grid gap-3 md:grid-cols-2">
        <PaymentMetricCard label="Other Collections" value={String(totalCollections)} note="Gate passes, stickers, memberships, and bonds" icon={WalletCards} />
        <PaymentMetricCard label="Refundable Items" value={String(refundableCount)} note="Construction bonds and other refundable records" icon={WalletCards} tone={refundableCount ? "info" : "default"} />
      </section>

      <section className="rounded-3xl border border-pine-100 bg-white p-4 shadow-soft sm:p-5">
        <PortalSectionHeader eyebrow={`${totalCollections} records`} title="Collections & Bonds" action={<Pagination page={page} totalPages={totalPages} />} />
        <div className="space-y-3 md:hidden">
          {collections.map((item) => {
            const balance = item.refundable ? Number(item.amount) - Number(item.amountRefunded) - Number(item.amountForfeited) : 0;
            return <CollectionCard key={item.id} href={`/receipts/collection/${item.id}`} title={collectionLabel(item.type, item.description)} date={shortDate(item.collectionDate)} amount={money(item.amount)} refunded={money(item.amountRefunded)} balance={money(balance)} status={item.refundable ? item.refundStatus.replaceAll("_", " ") : "INCOME"} reference={item.receiptNumber || item.referenceNumber || "No reference"} remarks={item.remarks} />;
          })}
          {!collections.length && <PaymentEmptyState title="No collection records" description="Other fees, bonds, refunds, and collection receipts will appear here." />}
        </div>
        <div className="table-wrap hidden shadow-none md:block">
          <StandardTable><table className="data-table">
            <thead><tr><th>Type / remarks</th><th>Collection date</th><th>Amount</th><th>Refunded</th><th>Balance held</th><th>Status</th><th>Receipt / reference</th><th></th></tr></thead>
            <tbody>{collections.map((item) => {
              const balance = item.refundable ? Number(item.amount) - Number(item.amountRefunded) - Number(item.amountForfeited) : 0;
              return <tr key={item.id}><td><p className="font-bold">{collectionLabel(item.type, item.description)}</p><p className="text-xs text-slate-400">{item.refundable ? "Refundable bond" : "Association fee"}</p>{item.remarks && <p className="mt-1 max-w-sm whitespace-pre-wrap text-xs text-slate-600">{item.remarks}</p>}</td><td>{shortDate(item.collectionDate)}</td><td className="font-black">{money(item.amount)}</td><td>{money(item.amountRefunded)}</td><td>{money(balance)}</td><td><StatusBadge status={item.refundable ? item.refundStatus : "INCOME"} /></td><td><p className="font-mono text-xs font-bold">{item.receiptNumber || "-"}</p><p className="font-mono text-[10px] text-slate-400">Ref: {item.referenceNumber || "-"}</p></td><td><Link className="btn-secondary min-h-8 px-3 py-1" href={`/receipts/collection/${item.id}`} target="_blank"><Printer className="size-4" /> Receipt</Link></td></tr>;
            })}{!collections.length && <tr><td colSpan={8} className="py-12 text-center text-slate-500">No other collections are associated with your account.</td></tr>}</tbody>
          </table></StandardTable>
        </div>
      </section>
    </PortalPageContainer>
  );
}

function Pagination({ page, totalPages }: { page: number; totalPages: number }) {
  if (totalPages <= 1) return null;
  return <div className="flex gap-2 text-sm font-black"><Link aria-disabled={page <= 1} className={`rounded-xl px-3 py-2 ${page <= 1 ? "pointer-events-none bg-slate-100 text-slate-400" : "bg-pine-50 text-pine-700"}`} href={`/portal/collections?page=${page - 1}`}>Prev</Link><span className="rounded-xl bg-slate-100 px-3 py-2 text-slate-600">{page}/{totalPages}</span><Link aria-disabled={page >= totalPages} className={`rounded-xl px-3 py-2 ${page >= totalPages ? "pointer-events-none bg-slate-100 text-slate-400" : "bg-pine-50 text-pine-700"}`} href={`/portal/collections?page=${page + 1}`}>Next</Link></div>;
}
