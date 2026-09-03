import { Download } from "lucide-react";
import { Role } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { inputDate } from "@/lib/utils";

export default async function TransactionHistoryReportPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireUser(Role.ADMIN);
  const filters = await searchParams;
  const now = new Date();
  const fromText = /^\d{4}-\d{2}-\d{2}$/.test(filters.from ?? "") ? filters.from! : `${now.getUTCFullYear()}-01-01`;
  const toText = /^\d{4}-\d{2}-\d{2}$/.test(filters.to ?? "") ? filters.to! : inputDate(now);
  const from = new Date(`${fromText}T00:00:00.000Z`);
  const to = new Date(`${toText}T23:59:59.999Z`);
  if (from > to) throw new Error("Report start date must be on or before the end date.");
  const query = `from=${fromText}&to=${toText}`;

  return <>
    <PageHeader
      eyebrow="Reports"
      title="Transaction History Report"
      description="Generate a tenant-scoped transaction schedule containing transaction dates, payment types, payment modes, amounts, balances, receipt numbers, references, and remarks."
      action={<a className="btn-primary" href={`/admin/reports/transactions/export?${query}`}><Download className="size-4" /> Download transaction history</a>}
    />

    <section className="card mb-6">
      <div className="mb-4">
        <h2 className="font-black text-slate-900">Report parameters</h2>
        <p className="text-sm text-slate-500">Select the transaction date range to use for this report. Tenant isolation is derived from the authenticated administrator session.</p>
      </div>
      <form className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div><label className="label">From</label><input className="field" name="from" type="date" defaultValue={fromText} required /></div>
        <div><label className="label">To</label><input className="field" name="to" type="date" defaultValue={toText} required /></div>
        <button className="btn-primary w-full sm:w-auto">Generate report</button>
      </form>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-black text-slate-900">Transaction history export</h2>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">The downloadable report consolidates tenant transactions within the selected date range, including payment type, mode of payment such as Cash, GCash or supported online channels, amount, balance, receipt number, reference number, and transaction remarks.</p>
      <a className="btn-secondary mt-5 inline-flex" href={`/admin/reports/transactions/export?${query}`}><Download className="size-4" /> Download report</a>
    </section>
  </>;
}
