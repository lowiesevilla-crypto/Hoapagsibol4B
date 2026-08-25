import { StandardTable } from "@/components/standard-table";
import { CalendarDays, CircleDollarSign, CreditCard, HandCoins, Megaphone } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { refreshOverdueBills } from "@/lib/actions/billing";
import { prisma } from "@/lib/db";
import { requireHomeownerProfile } from "@/lib/portal";
import { money, monthLabel, shortDate } from "@/lib/utils";

export default async function PortalDashboard() {
  const profile = await requireHomeownerProfile();
  await refreshOverdueBills();
  const now = new Date();
  const [balance, bills, paymentTotal, bondTotals, announcement, event] = await Promise.all([
    prisma.bill.aggregate({ _sum: { balance: true }, where: { homeownerId: profile.id, balance: { gt: 0 }, archivedAt: null } }),
    prisma.bill.findMany({ take: 5, where: { homeownerId: profile.id, archivedAt: null }, orderBy: { billingMonth: "desc" } }),
    prisma.payment.aggregate({ _sum: { amount: true }, where: { homeownerId: profile.id, status: "ACTIVE" } }),
    prisma.collection.aggregate({ _sum: { amount: true, amountRefunded: true, amountForfeited: true }, where: { homeownerId: profile.id, refundable: true } }),
    prisma.announcement.findFirst({ orderBy: { createdAt: "desc" } }),
    prisma.event.findFirst({ where: { eventDate: { gte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) } }, orderBy: { eventDate: "asc" } }),
  ]);
  const bondsHeld = Number(bondTotals._sum.amount ?? 0) - Number(bondTotals._sum.amountRefunded ?? 0) - Number(bondTotals._sum.amountForfeited ?? 0);
  return <><PageHeader eyebrow="Homeowner portal" title={`Hello, ${profile.user.name.split(" ")[0]}`} description={`Block ${profile.block}, Lot ${profile.lot} account overview.`} />
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><StatCard label="Current balance" value={money(balance._sum.balance ?? 0)} note="Across all open bills" icon={CircleDollarSign} /><StatCard label="Total dues payments" value={money(paymentTotal._sum.amount ?? 0)} note="All recorded receipts" icon={CreditCard} /><StatCard label="Refundable bonds held" value={money(bondsHeld)} note="Construction bond balance" icon={HandCoins} /><StatCard label="Latest announcement" value={announcement ? shortDate(announcement.createdAt) : "None yet"} note={announcement?.title} icon={Megaphone} /><StatCard label="Next event" value={event ? shortDate(event.eventDate) : "None scheduled"} note={event?.title} icon={CalendarDays} /></section>
    <section className="card mt-6"><h2 className="text-lg font-black">Recent billing</h2><p className="mb-4 text-sm text-slate-500">Your five latest monthly statements.</p><div className="table-wrap shadow-none"><StandardTable><table className="data-table"><thead><tr><th>Billing month</th><th>Due date</th><th>Status</th><th>Total</th><th>Balance</th></tr></thead><tbody>{bills.map((bill) => <tr key={bill.id}><td className="font-bold">{monthLabel(bill.billingMonth)}</td><td>{shortDate(bill.dueDate)}</td><td><StatusBadge status={bill.status} /></td><td>{money(bill.totalAmount)}</td><td className="font-black">{money(bill.balance)}</td></tr>)}{!bills.length && <tr><td colSpan={5} className="py-10 text-center text-slate-500">No bills are associated with your account.</td></tr>}</tbody></table></StandardTable></div></section>
  </>;
}
