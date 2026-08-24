"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import { prisma } from "@/lib/db";
import { expenseCategorySchema, expenseSchema } from "@/lib/validation";

type PettyCashExpenseLink = { voucherId: string; voucherNumber: string };

async function getPettyCashExpenseLink(expenseId: string, tenantId: string) {
  const rows = await prisma.$queryRaw<PettyCashExpenseLink[]>(Prisma.sql`
    SELECT i.voucherId, v.voucherNumber
    FROM PettyCashVoucherItem i
    JOIN PettyCashVoucher v ON v.id=i.voucherId AND v.tenantId=i.tenantId
    WHERE i.tenantId=${tenantId} AND i.expenseId=${expenseId}
    LIMIT 1
  `);
  return rows[0] ?? null;
}

export async function saveExpenseCategoryAction(formData: FormData) {
  const admin = await requirePermission(Permission.EXPENSES_MANAGE);
  const parsed = expenseCategorySchema.safeParse({ ...Object.fromEntries(formData.entries()), active: formData.get("active") === "on" });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Invalid expense category.");
  const { id, description, ...data } = parsed.data;
  const values = { ...data, description: description || null };
  if (id) {
    const existing = await prisma.expenseCategory.findFirst({ where: { id, tenantId: admin.tenantId }, select: { id: true } });
    if (!existing) throw new Error("Expense category not found.");
    await prisma.expenseCategory.update({ where: { id }, data: values });
  } else {
    await prisma.expenseCategory.create({ data: { ...values, tenantId: admin.tenantId } });
  }
  revalidatePath("/admin/expenses");
  redirect("/admin/expenses?success=saved&message=Expense%20category%20saved%20successfully.");
}

export async function deleteExpenseCategoryAction(formData: FormData) {
  const admin = await requirePermission(Permission.EXPENSES_MANAGE);
  const id = String(formData.get("id") || "");
  const category = await prisma.expenseCategory.findFirst({ where: { id, tenantId: admin.tenantId }, select: { id: true, _count: { select: { expenses: true } } } });
  if (!category) throw new Error("Expense category not found.");
  if (category._count.expenses) throw new Error("A category with expense history cannot be deleted. Mark it inactive instead.");
  await prisma.expenseCategory.delete({ where: { id: category.id } });
  revalidatePath("/admin/expenses");
  redirect("/admin/expenses?success=deleted&message=Expense%20category%20deleted%20successfully.");
}

export async function saveExpenseAction(formData: FormData) {
  const admin = await requirePermission(Permission.EXPENSES_MANAGE);
  const parsed = expenseSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Invalid expense details.");
  const { id, expenseDate, referenceNumber, voucherNumber, remarks, ...data } = parsed.data;
  const values = { ...data, expenseDate: new Date(`${expenseDate}T00:00:00.000Z`), referenceNumber: referenceNumber || null, voucherNumber: voucherNumber || null, remarks: remarks || null };
  if (id) {
    const existing = await prisma.expense.findFirst({ where: { id, tenantId: admin.tenantId }, select: { id: true } });
    if (!existing) throw new Error("Expense record not found.");
    const pettyCashLink = await getPettyCashExpenseLink(id, admin.tenantId);
    if (pettyCashLink) redirect(`/admin/petty-cash/${pettyCashLink.voucherId}/edit?error=${encodeURIComponent(`This expense belongs to Petty Cash Voucher ${pettyCashLink.voucherNumber}. Edit it from the voucher so the expense ledger and voucher remain synchronized.`)}`);
    await prisma.expense.update({ where: { id }, data: values });
  } else {
    await prisma.expense.create({ data: { ...values, tenantId: admin.tenantId, createdById: admin.id } });
  }
  revalidateExpensePages();
  redirect("/admin/expenses?success=saved");
}

export async function deleteExpenseAction(formData: FormData) {
  const admin = await requirePermission(Permission.EXPENSES_MANAGE);
  const id = String(formData.get("id") || "");
  const existing = await prisma.expense.findFirst({ where: { id, tenantId: admin.tenantId }, select: { id: true } });
  if (!existing) throw new Error("Expense record not found.");
  const pettyCashLink = await getPettyCashExpenseLink(id, admin.tenantId);
  if (pettyCashLink) redirect(`/admin/petty-cash/${pettyCashLink.voucherId}?error=${encodeURIComponent(`This expense belongs to Petty Cash Voucher ${pettyCashLink.voucherNumber}. Delete the voucher from Voucher View so all linked expense and payroll records are handled safely.`)}`);
  await prisma.expense.delete({ where: { id } });
  revalidateExpensePages();
  redirect("/admin/expenses?success=deleted&message=Expense%20record%20deleted%20successfully.");
}

function revalidateExpensePages() {
  revalidatePath("/admin/expenses");
  revalidatePath("/admin/petty-cash");
  revalidatePath("/admin/reports");
  revalidatePath("/admin/dashboard");
}
