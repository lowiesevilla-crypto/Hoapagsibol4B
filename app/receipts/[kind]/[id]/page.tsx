import { Role } from "@prisma/client";
import { ArrowLeft, Download, List } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AssociationLogo } from "@/components/association-logo";
import { PrintButton } from "@/components/print-button";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPaymentReceiptData } from "@/lib/services/payment-receipt";
import { getAssociationSettings } from "@/lib/system-settings";
import { amountInWords, collectionLabel, money, shortDate } from "@/lib/utils";

type ReceiptView = {
  number: string;
  date: Date;
  payer: string;
  homeownerId: string | null;
  address: string;
  property: string;
  account: string;
  purpose: string;
  amount: number;
  method: string;
  reference: string | null;
  remarks: string | null;
  processedBy: string;
  allocations: Array<{ id: string; coverage: string; amount: number; remainingBalance: number | null }>;
  allocationTotal: number;
  unappliedCredit: number;
  homeownerCreditBalance: number | null;
  remainingBalance: number | null;
};

export default async function ReceiptPage({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const user = await requireUser();
  const { kind, id } = await params;
  let receipt: ReceiptView | null = null;

  if (kind === "payment") {
    receipt = await getPaymentReceiptData(id);
  } else if (kind === "collection") {
    const item = await prisma.collection.findUnique({
      where: { id },
      include: { homeowner: { include: { user: true } }, contractor: true, createdBy: true },
    });
    if (item) {
      const purpose = collectionLabel(item.type, item.description);
      receipt = {
        number: item.receiptNumber || `AR-${item.id.slice(-8).toUpperCase()}`,
        date: item.collectionDate,
        payer: item.homeowner?.user.name ?? item.contractor?.companyName ?? "Unknown payer",
        homeownerId: item.homeownerId,
        address: item.homeowner?.address ?? item.contractor?.address ?? "",
        property: item.homeowner ? `Block ${item.homeowner.block}, Lot ${item.homeowner.lot}` : "Not applicable",
        account: item.homeownerId ?? item.contractorId ?? "Not applicable",
        purpose,
        amount: Number(item.amount),
        method: item.method,
        reference: item.referenceNumber,
        remarks: item.remarks,
        processedBy: item.createdBy.name,
        allocations: [{ id: item.id, coverage: purpose, amount: Number(item.amount), remainingBalance: null }],
        allocationTotal: Number(item.amount),
        unappliedCredit: 0,
        homeownerCreditBalance: null,
        remainingBalance: null,
      };
    }
  } else {
    notFound();
  }

  if (!receipt) notFound();
  if (user.role === Role.HOMEOWNER && user.homeownerProfile?.id !== receipt.homeownerId) redirect("/portal/dashboard");

  const association = await getAssociationSettings();
  const contactLine = [association.contactNumber && `Contact: ${association.contactNumber}`, association.email && `Email: ${association.email}`].filter(Boolean).join(" | ");
  const registrationLine = [association.tinNumber && `TIN: ${association.tinNumber}`, association.secRegistrationNumber && `SEC Reg. No.: ${association.secRegistrationNumber}`].filter(Boolean).join(" | ");

  return (
    <main className="print-document mx-auto min-h-screen max-w-4xl bg-white p-4 sm:p-8">
      <div className="print-hidden mb-5 flex flex-wrap justify-end gap-2">
        {kind === "payment" && user.role !== Role.HOMEOWNER && <Link className="btn-secondary" href="/admin/payments/record"><ArrowLeft className="size-4" /> Return to Record Payment</Link>}
        {kind === "payment" && user.role !== Role.HOMEOWNER && <Link className="btn-secondary" href="/admin/payments/active"><List className="size-4" /> Return to Payments</Link>}
        {kind === "payment" && user.role === Role.HOMEOWNER && <Link className="btn-secondary" href="/portal/payments"><ArrowLeft className="size-4" /> Return to My Payments</Link>}
        <Link className="btn-secondary" href={`/receipts/${kind}/${id}/pdf`}><Download className="size-4" /> Download PDF</Link>
        <PrintButton label="Print Receipt" />
      </div>
      <section className="border-2 border-ink p-4 sm:p-7">
        <header className="grid gap-4 border-b-2 border-ink pb-5 sm:grid-cols-[auto_1fr_auto] sm:items-center">
          <AssociationLogo className="size-20" src={association.logoUrl} alt={`${association.name} logo`} />
          <div className="text-center sm:text-left">
            <h1 className="text-lg font-black sm:text-2xl">{association.name}</h1>
            <p className="text-xs font-bold uppercase tracking-widest">Homeowners Association</p>
            <p className="mt-1 text-xs text-slate-500">Official Acknowledgement Receipt</p>
            {association.address && <p className="mt-1 text-xs text-slate-500">{association.address}</p>}
            {contactLine && <p className="text-xs text-slate-500">{contactLine}</p>}
            {registrationLine && <p className="text-xs text-slate-500">{registrationLine}</p>}
          </div>
          <div className="text-center sm:text-right">
            <p className="text-xs font-bold uppercase text-slate-500">Receipt No.</p>
            <p className="font-mono text-lg font-black text-rose-700 sm:text-xl">{receipt.number}</p>
            <p className="mt-1 text-sm"><b>Date:</b> {shortDate(receipt.date)}</p>
          </div>
        </header>

        <div className="space-y-4 py-6 text-sm sm:text-base">
          <Field label="Received from" value={receipt.payer} />
          <Field label="Address" value={receipt.address} />
          <Field label="Property / Account" value={`${receipt.property} | ${receipt.account}`} />
          <Field label="The sum of" value={amountInWords(receipt.amount)} />
          <Field label="Payment For" value={receipt.purpose} />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead><tr><th className="border border-ink p-2 text-left">Covered billing / particulars</th><th className="w-40 border border-ink p-2 text-right">Amount applied</th><th className="w-40 border border-ink p-2 text-right">Remaining bill balance</th></tr></thead>
            <tbody>
              {receipt.allocations.map((allocation) => <tr key={allocation.id}><td className="border border-ink p-3 font-bold">{allocation.coverage}</td><td className="border border-ink p-3 text-right font-black">{money(allocation.amount)}</td><td className="border border-ink p-3 text-right">{allocation.remainingBalance === null ? "-" : money(allocation.remainingBalance)}</td></tr>)}
              <tr><td className="border border-ink p-2 text-right font-black">AMOUNT APPLIED TO BILLS</td><td className="border border-ink p-2 text-right text-lg font-black">{money(receipt.allocationTotal)}</td><td className="border border-ink p-2" /></tr>
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid gap-2 border-y border-ink py-3 text-sm sm:grid-cols-2">
          <Field label="Total Amount Received" value={money(receipt.amount)} />
          <Field label="Amount Applied to Bills" value={money(receipt.allocationTotal)} />
          <Field label="Unapplied Credit" value={money(receipt.unappliedCredit)} />
          {receipt.homeownerCreditBalance !== null && <Field label="Homeowner Credit Balance" value={money(receipt.homeownerCreditBalance)} />}
        </div>

        {(receipt.remarks || receipt.reference) && <div className="mt-4 rounded border border-slate-300 p-3 text-sm">{receipt.remarks && <p><b>Remarks:</b> {receipt.remarks}</p>}{receipt.reference && <p><b>Reference:</b> {receipt.reference}</p>}</div>}
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Payment method</p><p className="mt-2 font-bold">{receipt.method.replaceAll("_", " ")}</p>{receipt.remainingBalance !== null && <p className="mt-3 text-sm"><b>Remaining account balance:</b> {money(receipt.remainingBalance)}</p>}</div>
          <div className="text-right"><p className="mb-10 text-xs text-slate-500">Received and acknowledged by:</p><div className="border-t border-ink pt-2 text-center text-xs"><b>{receipt.processedBy}</b><br />Authorized HOA processor</div></div>
        </div>
        <div className="mt-10 grid gap-10 text-center text-xs sm:grid-cols-2">
          <div className="border-t border-ink pt-2"><b>{receipt.payer}</b><br />Payer&apos;s signature / printed name</div>
          <div className="border-t border-ink pt-2"><b>{receipt.processedBy}</b><br />HOA processor signature / printed name</div>
        </div>
      </section>
    </main>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return <div className="grid gap-1 sm:grid-cols-[150px_1fr]"><span className="font-bold">{label}:</span><span className="min-h-6 border-b border-ink font-semibold">{value}</span></div>;
}
