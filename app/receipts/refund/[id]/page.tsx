import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AssociationLogo } from "@/components/association-logo";
import { PrintButton } from "@/components/print-button";
import { requirePermission } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import { bondRefundReference } from "@/lib/bond-refund-reference";
import { prisma } from "@/lib/db";
import { collectionLabel, money, receiptDateTime, shortDate } from "@/lib/utils";
import { getAssociationSettings } from "@/lib/system-settings";

export default async function BondRefundReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePermission(Permission.COLLECTIONS_REFUND);
  const { id } = await params;
  const refund = await prisma.bondRefund.findFirst({
    where: { id, tenantId: admin.tenantId },
    include: {
      collection: { include: { homeowner: { include: { user: true } }, contractor: true } },
      processedBy: true,
    },
  });
  if (!refund) notFound();

  const association = await getAssociationSettings(admin.tenantId);
  const payer = refund.collection.homeowner?.user.name ?? refund.collection.contractor?.companyName ?? refund.collection.payerName ?? "Unknown payer";
  const originalAmount = Number(refund.collection.amount);
  const refundedTotal = Number(refund.collection.amountRefunded);
  const forfeitedTotal = Number(refund.collection.amountForfeited);
  const remaining = Math.max(0, originalAmount - refundedTotal - forfeitedTotal);
  const refundNumber = bondRefundReference(refund.id, refund.refundDate);

  return <main className="print-document mx-auto min-h-screen max-w-4xl bg-white p-4 sm:p-8">
    <div className="print-hidden mb-5 flex flex-wrap justify-end gap-2">
      <Link className="btn-secondary min-h-12" href="/admin/collections"><ArrowLeft className="size-4" /> Return to Collections</Link>
      <PrintButton label="Print Refund Receipt" />
    </div>

    <section className="border-2 border-ink p-4 sm:p-7">
      <header className="grid gap-4 border-b-2 border-ink pb-5 sm:grid-cols-[auto_1fr_auto] sm:items-center">
        <AssociationLogo className="size-20" src={association.logoUrl} alt={`${association.name} logo`} />
        <div className="text-center sm:text-left">
          <h1 className="text-lg font-black sm:text-2xl">{association.name}</h1>
          <p className="text-xs font-bold uppercase tracking-widest">Homeowners Association</p>
          <p className="mt-1 text-xs text-slate-500">Bond Refund Acknowledgement</p>
          {association.address && <p className="mt-1 text-xs text-slate-500">{association.address}</p>}
        </div>
        <div className="text-center sm:text-right">
          <p className="text-xs font-bold uppercase text-slate-500">Refund No.</p>
          <p className="font-mono text-lg font-black text-rose-700 sm:text-xl">{refundNumber}</p>
          <p className="mt-1 text-sm"><b>Date:</b> {shortDate(refund.refundDate)}</p>
        </div>
      </header>

      <div className="space-y-4 py-6 text-sm sm:text-base">
        <Field label="Refunded to" value={payer} />
        <Field label="Bond type" value={collectionLabel(refund.collection.type, refund.collection.description)} />
        <Field label="Original receipt" value={refund.collection.receiptNumber || "-"} />
        <Field label="Refund amount" value={money(refund.amount)} />
        <Field label="Refund method" value={refund.method.replaceAll("_", " ")} />
        <Field label="External reference" value={refund.referenceNumber || "-"} />
        <Field label="Remaining bond balance" value={money(remaining)} />
        {refund.remarks && <Field label="Remarks" value={refund.remarks} />}
      </div>

      <div className="mt-10 grid gap-10 text-center text-xs sm:grid-cols-2">
        <div className="border-t border-ink pt-2"><b>{payer}</b><br />Recipient acknowledgement</div>
        <div className="border-t border-ink pt-2"><b>{refund.processedBy.name}</b><br />Authorized HOA Processor<br /><span className="text-slate-500">Processed on: {receiptDateTime(refund.createdAt)}</span></div>
      </div>
    </section>
  </main>;
}

function Field({ label, value }: { label: string; value: string }) {
  return <div className="grid gap-1 sm:grid-cols-[180px_1fr]"><span className="font-bold">{label}:</span><span className="min-h-6 border-b border-ink font-semibold">{value}</span></div>;
}
