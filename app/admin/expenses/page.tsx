import { Prisma } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { DeleteButton, SearchInput, SubmitButton } from "@/components/ui";
import { deleteExpenseAction, deleteExpenseCategoryAction, saveExpenseAction, saveExpenseCategoryAction } from "@/lib/actions/expenses";
import { requirePermission } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import { prisma } from "@/lib/db";
import { inputDate, money, shortDate } from "@/lib/utils";

type PettyCashExpenseLink = { expenseId: string; voucherId: string; voucherNumber: string };

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const admin = await requirePermission(Permission.EXPENSES_MANAGE);
  const { edit } = await searchParams;
  const [categories, expenses, selected, voucherLinks] = await Promise.all([
    prisma.expenseCategory.findMany({ where: { tenantId: admin.tenantId }, include: { _count: { select: { expenses: true } } }, orderBy: { name: "asc" } }),
    prisma.expense.findMany({ where: { tenantId: admin.tenantId }, include: { category: true, createdBy: true }, orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }] }),
    edit ? prisma.expense.findFirst({ where: { id: edit, tenantId: admin.tenantId } }) : null,
    prisma.$queryRaw<PettyCashExpenseLink[]>(Prisma.sql`
      SELECT i.expenseId, i.voucherId, v.voucherNumber
      FROM PettyCashVoucherItem i
      JOIN PettyCashVoucher v ON v.id=i.voucherId AND v.tenantId=i.tenantId
      WHERE i.tenantId=${admin.tenantId}
    `),
  ]);
  const voucherByExpense = new Map(voucherLinks.map((item) => [item.expenseId, item]));
  if (selected) {
    const voucherLink = voucherByExpense.get(selected.id);
    if (voucherLink) redirect(`/admin/petty-cash/${voucherLink.voucherId}/edit?error=${encodeURIComponent(`This expense is managed by Petty Cash Voucher ${voucherLink.voucherNumber}. Edit the voucher instead of the expense history row.`)}`);
  }

  const total = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  return <><PageHeader eyebrow="Financials" title="Expenses" description={`Track disbursements using administrator-defined categories. Total recorded: ${money(total)}.`} />
    <section className="mb-6 grid gap-5 xl:grid-cols-[2fr_1fr]"><form action={saveExpenseAction} className="card">{selected && <input type="hidden" name="id" value={selected.id} />}<div className="mb-5"><h2 className="text-lg font-black">{selected ? "Edit expense" : "Record an expense"}</h2><p className="text-sm text-slate-500">Manual expenses can be maintained here. Petty Cash-generated expenses are managed from their source voucher.</p></div><div className="grid gap-4 sm:grid-cols-2"><div><label className="label">Category</label><select className="field" name="categoryId" defaultValue={selected?.categoryId} required><option value="">Select category</option>{categories.filter((category) => category.active || category.id === selected?.categoryId).map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></div><div><label className="label">Expense date</label><input className="field" name="expenseDate" type="date" defaultValue={selected ? inputDate(selected.expenseDate) : inputDate(new Date())} required /></div><div className="sm:col-span-2"><label className="label">Description</label><input className="field" name="description" defaultValue={selected?.description} required /></div><div><label className="label">Payee / supplier</label><input className="field" name="payee" defaultValue={selected?.payee} required /></div><div><label className="label">Amount</label><input className="field" name="amount" type="number" min="0.01" step="0.01" defaultValue={selected ? String(selected.amount) : ""} required /></div><div><label className="label">Method</label><select className="field" name="method" defaultValue={selected?.method ?? "CASH"}><option value="CASH">Cash</option><option value="BANK_TRANSFER">Bank transfer</option><option value="GCASH">GCash</option><option value="CHECK">Check</option><option value="OTHER">Other</option></select></div><div><label className="label">Reference number</label><input className="field" name="referenceNumber" defaultValue={selected?.referenceNumber ?? ""} /></div><div><label className="label">Voucher number</label><input className="field" name="voucherNumber" defaultValue={selected?.voucherNumber ?? ""} /></div><div><label className="label">Remarks</label><input className="field" name="remarks" defaultValue={selected?.remarks ?? ""} /></div></div><div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap"><SubmitButton>{selected ? "Save changes" : "Record expense"}</SubmitButton>{selected && <Link className="btn-secondary" href="/admin/expenses">Cancel</Link>}</div></form>
      <div className="card h-fit"><h2 className="text-lg font-black">Expense categories</h2><p className="mb-4 text-sm text-slate-500">Add a new reporting type anytime.</p><form action={saveExpenseCategoryAction} className="space-y-3"><div><label className="label">Category name</label><input className="field" name="name" placeholder="e.g. Security services" required /></div><div><label className="label">Description</label><input className="field" name="description" /></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked className="accent-pine-600" /> Active</label><SubmitButton className="btn-secondary w-full">Add category</SubmitButton></form><div className="mt-5 space-y-2 border-t pt-4">{categories.map((category) => <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 p-2 text-sm" key={category.id}><span><b>{category.name}</b> <span className="text-xs text-slate-400">({category._count.expenses})</span></span>{!category._count.expenses && <form action={deleteExpenseCategoryAction}><input type="hidden" name="id" value={category.id} /><DeleteButton /></form>}</div>)}</div></div></section>

    <div className="mb-4 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950"><b>Expense history rule:</b> entries generated by Petty Cash Vouchers are read-only here. Use <b>View Voucher</b> to edit or delete the source transaction so all linked expense and payroll records stay synchronized.</div>
    <div className="mb-4"><SearchInput placeholder="Search category, payee, voucher or reference" /></div>
    <div className="table-wrap"><table className="data-table"><thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Payee</th><th>Voucher / reference</th><th>Source</th><th>Method</th><th className="text-right">Amount</th><th></th></tr></thead><tbody>{expenses.map((expense) => {
      const voucherLink = voucherByExpense.get(expense.id);
      return <tr key={expense.id} data-search={`${expense.category.name} ${expense.payee} ${expense.description} ${expense.voucherNumber ?? ""} ${expense.referenceNumber ?? ""} ${voucherLink ? "petty cash voucher" : "manual expense"}`.toLowerCase()}><td>{shortDate(expense.expenseDate)}</td><td className="font-bold">{expense.category.name}</td><td>{expense.description}</td><td>{expense.payee}</td><td><p>{expense.voucherNumber || "-"}</p><p className="text-xs text-slate-400">{expense.referenceNumber || ""}</p></td><td>{voucherLink ? <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-800">Petty Cash Voucher</span> : <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">Manual expense</span>}</td><td>{expense.method.replaceAll("_", " ")}</td><td className="text-right font-black text-rose-700">{money(expense.amount)}</td><td><div className="flex justify-end gap-2">{voucherLink ? <><Link className="btn-secondary min-h-8 px-3 py-1" href={`/admin/petty-cash/${voucherLink.voucherId}`}>View Voucher</Link><button type="button" disabled title="Managed from Petty Cash Voucher" className="btn-secondary min-h-8 cursor-not-allowed px-3 py-1 opacity-40">Edit</button><button type="button" disabled title="Delete from Petty Cash Voucher View" className="min-h-8 cursor-not-allowed rounded-lg border border-rose-200 px-3 py-1 text-sm font-bold text-rose-400 opacity-40">Delete</button></> : <><Link className="btn-secondary min-h-8 px-3 py-1" href={`/admin/expenses?edit=${expense.id}`}>Edit</Link><form action={deleteExpenseAction}><input type="hidden" name="id" value={expense.id} /><DeleteButton /></form></>}</div></td></tr>;
    })}{!expenses.length && <tr><td colSpan={9} className="py-12 text-center text-slate-500">No expenses recorded yet.</td></tr>}</tbody></table></div>
  </>;
}
