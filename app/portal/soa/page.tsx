import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronDown, Clock3, CreditCard, FileText, QrCode, ReceiptText } from "lucide-react";
import type { ReactNode } from "react";
import { HomeownerSoaPrintDocument } from "@/components/homeowner/payments/homeowner-soa-print-document";
import { PaymentAreaNavigation } from "@/components/homeowner/payments/payment-cards";
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

  return (
    <PortalPageContainer className="space-y-4">
      <span className="homeowner-soa-print hidden" aria-hidden="true" />
      <div className="print-hidden space-y-4">
        <PaymentAreaNavigation active="soa" />

        <header className="flex min-w-0 flex-col gap-3 px-1 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-pine-700">My account</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-ink sm:text-3xl">Statement of Account</h1>
            <p className="mt-1 truncate font-mono text-[11px] font-bold text-slate-400">{soa.statementCode}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="btn-secondary" href="/portal/pay"><QrCode className="size-4" /> Pay dues</Link>
            <SoaPrintButton />
          </div>
        </header>

        <section className="rounded-[1.6rem] border border-slate-100 bg-white p-4 shadow-[0_8px_28px_rgba(15,23,42,.06)] sm:p-5" aria-label="Account balance summary">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-pine-50 text-pine-700"><ReceiptText className="size-5" aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-[.13em] text-slate-400">Outstanding balance</p>
              <p className="mt-1 break-words text-3xl font-black tabular-nums text-ink sm:text-4xl">{money(soa.summary.currentOutstandingBalance)}</p>
              <p className="mt-1 text-xs font-bold text-slate-500">{soa.summary.collectionStatus}</p>
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3">
            <MiniStat label="Credit" value={money(soa.summary.availableCredit)} />
            <MiniStat label="Net balance" value={money(soa.summary.netAccountBalance)} />
            <MiniStat label="Last payment" value={soa.summary.lastPaymentDate ? shortDate(soa.summary.lastPaymentDate) : "None"} />
          </dl>
        </section>

        <CollapsibleSection icon={Clock3} title="Receivables aging" meta="Current, 30, 60, 90 and 120+ days">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <AgingCard label="Current" value={soa.aging.current} />
            <AgingCard label="30 Days" value={soa.aging.thirtyDays} />
            <AgingCard label="60 Days" value={soa.aging.sixtyDays} />
            <AgingCard label="90 Days" value={soa.aging.ninetyDays} />
            <AgingCard label="120+" value={soa.aging.overOneHundredTwenty} />
          </div>
        </CollapsibleSection>

        <CollapsibleSection icon={ReceiptText} title="Running ledger" meta={`${soa.ledger.length} record${soa.ledger.length === 1 ? "" : "s"}`}>
          <div className="homeowner-soa-screen-cards space-y-3 md:hidden">
            {soa.ledger.slice(-12).reverse().map((entry) => <PortalMobileListItem key={`${entry.reference}-${entry.date.toISOString()}-${entry.sortOrder}`} title={entry.description} meta={`${shortDate(entry.date)} · ${entry.transactionType} · ${entry.reference}`} value={money(entry.runningBalance)} icon={ReceiptText} />)}
            {!soa.ledger.length && <EmptyState>No billing, payment, or collection activity recorded.</EmptyState>}
          </div>
          <div className="homeowner-soa-print-table table-wrap hidden shadow-none md:block"><table className="data-table"><thead><tr><th>Date</th><th>Description</th><th>Reference</th><th className="text-right">Debit</th><th className="text-right">Credit</th><th className="text-right">Running balance</th><th>Type</th></tr></thead><tbody>{soa.ledger.map((entry) => <LedgerRow key={`${entry.reference}-${entry.date.toISOString()}-${entry.sortOrder}`} entry={entry} />)}{!soa.ledger.length && <tr><td colSpan={7} className="py-10 text-center text-slate-500">No billing, payment, or collection activity recorded.</td></tr>}</tbody></table></div>
        </CollapsibleSection>

        <CollapsibleSection icon={CreditCard} title="Payment history" meta={`${soa.paymentHistory.length} record${soa.paymentHistory.length === 1 ? "" : "s"}`} action={<Link className="text-xs font-black text-pine-700" href="/portal/payments">Receipts</Link>}>
          <div className="homeowner-soa-screen-cards space-y-3 md:hidden">{soa.paymentHistory.slice(0, 8).map((payment) => <PortalMobileListItem key={payment.id} title={payment.officialReceiptNo} meta={`${shortDate(payment.paymentDate)} · ${payment.paymentMethod} · ${payment.status}`} value={money(payment.amount)} icon={CreditCard} />)}{!soa.paymentHistory.length && <EmptyState>No payments recorded.</EmptyState>}</div>
          <div className="homeowner-soa-print-table table-wrap hidden shadow-none md:block"><table className="data-table"><thead><tr><th>Date</th><th>Receipt</th><th>Coverage</th><th className="text-right">Received</th><th className="text-right">Applied</th><th className="text-right">Credit</th><th>Status</th></tr></thead><tbody>{soa.paymentHistory.map((payment) => <tr key={payment.id}><td>{shortDate(payment.paymentDate)}</td><td className="font-mono text-xs font-bold">{payment.officialReceiptNo}</td><td>{payment.coverage}</td><td className="text-right font-black">{money(payment.amount)}</td><td className="text-right">{money(payment.appliedAmount)}</td><td className="text-right">{money(payment.unappliedCredit)}</td><td className={payment.status === "Void" ? "font-black text-rose-700" : "font-bold text-emerald-700"}>{payment.status}</td></tr>)}{!soa.paymentHistory.length && <tr><td colSpan={7} className="py-10 text-center text-slate-500">No payments recorded.</td></tr>}</tbody></table></div>
        </CollapsibleSection>

        <CollapsibleSection icon={FileText} title="Billing history" meta={`${soa.billingHistory.length} record${soa.billingHistory.length === 1 ? "" : "s"}`} action={<Link className="text-xs font-black text-pine-700" href="/portal/billing">View bills</Link>}>
          <div className="homeowner-soa-screen-cards space-y-3 md:hidden">{soa.billingHistory.slice(0, 8).map((bill) => <PortalMobileListItem key={bill.id} title={bill.coverage} meta={`${shortDate(bill.billingDate)} · ${bill.status.replaceAll("_", " ")}`} value={money(bill.amount)} icon={FileText} />)}{!soa.billingHistory.length && <EmptyState>No billing history recorded.</EmptyState>}</div>
          <div className="homeowner-soa-print-table table-wrap hidden shadow-none md:block"><table className="data-table"><thead><tr><th>Billing date</th><th>Type</th><th>Coverage</th><th className="text-right">Amount</th><th>Status</th></tr></thead><tbody>{soa.billingHistory.map((bill) => <tr key={bill.id}><td>{shortDate(bill.billingDate)}</td><td>{bill.billingType}</td><td>{bill.coverage}</td><td className="text-right font-black">{money(bill.amount)}</td><td><StatusBadge status={bill.status} /></td></tr>)}{!soa.billingHistory.length && <tr><td colSpan={5} className="py-10 text-center text-slate-500">No billing history recorded.</td></tr>}</tbody></table></div>
        </CollapsibleSection>
      </div>

      <HomeownerSoaPrintDocument soa={soa} />
    </PortalPageContainer>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</dt><dd className="mt-1 break-words text-xs font-black tabular-nums text-slate-800 sm:text-sm">{value}</dd></div>;
}

function CollapsibleSection({ icon: Icon, title, meta, action, children }: { icon: LucideIcon; title: string; meta: string; action?: ReactNode; children: ReactNode }) {
  return (
    <details className="group overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_6px_22px_rgba(15,23,42,.05)]">
      <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-pine-500 [&::-webkit-details-marker]:hidden sm:px-5">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-pine-50 text-pine-700"><Icon className="size-[18px]" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1"><h2 className="text-sm font-black text-ink sm:text-base">{title}</h2><p className="mt-0.5 truncate text-[11px] font-semibold text-slate-400">{meta}</p></div>
        <ChevronDown className="size-5 shrink-0 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="border-t border-slate-100 p-3 sm:p-4">
        {action && <div className="mb-3 flex justify-end">{action}</div>}
        {children}
      </div>
    </details>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm font-semibold text-slate-400">{children}</p>;
}

function AgingCard({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl bg-slate-50 p-3 text-center"><p className="text-[10px] font-black uppercase text-slate-400">{label}</p><p className="mt-1 text-base font-black tabular-nums text-ink">{money(value)}</p></div>;
}

function LedgerRow({ entry }: { entry: StatementLedgerEntry }) {
  return <tr><td>{shortDate(entry.date)}</td><td className="font-semibold">{entry.description}</td><td className="font-mono text-xs font-bold">{entry.reference}</td><td className="text-right">{entry.debit ? money(entry.debit) : "-"}</td><td className="text-right">{entry.credit ? money(entry.credit) : "-"}</td><td className="text-right font-black">{money(entry.runningBalance)}</td><td>{entry.transactionType}</td></tr>;
}
