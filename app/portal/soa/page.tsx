import Link from "next/link";
import { CalendarDays, CreditCard, Download, FileText, QrCode, ReceiptText } from "lucide-react";
import { PaymentAreaNavigation } from "@/components/homeowner/payments/payment-cards";
import { PageHeader } from "@/components/page-header";
import { PortalMobileListItem, PortalPageContainer, PortalSectionHeader, PortalSummaryCard } from "@/components/portal-mobile-shell";
import { SoaPrintButton } from "@/components/soa-print-button";
import { StatusBadge } from "@/components/status-badge";
import { getAppUrl } from "@/lib/app-url";
import { requireHomeownerProfile } from "@/lib/portal";
import { getStatementOfAccount, type StatementLedgerEntry } from "@/lib/services/statement-of-account";
import { money, shortDate } from "@/lib/utils";

export default async function PortalStatementOfAccountPage() {
  const profile = await requireHomeownerProfile();
  const soa = await getStatementOfAccount(profile.id, profile.tenantId, getAppUrl());

  return <PortalPageContainer className="space-y-6">
    <PaymentAreaNavigation active="soa" />
    <PageHeader eyebrow="My account" title="Statement of Account" description="A tenant-scoped summary of your balances, payments, and billing activity." action={<div className="flex flex-wrap gap-2"><Link className="btn-secondary" href="/portal/pay"><QrCode className="size-4" /> Pay dues</Link><SoaPrintButton /></div>} />

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <PortalSummaryCard label="Outstanding balance" value={money(soa.summary.currentOutstandingBalance)} note={soa.summary.collectionStatus} icon={ReceiptText} tone={soa.summary.currentOutstandingBalance > 0 ? "warning" : "success"} />
      <PortalSummaryCard label="Available credit" value={money(soa.summary.availableCredit)} note="Unapplied homeowner credit" icon={CreditCard} tone={soa.summary.availableCredit > 0 ? "success" : "default"} />
      <PortalSummaryCard label="Net account balance" value={money(soa.summary.netAccountBalance)} note="Outstanding less available credit" icon={FileText} />
      <PortalSummaryCard label="Last payment" value={soa.summary.lastPaymentDate ? shortDate(soa.summary.lastPaymentDate) : "None yet"} note={`Statement ${soa.statementCode}`} icon={CalendarDays} />
    </section>

    <section className="rounded-3xl border border-pine-100 bg-white p-4 shadow-soft sm:p-5">
      <PortalSectionHeader eyebrow="Aging" title="Receivables aging" />
      <div className="grid gap-3 sm:grid-cols-5">
        <AgingCard label="Current" value={soa.aging.current} />
        <AgingCard label="30 Days" value={soa.aging.thirtyDays} />
        <AgingCard label="60 Days" value={soa.aging.sixtyDays} />
        <AgingCard label="90 Days" value={soa.aging.ninetyDays} />
        <AgingCard label="120+" value={soa.aging.overOneHundredTwenty} />
      </div>
    </section>

    <section className="rounded-3xl border border-pine-100 bg-white p-4 shadow-soft sm:p-5">
      <PortalSectionHeader eyebrow={`${soa.ledger.length} records`} title="Running ledger" />
      <div className="space-y-3 md:hidden">
        {soa.ledger.slice(-12).reverse().map((entry) => <PortalMobileListItem key={`${entry.reference}-${entry.date.toISOString()}-${entry.sortOrder}`} title={entry.description} meta={`${shortDate(entry.date)} · ${entry.transactionType} · ${entry.reference}`} value={money(entry.runningBalance)} icon={ReceiptText} />)}
        {!soa.ledger.length && <p className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500">No billing, payment, or collection activity recorded.</p>}
      </div>
      <div className="table-wrap hidden shadow-none md:block"><table className="data-table"><thead><tr><th>Date</th><th>Description</th><th>Reference</th><th className="text-right">Debit</th><th className="text-right">Credit</th><th className="text-right">Running balance</th><th>Type</th></tr></thead><tbody>{soa.ledger.map((entry) => <LedgerRow key={`${entry.reference}-${entry.date.toISOString()}-${entry.sortOrder}`} entry={entry} />)}{!soa.ledger.length && <tr><td colSpan={7} className="py-10 text-center text-slate-500">No billing, payment, or collection activity recorded.</td></tr>}</tbody></table></div>
    </section>

    <section className="grid gap-5 xl:grid-cols-2">
      <div className="rounded-3xl border border-pine-100 bg-white p-4 shadow-soft sm:p-5">
        <PortalSectionHeader eyebrow={`${soa.paymentHistory.length} records`} title="Payment history" action={<Link className="text-sm font-black text-pine-700" href="/portal/payments">Receipts</Link>} />
        <div className="space-y-3 md:hidden">{soa.paymentHistory.slice(0, 8).map((payment) => <PortalMobileListItem key={payment.id} title={payment.officialReceiptNo} meta={`${shortDate(payment.paymentDate)} · ${payment.paymentMethod} · ${payment.status}`} value={money(payment.amount)} icon={CreditCard} />)}{!soa.paymentHistory.length && <p className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500">No payments recorded.</p>}</div>
        <div className="table-wrap hidden shadow-none md:block"><table className="data-table"><thead><tr><th>Date</th><th>Receipt</th><th>Coverage</th><th className="text-right">Received</th><th className="text-right">Applied</th><th className="text-right">Credit</th><th>Status</th></tr></thead><tbody>{soa.paymentHistory.map((payment) => <tr key={payment.id}><td>{shortDate(payment.paymentDate)}</td><td className="font-mono text-xs font-bold">{payment.officialReceiptNo}</td><td>{payment.coverage}</td><td className="text-right font-black">{money(payment.amount)}</td><td className="text-right">{money(payment.appliedAmount)}</td><td className="text-right">{money(payment.unappliedCredit)}</td><td className={payment.status === "Void" ? "font-black text-rose-700" : "font-bold text-emerald-700"}>{payment.status}</td></tr>)}{!soa.paymentHistory.length && <tr><td colSpan={7} className="py-10 text-center text-slate-500">No payments recorded.</td></tr>}</tbody></table></div>
      </div>

      <div className="rounded-3xl border border-pine-100 bg-white p-4 shadow-soft sm:p-5">
        <PortalSectionHeader eyebrow={`${soa.billingHistory.length} records`} title="Billing history" action={<Link className="text-sm font-black text-pine-700" href="/portal/billing">View billing</Link>} />
        <div className="space-y-3 md:hidden">{soa.billingHistory.slice(0, 8).map((bill) => <PortalMobileListItem key={bill.id} title={bill.coverage} meta={`${shortDate(bill.billingDate)} · ${bill.status.replaceAll("_", " ")}`} value={money(bill.amount)} icon={FileText} />)}{!soa.billingHistory.length && <p className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500">No billing history recorded.</p>}</div>
        <div className="table-wrap hidden shadow-none md:block"><table className="data-table"><thead><tr><th>Billing date</th><th>Type</th><th>Coverage</th><th className="text-right">Amount</th><th>Status</th></tr></thead><tbody>{soa.billingHistory.map((bill) => <tr key={bill.id}><td>{shortDate(bill.billingDate)}</td><td>{bill.billingType}</td><td>{bill.coverage}</td><td className="text-right font-black">{money(bill.amount)}</td><td><StatusBadge status={bill.status} /></td></tr>)}{!soa.billingHistory.length && <tr><td colSpan={5} className="py-10 text-center text-slate-500">No billing history recorded.</td></tr>}</tbody></table></div>
      </div>
    </section>

    <p className="flex flex-wrap items-center gap-2 rounded-3xl bg-pine-50 p-4 text-sm font-semibold text-pine-900"><Download className="size-4" /> Use Print for the homeowner mobile statement. Official downloadable SOA PDF remains available through the HOA office.</p>
  </PortalPageContainer>;
}

function AgingCard({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-center"><p className="text-xs font-black uppercase text-slate-500">{label}</p><p className="mt-1 text-lg font-black text-ink">{money(value)}</p></div>;
}

function LedgerRow({ entry }: { entry: StatementLedgerEntry }) {
  return <tr><td>{shortDate(entry.date)}</td><td className="font-semibold">{entry.description}</td><td className="font-mono text-xs font-bold">{entry.reference}</td><td className="text-right">{entry.debit ? money(entry.debit) : "-"}</td><td className="text-right">{entry.credit ? money(entry.credit) : "-"}</td><td className="text-right font-black">{money(entry.runningBalance)}</td><td>{entry.transactionType}</td></tr>;
}
