import Link from "next/link";
import { Paperclip, Printer } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db";
import { paymentCoverageLabel } from "@/lib/payment-coverage";
import { requireHomeownerProfile } from "@/lib/portal";
import { money, shortDate } from "@/lib/utils";

export default async function PortalPaymentsPage() {
  const profile = await requireHomeownerProfile();
  const payments = await prisma.payment.findMany({ where: { homeownerId: profile.id, status: "ACTIVE" }, include: { bill: true }, orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }] });
  return <><PageHeader eyebrow="My account" title="Payment and receipt history" description="Official monthly dues receipts recorded by the HOA for your household." /><div className="table-wrap"><table className="data-table"><thead><tr><th>Receipt / reference</th><th>Payment Coverage</th><th>Date</th><th>Method</th><th>Remarks</th><th>Proof</th><th className="text-right">Amount</th><th></th></tr></thead><tbody>{payments.map((payment) => <tr key={payment.id}><td><p className="font-mono text-xs font-bold text-pine-700">{payment.receiptNumber || "Legacy receipt"}</p><p className="font-mono text-[10px] text-slate-400">Ref: {payment.referenceNumber || "Not required"}</p></td><td className="font-bold">{paymentCoverageLabel(payment)}</td><td>{shortDate(payment.paymentDate)}</td><td>{payment.method.replaceAll("_", " ")}</td><td className="max-w-xs whitespace-pre-wrap text-slate-500">{payment.remarks || "-"}</td><td>{payment.proofUrl ? <a className="inline-flex items-center gap-1 text-xs font-bold text-pine-700" href={payment.proofUrl} target="_blank" rel="noreferrer"><Paperclip className="size-3" /> With Proof of Payment</a> : <span className="text-xs font-semibold text-slate-400">No Attachment</span>}</td><td className="text-right font-black text-pine-700">{money(payment.amount)}</td><td><Link className="btn-secondary min-h-8 px-3 py-1" href={`/receipts/payment/${payment.id}`} target="_blank"><Printer className="size-4" /> Receipt</Link></td></tr>)}{!payments.length && <tr><td colSpan={8} className="py-12 text-center text-slate-500">No payments have been recorded for your account.</td></tr>}</tbody></table></div></>;
}
