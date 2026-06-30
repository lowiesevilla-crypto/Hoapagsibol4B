import Link from "next/link";
import { QrCode } from "lucide-react";
import { BillRemarks } from "@/components/bill-remarks";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { refreshOverdueBills } from "@/lib/actions/billing";
import { prisma } from "@/lib/db";
import { requireHomeownerProfile } from "@/lib/portal";
import { money, monthLabel, shortDate } from "@/lib/utils";

export default async function PortalBillingPage() {
  const profile = await requireHomeownerProfile();
  await refreshOverdueBills();
  const bills = await prisma.bill.findMany({ where: { homeownerId: profile.id, archivedAt: null }, orderBy: { billingMonth: "desc" } });
  return <><PageHeader eyebrow="My account" title="Billing history" description="Every dues statement tied exclusively to your property." action={<Link className="btn-primary" href="/portal/pay"><QrCode className="size-4" /> Pay by QR</Link>} /><div className="table-wrap"><table className="data-table"><thead><tr><th>Billing month</th><th>Remarks</th><th>Due date</th><th>Base dues</th><th>Penalty</th><th>Paid</th><th>Balance</th><th>Status</th><th></th></tr></thead><tbody>{bills.map((bill) => <tr key={bill.id}><td className="font-bold">{monthLabel(bill.billingMonth)}</td><td><BillRemarks notes={bill.notes} /></td><td>{shortDate(bill.dueDate)}</td><td>{money(bill.amount)}</td><td>{money(bill.penalty)}</td><td>{money(bill.amountPaid)}</td><td className="font-black">{money(bill.balance)}</td><td><StatusBadge status={bill.status} /></td><td>{Number(bill.balance) > 0 && <Link className="btn-secondary min-h-8 px-3 py-1" href="/portal/pay"><QrCode className="size-4" /> Pay</Link>}</td></tr>)}{!bills.length && <tr><td colSpan={9} className="py-12 text-center text-slate-500">No billing history yet.</td></tr>}</tbody></table></div></>;
}
