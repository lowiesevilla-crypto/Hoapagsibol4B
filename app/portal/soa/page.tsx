import Link from "next/link";
import { CalendarDays, ChevronDown, CreditCard, Download, FileText, Home, QrCode, ReceiptText, UserRound } from "lucide-react";
import { PaymentAreaNavigation } from "@/components/homeowner/payments/payment-cards";
import { PageHeader } from "@/components/page-header";
import { PortalMobileListItem, PortalPageContainer } from "@/components/portal-mobile-shell";
import { SoaPrintButton } from "@/components/soa-print-button";
import { StatusBadge } from "@/components/status-badge";
import { getAppUrl } from "@/lib/app-url";
import { requireHomeownerProfile } from "@/lib/portal";
import { getStatementOfAccount, type StatementLedgerEntry } from "@/lib/services/statement-of-account";
import { money, shortDate } from "@/lib/utils";

export default async function PortalStatementOfAccountPage() {
  const profile = await requireHomeownerProfile();
  const soa = await getStatementOfAccount(profile.id, profile.tenantId, getAppUrl());
  const propertyLabel = [soa.homeowner.phase ? `Phase ${soa.homeowner.phase}` : null, `Block ${soa.homeowner.block}`, `Lot ${soa.homeowner.lot}`]
    .filter(Boolean)
    .join(" · ");

  return <PortalPageContainer className="homeowner-soa-print space-y-4 sm:space-y-5">
    <style>{`
      @media print {
        .homeowner-soa-print details.soa-disclosure > .soa-disclosure-content { display: block !important; }
        .homeowner-soa-print details.soa-disclosure > summary { display: none !important; }
        .homeowner-soa-print .soa-account-identity { display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 2mm 6mm !important; }
        .homeowner-soa-print .soa-account-identity > div { break-inside: avoid !important; }
        .homeowner-soa-print .soa-primary-summary { display: grid !important; grid-template-columns: 1.2fr 1fr !important; gap: 3mm !important; }
        .homeowner-soa-print .soa-compact-stats { display: grid !important; grid-template-columns: repeat(3, minmax(0, 1fr)) !important; gap: 2mm !important; }
      }
    `}</style>

    <div className="print-hidden"><PaymentAreaNavigation active="soa" /></div>
    <PageHeader eyebrow="My account" title="Statement of Account" description="Your current account position, billing activity, and payment history." action={<div className="print-hidden flex flex-wrap gap-2"><Link className="btn-secondary" href="/portal/pay"><QrCode className="size-4" /> Pay dues</Link><SoaPrintButton /></div>} />

    <section className="soa-account-identity grid gap-3 rounded-2xl border border-pine-100 bg-white p-4 shadow-soft sm:grid-cols-2 sm:p-5" aria-label="Homeowner statement information">
      <IdentityItem icon={UserRound} label="Homeowner" value={soa.homeowner.user.name} />
      <IdentityItem icon={FileText} label="Account number" value={soa.accountNumber} mono />
      <IdentityItem icon={Home} label="Property" value={propertyLabel} note={soa.homeowner.address} />
      <IdentityItem icon={CalendarDays} label="Statement" value={soa.statementCode} note={`As of ${shortDate(soa.statementDate)}`} mono />
    </section>

    <section className="soa-primary-summary overflow-hidden rounded-2xl border border-pine-100 bg-white shadow-soft">
      <div className="bg-gradient-to-br from-pine-700 via-pine-600 to-cyan-700 p-4 text-white sm:p-5">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/70">Net account balance</p>
        <p className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">{money(soa.summary.netAccountBalance)}</p>
        <p className="mt-2 text-xs font-semibold text-white/75">Outstanding less available homeowner credit</p>
      </div>
      <div className="soa-compact-stats grid grid-cols-3 divide-x divide-slate-100 p-3 sm:p-4">
        <CompactStat label="Outstanding" value={money(soa.summary.currentOutstandingBalance)} note={soa.summary.collectionStatus} />
        <CompactStat label="Credit" value={money(soa.summary.availableCredit)} note="Available" />
        <CompactStat label="Last payment" value={soa.summary.lastPaymentDate ? shortDate(soa.summary.lastPaymentDate) : "None"} note="Recorded" />
      </div>
    </section>

    <SoaDisclosure title="Receivables aging" eyebrow="Aging" summary={`${money(totalAging(soa.aging))} receivable`} defaultOpen>
      <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-5 sm:gap-3 sm:p-4">
        <AgingCard label="Current" value={soa.aging.current} />
        <AgingCard label="30 Days" value={soa.aging.thirtyDays} />
        <AgingCard label="60 Days" value={soa.aging.sixtyDays} />
        <AgingCard label="90 Days" value={soa.aging.ninetyDays} />
        <AgingCard label="120+" value={soa.aging.overOneHundredTwenty} />
      </div>
    </SoaDisclosure>

    <SoaDisclosure title="Running ledger" eyebrow={`${soa.ledger.length} records`} summary={soa.ledger.length ? `Latest balance ${money(soa.ledger.at(-1)?.runningBalance ?? 0)}` : "No activity"}>
      <div className="homeowner-soa-screen-cards space-y-2 p-3 md:hidden">
        {soa.ledger.slice(-12).reverse().map((entry) => <PortalMobileListItem key={`${entry.reference}-${entry.date.toISOString()}-${entry.sortOrder}`} title={entry.description} meta={`${shortDate(entry.date)} · ${entry.transactionType} · ${entry.reference}`} value={money(entry.runningBalance)} icon={ReceiptText} />)}
        {!soa.ledger.length && <EmptyState>No billing, payment, or collection activity recorded.</EmptyState>}
      </div>
      <div className="homeowner-soa-print-table table-wrap hidden rounded-none border-x-0 border-b-0 shadow-none md:block"><table className="data-table"><thead><tr><th>Date</th><th>Description</th><th>Reference</th><th className="text-right">Debit</th><th className="text-right">Credit</th><th className="text-right">Running balance</th><th>Type</th></tr></thead><tbody>{soa.ledger.map((entry) => <LedgerRow key={`${entry.reference}-${entry.date.toISOString()}-${entry.sortOrder}`} entry={entry} />)}{!soa.ledger.length && <tr><td colSpan={7} className="py-10 text-center text-slate-500">No billing, payment, or collection activity recorded.</td></tr>}</tbody></table></div>
    </SoaDisclosure>

    <SoaDisclosure title="Payment history" eyebrow={`${soa.paymentHistory.length} records`} summary={soa.paymentHistory[0] ? `Latest ${shortDate(soa.paymentHistory[0].paymentDate)} · ${money(soa.paymentHistory[0].amount)}` : "No payments"}>
      <div className="homeowner-soa-screen-cards space-y-2 p-3 md:hidden">{soa.paymentHistory.slice(0, 8).map((payment) => <PortalMobileListItem key={payment.id} title={payment.officialReceiptNo} meta={`${shortDate(payment.paymentDate)} · ${payment.paymentMethod} · ${payment.status}`} value={money(payment.amount)} icon={CreditCard} />)}{!soa.paymentHistory.length && <EmptyState>No payments recorded.</EmptyState>}<Link className="print-hidden btn-secondary mt-2 w-full" href="/portal/payments">View receipts</Link></div>
      <div className="homeowner-soa-print-table table-wrap hidden rounded-none border-x-0 border-b-0 shadow-none md:block"><table className="data-table"><thead><tr><th>Date</th><th>Receipt</th><th>Coverage</th><th className="text-right">Received</th><th className="text-right">Applied</th><th className="text-right">Credit</th><th>Status</th></tr></thead><tbody>{soa.paymentHistory.map((payment) => <tr key={payment.id}><td>{shortDate(payment.paymentDate)}</td><td className="font-mono text-xs font-bold">{payment.officialReceiptNo}</td><td>{payment.coverage}</td><td className="text-right font-black">{money(payment.amount)}</td><td className="text-right">{money(payment.appliedAmount)}</td><td className="text-right">{money(payment.unappliedCredit)}</td><td className={payment.status === "Void" ? "font-black text-rose-700" : "font-bold text-emerald-700"}>{payment.status}</td></tr>)}{!soa.paymentHistory.length && <tr><td colSpan={7} className="py-10 text-center text-slate-500">No payments recorded.</td></tr>}</tbody></table></div>
    </SoaDisclosure>

    <SoaDisclosure title="Billing history" eyebrow={`${soa.billingHistory.length} records`} summary={soa.billingHistory[0] ? `Latest ${soa.billingHistory[0].coverage} · ${money(soa.billingHistory[0].amount)}` : "No billings"}>
      <div className="homeowner-soa-screen-cards space-y-2 p-3 md:hidden">{soa.billingHistory.slice(0, 8).map((bill) => <PortalMobileListItem key={bill.id} title={bill.coverage} meta={`${shortDate(bill.billingDate)} · ${bill.status.replaceAll("_", " ")}`} value={money(bill.amount)} icon={FileText} />)}{!soa.billingHistory.length && <EmptyState>No billing history recorded.</EmptyState>}<Link className="print-hidden btn-secondary mt-2 w-full" href="/portal/billing">View billing</Link></div>
      <div className="homeowner-soa-print-table table-wrap hidden rounded-none border-x-0 border-b-0 shadow-none md:block"><table className="data-table"><thead><tr><th>Billing date</th><th>Type</th><th>Coverage</th><th className="text-right">Amount</th><th>Status</th></tr></thead><tbody>{soa.billingHistory.map((bill) => <tr key={bill.id}><td>{shortDate(bill.billingDate)}</td><td>{bill.billingType}</td><td>{bill.coverage}</td><td className="text-right font-black">{money(bill.amount)}</td><td><StatusBadge status={bill.status} /></td></tr>)}{!soa.billingHistory.length && <tr><td colSpan={5} className="py-10 text-center text-slate-500">No billing history recorded.</td></tr>}</tbody></table></div>
    </SoaDisclosure>

    <p className="print-hidden flex items-start gap-2 rounded-2xl bg-pine-50 p-3 text-xs font-semibold leading-5 text-pine-900 sm:text-sm"><Download className="mt-0.5 size-4 shrink-0" /> Print SOA includes your homeowner identity, account and property details, and the complete financial history even when sections are collapsed on screen.</p>
  </PortalPageContainer>;
}

function IdentityItem({ icon: Icon, label, value, note, mono = false }: { icon: typeof UserRound; label: string; value: string; note?: string | null; mono?: boolean }) {
  return <div className="flex min-w-0 items-start gap-3 rounded-xl bg-slate-50/80 p-3">
    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-pine-700 shadow-sm"><Icon className="size-4" /></span>
    <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p><p className={`mt-0.5 break-words text-sm font-black text-ink ${mono ? "font-mono" : ""}`}>{value}</p>{note && <p className="mt-0.5 break-words text-xs font-medium text-slate-500">{note}</p>}</div>
  </div>;
}

function CompactStat({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="min-w-0 px-2 text-center sm:px-3"><p className="text-[9px] font-black uppercase tracking-wide text-slate-400 sm:text-[10px]">{label}</p><p className="mt-1 break-words text-xs font-black text-ink sm:text-sm">{value}</p><p className="mt-0.5 hidden text-[10px] font-semibold text-slate-400 sm:block">{note}</p></div>;
}

function SoaDisclosure({ title, eyebrow, summary, defaultOpen = false, children }: { title: string; eyebrow: string; summary: string; defaultOpen?: boolean; children: React.ReactNode }) {
  return <details className="soa-disclosure group overflow-hidden rounded-2xl border border-pine-100 bg-white shadow-soft" open={defaultOpen}>
    <summary className="print-hidden flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-pine-500 [&::-webkit-details-marker]:hidden">
      <div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{eyebrow}</p><div className="mt-0.5 flex min-w-0 flex-wrap items-baseline gap-x-2"><h2 className="text-base font-black text-ink sm:text-lg">{title}</h2><span className="truncate text-xs font-semibold text-slate-500">{summary}</span></div></div>
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-pine-50 text-pine-700 transition group-open:rotate-180"><ChevronDown className="size-4" /></span>
    </summary>
    <div className="soa-disclosure-content border-t border-slate-100">{children}</div>
  </details>;
}

function AgingCard({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-center"><p className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-base font-black text-ink">{money(value)}</p></div>;
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">{children}</p>;
}

function totalAging(aging: { current: number; thirtyDays: number; sixtyDays: number; ninetyDays: number; overOneHundredTwenty: number }) {
  return aging.current + aging.thirtyDays + aging.sixtyDays + aging.ninetyDays + aging.overOneHundredTwenty;
}

function LedgerRow({ entry }: { entry: StatementLedgerEntry }) {
  return <tr><td>{shortDate(entry.date)}</td><td className="font-semibold">{entry.description}</td><td className="font-mono text-xs font-bold">{entry.reference}</td><td className="text-right">{entry.debit ? money(entry.debit) : "-"}</td><td className="text-right">{entry.credit ? money(entry.credit) : "-"}</td><td className="text-right font-black">{money(entry.runningBalance)}</td><td>{entry.transactionType}</td></tr>;
}
