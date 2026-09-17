import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AssociationLogo } from "@/components/association-logo";
import { PrintButton } from "@/components/print-button";
import { requirePermission } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import { bondRefundReference } from "@/lib/bond-refund-reference";
import { prisma } from "@/lib/db";
import { homeownerAccountNumber, homeownerPropertyLabel } from "@/lib/homeowner-account";
import { getAssociationSettings } from "@/lib/system-settings";
import { roleLabel } from "@/lib/tenant-roles";
import { collectionLabel, money, receiptDateTime, shortDate } from "@/lib/utils";

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

  const association = await getAssociationSettings(refund.tenantId);
  const collection = refund.collection;
  const payer = collection.homeowner?.user.name ?? collection.contractor?.companyName ?? collection.payerName ?? "Unknown payer";
  const address = collection.homeowner?.address ?? collection.contractor?.address ?? "";
  const property = collection.homeowner
    ? `${homeownerPropertyLabel(collection.homeowner)} | Account ${homeownerAccountNumber(collection.homeowner)}`
    : collection.contractor
      ? `Contractor account | ${collection.contractor.companyName}`
      : collection.payerType.replaceAll("_", " ");
  const refundNumber = bondRefundReference(refund.id, refund.refundDate);
  const contactLine = [association.contactNumber && `Contact: ${association.contactNumber}`, association.email && `Email: ${association.email}`].filter(Boolean).join(" | ");
  const registrationLine = [association.tinNumber && `TIN: ${association.tinNumber}`, association.secRegistrationNumber && `SEC Reg. No.: ${association.secRegistrationNumber}`].filter(Boolean).join(" | ");

  return (
    <main className="print-document mx-auto min-h-screen max-w-4xl bg-white p-4 sm:p-8">
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
            <p className="mt-1 text-xs text-slate-500">Official Bond Refund Receipt</p>
            {association.address && <p className="mt-1 text-xs text-slate-500">{association.address}</p>}
            {contactLine && <p className="text-xs text-slate-500">{contactLine}</p>}
            {registrationLine && <p className="text-xs text-slate-500">{registrationLine}</p>}
          </div>
          <div className="text-center sm:text-right">
            <p className="text-xs font-bold uppercase text-slate-500">Refund Ref.</p>
            <p className="font-mono text-lg font-black text-rose-700 sm:text-xl">{refundNumber}</p>
            <p className="mt-1 text-sm"><b>Refund date:</b> {shortDate(refund.refundDate)}</p>
            <p className="mt-1 text-xs font-black uppercase text-emerald-700">Processed</p>
          </div>
        </header>

        <div className="space-y-4 py-6 text-sm sm:text-base">
          <Field label="Refunded to" value={payer} />
          <Field label="Address" value={address || "-"} />
          <Field label="Property / Account" value={property} />
          <Field label="Bond type" value={collectionLabel(collection.type, collection.description)} />
          <Field label="Original receipt" value={collection.receiptNumber || `AR-${collection.id.slice(-8).toUpperCase()}`} />
        </div>

        <div className="grid gap-3 border-y border-ink py-4 text-sm sm:grid-cols-2 sm:text-base">
          <Field label="Original bond amount" value={money(collection.amount)} />
          <Field label="Refund amount" value={money(refund.amount)} />
          <Field label="Refund method" value={refund.method.replaceAll("_", " ")} />
          <Field label="External reference" value={refund.referenceNumber || "-"} />
        </div>

        {refund.remarks && <div className="mt-4 rounded border border-slate-300 p-3 text-sm"><b>Remarks:</b> {refund.remarks}</div>}

        <div className="mt-10 grid gap-10 text-center text-xs sm:grid-cols-2">
          <div className="border-t border-ink pt-2">
            <b>{payer}</b><br />
            Recipient&apos;s signature / printed name<br />
            <span className="text-slate-500">Refund date: {shortDate(refund.refundDate)}</span>
          </div>
          <div className="border-t border-ink pt-2">
            <b>{refund.processedBy.name || "Authorized HOA Processor"}</b><br />
            {roleLabel(refund.processedBy.role)}<br />
            <span className="text-slate-500">Processed on: {receiptDateTime(refund.createdAt)}</span>
          </div>
        </div>
      </section>
    </main>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return <div className="grid gap-1 sm:grid-cols-[170px_1fr]"><span className="font-bold">{label}:</span><span className="min-h-6 border-b border-ink font-semibold">{value}</span></div>;
}
