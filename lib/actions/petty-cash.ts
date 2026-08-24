"use server";

import { randomUUID } from "node:crypto";
import { EmployeeLoanType, PaymentMethod, Prisma, TenantModule } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import { prisma } from "@/lib/db";
import { PETTY_CASH_SEQUENCE_SCOPE, type PettyCashApproverType, type PettyCashPayeeType } from "@/lib/petty-cash/constants";
import { requirePettyCashFeature } from "@/lib/petty-cash/entitlement";
import { getEnabledTenantModules } from "@/lib/tenant";

type DraftVoucherItem = {
  categoryId?: string;
  otherParticular?: string;
  amount?: string | number;
};

type ResolvedVoucherItem = {
  categoryId: string;
  particular: string;
  amount: number;
};

function clean(value: FormDataEntryValue | null) {
  return String(value || "").trim();
}

function normalizeParticular(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
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

function positiveMoney(value: string | number | undefined, label: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error(`${label} must be greater than zero.`);
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

async function resolvePayee(
  tx: Prisma.TransactionClient,
  tenantId: string,
  payeeType: PettyCashPayeeType,
  payeeEntityId: string,
  otherPayeeName: string,
) {
  if (payeeType === "OTHER") {
    if (!otherPayeeName) throw new Error("Enter the payee name when Other is selected.");
    return { id: null, name: otherPayeeName, address: "" };
  }
  if (!payeeEntityId) throw new Error(`Select a ${payeeType.toLowerCase()} payee.`);

  if (payeeType === "EMPLOYEE") {
    const employee = await tx.employeeProfile.findFirst({ where: { id: payeeEntityId, tenantId, status: "ACTIVE" }, select: { id: true, name: true, address: true } });
    if (!employee) throw new Error("Selected employee is not available.");
    return { id: employee.id, name: employee.name, address: employee.address || "" };
  }
  if (payeeType === "HOMEOWNER") {
    const homeowner = await tx.homeownerProfile.findFirst({ where: { id: payeeEntityId, tenantId, status: "ACTIVE" }, include: { user: { select: { name: true } } } });
    if (!homeowner) throw new Error("Selected homeowner is not available.");
    return { id: homeowner.id, name: homeowner.user.name, address: homeowner.address || "" };
  }
  if (payeeType === "CONTRACTOR") {
    const contractor = await tx.contractorProfile.findFirst({ where: { id: payeeEntityId, tenantId, status: "ACTIVE" }, select: { id: true, companyName: true, address: true } });
    if (!contractor) throw new Error("Selected contractor is not available.");
    return { id: contractor.id, name: contractor.companyName, address: contractor.address || "" };
  }

  const renters = await tx.$queryRaw<Array<{ id: string; fullName: string; address: string | null }>>(Prisma.sql`
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
) {
  if (approverType === "ADMIN") return { id: actor.id, name: actor.name, title: "Administrator" };
  if (!officerId) throw new Error("Select an organization officer for approval.");
  const officer = await tx.organizationOfficer.findFirst({
    where: { id: officerId, tenantId, active: true, archivedAt: null },
    select: { id: true, fullName: true, position: true },
  });
  if (!officer) throw new Error("Selected approving officer is not active.");
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

    const category = await tx.expenseCategory.findFirst({ where: { id: categoryId, tenantId, active: true }, select: { id: true, name: true } });
    if (!category) throw new Error(`The selected expense type on line ${index + 1} is no longer active.`);
    items.push({ categoryId: category.id, particular: category.name, amount });
  }
  return items;
}

export async function createPettyCashVoucherAction(formData: FormData) {
  const actor = await requirePermission(Permission.EXPENSES_MANAGE);
  await requirePettyCashFeature(actor.tenantId);

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

  if (!/^\d{4}-\d{2}-\d{2}$/.test(transactionDateRaw)) redirect(`/admin/petty-cash/new?error=${encodeURIComponent("Choose a valid transaction date.")}`);
  if (!["EMPLOYEE", "HOMEOWNER", "RENTER", "CONTRACTOR", "OTHER"].includes(payeeType)) redirect(`/admin/petty-cash/new?error=${encodeURIComponent("Choose a payee type.")}`);
  if (!["ADMIN", "OFFICER"].includes(approverType)) redirect(`/admin/petty-cash/new?error=${encodeURIComponent("Choose who approved the voucher.")}`);

  const transactionDate = new Date(`${transactionDateRaw}T00:00:00.000Z`);
  let createdVoucherId = "";
  let errorMessage = "";

  try {
    const enabledModules = await getEnabledTenantModules(actor.tenantId);
    createdVoucherId = await prisma.$transaction(async (tx) => {
      const [payee, approver, items] = await Promise.all([
        resolvePayee(tx as unknown as Prisma.TransactionClient, actor.tenantId, payeeType, payeeEntityId, otherPayeeName),
        resolveApprover(tx as unknown as Prisma.TransactionClient, actor.tenantId, { id: actor.id, name: actor.name }, approverType, approvingOfficerId),
        resolveVoucherItems(tx as unknown as Prisma.TransactionClient, actor.tenantId, draftItems),
      ]);

      const totalAmount = Math.round((items.reduce((sum, item) => sum + item.amount, 0) + Number.EPSILON) * 100) / 100;
      const employeeAdvanceAmount = Math.round((items.filter((item) => normalizeParticular(item.particular) === "employee cash advance").reduce((sum, item) => sum + item.amount, 0) + Number.EPSILON) * 100) / 100;
      const finalAddress = payee.address || addressOverride;

      if (employeeAdvanceAmount > 0) {
        if (!enabledModules.has(TenantModule.PAYROLL) || !enabledModules.has(TenantModule.LOANS)) {
          throw new Error("Employee Cash Advance requires both Payroll and Loans to be included in the tenant subscription.");
        }
        if (!employeeAdvanceEmployeeId) throw new Error("Select the employee who will repay this cash advance.");
      }

      const year = transactionDate.getUTCFullYear();
      const sequence = await tx.tenantSequence.upsert({
        where: { tenantId_scope_year: { tenantId: actor.tenantId, scope: PETTY_CASH_SEQUENCE_SCOPE, year } },
        create: { tenantId: actor.tenantId, scope: PETTY_CASH_SEQUENCE_SCOPE, year, nextValue: 2 },
        update: { nextValue: { increment: 1 } },
        select: { nextValue: true },
      });
      const sequenceNumber = sequence.nextValue - 1;
      const voucherNumber = `PCV-${year}-${String(sequenceNumber).padStart(6, "0")}`;
      const voucherId = randomUUID();

      let employeeLoanId: string | null = null;
      let deductionPerCutoff: number | null = null;
      if (employeeAdvanceAmount > 0) {
        deductionPerCutoff = positiveMoney(deductionPerCutoffRaw, "Deduction amount per cutoff");
        if (deductionPerCutoff > employeeAdvanceAmount + 0.005) throw new Error("Deduction per cutoff cannot exceed the employee cash advance amount.");
        const employee = await tx.employeeProfile.findFirst({ where: { id: employeeAdvanceEmployeeId, tenantId: actor.tenantId, status: "ACTIVE" }, select: { id: true, name: true } });
        if (!employee) throw new Error("Selected employee for cash advance repayment is not active.");
        const loan = await tx.employeeLoan.create({
          data: {
            tenantId: actor.tenantId,
            employeeId: employee.id,
            type: EmployeeLoanType.CASH_ADVANCE,
            description: `Petty Cash Employee Cash Advance ${voucherNumber}`,
            principalAmount: employeeAdvanceAmount,
            amountPaid: 0,
            balance: employeeAdvanceAmount,
            issuedDate: transactionDate,
            referenceNumber: voucherNumber,
            remarks: `Automatic Petty Cash posting. Scheduled deduction per cutoff: PHP ${deductionPerCutoff.toFixed(2)}.`,
          },
          select: { id: true },
        });
        employeeLoanId = loan.id;
      }

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO PettyCashVoucher
          (id, tenantId, voucherNumber, transactionDate, payeeType, payeeEntityId, payeeName, address,
           approvedByType, approvedById, approvedByName, approvedByTitle, receivedBy, totalAmount,
           employeeId, employeeLoanId, deductionPerCutoff, status, createdById, createdAt, updatedAt)
        VALUES
          (${voucherId}, ${actor.tenantId}, ${voucherNumber}, ${transactionDate}, ${payeeType}, ${payee.id}, ${payee.name}, ${finalAddress || null},
           ${approverType}, ${approver.id}, ${approver.name}, ${approver.title}, ${payee.name}, ${totalAmount},
           ${employeeAdvanceAmount > 0 ? employeeAdvanceEmployeeId : null}, ${employeeLoanId}, ${deductionPerCutoff}, 'POSTED', ${actor.id}, NOW(3), NOW(3))
      `);

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
            referenceNumber: voucherNumber,
            voucherNumber,
            remarks: `Automatically posted from Petty Cash Voucher ${voucherNumber}.`,
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

      await tx.auditLog.create({
        data: {
          tenantId: actor.tenantId,
          actorId: actor.id,
          module: "PETTY_CASH",
          action: "CREATE_PETTY_CASH_VOUCHER",
          entityType: "PettyCashVoucher",
          entityId: voucherId,
          metadata: {
            voucherNumber,
            payeeType,
            payeeName: payee.name,
            totalAmount,
            itemCount: items.length,
            employeeLoanId,
            deductionPerCutoff,
            financePosting: "EXPENSE_LEDGER",
          },
        },
      });

      return voucherId;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Petty cash voucher could not be created.";
  }

  if (errorMessage) redirect(`/admin/petty-cash/new?error=${encodeURIComponent(errorMessage)}`);
  if (!createdVoucherId) redirect(`/admin/petty-cash/new?error=${encodeURIComponent("Petty cash voucher could not be created.")}`);

  revalidatePath("/admin/petty-cash");
  revalidatePath("/admin/expenses");
  revalidatePath("/admin/reports");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/payroll");
  redirect(`/admin/petty-cash/${createdVoucherId}?success=created`);
}
