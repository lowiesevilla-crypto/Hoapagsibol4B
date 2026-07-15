import Link from "next/link";
import { Role } from "@prisma/client";
import { AlertTriangle, Banknote, CircleDollarSign, CreditCard, FileWarning, Gauge, HandCoins, Landmark, ListChecks, ReceiptText, Search, ShieldAlert, TrendingUp, UsersRound } from "lucide-react";
import { FinanceDashboardControls } from "@/components/finance-dashboard-controls";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { assertFinanceDashboardAccess, FinanceDashboardAccessError } from "@/lib/finance-dashboard-access";
import { canAccessAdminPath } from "@/lib/role-access";
import { FinanceDashboardInputError, getFinanceDashboard, parseFinanceDashboardDateRange, type FinanceDashboardData } from "@/lib/services/finance-dashboard";
import { money, shortDate, statusTone } from "@/lib/utils";

type DashboardSearchParams = { from?: string; to?: string; q?: string; page?: string };

export default async function FinanceDashboardPage({ searchParams }: { searchParams: Promise<DashboardSearchParams> }) {
  const user = await requireUser(Role.ADMIN);
  try {
    await assertFinanceDashboardAccess(user);
  } catch (error) {
    if (!(error instanceof FinanceDashboardAccessError)) throw error;
    return <><PageHeader eyebrow="Executive reporting" title="Finance Dashboard" description="Tenant-scoped collections, receivables, reconciliation, and finance activity." /><section className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-amber-900" role="alert"><div className="flex items-start gap-3"><ShieldAlert className="mt-0.5 size-5 shrink-0" /><div><h2 className="font-black">Finance dashboard unavailable</h2><p className="mt-1 text-sm">{error.message}</p></div></div></section></>;
  }
  const filters = await searchParams;
  let defaultRange;
  try {
    defaultRange = parseFinanceDashboardDateRange(filters.from, filters.to);
  } catch (error) {
    const fallback = parseFinanceDashboardDateRange();
    return <>
      <PageHeader eyebrow="Executive reporting" title="Finance Dashboard" description="Tenant-scoped collections, receivables, reconciliation, and finance activity." />
      <FinanceDashboardControls from={filters.from || fallback.fromText} to={filters.to || fallback.toText} />
      <section className="rounded-lg border border-rose-200 bg-rose-50 p-5 text-rose-900" role="alert"><div className="flex items-start gap-3"><ShieldAlert className="mt-0.5 size-5 shrink-0" /><div><h2 className="font-black">Invalid reporting period</h2><p className="mt-1 text-sm">{error instanceof FinanceDashboardInputError ? error.message : "The reporting period could not be loaded."}</p></div></div></section>
    </>;
  }
  const data = await getFinanceDashboard({ tenantId: user.tenantId, fromInput: defaultRange.fromText, toInput: defaultRange.toText, delinquentSearch: filters.q, delinquentPage: filters.page });
  const canOpenSoa = canAccessAdminPath(user.role, "/admin/homeowners/example/soa");

  return <>
    <PageHeader eyebrow="Executive reporting" title="Finance Dashboard" description={`${reportDate(data.range.fromText)} to ${reportDate(data.range.toText)}. All values are scoped to the authenticated HOA.`} />
    <FinanceDashboardControls from={data.range.fromText} to={data.range.toText} />
    <KpiGrid data={data} />
    <Reconciliation data={data} />
    <MonthlyTrend data={data} />
    <section className="mt-6 grid gap-6 xl:grid-cols-2"><AgingSummary data={data} /><PaymentMethods data={data} /></section>
    <RevenueBreakdown data={data} />
    <DelinquentHomeowners data={data} canOpenSoa={canOpenSoa} />
    <RecentActivity data={data} />
  </>;
}

function KpiGrid({ data }: { data: FinanceDashboardData }) {
  const items = [
    { label: "Total Billed Amount", value: money(data.kpis.totalBilled), note: "Valid bills in period", icon: ReceiptText, href: "/admin/billing" },
    { label: "Active Collections", value: money(data.kpis.activeCollections), note: "Active Payment headers", icon: Banknote, href: "/admin/payments/active" },
    { label: "Voided Collections", value: money(data.kpis.voidedCollections), note: "Voided Payment headers", icon: FileWarning, href: "/admin/payments/history" },
    { label: "Net Collections", value: money(data.kpis.netCollections), note: "Active collections only", icon: TrendingUp, href: "/admin/payments/active" },
    { label: "Outstanding Receivables", value: money(data.kpis.outstandingReceivables), note: `As of ${reportDate(data.range.toText)}`, icon: Landmark, href: "/admin/billing" },
    { label: "Collection Rate", value: `${data.kpis.collectionRate.toFixed(1)}%`, note: "Applied divided by billed", icon: Gauge },
    { label: "Unapplied Homeowner Credit", value: money(data.kpis.unappliedCredit), note: "Selected-period liability", icon: HandCoins },
    { label: "Active Receipt Count", value: data.kpis.activeReceiptCount.toLocaleString("en-PH"), note: "One per active Payment", icon: CreditCard, href: "/admin/receipts" },
    { label: "Voided Receipt Count", value: data.kpis.voidedReceiptCount.toLocaleString("en-PH"), note: "One per voided Payment", icon: AlertTriangle, href: "/admin/payments/history" },
    { label: "Pending Payment Requests", value: data.kpis.pendingPaymentRequestCount.toLocaleString("en-PH"), note: "Awaiting finance review", icon: ListChecks, href: "/admin/payments/requests" },
  ];
  return <section aria-labelledby="kpi-heading"><h2 id="kpi-heading" className="sr-only">Executive finance KPIs</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">{items.map((item) => {
    const Icon = item.icon;
    const content = <><div className="flex items-start justify-between gap-3"><p className="text-sm font-bold leading-5 text-slate-500">{item.label}</p><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-pine-50 text-pine-700"><Icon className="size-4" /></span></div><p className="mt-3 break-words text-xl font-black tabular-nums text-ink">{item.value}</p><p className="mt-1 text-xs text-slate-400">{item.note}</p></>;
    const className = "block min-h-36 rounded-lg border border-pine-100 bg-white p-4 shadow-soft transition hover:border-pine-300";
    return item.href ? <Link className={className} href={item.href} key={item.label}>{content}</Link> : <article className={className} key={item.label}>{content}</article>;
  })}</div></section>;
}

function Reconciliation({ data }: { data: FinanceDashboardData }) {
  const rows = [
    ["Total billed", data.reconciliation.totalBilled],
    ["Amount applied to bills", data.reconciliation.amountAppliedToBills],
    ["Unapplied credit", data.reconciliation.unappliedCredit],
    ["Active payment received", data.reconciliation.activePaymentReceived],
    ["Voided payment received", data.reconciliation.voidedPaymentReceived],
    ["Outstanding receivables", data.reconciliation.outstandingReceivables],
  ] as const;
  return <section className="mt-6 rounded-lg border border-pine-100 bg-white p-4 shadow-soft sm:p-5" aria-labelledby="reconciliation-heading"><div className="flex flex-col gap-2 border-b border-slate-100 pb-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-black uppercase tracking-wider text-pine-700">Control total</p><h2 id="reconciliation-heading" className="text-lg font-black">Reconciliation Summary</h2></div><p className="text-sm font-semibold text-slate-500">Active received = applied + unapplied credit</p></div><div className="mt-4 grid gap-4 lg:grid-cols-[1fr_340px]"><dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">{rows.map(([label, value]) => <div className="flex items-center justify-between gap-4 border-b border-slate-100 py-2" key={label}><dt className="text-sm text-slate-600">{label}</dt><dd className="font-black tabular-nums">{money(value)}</dd></div>)}</dl><div className={`rounded-lg border p-4 ${data.reconciliation.balanced ? "border-emerald-200 bg-emerald-50" : "border-rose-300 bg-rose-50"}`}><div className="flex items-center gap-2">{data.reconciliation.balanced ? <CircleDollarSign className="size-5 text-emerald-700" /> : <AlertTriangle className="size-5 text-rose-700" />}<h3 className="font-black">Reconciliation variance</h3></div><p className={`mt-3 text-2xl font-black tabular-nums ${data.reconciliation.balanced ? "text-emerald-800" : "text-rose-800"}`}>{money(data.reconciliation.variance)}</p><p className="mt-1 text-xs leading-5 text-slate-600">Tolerance: {money(data.reconciliation.tolerance)}. {data.reconciliation.balanced ? "Payment headers reconcile to allocations and credit." : "Review the visible variance before approving this report."}</p></div></div></section>;
}

function MonthlyTrend({ data }: { data: FinanceDashboardData }) {
  const maximum = Math.max(1, ...data.monthlyTrend.flatMap((row) => [row.activeCollections, row.amountAppliedToBills, row.unappliedCredit, row.voidedCollections]));
  const series = [
    { key: "activeCollections" as const, label: "Active collections", color: "bg-pine-600" },
    { key: "amountAppliedToBills" as const, label: "Applied to bills", color: "bg-leaf-600" },
    { key: "unappliedCredit" as const, label: "Unapplied credit", color: "bg-amber-400" },
    { key: "voidedCollections" as const, label: "Voided collections", color: "bg-rose-500" },
  ];
  return <section className="mt-6 min-w-0 overflow-hidden rounded-lg border border-pine-100 bg-white p-4 shadow-soft sm:p-5" aria-labelledby="trend-heading"><SectionHeading eyebrow="Calendar month" title="Monthly Collection Trend" id="trend-heading" /><div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold text-slate-600">{series.map((item) => <span className="inline-flex items-center gap-2" key={item.key}><span className={`size-2.5 rounded-sm ${item.color}`} />{item.label}</span>)}</div><div className="mt-5 w-full min-w-0 pb-2"><div className="grid h-64 items-end gap-1 sm:gap-2" style={{ gridTemplateColumns: `repeat(${data.monthlyTrend.length}, minmax(20px, 1fr))` }}>{data.monthlyTrend.map((month) => <div className="grid h-full min-w-0 grid-rows-[1fr_auto] gap-2" key={month.key}><div className="flex h-full items-end justify-center gap-px border-b border-slate-200 sm:gap-1">{series.map((item) => <span key={item.key} className={`w-1 rounded-t-sm sm:w-2.5 ${item.color}`} style={{ height: `${Math.max(month[item.key] ? 2 : 0, (month[item.key] / maximum) * 100)}%` }} title={`${month.label} - ${item.label}: ${money(month[item.key])}`}><span className="sr-only">{item.label}: {money(month[item.key])}</span></span>)}</div><p className="truncate text-center text-[10px] font-bold text-slate-500 sm:text-[11px]" title={month.label}><span className="sm:hidden">{month.label.slice(0, 3)}</span><span className="hidden sm:inline">{month.label}</span></p></div>)}</div></div><details className="mt-3 rounded-lg border border-slate-200"><summary className="cursor-pointer px-3 py-2 text-sm font-bold text-pine-700">Monthly values</summary><ResponsiveDataTable headers={["Month", "Active", "Applied", "Credit", "Voided"]} rows={data.monthlyTrend.map((row) => [row.label, money(row.activeCollections), money(row.amountAppliedToBills), money(row.unappliedCredit), money(row.voidedCollections)])} /></details></section>;
}

function AgingSummary({ data }: { data: FinanceDashboardData }) {
  const maximum = Math.max(1, ...data.aging.map((row) => row.amount));
  const colors = ["bg-emerald-500", "bg-sky-500", "bg-amber-400", "bg-orange-500", "bg-rose-600"];
  return <section className="rounded-lg border border-pine-100 bg-white p-4 shadow-soft sm:p-5" aria-labelledby="aging-heading"><SectionHeading eyebrow={`As of ${reportDate(data.range.toText)}`} title="Receivables Aging" id="aging-heading" /><div className="mt-5 space-y-4">{data.aging.map((row, index) => <div key={row.key}><div className="mb-1.5 flex items-end justify-between gap-3"><div><p className="text-sm font-black">{row.label}</p><p className="text-xs text-slate-500">{row.billCount} bill{row.billCount === 1 ? "" : "s"}</p></div><p className="text-sm font-black tabular-nums">{money(row.amount)}</p></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${colors[index]}`} style={{ width: `${(row.amount / maximum) * 100}%` }} title={`${row.label}: ${money(row.amount)}`} /></div></div>)}</div><ResponsiveDataTable headers={["Bucket", "Bills", "Amount"]} rows={data.aging.map((row) => [row.label, row.billCount.toLocaleString("en-PH"), money(row.amount)])} compact /></section>;
}

function PaymentMethods({ data }: { data: FinanceDashboardData }) {
  const maximum = Math.max(1, ...data.paymentMethods.map((row) => row.totalAmount));
  return <section className="rounded-lg border border-pine-100 bg-white p-4 shadow-soft sm:p-5" aria-labelledby="method-heading"><SectionHeading eyebrow="Active Payment headers" title="Payment Method Breakdown" id="method-heading" /><div className="mt-5 space-y-4">{data.paymentMethods.map((row, index) => <div key={row.method}><div className="mb-1.5 flex items-end justify-between gap-3"><div><p className="text-sm font-black">{row.label}</p><p className="text-xs text-slate-500">{row.transactionCount} transaction{row.transactionCount === 1 ? "" : "s"} · {row.percentage.toFixed(1)}%</p></div><p className="text-sm font-black tabular-nums">{money(row.totalAmount)}</p></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={index % 2 ? "h-full rounded-full bg-leaf-600" : "h-full rounded-full bg-pine-600"} style={{ width: `${(row.totalAmount / maximum) * 100}%` }} title={`${row.label}: ${money(row.totalAmount)}`} /></div></div>)}{!data.paymentMethods.length && <EmptyState text="No active collections in this reporting period." />}</div><ResponsiveDataTable headers={["Method", "Transactions", "Amount", "Share"]} rows={data.paymentMethods.map((row) => [row.label, row.transactionCount.toLocaleString("en-PH"), money(row.totalAmount), `${row.percentage.toFixed(1)}%`])} compact /></section>;
}

function RevenueBreakdown({ data }: { data: FinanceDashboardData }) {
  const maximum = Math.max(1, ...data.revenueBreakdown.flatMap((row) => [row.billedAmount, row.collectedAmount, row.outstandingAmount]));
  return <section className="mt-6 rounded-lg border border-pine-100 bg-white p-4 shadow-soft sm:p-5" aria-labelledby="revenue-heading"><SectionHeading eyebrow="Refundable bonds excluded" title="Revenue and Billing Type Breakdown" id="revenue-heading" /><div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.revenueBreakdown.map((row) => <article className="rounded-lg border border-slate-200 p-4" key={row.key}><h3 className="text-sm font-black">{row.label}</h3><div className="mt-3 space-y-3">{[["Billed", row.billedAmount, "bg-pine-600"], ["Collected / applied", row.collectedAmount, "bg-leaf-600"], ["Outstanding", row.outstandingAmount, "bg-rose-500"]].map(([label, value, color]) => <div key={String(label)}><div className="mb-1 flex justify-between gap-3 text-xs"><span className="text-slate-500">{label}</span><span className="font-black tabular-nums">{money(Number(value))}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${color}`} style={{ width: `${(Number(value) / maximum) * 100}%` }} /></div></div>)}</div></article>)}{!data.revenueBreakdown.length && <div className="md:col-span-2 xl:col-span-3"><EmptyState text="No billing or non-refundable collection activity in this reporting period." /></div>}</div><ResponsiveDataTable headers={["Billing type", "Billed", "Collected / applied", "Outstanding"]} rows={data.revenueBreakdown.map((row) => [row.label, money(row.billedAmount), money(row.collectedAmount), money(row.outstandingAmount)])} /></section>;
}

function DelinquentHomeowners({ data, canOpenSoa }: { data: FinanceDashboardData; canOpenSoa: boolean }) {
  const query = data.delinquent.search;
  return <section className="mt-6 rounded-lg border border-pine-100 bg-white p-4 shadow-soft sm:p-5" aria-labelledby="delinquent-heading"><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><SectionHeading eyebrow={`${data.delinquent.totalCount} matching homeowner${data.delinquent.totalCount === 1 ? "" : "s"}`} title="Top Delinquent Homeowners" id="delinquent-heading" /><form className="grid gap-2 sm:grid-cols-[minmax(220px,360px)_auto]" action="/admin/reports/dashboard"><input type="hidden" name="from" value={data.range.fromText} /><input type="hidden" name="to" value={data.range.toText} /><label className="relative"><span className="sr-only">Search delinquent homeowners</span><Search className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-slate-400" /><input className="field pl-10" name="q" type="search" defaultValue={query} placeholder="Search name, account, block, or lot" /></label><button className="btn-secondary" type="submit"><Search className="size-4" />Search</button></form></div><div className="mt-5 hidden overflow-hidden rounded-lg border border-slate-200 md:block"><table className="w-full border-collapse text-left text-sm"><thead className="bg-pine-50 text-xs uppercase text-pine-900"><tr><th className="px-3 py-3">Homeowner</th><th className="px-3 py-3">Account</th><th className="px-3 py-3">Block / Lot</th><th className="px-3 py-3 text-right">Outstanding</th><th className="px-3 py-3">Oldest unpaid</th><th className="px-3 py-3">Aging</th></tr></thead><tbody>{data.delinquent.rows.map((row) => <tr className="border-t border-slate-100" key={row.homeownerId}><td className="px-3 py-3 font-bold">{canOpenSoa ? <Link className="text-pine-700 hover:underline" href={`/admin/homeowners/${row.homeownerId}/soa`}>{row.homeownerName}</Link> : row.homeownerName}</td><td className="px-3 py-3 font-mono text-xs">{row.accountNumber}</td><td className="px-3 py-3">{row.block} / {row.lot}</td><td className="px-3 py-3 text-right font-black tabular-nums text-rose-700">{money(row.outstandingBalance)}</td><td className="px-3 py-3">{shortDate(row.oldestUnpaidDate)}</td><td className="px-3 py-3"><span className="rounded-full bg-rose-50 px-2 py-1 text-xs font-bold text-rose-700">{row.agingBucket}</span></td></tr>)}{!data.delinquent.rows.length && <tr><td colSpan={6}><EmptyState text="No homeowners match this delinquency search." /></td></tr>}</tbody></table></div><div className="mt-5 grid gap-3 md:hidden">{data.delinquent.rows.map((row) => <article className="rounded-lg border border-slate-200 p-4" key={row.homeownerId}><div className="flex items-start justify-between gap-3"><div><h3 className="font-black">{canOpenSoa ? <Link className="text-pine-700" href={`/admin/homeowners/${row.homeownerId}/soa`}>{row.homeownerName}</Link> : row.homeownerName}</h3><p className="mt-1 font-mono text-xs text-slate-500">{row.accountNumber}</p></div><span className="rounded-full bg-rose-50 px-2 py-1 text-xs font-bold text-rose-700">{row.agingBucket}</span></div><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-slate-500">Block / Lot</dt><dd className="font-bold">{row.block} / {row.lot}</dd></div><div className="text-right"><dt className="text-xs text-slate-500">Oldest unpaid</dt><dd className="font-bold">{shortDate(row.oldestUnpaidDate)}</dd></div><div className="col-span-2 border-t border-slate-100 pt-3"><dt className="text-xs text-slate-500">Outstanding balance</dt><dd className="text-xl font-black text-rose-700">{money(row.outstandingBalance)}</dd></div></dl></article>)}{!data.delinquent.rows.length && <EmptyState text="No homeowners match this delinquency search." />}</div><Pagination data={data} /></section>;
}

function RecentActivity({ data }: { data: FinanceDashboardData }) {
  return <section className="mt-6 rounded-lg border border-pine-100 bg-white p-4 shadow-soft sm:p-5" aria-labelledby="activity-heading"><SectionHeading eyebrow="Latest 30 events" title="Recent Finance Activity" id="activity-heading" /><div className="mt-5 hidden overflow-hidden rounded-lg border border-slate-200 lg:block"><table className="w-full border-collapse text-left text-sm"><thead className="bg-pine-50 text-xs uppercase text-pine-900"><tr><th className="px-3 py-3">Date / Time</th><th className="px-3 py-3">Activity</th><th className="px-3 py-3">Homeowner</th><th className="px-3 py-3">Receipt / Reference</th><th className="px-3 py-3 text-right">Amount</th><th className="px-3 py-3">Actor</th><th className="px-3 py-3">Status</th></tr></thead><tbody>{data.recentActivity.map((row, index) => <tr className="border-t border-slate-100" key={`${row.date.toISOString()}-${row.type}-${index}`}><td className="px-3 py-3 whitespace-nowrap">{dateTime(row.date)}</td><td className="px-3 py-3 font-bold">{row.type}</td><td className="px-3 py-3">{row.homeowner}</td><td className="px-3 py-3 font-mono text-xs">{row.reference}</td><td className="px-3 py-3 text-right font-black tabular-nums">{money(row.amount)}</td><td className="px-3 py-3">{row.actor}</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-xs font-bold ${statusTone(row.status.toUpperCase().replaceAll(" ", "_"))}`}>{row.status}</span></td></tr>)}{!data.recentActivity.length && <tr><td colSpan={7}><EmptyState text="No finance activity in this reporting period." /></td></tr>}</tbody></table></div><div className="mt-5 grid gap-3 lg:hidden">{data.recentActivity.map((row, index) => <article className="rounded-lg border border-slate-200 p-4" key={`${row.date.toISOString()}-${row.type}-${index}`}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-slate-500">{dateTime(row.date)}</p><h3 className="mt-1 font-black">{row.type}</h3></div><span className={`rounded-full px-2 py-1 text-xs font-bold ${statusTone(row.status.toUpperCase().replaceAll(" ", "_"))}`}>{row.status}</span></div><p className="mt-3 text-sm font-semibold">{row.homeowner}</p><p className="mt-1 break-all font-mono text-xs text-slate-500">{row.reference}</p><div className="mt-3 flex items-end justify-between gap-3 border-t border-slate-100 pt-3"><p className="text-xs text-slate-500">{row.actor}</p><p className="font-black tabular-nums">{money(row.amount)}</p></div></article>)}{!data.recentActivity.length && <EmptyState text="No finance activity in this reporting period." />}</div></section>;
}

function Pagination({ data }: { data: FinanceDashboardData }) {
  const pageUrl = (page: number) => { const query = new URLSearchParams({ from: data.range.fromText, to: data.range.toText, page: String(page) }); if (data.delinquent.search) query.set("q", data.delinquent.search); return `/admin/reports/dashboard?${query}`; };
  return <nav className="mt-4 flex flex-col items-center justify-between gap-3 border-t border-slate-100 pt-4 text-sm sm:flex-row" aria-label="Delinquent homeowners pages"><p className="font-semibold text-slate-500">Page {data.delinquent.page} of {data.delinquent.pageCount}</p><div className="flex w-full gap-2 sm:w-auto">{data.delinquent.page > 1 ? <Link className="btn-secondary flex-1" href={pageUrl(data.delinquent.page - 1)}>Previous</Link> : <span className="btn-secondary flex-1 cursor-not-allowed opacity-50">Previous</span>}{data.delinquent.page < data.delinquent.pageCount ? <Link className="btn-secondary flex-1" href={pageUrl(data.delinquent.page + 1)}>Next</Link> : <span className="btn-secondary flex-1 cursor-not-allowed opacity-50">Next</span>}</div></nav>;
}

function SectionHeading({ eyebrow, title, id }: { eyebrow: string; title: string; id: string }) { return <div><p className="text-xs font-black uppercase tracking-wider text-pine-700">{eyebrow}</p><h2 id={id} className="mt-1 text-lg font-black text-ink">{title}</h2></div>; }
function EmptyState({ text }: { text: string }) { return <div className="grid min-h-24 place-items-center p-4 text-center text-sm font-semibold text-slate-500"><UsersRound className="mb-2 size-6 text-slate-300" /><p>{text}</p></div>; }
function ResponsiveDataTable({ headers, rows, compact = false }: { headers: string[]; rows: string[][]; compact?: boolean }) { return <div className={`${compact ? "mt-5" : "mt-4"} max-w-full overflow-x-auto rounded-lg border border-slate-200`}><table className="w-full table-fixed border-collapse text-left text-[10px] sm:text-sm md:min-w-[580px] md:table-auto"><thead className="bg-slate-50 text-[9px] uppercase text-slate-600 sm:text-xs"><tr>{headers.map((header) => <th className="break-all px-1.5 py-2 sm:break-normal sm:px-3" key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr className="border-t border-slate-100" key={rowIndex}>{row.map((cell, cellIndex) => <td className={`break-all px-1.5 py-2 sm:break-normal sm:px-3 ${cellIndex > 0 ? "text-right tabular-nums" : "font-semibold"}`} key={cellIndex}>{cell}</td>)}</tr>)}{!rows.length && <tr><td className="px-3 py-6 text-center text-slate-500" colSpan={headers.length}>No values for this reporting period.</td></tr>}</tbody></table></div>; }
function dateTime(value: Date) { return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" }).format(value); }
function reportDate(value: string) { return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00.000Z`)); }
