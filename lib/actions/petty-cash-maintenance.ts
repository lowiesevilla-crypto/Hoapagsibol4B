"use server";

import { randomUUID } from "node:crypto";
import { EmployeeLoanStatus, EmployeeLoanType, PaymentMethod, PayrollStatus, Prisma, TenantModule } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import { prisma } from "@/lib/db";
import type { PettyCashApproverType, PettyCashPayeeType } from "@/lib/petty-cash/constants";
import { requirePettyCashFeature } from "@/lib/petty-cash/entitlement";
import { getEnabledTenantModules } from "@/lib/tenant";

type DraftVoucherItem = { categoryId?: string; otherParticular?: string; amount?: string | number };
type ResolvedVoucherItem = { categoryId: string; particular: string; amount: number };
type ExistingVoucher = {
  id: string;
  voucherNumber: string;
  payeeType: string;
  payeeEntityId: string | null;
  employeeId: string | null;
  employeeLoanId: string | null;
  status: string;
};
type ExistingVoucherItem = { expenseId: string };

const LOCKED_PAYROLL_STATUSES = new Set<PayrollStatus>([
  PayrollStatus.FINALIZED,
  PayrollStatus.POSTING,
  PayrollStatus.POSTED,
  PayrollStatus.PAID,
]);

function clean(value: FormDataEntryValue | null) {
  return String(value || "").trim();
}

function normalizeParticular(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function positiveMoney(value: string | number | undefined, label: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error(`${label} must be greater than zero.`);
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function parseItems(raw: string): DraftVoucherItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Voucher particulars are invalid. Refresh the form and try again.");
  }
  if (!Array.isArray(parsed) || !parsed.length) throw new Error("Add at least one petty cash particular.");
  if (parsed.length > 40) throw new Error("A voucher can contain up to 40 particulars.");
  return parsed as DraftVoucherItem[];
}

async function resolvePayee(
  tx: Prisma.TransactionClient,
  tenantId: string,
  payeeType: PettyCashPayeeType,
  payeeEntityId: string,
  otherPayeeName: string,
  existingEntityId: string | null,
) {
  if (payeeType === "OTHER") {
    if (!otherPayeeName) throw new Error("Enter the payee name when Other is selected.");
    return { id: null, name: otherPayeeName, address: "" };
  }
  if (!payeeEntityId) throw new Error(`Select a ${payeeType.toLowerCase()} payee.`);
  const allowExisting = payeeEntityId === existingEntityId;

  if (payeeType === "EMPLOYEE") {
    const employee = await tx.employeeProfile.findFirst({
      where: { id: payeeEntityId, tenantId, ...(allowExisting ? {} : { status: "ACTIVE" }) },
      select: { id: true, name: true, address: true },
    });
    if (!employee) throw new Error("Selected employee is not available.");
    return { id: employee.id, name: employee.name, address: employee.address || "" };
  }
  if (payeeType === "HOMEOWNER") {
    const homeowner = await tx.homeownerProfile.findFirst({
      where: { id: payeeEntityId, tenantId, ...(allowExisting ? {} : { status: "ACTIVE" }) },
      include: { user: { select: { name: true } } },
    });
    if (!homeowner) throw new Error("Selected homeowner is not available.");
    return { id: homeowner.id, name: homeowner.user.name, address: homeowner.address || "" };
  }
  if (payeeType === "CONTRACTOR") {
    const contractor = await tx.contractorProfile.findFirst({
      where: { id: payeeEntityId, tenantId, ...(allowExisting ? {} : { status: "ACTIVE" }) },
      select: { id: true, companyName: true, address: true },
    });
    if (!contractor) throw new Error("Selected contractor is not available.");
    return { id: contractor.id, name: contractor.companyName, address: contractor.address || "" };
  }

  const renters = allowExisting
    ? await tx.$queryRaw<Array<{ id: string; fullName: string; address: string | null }>>(Prisma.sql`
        SELECT id, fullName, address FROM Renter
        WHERE tenantId=${tenantId} AND id=${payeeEntityId}
        LIMIT 1
      `)
    : await tx.$queryRaw<Array<{ id: string; fullName: string; address: string | null }>>(Prisma.sql`
        SELECT id, fullName, address FROM Renter
        WHERE tenantId=${tenantId} AND id=${payeeEntityId} AND status='ACTIVE'
        LIMIT 1
      `);
  const renter = renters[0];
  if (!renter) throw new Error("Selected renter is not available.");
  return { id: renter.id, name: renter.fullName, address: renter.address || "" };
}

async function resolveApprover(
  tx: Prisma.TransactionClient,
  tenantId: string,
  actor: { id: string; name: string },
  approverType: PettyCashApproverType,
  officerId: string,
  existingApproverId: string | null,
) {
  if (approverType === "ADMIN") return { id: actor.id, name: actor.name, title: "Administrator" };
  if (!officerId) throw new Error("Select an organization officer for approval.");
  const officer = await tx.organizationOfficer.findFirst({
    where: {
      id: officerId,
      tenantId,
      ...(officerId === existingApproverId ? {} : { active: true, archivedAt: null }),
    },
    select: { id: true, fullName: true, position: true },
  });
  if (!officer) throw new Error("Selected approving officer is not available.");
  return { id: officer.id, name: officer.fullName, title: officer.position };
}

async function resolveVoucherItems(tx: Prisma.TransactionClient, tenantId: string, draftItems: DraftVoucherItem[]) {
  const items: ResolvedVoucherItem[] = [];
  for (let index = 0; index < draftItems.length; index += 1) {
    const draft = draftItems[index];
    const amount = positiveMoney(draft.amount, `Amount on line ${index + 1}`);
    const categoryId = String(draft.categoryId || "").trim();
    if (!categoryId) throw new Error(`Choose a particular on line ${index + 1}.`);

    if (categoryId === "OTHER") {
      const particular = String(draft.otherParticular || "").trim();
      if (!particular) throw new Error(`Enter the Other particular on line ${index + 1}.`);
      if (particular.length > 120) throw new Error("A petty cash particular cannot exceed 120 characters.");
      const category = await tx.expenseCategory.upsert({
        where: { tenantId_name: { tenantId, name: particular } },
        create: { tenantId, name: particular, description: "Created from Petty Cash Voucher", active: true },
        update: { active: true },
        select: { id: true, name: true },
      });
      items.push({ categoryId: category.id, particular: category.name, amount });
      continue;
    }

    const category = await tx.expenseCategory.findFirst({ where: { id: categoryId, tenantId }, select: { id: true, name: true } });
    if (!category) throw new Error(`The selected expense type on line ${index + 1} is no longer available.`);
    items.push({ categoryId: category.id, particular: category.name, amount });
  }
  return items;
}

async function clearMutablePettyCashLoanDeductions(
  tx: Prisma.TransactionClient,
  tenantId: string,
  loanId: string,
  voucherId: string,
) {
  const loan = await tx.employeeLoan.findFirst({
    where: { id: loanId, tenantId },
    select: { id: true, amountPaid: true, status: true },
  });
  if (!loan) throw new Error("The Employee Cash Advance loan linked to this voucher no longer exists.");
  if (Number(loan.amountPaid) > 0 || loan.status !== EmployeeLoanStatus.OPEN) {
    throw new Error("This voucher can no longer be edited or deleted because its Employee Cash Advance has already been repaid or closed.");
  }

  const deductions = await tx.payrollDeduction.findMany({
    where: { tenantId, employeeLoanId: loanId },
    select: { id: true, remarks: true, payroll: { select: { status: true } } },
  });
  for (const deduction of deductions) {
    const automatic = deduction.remarks?.startsWith(`[AUTO_PETTY_CASH:${voucherId}]`) ?? false;
    if (!automatic) throw new Error("This cash advance has a manually linked payroll deduction and cannot be changed from Petty Cash.");
    if (LOCKED_PAYROLL_STATUSES.has(deduction.payroll.status)) {
      throw new Error("This voucher is already included in a finalized or posted payroll and cannot be edited or deleted.");
    }
  }
  if (deductions.length) await tx.payrollDeduction.deleteMany({ where: { id: { in: deductions.map((item) => item.id) } } });
  return loan;
}

function revalidatePettyCashPaths(voucherId?: string) {
  revalidatePath("/admin/petty-cash");
  if (voucherId) revalidatePath(`/admin/petty-cash/${voucherId}`);
  revalidatePath("/admin/expenses");
  revalidatePath("/admin/reports");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/payroll");
}

export async function updatePettyCashVoucherAction(formData: FormData) {
  const actor = await requirePermission(Permission.EXPENSES_MANAGE);
  await requirePettyCashFeature(actor.tenantId);
  const voucherId = clean(formData.get("voucherId"));
  const transactionDateRaw = clean(formData.get("transactionDate"));
  const payeeType = clean(formData.get("payeeType")) as PettyCashPayeeType;
  const payeeEntityId = clean(formData.get("payeeEntityId"));
  const otherPayeeName = clean(formData.get("otherPayeeName"));
  const addressOverride = clean(formData.get("address"));
  const approverType = clean(formData.get("approverType")) as PettyCashApproverType;
  const approvingOfficerId = clean(formData.get("approvingOfficerId"));
  const employeeAdvanceEmployeeId = clean(formData.get("employeeAdvanceEmployeeId"));
  const deductionPerCutoffRaw = clean(formData.get("deductionPerCutoff"));
  const draftItems = parseItems(clean(formData.get("itemsJson")));

  if (!voucherId) redirect("/admin/petty-cash?error=Voucher%20ID%20is%20required.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(transactionDateRaw)) redirect(`/admin/petty-cash/${voucherId}/edit?error=${encodeURIComponent("Choose a valid transaction date.")}`);
  if (!["EMPLOYEE", "HOMEOWNER", "RENTER", "CONTRACTOR", "OTHER"].includes(payeeType)) redirect(`/admin/petty-cash/${voucherId}/edit?error=${encodeURIComponent("Choose a payee type.")}`);
  if (!["ADMIN", "OFFICER"].includes(approverType)) redirect(`/admin/petty-cash/${voucherId}/edit?error=${encodeURIComponent("Choose who approved the voucher.")}`);

  const transactionDate = new Date(`${transactionDateRaw}T00:00:00.000Z`);
  let errorMessage = "";
  try {
    const enabledModules = await getEnabledTenantModules(actor.tenantId);
    await prisma.$transaction(async (tx) => {
      const transaction = tx as unknown as Prisma.TransactionClient;
      const rows = await tx.$queryRaw<ExistingVoucher[]>(Prisma.sql`
        SELECT id, voucherNumber, payeeType, payeeEntityId, employeeId, employeeLoanId, status
        FROM PettyCashVoucher
        WHERE tenantId=${actor.tenantId} AND id=${voucherId}
        LIMIT 1
      `);
      const existing = rows[0];
      if (!existing) throw new Error("Petty Cash Voucher was not found.");
      if (existing.status !== "POSTED") throw new Error("Only posted Petty Cash Vouchers can be edited.");

      const approverRows = await tx.$queryRaw<Array<{ approvedById: string | null }>>(Prisma.sql`
        SELECT approvedById FROM PettyCashVoucher WHERE tenantId=${actor.tenantId} AND id=${voucherId} LIMIT 1
      `);
      const [payee, approver, items] = await Promise.all([
        resolvePayee(transaction, actor.tenantId, payeeType, payeeEntityId, otherPayeeName, existing.payeeEntityId),
        resolveApprover(transaction, actor.tenantId, { id: actor.id, name: actor.name }, approverType, approvingOfficerId, approverRows[0]?.approvedById || null),
        resolveVoucherItems(transaction, actor.tenantId, draftItems),
      ]);

      const totalAmount = Math.round((items.reduce((sum, item) => sum + item.amount, 0) + Number.EPSILON) * 100) / 100;
      const employeeAdvanceAmount = Math.round((items.filter((item) => normalizeParticular(item.particular) === "employee cash advance").reduce((sum, item) => sum + item.amount, 0) + Number.EPSILON) * 100) / 100;
      const finalAddress = payee.address || addressOverride;

      let employeeLoanId = existing.employeeLoanId;
      let deductionPerCutoff: number | null = null;
      if (existing.employeeLoanId) await clearMutablePettyCashLoanDeductions(transaction, actor.tenantId, existing.employeeLoanId, voucherId);

      if (employeeAdvanceAmount > 0) {
        if (!enabledModules.has(TenantModule.PAYROLL) || !enabledModules.has(TenantModule.LOANS)) {
          throw new Error("Employee Cash Advance requires both Payroll and Loans in the tenant subscription.");
        }
        if (!employeeAdvanceEmployeeId) throw new Error("Select the employee who will repay this cash advance.");
        deductionPerCutoff = positiveMoney(deductionPerCutoffRaw, "Deduction amount per cutoff");
        if (deductionPerCutoff > employeeAdvanceAmount + 0.005) throw new Error("Deduction per cutoff cannot exceed the employee cash advance amount.");
        const employee = await tx.employeeProfile.findFirst({
          where: { id: employeeAdvanceEmployeeId, tenantId: actor.tenantId, ...(employeeAdvanceEmployeeId === existing.employeeId ? {} : { status: "ACTIVE" }) },
          select: { id: true },
        });
        if (!employee) throw new Error("Selected employee for cash advance repayment is not available.");

        if (employeeLoanId) {
          await tx.employeeLoan.update({
            where: { id: employeeLoanId },
            data: {
              employeeId: employee.id,
              type: EmployeeLoanType.CASH_ADVANCE,
              description: `Petty Cash Employee Cash Advance ${existing.voucherNumber}`,
              principalAmount: employeeAdvanceAmount,
              amountPaid: 0,
              balance: employeeAdvanceAmount,
              issuedDate: transactionDate,
              referenceNumber: existing.voucherNumber,
              remarks: `Automatic Petty Cash posting. Scheduled deduction per cutoff: PHP ${deductionPerCutoff.toFixed(2)}.`,
              status: EmployeeLoanStatus.OPEN,
            },
          });
        } else {
          const loan = await tx.employeeLoan.create({
            data: {
              tenantId: actor.tenantId,
              employeeId: employee.id,
              type: EmployeeLoanType.CASH_ADVANCE,
              description: `Petty Cash Employee Cash Advance ${existing.voucherNumber}`,
              principalAmount: employeeAdvanceAmount,
              amountPaid: 0,
              balance: employeeAdvanceAmount,
              issuedDate: transactionDate,
              referenceNumber: existing.voucherNumber,
              remarks: `Automatic Petty Cash posting. Scheduled deduction per cutoff: PHP ${deductionPerCutoff.toFixed(2)}.`,
            },
            select: { id: true },
          });
          employeeLoanId = loan.id;
        }
      } else if (employeeLoanId) {
        await tx.employeeLoan.delete({ where: { id: employeeLoanId } });
        employeeLoanId = null;
      }

      const oldItems = await tx.$queryRaw<ExistingVoucherItem[]>(Prisma.sql`
        SELECT expenseId FROM PettyCashVoucherItem
        WHERE tenantId=${actor.tenantId} AND voucherId=${voucherId}
      `);
      await tx.$executeRaw(Prisma.sql`DELETE FROM PettyCashVoucherItem WHERE tenantId=${actor.tenantId} AND voucherId=${voucherId}`);
      if (oldItems.length) await tx.expense.deleteMany({ where: { tenantId: actor.tenantId, id: { in: oldItems.map((item) => item.expenseId) } } });

      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        const expense = await tx.expense.create({
          data: {
            tenantId: actor.tenantId,
            categoryId: item.categoryId,
            description: item.particular,
            payee: payee.name,
            amount: item.amount,
            expenseDate: transactionDate,
            method: PaymentMethod.CASH,
            referenceNumber: existing.voucherNumber,
            voucherNumber: existing.voucherNumber,
            remarks: `Automatically posted from Petty Cash Voucher ${existing.voucherNumber}.`,
            createdById: actor.id,
          },
          select: { id: true },
        });
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO PettyCashVoucherItem
            (id, tenantId, voucherId, expenseCategoryId, particular, amount, expenseId, displayOrder, createdAt)
          VALUES
            (${randomUUID()}, ${actor.tenantId}, ${voucherId}, ${item.categoryId}, ${item.particular}, ${item.amount}, ${expense.id}, ${index}, NOW(3))
        `);
      }

      await tx.$executeRaw(Prisma.sql`
        UPDATE PettyCashVoucher
        SET transactionDate=${transactionDate}, payeeType=${payeeType}, payeeEntityId=${payee.id}, payeeName=${payee.name},
            address=${finalAddress || null}, approvedByType=${approverType}, approvedById=${approver.id},
            approvedByName=${approver.name}, approvedByTitle=${approver.title}, receivedBy=${payee.name},
            totalAmount=${totalAmount}, employeeId=${employeeAdvanceAmount > 0 ? employeeAdvanceEmployeeId : null},
            employeeLoanId=${employeeLoanId}, deductionPerCutoff=${deductionPerCutoff}, updatedAt=NOW(3)
        WHERE tenantId=${actor.tenantId} AND id=${voucherId}
      `);

      await tx.auditLog.create({
        data: {
          tenantId: actor.tenantId,
          actorId: actor.id,
          module: "PETTY_CASH",
          action: "UPDATE_PETTY_CASH_VOUCHER",
          entityType: "PettyCashVoucher",
          entityId: voucherId,
          metadata: { voucherNumber: existing.voucherNumber, totalAmount, itemCount: items.length, employeeLoanId, deductionPerCutoff },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Petty Cash Voucher could not be updated.";
  }

  if (errorMessage) redirect(`/admin/petty-cash/${voucherId}/edit?error=${encodeURIComponent(errorMessage)}`);
  revalidatePettyCashPaths(voucherId);
  redirect(`/admin/petty-cash/${voucherId}?success=updated`);
}

export async function deletePettyCashVoucherAction(formData: FormData) {
  const actor = await requirePermission(Permission.EXPENSES_MANAGE);
  await requirePettyCashFeature(actor.tenantId);
  const voucherId = clean(formData.get("voucherId"));
  if (!voucherId) redirect("/admin/petty-cash?error=Voucher%20ID%20is%20required.");

  let errorMessage = "";
  try {
    await prisma.$transaction(async (tx) => {
      const transaction = tx as unknown as Prisma.TransactionClient;
      const rows = await tx.$queryRaw<ExistingVoucher[]>(Prisma.sql`
        SELECT id, voucherNumber, payeeType, payeeEntityId, employeeId, employeeLoanId, status
        FROM PettyCashVoucher
        WHERE tenantId=${actor.tenantId} AND id=${voucherId}
        LIMIT 1
      `);
      const existing = rows[0];
      if (!existing) throw new Error("Petty Cash Voucher was not found.");
      if (existing.employeeLoanId) await clearMutablePettyCashLoanDeductions(transaction, actor.tenantId, existing.employeeLoanId, voucherId);

      const oldItems = await tx.$queryRaw<ExistingVoucherItem[]>(Prisma.sql`
        SELECT expenseId FROM PettyCashVoucherItem
        WHERE tenantId=${actor.tenantId} AND voucherId=${voucherId}
      `);
      await tx.$executeRaw(Prisma.sql`DELETE FROM PettyCashVoucherItem WHERE tenantId=${actor.tenantId} AND voucherId=${voucherId}`);
      if (oldItems.length) await tx.expense.deleteMany({ where: { tenantId: actor.tenantId, id: { in: oldItems.map((item) => item.expenseId) } } });
      await tx.$executeRaw(Prisma.sql`DELETE FROM PettyCashVoucher WHERE tenantId=${actor.tenantId} AND id=${voucherId}`);
      if (existing.employeeLoanId) await tx.employeeLoan.delete({ where: { id: existing.employeeLoanId } });

      await tx.auditLog.create({
        data: {
          tenantId: actor.tenantId,
          actorId: actor.id,
          module: "PETTY_CASH",
          action: "DELETE_PETTY_CASH_VOUCHER",
          entityType: "PettyCashVoucher",
          entityId: voucherId,
          metadata: { voucherNumber: existing.voucherNumber, deletedExpenseCount: oldItems.length, employeeLoanId: existing.employeeLoanId },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Petty Cash Voucher could not be deleted.";
  }

  if (errorMessage) redirect(`/admin/petty-cash/${voucherId}?error=${encodeURIComponent(errorMessage)}`);
  revalidatePettyCashPaths();
  redirect("/admin/petty-cash?success=deleted");
}
