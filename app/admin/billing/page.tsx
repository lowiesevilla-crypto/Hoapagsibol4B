import Link from "next/link";
import { RecurringChargeType } from "@prisma/client";
import { Archive, BellRing, ShieldCheck } from "lucide-react";
import { BillArchiveForm } from "@/components/bill-archive-form";
import { BillForm } from "@/components/bill-form";
import { BillRemarks } from "@/components/bill-remarks";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { DeleteButton, SearchInput, SubmitButton } from "@/components/ui";
import { generateMonthlyBillsAction, refreshOverdueBills } from "@/lib/actions/billing";
import { sendRemindersAction } from "@/lib/actions/content";
import { deleteDuesExemptionAction, saveDuesExemptionAction } from "@/lib/actions/exemptions";
import { prisma } from "@/lib/db";
import { findEffectiveBillingRule } from "@/lib/services/billing-rules";
import { money, monthLabel, shortDate } from "@/lib/utils";

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ edit?: string; error?: string }> }) {
  const user = await refreshOverdueBills();
  const query = await searchParams;
  const { edit } = query;
  const today = new Date();
  const [homeowners, bills, archivedBills, editBill, exemptions, currentRule] = await Promise.all([
    prisma.homeownerProfile.findMany({ where: { status: "ACTIVE" }, include: { user: true }, orderBy: { user: { name: "asc" } } }),
    prisma.bill.findMany({ where: { archivedAt: null }, include: { homeowner: { include: { user: true } }, _count: { select: { payments: true, paymentRequests: true } } }, orderBy: [{ billingMonth: "desc" }, { dueDate: "desc" }] }),
    prisma.bill.findMany({ where: { archivedAt: { not: null } }, include: { homeowner: { include: { user: true } }, archivedBy: true, _count: { select: { payments: true, paymentRequests: true } } }, orderBy: { archivedAt: "desc" }, take: 50 }),
    edit ? prisma.bill.findFirst({ where: { id: edit, archivedAt: null } }) : null,
    prisma.duesExemption.findMany({ where: { active: true }, include: { homeowner: { include: { user: true } }, createdBy: true }, orderBy: [{ billingMonth: "desc" }, { homeowner: { user: { name: "asc" } } }] }),
    findEffectiveBillingRule(user.tenantId, RecurringChargeType.MONTHLY_DUES, today.getUTCFullYear(), today.getUTCMonth() + 1),
  ]);
  return <><PageHeader eyebrow="Collections" title="Billing management" description="Generate dues, maintain bill details, and follow up outstanding accounts." action={<form action={sendRemindersAction}><SubmitButton className="btn-secondary"><BellRing className="size-4" /> Send due reminders</SubmitButton></form>} />
    {query.error && <div role="alert" className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">{query.error}</div>}
    <section className="mb-6 grid gap-5 xl:grid-cols-2">
      <form action={generateMonthlyBillsAction} className="card"><div className="mb-5"><h2 className="text-lg font-black">Generate monthly dues</h2><p className="text-sm text-slate-500">Creates bills only after an effective billing rule exists, skips duplicates, and excludes approved exemption periods.</p>{currentRule ? <p className="mt-2 text-xs font-bold text-pine-700">Active rule: {currentRule.resolutionReference} at {money(currentRule.amount)}</p> : <p className="mt-2 text-xs font-bold text-amber-700">No billing rule configured. Configure an approved rule before rule-based generation.</p>}<Link className="mt-2 inline-flex text-xs font-bold text-pine-700 hover:underline" href="/admin/settings/billing-rules">Manage billing rules</Link></div><div className="grid gap-4 sm:grid-cols-2"><div><label className="label">Billing month</label><input className="field" name="billingMonth" type="month" defaultValue={new Date().toISOString().slice(0, 7)} required /></div><div><label className="label">Due date</label><input className="field" name="dueDate" type="date" required /></div></div><div className="mt-5"><SubmitButton>Generate monthly bills</SubmitButton></div></form>
      <BillForm homeowners={homeowners} bill={editBill ?? undefined} />
    </section>
    <section className="card mb-6"><div className="mb-5 flex items-start gap-3"><span className="grid size-10 place-items-center rounded-xl bg-leaf-50 text-leaf-700"><ShieldCheck className="size-5" /></span><div><h2 className="text-lg font-black">Monthly dues exemptions</h2><p className="text-sm text-slate-500">Quick-add a single-month exemption here, or manage full exemption periods in Finance settings.</p><Link className="mt-2 inline-flex text-xs font-bold text-pine-700 hover:underline" href="/admin/settings/billing-exemptions">Manage exemption periods</Link></div></div>
      <form action={saveDuesExemptionAction} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[1.2fr_.7fr_1.5fr_auto] xl:items-end"><div><label className="label">Homeowner</label><select className="field" name="homeownerId" required><option value="">Select homeowner</option>{homeowners.map((homeowner) => <option key={homeowner.id} value={homeowner.id}>{homeowner.user.name} - B{homeowner.block} L{homeowner.lot}</option>)}</select></div><div><label className="label">Exempt month</label><input className="field" name="billingMonth" type="month" required /></div><div><label className="label">Reason / board approval</label><input className="field" name="reason" placeholder="Example: Board Resolution No. 2026-04" required /></div><SubmitButton>Add exemption</SubmitButton></form>
      <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200"><table className="data-table"><thead><tr><th>Homeowner</th><th>Exempt month</th><th>Reason</th><th>Approved by</th><th></th></tr></thead><tbody>{exemptions.map((item) => <tr key={item.id}><td className="font-bold">{item.homeowner.user.name}<span className="block text-xs font-normal text-slate-400">B{item.homeowner.block} L{item.homeowner.lot}</span></td><td>{monthLabel(item.billingMonth)}</td><td>{item.reason}</td><td>{item.createdBy.name}</td><td className="text-right"><form action={deleteDuesExemptionAction}><input type="hidden" name="id" value={item.id} /><DeleteButton label="Deactivate" /></form></td></tr>)}{!exemptions.length && <tr><td colSpan={5} className="py-8 text-center text-slate-500">No active monthly dues exemptions recorded.</td></tr>}</tbody></table></div>
    </section>
    <div className="mb-4"><SearchInput placeholder="Search homeowner, month or status" /></div>
    <div className="table-wrap"><table className="data-table"><thead><tr><th>Account</th><th>Billing month</th><th>Remarks</th><th>Due</th><th>Status</th><th>Total</th><th>Balance</th><th></th></tr></thead><tbody>
      {bills.map((bill) => <tr key={bill.id} data-search={`${bill.homeowner.user.name} ${monthLabel(bill.billingMonth)} ${bill.status} ${bill.notes ?? ""}`.toLowerCase()}><td><p className="font-bold">{bill.homeowner.user.name}</p><p className="text-xs text-slate-400">B{bill.homeowner.block} L{bill.homeowner.lot}</p></td><td>{monthLabel(bill.billingMonth)}</td><td><BillRemarks notes={bill.notes} showSource /></td><td>{shortDate(bill.dueDate)}</td><td><StatusBadge status={bill.status} /></td><td>{money(bill.totalAmount)}</td><td className="font-black">{money(bill.balance)}</td><td><div className="flex justify-end gap-2"><Link className="btn-secondary min-h-8 px-3 py-1" href={`/admin/billing?edit=${bill.id}`}>Edit</Link><BillArchiveForm id={bill.id} homeowner={bill.homeowner.user.name} billingMonth={monthLabel(bill.billingMonth)} paymentCount={bill._count.payments} requestCount={bill._count.paymentRequests} /></div></td></tr>)}
      {!bills.length && <tr><td colSpan={8} className="py-12 text-center text-slate-500">No bills yet. Generate the first monthly cycle above.</td></tr>}
    </tbody></table></div>
    <details className="card mt-6"><summary className="flex cursor-pointer list-none items-center gap-3 font-black"><span className="grid size-9 place-items-center rounded-xl bg-slate-100 text-slate-600"><Archive className="size-4" /></span>Archived billing history <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500">{archivedBills.length}</span></summary><p className="mt-2 text-sm text-slate-500">Archived records stay out of active billing while preserving payments, receipts, requests, and audit history.</p><div className="table-wrap mt-4 shadow-none"><table className="data-table"><thead><tr><th>Account</th><th>Billing month</th><th>Paid</th><th>Balance</th><th>Related records</th><th>Archived by</th><th>Reason</th></tr></thead><tbody>{archivedBills.map((bill) => <tr key={bill.id}><td className="font-bold">{bill.homeowner.user.name}</td><td>{monthLabel(bill.billingMonth)}</td><td>{money(bill.amountPaid)}</td><td>{money(bill.balance)}</td><td className="text-xs text-slate-500">{bill._count.payments} payment(s), {bill._count.paymentRequests} request(s)</td><td><p className="font-semibold">{bill.archivedBy?.name ?? "Administrator"}</p><p className="text-xs text-slate-400">{bill.archivedAt ? shortDate(bill.archivedAt) : "-"}</p></td><td className="max-w-xs text-sm text-slate-500">{bill.archiveReason || "-"}</td></tr>)}{!archivedBills.length && <tr><td colSpan={7} className="py-8 text-center text-slate-500">No archived billing records.</td></tr>}</tbody></table></div></details>
  </>;
}
