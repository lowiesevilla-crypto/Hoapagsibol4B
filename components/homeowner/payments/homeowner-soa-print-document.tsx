import type { ReactNode } from "react";
import { AssociationLogo } from "@/components/association-logo";
import { StatusBadge } from "@/components/status-badge";
import { homeownerAccountNumber } from "@/lib/homeowner-account";
import { getStatementOfAccount, type StatementLedgerEntry } from "@/lib/services/statement-of-account";
import { money, shortDate } from "@/lib/utils";

type StatementOfAccount = Awaited<ReturnType<typeof getStatementOfAccount>>;

export function HomeownerSoaPrintDocument({ soa }: { soa: StatementOfAccount }) {
  const contactLine = [
    soa.association.contactNumber && `Contact: ${soa.association.contactNumber}`,
    soa.association.email && `Email: ${soa.association.email}`,
  ].filter(Boolean).join(" | ");

  return (
    <section className="soa-document soa-print-root print-document hidden print:block" aria-label="Printable homeowner statement of account">
      <div className="soa-sheet soa-print-sheet border-2 border-ink p-4 sm:p-7">
        <header className="soa-print-header grid gap-5 border-b-2 border-ink pb-5 lg:grid-cols-[auto_1fr_auto] lg:items-center">
          <AssociationLogo className="size-24" src={soa.association.logoUrl} alt={`${soa.association.name} logo`} />
          <div className="text-center lg:text-left">
            <p className="text-xs font-bold uppercase tracking-widest text-pine-700">Statement of Account</p>
            <h1 className="mt-1 text-xl font-black text-ink sm:text-3xl">{soa.association.name}</h1>
            {soa.association.address && <p className="mt-1 text-sm text-slate-600">{soa.association.address}</p>}
            {contactLine && <p className="text-sm text-slate-600">{contactLine}</p>}
            <p className="mt-2 font-mono text-xs font-bold text-rose-700">{soa.statementCode}</p>
          </div>
          <div className="text-center lg:text-right">
            <p className="text-xs font-bold uppercase text-slate-500">Statement Date</p>
            <p className="font-black">{shortDate(soa.statementDate)}</p>
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Homeowner Copy</p>
          </div>
        </header>

        <section className="soa-info-summary grid gap-5 border-b border-ink py-6 xl:grid-cols-2">
          <div>
            <h2 className="mb-3 text-sm font-black uppercase tracking-wider text-pine-800">Homeowner Information</h2>
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <Info label="Homeowner Name" value={soa.homeowner.user.name} />
              <Info label="Account Number" value={homeownerAccountNumber(soa.homeowner)} />
              <Info label="Block" value={soa.homeowner.block} />
              <Info label="Lot" value={soa.homeowner.lot} />
              <Info label="Property Address" value={soa.homeowner.address} wide />
              <Info label="Contact Number" value={soa.homeowner.phone || "-"} />
              <Info label="Email" value={soa.homeowner.user.email} />
              <Info label="Monthly Dues" value={money(soa.homeowner.monthlyDuesAmount)} />
              <Info label="Status" value={soa.homeowner.status.replaceAll("_", " ")} />
            </div>
          </div>
          <div className="soa-account-summary">
            <h2 className="mb-3 text-sm font-black uppercase tracking-wider text-pine-800">Account Summary</h2>
            <div className="space-y-2 text-sm">
              <Summary label="Current Outstanding Balance" value={money(soa.summary.currentOutstandingBalance)} strong />
              <Summary label="Available Unapplied Credit" value={money(soa.summary.availableCredit)} strong />
              <Summary label="Net Account Balance" value={money(soa.summary.netAccountBalance)} strong />
              <div className="soa-summary-grid grid gap-2 sm:grid-cols-2">
                <Summary label="Total Amount Billed" value={money(soa.summary.totalAmountBilled)} />
                <Summary label="Total Payments" value={money(soa.summary.totalPayments)} />
                <Summary label="Total Credits" value={money(soa.summary.totalCredits)} />
                <Summary label="Total Penalties" value={money(soa.summary.totalPenalties)} />
                <Summary label="Last Payment Date" value={soa.summary.lastPaymentDate ? shortDate(soa.summary.lastPaymentDate) : "-"} />
                <Summary label="Collection Status" value={soa.summary.collectionStatus} />
              </div>
            </div>
          </div>
        </section>

        <section className="soa-print-section soa-aging-section border-b border-ink py-6">
          <h2 className="mb-3 text-sm font-black uppercase tracking-wider text-pine-800">Receivables Aging</h2>
          <div className="soa-aging-grid grid gap-2 sm:grid-cols-5">
            <Aging label="Current" value={soa.aging.current} />
            <Aging label="30 Days" value={soa.aging.thirtyDays} />
            <Aging label="60 Days" value={soa.aging.sixtyDays} />
            <Aging label="90 Days" value={soa.aging.ninetyDays} />
            <Aging label="120+" value={soa.aging.overOneHundredTwenty} />
          </div>
        </section>

        <section className="soa-print-section soa-ledger-section border-b border-ink py-6">
          <SectionTitle title="Running Ledger" count={soa.ledger.length} />
          <ResponsiveTable kind="ledger" minWidth="820px">
            <thead><tr><th>Date</th><th>Description</th><th>Reference</th><th className="text-right">Debit</th><th className="text-right">Credit</th><th className="text-right">Running Balance</th><th>Transaction Type</th></tr></thead>
            <tbody>
              {soa.ledger.map((entry) => <LedgerRow key={`${entry.reference}-${entry.date.toISOString()}-${entry.sortOrder}`} entry={entry} />)}
              {!soa.ledger.length && <tr><td colSpan={7} className="py-8 text-center text-slate-500">No billing, payment, or collection activity recorded.</td></tr>}
            </tbody>
          </ResponsiveTable>
        </section>

        <section className="soa-print-section soa-print-history grid gap-6 py-6 xl:grid-cols-2">
          <div>
            <SectionTitle title="Payment History" count={soa.paymentHistory.length} />
            <ResponsiveTable kind="payment" minWidth="760px">
              <thead><tr><th>Payment Date</th><th>Official Receipt No.</th><th>Payment Method</th><th>Reference Number</th><th>Coverage</th><th className="text-right">Received</th><th className="text-right">Applied</th><th className="text-right">Credit</th><th>Status</th><th>Collector</th></tr></thead>
              <tbody>
                {soa.paymentHistory.map((payment) => <tr key={payment.id}><td>{shortDate(payment.paymentDate)}</td><td className="font-mono text-xs font-bold">{payment.officialReceiptNo}</td><td>{payment.paymentMethod}</td><td>{payment.referenceNumber}</td><td>{payment.coverage}</td><td className="text-right font-black">{money(payment.amount)}</td><td className="text-right">{money(payment.appliedAmount)}</td><td className="text-right">{money(payment.unappliedCredit)}</td><td className={payment.status === "Void" ? "font-black text-rose-700" : "font-bold text-emerald-700"}>{payment.status}</td><td>{payment.collector}</td></tr>)}
                {!soa.paymentHistory.length && <tr><td colSpan={10} className="py-8 text-center text-slate-500">No payments recorded.</td></tr>}
              </tbody>
            </ResponsiveTable>
          </div>

          <div>
            <SectionTitle title="Billing History" count={soa.billingHistory.length} />
            <ResponsiveTable kind="billing" minWidth="620px">
              <thead><tr><th>Billing Date</th><th>Billing Type</th><th>Coverage</th><th className="text-right">Amount</th><th>Status</th></tr></thead>
              <tbody>
                {soa.billingHistory.map((bill) => <tr key={bill.id}><td>{shortDate(bill.billingDate)}</td><td>{bill.billingType}</td><td>{bill.coverage}</td><td className="text-right font-black">{money(bill.amount)}</td><td><StatusBadge status={bill.status} /></td></tr>)}
                {!soa.billingHistory.length && <tr><td colSpan={5} className="py-8 text-center text-slate-500">No billing history recorded.</td></tr>}
              </tbody>
            </ResponsiveTable>
          </div>
        </section>

        <footer className="soa-signature-footer soa-print-signatures mt-8 grid gap-10 text-center text-xs sm:grid-cols-2">
          <div className="border-t border-ink pt-2">Prepared by HOAHub Finance Engine</div>
          <div className="border-t border-ink pt-2">Treasurer / Authorized HOA Representative</div>
          <p className="soa-generated-footer text-center text-[11px] font-semibold text-slate-500 sm:col-span-2">Generated for {soa.homeowner.user.name} on {shortDate(soa.statementDate)} · {soa.statementCode}.</p>
        </footer>
      </div>
    </section>
  );
}

function Info({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return <div className={wide ? "sm:col-span-2" : ""}><p className="text-[11px] font-black uppercase text-slate-500">{label}</p><p className="min-h-8 border-b border-slate-300 py-1 font-semibold">{value}</p></div>;
}

function Summary({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className={strong ? "soa-summary-card rounded-lg border-2 border-pine-700 bg-pine-50 p-3" : "soa-summary-card rounded-lg border border-slate-200 p-3"}>
    <div className="grid grid-cols-1 items-start gap-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-3">
      <p className="min-w-0 text-[11px] font-black uppercase leading-4 text-slate-500">{label}</p>
      <p className={`${strong ? "text-xl text-pine-900 sm:text-2xl" : "text-sm text-ink"} max-w-full justify-self-end whitespace-nowrap text-right font-mono font-black tabular-nums leading-tight`}>{value}</p>
    </div>
  </div>;
}

function Aging({ label, value }: { label: string; value: number }) {
  return <div className="soa-aging-card rounded-lg border border-slate-200 p-3 text-center"><p className="text-xs font-black uppercase text-slate-500">{label}</p><p className="mt-1 text-lg font-black text-ink">{money(value)}</p></div>;
}

function SectionTitle({ title, count }: { title: string; count: number }) {
  return <div className="soa-section-title mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-black uppercase tracking-wider text-pine-800">{title}</h2><span className="rounded-full bg-pine-50 px-3 py-1 text-xs font-bold text-pine-700">{count} record{count === 1 ? "" : "s"}</span></div>;
}

function ResponsiveTable({ children, kind, minWidth }: { children: ReactNode; kind: "ledger" | "payment" | "billing"; minWidth: string }) {
  return <div className={`soa-table-frame soa-${kind}-table-frame overflow-x-auto rounded-lg border border-slate-200`}><table className={`data-table soa-print-table soa-${kind}-table`} style={{ minWidth }}>{children}</table></div>;
}

function LedgerRow({ entry }: { entry: StatementLedgerEntry }) {
  return <tr><td>{shortDate(entry.date)}</td><td className="font-semibold">{entry.description}</td><td className="font-mono text-xs font-bold">{entry.reference}</td><td className="text-right">{entry.debit ? money(entry.debit) : "-"}</td><td className="text-right">{entry.credit ? money(entry.credit) : "-"}</td><td className="text-right font-black">{money(entry.runningBalance)}</td><td>{entry.transactionType}</td></tr>;
}
