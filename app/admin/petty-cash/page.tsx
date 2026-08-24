import { Banknote, CirclePlus, FileText, ReceiptText } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import { requirePettyCashFeature } from "@/lib/petty-cash/entitlement";
import { listPettyCashVouchers } from "@/lib/petty-cash/service";
import { money, shortDate } from "@/lib/utils";

export default async function PettyCashPage() {
  const admin = await requirePermission(Permission.EXPENSES_MANAGE);
  await requirePettyCashFeature(admin.tenantId);
  const vouchers = await listPettyCashVouchers(admin.tenantId);
  const now = new Date();
  const thisMonth = vouchers.filter((item) => item.transactionDate.getUTCFullYear() === now.getUTCFullYear() && item.transactionDate.getUTCMonth() === now.getUTCMonth());
  const monthAmount = thisMonth.reduce((sum, item) => sum + Number(item.totalAmount), 0);
  const latest = vouchers[0];

  return <>
    <PageHeader
      eyebrow="Finance · Cash disbursement"
      title="Petty Cash Vouchers"
      description="Create traceable petty cash disbursements, post each line to the tenant expense ledger, and print compact half-A4 vouchers."
      action={<Link className="btn-primary inline-flex min-h-11 items-center gap-2" href="/admin/petty-cash/new"><CirclePlus className="size-4" /> Create voucher</Link>}
    />

    <section className="mb-6 grid gap-3 sm:grid-cols-3" aria-label="Petty cash summary">
      <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><span className="grid size-10 place-items-center rounded-xl bg-pine-50 text-pine-700"><ReceiptText className="size-4" /></span><p className="mt-3 text-xs font-black uppercase tracking-wide text-slate-400">This month</p><p className="mt-1 text-2xl font-black text-ink">{thisMonth.length}</p><p className="text-xs text-slate-500">voucher{thisMonth.length === 1 ? "" : "s"}</p></article>
      <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><span className="grid size-10 place-items-center rounded-xl bg-sky-50 text-sky-700"><Banknote className="size-4" /></span><p className="mt-3 text-xs font-black uppercase tracking-wide text-slate-400">Month amount</p><p className="mt-1 text-2xl font-black text-ink">{money(monthAmount)}</p><p className="text-xs text-slate-500">posted to expense ledger</p></article>
      <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><span className="grid size-10 place-items-center rounded-xl bg-violet-50 text-violet-700"><FileText className="size-4" /></span><p className="mt-3 text-xs font-black uppercase tracking-wide text-slate-400">Latest transaction</p><p className="mt-1 truncate font-mono text-base font-black text-ink">{latest?.voucherNumber ?? "No vouchers yet"}</p><p className="text-xs text-slate-500">{latest ? shortDate(latest.transactionDate) : "Create the first petty cash voucher"}</p></article>
    </section>

    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-black text-ink">Voucher register</h2><p className="mt-1 text-sm text-slate-500">Open any voucher to review or print it.</p></div><Link className="text-sm font-black text-pine-700 hover:underline" href="/admin/expenses">Manage expense types</Link></div>
      {vouchers.length ? <>
        <div className="space-y-3 p-4 sm:hidden">
          {vouchers.map((voucher) => <Link key={voucher.id} href={`/admin/petty-cash/${voucher.id}`} className="block rounded-2xl border border-slate-200 p-4 transition hover:border-pine-200 hover:bg-pine-50/40"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-mono text-sm font-black text-pine-800">{voucher.voucherNumber}</p><p className="mt-1 truncate font-black text-ink">{voucher.payeeName}</p><p className="mt-1 text-xs text-slate-500">{shortDate(voucher.transactionDate)} · {Number(voucher.itemCount)} item{Number(voucher.itemCount) === 1 ? "" : "s"}</p></div><strong className="shrink-0 text-sm text-ink">{money(Number(voucher.totalAmount))}</strong></div></Link>)}
        </div>
        <div className="hidden overflow-x-auto sm:block"><table className="w-full min-w-[760px] text-sm"><thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Voucher no.</th><th className="px-5 py-3">Date</th><th className="px-5 py-3">Payee</th><th className="px-5 py-3">Type</th><th className="px-5 py-3 text-center">Items</th><th className="px-5 py-3 text-right">Amount</th><th className="px-5 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{vouchers.map((voucher) => <tr key={voucher.id} className="hover:bg-slate-50"><td className="px-5 py-4 font-mono font-black text-pine-800">{voucher.voucherNumber}</td><td className="px-5 py-4">{shortDate(voucher.transactionDate)}</td><td className="px-5 py-4 font-bold text-ink">{voucher.payeeName}</td><td className="px-5 py-4 text-slate-500">{voucher.payeeType.replaceAll("_", " ")}</td><td className="px-5 py-4 text-center">{Number(voucher.itemCount)}</td><td className="px-5 py-4 text-right font-black">{money(Number(voucher.totalAmount))}</td><td className="px-5 py-4 text-right"><Link className="font-black text-pine-700 hover:underline" href={`/admin/petty-cash/${voucher.id}`}>Open / Print</Link></td></tr>)}</tbody></table></div>
      </> : <div className="grid min-h-56 place-items-center p-6 text-center"><div><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-500"><ReceiptText className="size-5" /></span><h3 className="mt-3 font-black text-ink">No petty cash vouchers yet</h3><p className="mt-1 text-sm text-slate-500">Create a voucher to start the tenant cash-disbursement register.</p><Link className="btn-primary mt-4 inline-flex min-h-11 items-center gap-2" href="/admin/petty-cash/new"><CirclePlus className="size-4" /> Create first voucher</Link></div></div>}
    </section>
  </>;
}
