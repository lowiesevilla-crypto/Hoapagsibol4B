import { Role } from "@prisma/client";
import { Download } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AssociationLogo } from "@/components/association-logo";
import { PrintButton } from "@/components/print-button";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { paymentCoverageDisplay } from "@/lib/payment-coverage";
import { getAssociationSettings } from "@/lib/system-settings";
import { amountInWords, collectionLabel, money, shortDate } from "@/lib/utils";

type ReceiptView = {
  number: string;
  date: Date;
  payer: string;
  address: string;
  purpose: string;
  particulars: string;
  amount: unknown;
  method: string;
  reference: string | null;
  remarks: string | null;
  processedBy: string;
};

export default async function ReceiptPage({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const user = await requireUser();
  const { kind, id } = await params;
  let receipt: ReceiptView | null = null;

  if (kind === "payment") {
    const payment = await prisma.payment.findFirst({
      where: { id, status: "ACTIVE" },
      include: { homeowner: { include: { user: true } }, bill: true, processedBy: true },
    });
    if (!payment) notFound();
    if (user.role === Role.HOMEOWNER && user.homeownerProfile?.id !== payment.homeownerId) redirect("/portal/dashboard");
    const coverage = paymentCoverageDisplay(payment);
    receipt = {
      number: payment.receiptNumber || `AR-${payment.id.slice(-8).toUpperCase()}`,
      date: payment.paymentDate,
      payer: payment.homeowner.user.name,
      address: payment.homeowner.address,
      purpose: coverage,
      particulars: coverage,
      amount: payment.amount,
      method: payment.method,
      reference: payment.referenceNumber,
      remarks: payment.remarks,
      processedBy: payment.processedBy?.name ?? "Authorized HOA Treasurer / Collector",
    };
  } else if (kind === "collection") {
    const item = await prisma.collection.findUnique({
      where: { id },
      include: { homeowner: { include: { user: true } }, contractor: true, createdBy: true },
    });
    if (!item) notFound();
    if (user.role === Role.HOMEOWNER && user.homeownerProfile?.id !== item.homeownerId) redirect("/portal/dashboard");
    receipt = {
      number: item.receiptNumber || `AR-${item.id.slice(-8).toUpperCase()}`,
      date: item.collectionDate,
      payer: item.homeowner?.user.name ?? item.contractor?.companyName ?? "Unknown payer",
      address: item.homeowner?.address ?? item.contractor?.address ?? "",
      purpose: collectionLabel(item.type, item.description),
      particulars: collectionLabel(item.type, item.description),
      amount: item.amount,
      method: item.method,
      reference: item.referenceNumber,
      remarks: item.remarks,
      processedBy: item.createdBy.name,
    };
  } else {
    notFound();
  }

  const association = await getAssociationSettings();
  const amount = Number(receipt.amount);
  const contactLine = [association.contactNumber && `Contact: ${association.contactNumber}`, association.email && `Email: ${association.email}`].filter(Boolean).join(" | ");
  const registrationLine = [association.tinNumber && `TIN: ${association.tinNumber}`, association.secRegistrationNumber && `SEC Reg. No.: ${association.secRegistrationNumber}`].filter(Boolean).join(" | ");

  return (
    <main className="print-document mx-auto min-h-screen max-w-4xl bg-white p-4 sm:p-8">
      <div className="print-hidden mb-5 flex flex-wrap justify-end gap-2"><Link className="btn-secondary" href={`/receipts/${kind}/${id}/pdf`}><Download className="size-4" /> Download PDF</Link><PrintButton label="Print acknowledgement receipt" /></div>
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
          <Field label="The sum of" value={amountInWords(amount)} />
          <Field label="Payment For" value={receipt.purpose} />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead><tr><th className="border border-ink p-2 text-left">Particulars</th><th className="w-40 border border-ink p-2 text-right">Amount</th></tr></thead>
            <tbody>
              <tr><td className="h-24 border border-ink p-3 align-top"><p className="font-bold">{receipt.particulars}</p>{receipt.remarks && <p className="mt-2 text-slate-600">{receipt.remarks}</p>}{receipt.reference && <p className="mt-2 text-xs">Reference: {receipt.reference}</p>}</td><td className="border border-ink p-3 text-right align-top text-lg font-black">{money(amount)}</td></tr>
              <tr><td className="border border-ink p-2 text-right font-black">TOTAL</td><td className="border border-ink p-2 text-right text-lg font-black">{money(amount)}</td></tr>
            </tbody>
          </table>
        </div>

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Payment method</p><p className="mt-2 font-bold">{receipt.method.replaceAll("_", " ")}</p>{receipt.reference && <p className="text-sm">Reference: {receipt.reference}</p>}</div>
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
