import { ArrowLeft, Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AssociationLogo } from "@/components/association-logo";
import { PettyCashDeleteButton } from "@/components/petty-cash-delete-button";
import { PrintButton } from "@/components/print-button";
import { requirePermission } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import { requirePettyCashFeature } from "@/lib/petty-cash/entitlement";
import { getPettyCashVoucher } from "@/lib/petty-cash/service";
import { getAssociationSettings } from "@/lib/system-settings";
import { amountInWords, money, shortDate } from "@/lib/utils";

export default async function PettyCashVoucherPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ success?: string; error?: string }> }) {
  const admin = await requirePermission(Permission.EXPENSES_MANAGE);
  await requirePettyCashFeature(admin.tenantId);
  const { id } = await params;
  const query = await searchParams;
  const [record, association] = await Promise.all([getPettyCashVoucher(id, admin.tenantId), getAssociationSettings(admin.tenantId)]);
  if (!record) notFound();
  const { voucher, items } = record;
  const registrationLine = [association.tinNumber && `TIN: ${association.tinNumber}`, association.secRegistrationNumber && `SEC Reg. No.: ${association.secRegistrationNumber}`].filter(Boolean).join(" · ");
  const contactLine = [association.contactNumber, association.email].filter(Boolean).join(" · ");

  return <>
    <style>{`
      @media print {
        @page { size: A4 portrait; margin: 0; }
        html, body { width: 210mm !important; min-width: 210mm !important; min-height: 297mm !important; margin: 0 !important; padding: 0 !important; background: #fff !important; }
        .petty-cash-print { width: 210mm !important; max-width: 210mm !important; height: 148.5mm !important; max-height: 148.5mm !important; margin: 0 !important; padding: 3mm !important; overflow: hidden !important; box-sizing: border-box !important; font-size: 7.5pt !important; line-height: 1.1 !important; }
        .petty-cash-print section { height: 142.5mm !important; max-height: 142.5mm !important; padding: 3mm !important; overflow: hidden !important; box-shadow: none !important; }
        .petty-cash-print header { padding-bottom: 1.5mm !important; gap: 2mm !important; }
        .petty-cash-print header > :first-child { width: 13mm !important; height: 13mm !important; }
        .petty-cash-print .mt-3 { margin-top: 1.5mm !important; }
        .petty-cash-print .mt-4 { margin-top: 2mm !important; }
        .petty-cash-print .mt-5 { margin-top: 2.5mm !important; }
        .petty-cash-print .mt-7 { margin-top: 4mm !important; }
        .petty-cash-print .gap-8 { gap: 8mm !important; }
        .petty-cash-print table { margin-top: 2mm !important; font-size: 7pt !important; line-height: 1.05 !important; }
        .petty-cash-print th, .petty-cash-print td { padding: 0.8mm 1.2mm !important; }
        .petty-cash-print footer { margin-top: 2mm !important; padding-top: 1mm !important; font-size: 5.5pt !important; line-height: 1.05 !important; }
        .petty-cash-print h2 { font-size: 13pt !important; line-height: 1 !important; }
        .petty-cash-print dl { gap: 0.8mm !important; }
      }
    `}</style>
    <div className="petty-cash-print mx-auto max-w-[210mm]">
      <div className="print-hidden mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <Link className="btn-secondary inline-flex min-h-11 items-center justify-center gap-2" href="/admin/petty-cash"><ArrowLeft className="size-4" /> Voucher register</Link>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link className="btn-secondary inline-flex min-h-11 items-center justify-center gap-2" href={`/admin/petty-cash/${voucher.id}/edit`}><Pencil className="size-4" /> Edit</Link>
          <PettyCashDeleteButton voucherId={voucher.id} />
          <PrintButton label="Print Half-A4 Voucher" />
        </div>
      </div>
      {query.success && <div className="print-hidden mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">{query.success === "updated" ? "Voucher updated successfully. Linked expense entries were synchronized." : "Voucher posted successfully. Expense entries were created automatically."}</div>}
      {query.error && <div className="print-hidden mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-900">{query.error}</div>}

      <section className="border-2 border-slate-900 bg-white p-4 shadow-sm print:p-[3mm]">
        <header className="grid grid-cols-[16mm_minmax(0,1fr)] items-center gap-3 border-b-2 border-slate-900 pb-3">
          <AssociationLogo className="size-14" src={association.logoUrl} alt={`${association.name} logo`} />
          <div className="min-w-0 text-center">
            <h1 className="text-base font-black leading-tight text-slate-950">{association.name}</h1>
            {association.address && <p className="mt-0.5 text-[10px] leading-4 text-slate-600">{association.address}</p>}
            {contactLine && <p className="text-[9px] leading-4 text-slate-500">{contactLine}</p>}
            {registrationLine && <p className="text-[9px] font-semibold leading-4 text-slate-600">{registrationLine}</p>}
          </div>
        </header>

        <div className="mt-3 grid grid-cols-[1fr_auto] items-start gap-3">
          <div><p className="text-[10px] font-black uppercase tracking-[.18em] text-slate-500">Official disbursement record</p><h2 className="mt-1 text-xl font-black text-slate-950">PETTY CASH VOUCHER</h2></div>
          <div className="text-right"><p className="text-[9px] font-black uppercase text-slate-500">Voucher no.</p><p className="font-mono text-sm font-black text-rose-700">{voucher.voucherNumber}</p><p className="mt-1 text-[10px]"><b>Date:</b> {shortDate(voucher.transactionDate)}</p></div>
        </div>

        <dl className="mt-4 grid gap-2 text-[11px]">
          <InfoLine label="Name" value={voucher.payeeName} />
          <InfoLine label="Address" value={voucher.address || "Not provided"} />
          <InfoLine label="Payee Type" value={voucher.payeeType.replaceAll("_", " ")} />
        </dl>

        <table className="mt-4 w-full border-collapse text-[10px]">
          <thead><tr className="bg-slate-100"><th className="border border-slate-900 px-2 py-1.5 text-left">Particular</th><th className="w-[34mm] border border-slate-900 px-2 py-1.5 text-right">Amount</th></tr></thead>
          <tbody>{items.map((item) => <tr key={item.id}><td className="border border-slate-900 px-2 py-1.5 font-semibold">{item.particular}</td><td className="border border-slate-900 px-2 py-1.5 text-right font-black">{money(Number(item.amount))}</td></tr>)}<tr><td className="border border-slate-900 px-2 py-2 text-right font-black">TOTAL AMOUNT</td><td className="border border-slate-900 px-2 py-2 text-right text-xs font-black">{money(Number(voucher.totalAmount))}</td></tr></tbody>
        </table>
        <p className="mt-2 text-[9px] leading-4 text-slate-600"><b>Amount in words:</b> {amountInWords(Number(voucher.totalAmount))}</p>

        {voucher.employeeLoanId && <div className="mt-3 border border-slate-400 bg-slate-50 p-2 text-[9px] leading-4"><p className="font-black uppercase tracking-wide text-slate-700">Employee Cash Advance · Payroll Schedule</p><p className="mt-0.5">Employee: <b>{voucher.employeeName || "Employee record"}</b> · Deduction per cutoff: <b>{money(Number(voucher.deductionPerCutoff || 0))}</b></p><p>Employee Loan Ref.: <span className="font-mono">{voucher.employeeLoanId}</span></p></div>}

        <div className="mt-7 grid grid-cols-2 gap-8 text-center text-[9px]">
          <div><div className="border-t border-slate-900 pt-1.5"><b className="text-[10px]">{voucher.approvedByName}</b><br />{voucher.approvedByTitle || (voucher.approvedByType === "ADMIN" ? "Administrator" : "Authorized Officer")}<br /><span className="text-slate-500">Approved By</span></div></div>
          <div><div className="border-t border-slate-900 pt-1.5"><b className="text-[10px]">{voucher.receivedBy}</b><br /><span className="text-slate-500">Received By / Signature</span></div></div>
        </div>

        <footer className="mt-5 border-t border-slate-300 pt-2 text-[8px] leading-3 text-slate-500"><p>This voucher is system-numbered and recorded in HOAHub. Each particular is posted to the tenant expense ledger under the voucher number above.</p><p className="mt-1">Recorded by: {voucher.createdByName} · Status: {voucher.status}</p></footer>
      </section>
    </div>
  </>;
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return <div className="grid grid-cols-[24mm_minmax(0,1fr)] items-end gap-2"><dt className="font-black uppercase text-slate-600">{label}</dt><dd className="min-h-5 border-b border-slate-700 pb-0.5 font-semibold text-slate-950">{value}</dd></div>;
}
