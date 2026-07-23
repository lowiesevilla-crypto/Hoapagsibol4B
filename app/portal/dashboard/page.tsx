import Link from "next/link";
import { TenantModule } from "@prisma/client";
import type { LucideIcon } from "lucide-react";
import { CalendarDays, CarFront, CircleDollarSign, CreditCard, FileText, HandCoins, Megaphone, MessageSquare, QrCode, ReceiptText } from "lucide-react";
import { PortalEmptyState, PortalMobileListItem, PortalPageContainer, PortalQuickActionTile, PortalSectionHeader, PortalSummaryCard } from "@/components/portal-mobile-shell";
import { StatusBadge } from "@/components/status-badge";
import { refreshOverdueBills } from "@/lib/actions/billing";
import { getAppUrl } from "@/lib/app-url";
import { prisma } from "@/lib/db";
import { requireHomeownerProfile } from "@/lib/portal";
import { getStatementOfAccount } from "@/lib/services/statement-of-account";
import { documentTypeLabel } from "@/lib/services/documents";
import { getEnabledTenantModules } from "@/lib/tenant";
import { collectionLabel, money, monthLabel, shortDate } from "@/lib/utils";

export default async function PortalDashboard() {
  const profile = await requireHomeownerProfile();
  await refreshOverdueBills();
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const [soa, openBills, recentBills, bondTotals, announcement, event, documentRequest, paymentRequest, enabledModules] = await Promise.all([
    getStatementOfAccount(profile.id, profile.tenantId, getAppUrl()),
    prisma.bill.findMany({ take: 3, where: { tenantId: profile.tenantId, homeownerId: profile.id, balance: { gt: 0 }, archivedAt: null }, orderBy: [{ dueDate: "asc" }, { billingMonth: "desc" }] }),
    prisma.bill.findMany({ take: 5, where: { tenantId: profile.tenantId, homeownerId: profile.id, archivedAt: null }, orderBy: { billingMonth: "desc" } }),
    prisma.collection.aggregate({ _sum: { amount: true, amountRefunded: true, amountForfeited: true }, where: { tenantId: profile.tenantId, homeownerId: profile.id, refundable: true } }),
    prisma.announcement.findFirst({ where: { tenantId: profile.tenantId, status: "PUBLISHED" }, orderBy: { createdAt: "desc" } }),
    prisma.event.findFirst({ where: { tenantId: profile.tenantId, status: "PUBLISHED", eventDate: { gte: today } }, orderBy: { eventDate: "asc" } }),
    prisma.documentRequest.findFirst({ where: { tenantId: profile.tenantId, homeownerId: profile.id, archivedAt: null, status: { in: ["SUBMITTED", "PENDING_PAYMENT", "PAYMENT_CONFIRMED", "PENDING_APPROVAL", "UNDER_REVIEW", "APPROVED", "GENERATING", "ISSUED", "GENERATED"] } }, include: { definition: true, configuration: true }, orderBy: { requestedAt: "desc" } }),
    prisma.paymentRequest.findFirst({ where: { tenantId: profile.tenantId, homeownerId: profile.id, status: "PENDING_REVIEW" }, orderBy: { createdAt: "desc" } }),
    getEnabledTenantModules(profile.tenantId),
  ]);
  const bondsHeld = Number(bondTotals._sum.amount ?? 0) - Number(bondTotals._sum.amountRefunded ?? 0) - Number(bondTotals._sum.amountForfeited ?? 0);
  const latestPayment = soa.paymentHistory.find((payment) => payment.status === "Active");
  const nextDue = openBills[0];
  const quickActions = [
    enabledModules.has(TenantModule.BILLING) && { href: "/portal/pay", label: "Pay Dues", description: "Submit a QR payment for open balances.", icon: QrCode },
    enabledModules.has(TenantModule.BILLING) && { href: "/portal/soa", label: "View SOA", description: "Review your account summary and ledger.", icon: ReceiptText },
    enabledModules.has(TenantModule.BILLING) && { href: "/portal/payments", label: "Receipts", description: "Open payment history and receipts.", icon: CreditCard },
    enabledModules.has(TenantModule.DOCUMENTS) && { href: "/portal/documents", label: "Request Document", description: "Track certificates, passes, and clearances.", icon: FileText },
    enabledModules.has(TenantModule.ANNOUNCEMENTS) && { href: "/portal/announcements", label: "Announcements", description: "Read the latest HOA notices.", icon: Megaphone },
    enabledModules.has(TenantModule.CHAT) && { href: "/portal/chat", label: "Chat", description: "Message the HOA office.", icon: MessageSquare },
    enabledModules.has(TenantModule.VEHICLES) && { href: "/portal/vehicles", label: "Vehicles", description: "Review registered vehicles and stickers.", icon: CarFront },
    enabledModules.has(TenantModule.EVENTS) && { href: "/portal/events", label: "Events", description: "See upcoming community events.", icon: CalendarDays },
  ].filter(Boolean) as Array<{ href: string; label: string; description: string; icon: LucideIcon }>;

  return <PortalPageContainer className="space-y-6">
    <section className="overflow-hidden rounded-[2rem] border border-pine-100 bg-gradient-to-br from-pine-900 via-pine-700 to-pine-600 p-5 text-white shadow-brand sm:p-7">
      <p className="text-xs font-black uppercase tracking-[.18em] text-leaf-100">Homeowner portal</p>
      <div className="mt-3 grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <h1 className="break-words text-3xl font-black tracking-tight sm:text-4xl">Hello, {profile.user.name.split(" ")[0]}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-pine-50">Block {profile.block}, Lot {profile.lot} account overview with tenant-scoped balances, requests, and community updates.</p>
        </div>
        <div className="rounded-3xl bg-white/10 p-4 ring-1 ring-white/15">
          <p className="text-xs font-bold uppercase text-leaf-100">Collection status</p>
          <p className="mt-1 text-2xl font-black">{soa.summary.collectionStatus}</p>
        </div>
      </div>
    </section>

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <PortalSummaryCard label="Outstanding balance" value={money(soa.summary.currentOutstandingBalance)} note="From your current SOA" icon={CircleDollarSign} tone={soa.summary.currentOutstandingBalance > 0 ? "warning" : "success"} href="/portal/soa" />
      <PortalSummaryCard label="Available credit" value={money(soa.summary.availableCredit)} note="Unapplied homeowner credit" icon={HandCoins} tone={soa.summary.availableCredit > 0 ? "success" : "default"} href="/portal/payments" />
      <PortalSummaryCard label="Last payment" value={latestPayment ? money(latestPayment.amount) : "None yet"} note={latestPayment ? `${shortDate(latestPayment.paymentDate)} · ${latestPayment.officialReceiptNo}` : "No active receipts recorded"} icon={CreditCard} href="/portal/payments" />
      <PortalSummaryCard label="Next due date" value={nextDue ? shortDate(nextDue.dueDate) : "No open dues"} note={nextDue ? `${monthLabel(nextDue.billingMonth)} · ${money(nextDue.balance)}` : "Your open billing queue is clear"} icon={CalendarDays} href="/portal/billing" />
    </section>

    <section>
      <PortalSectionHeader eyebrow="Fast actions" title="What would you like to do?" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{quickActions.map((action) => <PortalQuickActionTile key={action.href} {...action} />)}</div>
    </section>

    <section className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
      <div className="rounded-3xl border border-pine-100 bg-white p-4 shadow-soft sm:p-5">
        <PortalSectionHeader eyebrow="Billing" title="Recent billing" action={<Link className="text-sm font-black text-pine-700 hover:text-pine-900" href="/portal/billing">View all</Link>} />
        <div className="space-y-3 md:hidden">
          {recentBills.map((bill) => <PortalMobileListItem key={bill.id} title={monthLabel(bill.billingMonth)} meta={`${shortDate(bill.dueDate)} · ${bill.status.replaceAll("_", " ")}`} value={money(bill.balance)} icon={ReceiptText} />)}
          {!recentBills.length && <PortalEmptyState title="No bills yet" description="No billing history is associated with your account." />}
        </div>
        <div className="table-wrap hidden shadow-none md:block"><table className="data-table"><thead><tr><th>Billing month</th><th>Due date</th><th>Status</th><th>Total</th><th>Balance</th></tr></thead><tbody>{recentBills.map((bill) => <tr key={bill.id}><td className="font-bold">{monthLabel(bill.billingMonth)}</td><td>{shortDate(bill.dueDate)}</td><td><StatusBadge status={bill.status} /></td><td>{money(bill.totalAmount)}</td><td className="font-black">{money(bill.balance)}</td></tr>)}{!recentBills.length && <tr><td colSpan={5} className="py-10 text-center text-slate-500">No bills are associated with your account.</td></tr>}</tbody></table></div>
      </div>

      <div className="space-y-5">
        <section className="rounded-3xl border border-pine-100 bg-white p-4 shadow-soft sm:p-5">
          <PortalSectionHeader eyebrow="Community" title="Latest updates" />
          <div className="space-y-3">
            {announcement ? <PortalMobileListItem title={announcement.title} meta={`Announcement · ${shortDate(announcement.createdAt)}`} href={`/portal/announcements/${announcement.id}`} icon={Megaphone} /> : <PortalEmptyState title="No announcements" description="Published HOA notices will appear here." />}
            {event ? <PortalMobileListItem title={event.title} meta={`Event · ${shortDate(event.eventDate)} · ${event.location}`} href={`/portal/events/${event.id}`} icon={CalendarDays} /> : <PortalEmptyState title="No upcoming events" description="Published community events will appear here." />}
          </div>
        </section>

        <section className="rounded-3xl border border-pine-100 bg-white p-4 shadow-soft sm:p-5">
          <PortalSectionHeader eyebrow="Requests" title="Active requests" />
          <div className="space-y-3">
            {paymentRequest && <PortalMobileListItem title={paymentRequest.type === "MONTHLY_DUES" ? "Payment request under review" : collectionLabel(String(paymentRequest.collectionType), paymentRequest.description)} meta={`${shortDate(paymentRequest.createdAt)} · ${paymentRequest.status.replaceAll("_", " ")}`} value={money(paymentRequest.amount)} href="/portal/pay" icon={QrCode} />}
            {documentRequest && <PortalMobileListItem title="Document request" meta={`${shortDate(documentRequest.requestedAt)} · ${documentRequest.definition?.displayName || documentRequest.configuration?.displayName || documentTypeLabel(documentRequest.type)} · ${documentRequest.status.replaceAll("_", " ")}`} href="/portal/documents" icon={FileText} />}
            {!paymentRequest && !documentRequest && <PortalEmptyState title="No active requests" description="Payment and document requests that need attention will appear here." />}
          </div>
        </section>

        <PortalSummaryCard label="Refundable bonds held" value={money(bondsHeld)} note="Construction bond balance where applicable" icon={HandCoins} />
      </div>
    </section>
  </PortalPageContainer>;
}
