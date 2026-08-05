"use server";

import { Permission } from "@/lib/authorization/permissions";
import { requirePermission } from "@/lib/authorization/guards";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { expenseCategorySchema, expenseSchema } from "@/lib/validation";

export async function saveExpenseCategoryAction(formData: FormData) {
  await requirePermission(Permission.EXPENSES_MANAGE);
  const parsed = expenseCategorySchema.safeParse({ ...Object.fromEntries(formData.entries()), active: formData.get("active") === "on" });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Invalid expense category.");
  const { id, description, ...data } = parsed.data;
  const values = { ...data, description: description || null };
  if (id) await prisma.expenseCategory.update({ where: { id }, data: values });
  else await prisma.expenseCategory.create({ data: values });
  revalidatePath("/admin/expenses");
  redirect("/admin/expenses?success=saved&message=Expense%20category%20saved%20successfully.");
}

export async function deleteExpenseCategoryAction(formData: FormData) {
  await requirePermission(Permission.EXPENSES_MANAGE);
  const id = String(formData.get("id") || "");
  const category = await prisma.expenseCategory.findUnique({ where: { id }, select: { _count: { select: { expenses: true } } } });
  if (!category) throw new Error("Expense category not found.");
  if (category._count.expenses) throw new Error("A category with expense history cannot be deleted. Mark it inactive instead.");
  await prisma.expenseCategory.delete({ where: { id } });
  revalidatePath("/admin/expenses");
  redirect("/admin/expenses?success=deleted&message=Expense%20category%20deleted%20successfully.");
}

export async function saveExpenseAction(formData: FormData) {
  const admin = await requirePermission(Permission.EXPENSES_MANAGE);
  const parsed = expenseSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Invalid expense details.");
  const { id, expenseDate, referenceNumber, voucherNumber, remarks, ...data } = parsed.data;
  const values = { ...data, expenseDate: new Date(`${expenseDate}T00:00:00.000Z`), referenceNumber: referenceNumber || null, voucherNumber: voucherNumber || null, remarks: remarks || null };
  if (id) await prisma.expense.update({ where: { id }, data: values });
  else await prisma.expense.create({ data: { ...values, createdById: admin.id } });
  revalidateExpensePages();
  redirect("/admin/expenses?success=saved");
}

export async function deleteExpenseAction(formData: FormData) {
  await requirePermission(Permission.EXPENSES_MANAGE);
  await prisma.expense.delete({ where: { id: String(formData.get("id") || "") } });
  revalidateExpensePages();
  redirect("/admin/expenses?success=deleted&message=Expense%20record%20deleted%20successfully.");
}

function revalidateExpensePages() {
  revalidatePath("/admin/expenses");
  revalidatePath("/admin/reports");
  revalidatePath("/admin/dashboard");
}
