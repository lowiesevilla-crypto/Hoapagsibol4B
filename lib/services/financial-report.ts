import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { paymentAllocationCoverageLabel } from "@/lib/payment-coverage";
import { rentalCollectionAccounting, summarizeRentalAllocations } from "@/lib/rental-accounting";
import { paymentAppliedAmount, paymentUnappliedCredit } from "@/lib/payment-credit";
import { collectionLabel, inputDate } from "@/lib/utils";

type RentalAllocationAccountingRow = { collectionId: string; amount: Prisma.Decimal | number | string; chargeType: string };
type CollectionIdRow = { collectionId: string };
type TotalsRow = { amount: Prisma.Decimal | number | string | null; amountRefunded: Prisma.Decimal | number | string | null; amountForfeited: Prisma.Decimal | number | string | null };
type TotalRow = { total: Prisma.Decimal | number | string | null };

export async function getFinancialReport(tenantId: string, fromInput?: string | null, toInput?: string | null) {
  const now = new Date();
  const fromText = /^\d{4}-\d{2}-\d{2}$/.test(fromInput ?? "") ? fromInput! : `${now.getUTCFullYear()}-01-01`;
  const toText = /^\d{4}-\d{2}-\d{2}$/.test(toInput ?? "") ? toInput! : inputDate(now);
  const from = new Date(`${fromText}T00:00:00.000Z`);
  const to = new Date(`${toText}T23:59:59.999Z`);
  if (from > to) throw new Error("Report start date must be on or before the end date.");
  const range = { gte: from, lte: to };
  const [payments, collections, refunds, expenses, payrolls, employeeLoanIssuances, employeeLoanRepaymentRowsRaw, allEmployeeLoanTotals, billSummary, statusCounts, allBondTotalsRows, rentalAllocations, allRentalDepositIds, rentalDepositHeldRows, rentalAdvanceHeldRows] = await Promise.all([
    prisma.payment.findMany({ where: { status: "ACTIVE", paymentDate: range }, include: { homeowner: { include: { user: true } }, bill: true, allocations: { include: { bill: true }, orderBy: { bill: { billingMonth: "asc" } } } }, orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }] }),
    prisma.collection.findMany({ where: { OR: [{ collectionDate: range }, { forfeitedAt: range }] } }),
    prisma.bondRefund.findMany({ where: { refundDate: range } }),
    prisma.expense.findMany({ where: { expenseDate: range }, include: { category: true } }),
    prisma.payrollPeriod.findMany({ where: { payDate: range, status: { in: ["POSTED", "PAID"] } }, include: { payslips: true } }),
    prisma.employeeLoan.findMany({ where: { issuedDate: range, status: { not: "CANCELLED" } }, include: { employee: true }, orderBy: { issuedDate: "asc" } }),
    prisma.payrollDeduction.findMany({
      where: { employeeLoanId: { not: null }, payroll: { payDate: range, status: "PAID" } },
      include: { employee: true, employeeLoan: true, deductionType: true, payroll: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.employeeLoan.aggregate({ _sum: { principalAmount: true, amountPaid: true, balance: true }, where: { status: { not: "CANCELLED" } } }),
    prisma.bill.aggregate({ _sum: { totalAmount: true, balance: true } }),
    prisma.bill.groupBy({ by: ["status"], _count: true, _sum: { balance: true } }),
    prisma.$queryRaw<TotalsRow[]>(Prisma.sql`
      SELECT COALESCE(SUM(c.amount),0) AS amount,COALESCE(SUM(c.amountRefunded),0) AS amountRefunded,COALESCE(SUM(c.amountForfeited),0) AS amountForfeited
      FROM Collection c
      WHERE c.tenantId=${tenantId} AND c.refundable=TRUE
        AND NOT EXISTS (
          SELECT 1 FROM RentalPaymentAllocation a
          JOIN RentalInvoice i ON i.tenantId=a.tenantId AND i.id=a.invoiceId
          WHERE a.tenantId=c.tenantId AND a.collectionId=c.id AND i.chargeType='SECURITY_DEPOSIT'
        )
    `),
    prisma.$queryRaw<RentalAllocationAccountingRow[]>(Prisma.sql`
      SELECT a.collectionId,a.amount,i.chargeType
      FROM RentalPaymentAllocation a
      JOIN RentalInvoice i ON i.tenantId=a.tenantId AND i.id=a.invoiceId
      JOIN Collection c ON c.tenantId=a.tenantId AND c.id=a.collectionId
      WHERE a.tenantId=${tenantId} AND c.collectionDate>=${from} AND c.collectionDate<=${to}
    `),
    prisma.$queryRaw<CollectionIdRow[]>(Prisma.sql`
      SELECT DISTINCT a.collectionId
      FROM RentalPaymentAllocation a
      JOIN RentalInvoice i ON i.tenantId=a.tenantId AND i.id=a.invoiceId
      WHERE a.tenantId=${tenantId} AND i.chargeType='SECURITY_DEPOSIT'
    `),
    prisma.$queryRaw<TotalRow[]>(Prisma.sql`
      SELECT COALESCE(SUM(c.amount-c.amountRefunded-c.amountForfeited),0) AS total
      FROM Collection c
      WHERE c.tenantId=${tenantId} AND c.refundable=TRUE
        AND EXISTS (
          SELECT 1 FROM RentalPaymentAllocation a
          JOIN RentalInvoice i ON i.tenantId=a.tenantId AND i.id=a.invoiceId
          WHERE a.tenantId=c.tenantId AND a.collectionId=c.id AND i.chargeType='SECURITY_DEPOSIT'
        )
    `),
    prisma.$queryRaw<TotalRow[]>(Prisma.sql`
      SELECT COALESCE(SUM(GREATEST(c.amount-COALESCE(x.allocated,0),0)),0) AS total
      FROM Collection c
      LEFT JOIN (
        SELECT tenantId,collectionId,SUM(amount) AS allocated
        FROM RentalPaymentAllocation GROUP BY tenantId,collectionId
      ) x ON x.tenantId=c.tenantId AND x.collectionId=c.id
      WHERE c.tenantId=${tenantId} AND c.type='OTHER' AND c.refundable=FALSE AND c.description='Rental payment'
    `),
  ]);

  const duesIncome = payments.reduce((sum, item) => sum + paymentAppliedAmount(item), 0);
  const paymentCashReceived = payments.reduce((sum, item) => sum + Number(item.amount), 0);
  const unappliedCredits = payments.reduce((sum, item) => sum + paymentUnappliedCredit(item), 0);
  const feeCollections = collections.filter((item) => !item.refundable && item.collectionDate >= from && item.collectionDate <= to);
  const rentalAllocationSummary = summarizeRentalAllocations(rentalAllocations.map((item) => ({ collectionId: item.collectionId, amount: item.amount, chargeType: item.chargeType })));
  const rentalDepositCollectionIds = new Set(allRentalDepositIds.map((item) => item.collectionId));
  const rentalSecurityDepositsReceived = rentalAllocationSummary.securityDepositTotal;

  let genericFeeIncome = 0;
  let rentalIncome = 0;
  let rentalAdvanceCreditsReceived = 0;
  const feeMap = new Map<string, number>();
  for (const item of feeCollections) {
    const accounting = rentalCollectionAccounting({
      amount: item.amount,
      rentAllocated: rentalAllocationSummary.rentByCollection.get(item.id) ?? 0,
      securityDepositAllocated: rentalAllocationSummary.securityDepositByCollection.get(item.id) ?? 0,
      isRentalPayment: item.description === "Rental payment",
    });
    genericFeeIncome += accounting.genericIncome;
    rentalIncome += accounting.rentalIncome;
    rentalAdvanceCreditsReceived += accounting.advanceCredit;
    if (accounting.genericIncome > 0) {
      const itemLabel = collectionLabel(item.type, item.description);
      feeMap.set(itemLabel, (feeMap.get(itemLabel) ?? 0) + accounting.genericIncome);
    }
    if (accounting.rentalIncome > 0) feeMap.set("Rental income", (feeMap.get("Rental income") ?? 0) + accounting.rentalIncome);
  }
  const feeIncome = genericFeeIncome + rentalIncome;
  const forfeitedIncome = collections.filter((item) => item.forfeitedAt && item.forfeitedAt >= from && item.forfeitedAt <= to).reduce((sum, item) => sum + Number(item.amountForfeited), 0);
  const operatingExpenses = expenses.reduce((sum, item) => sum + Number(item.amount), 0);
  const payrollExpense = payrolls.flatMap((period) => period.payslips).reduce((sum, item) => sum + Number(item.grossPay) + Number(item.employerContribution), 0);
  const payrollCashDisbursements = payrolls.filter((period) => period.status === "PAID").flatMap((period) => period.payslips).reduce((sum, item) => sum + Number(item.netPay), 0);
  const employeeLoansIssued = employeeLoanIssuances.reduce((sum, item) => sum + Number(item.principalAmount), 0);
  const employeeLoanRepayments = employeeLoanRepaymentRowsRaw.reduce((sum, item) => sum + Number(item.amount), 0);
  const bondsReceived = collections.filter((item) => item.refundable && !rentalDepositCollectionIds.has(item.id) && item.collectionDate >= from && item.collectionDate <= to).reduce((sum, item) => sum + Number(item.amount), 0);
  const rentalSecurityDepositsRefunded = refunds.filter((item) => rentalDepositCollectionIds.has(item.collectionId)).reduce((sum, item) => sum + Number(item.amount), 0);
  const bondsRefunded = refunds.filter((item) => !rentalDepositCollectionIds.has(item.collectionId)).reduce((sum, item) => sum + Number(item.amount), 0);
  const recognizedIncome = duesIncome + feeIncome + forfeitedIncome;
  const totalExpenses = operatingExpenses + payrollExpense;
  const cashInflows = paymentCashReceived + feeIncome + rentalAdvanceCreditsReceived + rentalSecurityDepositsReceived + bondsReceived;
  const cashOutflows = operatingExpenses + payrollCashDisbursements + bondsRefunded + rentalSecurityDepositsRefunded + employeeLoansIssued;
  const allBondTotals = allBondTotalsRows[0];
  const bondsHeld = Number(allBondTotals?.amount ?? 0) - Number(allBondTotals?.amountRefunded ?? 0) - Number(allBondTotals?.amountForfeited ?? 0);
  const rentalSecurityDepositsHeld = Number(rentalDepositHeldRows[0]?.total ?? 0);
  const rentalAdvanceCreditsHeld = Number(rentalAdvanceHeldRows[0]?.total ?? 0);
  const expenseMap = new Map<string, number>();
  for (const item of expenses) expenseMap.set(item.category.name, (expenseMap.get(item.category.name) ?? 0) + Number(item.amount));

  return {
    from, to, fromText, toText,
    duesIncome, paymentCashReceived, unappliedCredits, feeIncome, rentalIncome, rentalAdvanceCreditsReceived, rentalAdvanceCreditsHeld,
    rentalSecurityDepositsReceived, rentalSecurityDepositsRefunded, rentalSecurityDepositsHeld,
    forfeitedIncome, recognizedIncome,
    operatingExpenses, payrollExpense, payrollCashDisbursements, totalExpenses, operatingSurplus: recognizedIncome - totalExpenses,
    bondsReceived, bondsRefunded, bondsHeld, cashInflows, cashOutflows, netCashMovement: cashInflows - cashOutflows,
    employeeLoansIssued,
    employeeLoanRepayments,
    employeeLoanPrincipal: Number(allEmployeeLoanTotals._sum.principalAmount ?? 0),
    employeeLoanPaid: Number(allEmployeeLoanTotals._sum.amountPaid ?? 0),
    employeeLoanOutstanding: Number(allEmployeeLoanTotals._sum.balance ?? 0),
    employeeLoanIssuanceRows: employeeLoanIssuances.map((item) => ({ id: item.id, employee: item.employee.name, type: item.type, description: item.description, amount: Number(item.principalAmount), issuedDate: item.issuedDate, balance: Number(item.balance) })),
    employeeLoanRepaymentRows: employeeLoanRepaymentRowsRaw.map((item) => ({ id: item.id, employee: item.employee.name, type: item.employeeLoan?.type ?? "OTHER", description: item.employeeLoan?.description ?? item.deductionType.name, amount: Number(item.amount), payDate: item.payroll.payDate, balance: Number(item.employeeLoan?.balance ?? 0) })),
    duesCollectionRows: payments.map((item) => ({ id: item.id, receiptNumber: item.receiptNumber ?? "Legacy receipt", homeowner: item.homeowner.user.name, paymentDate: item.paymentDate, coverage: paymentAllocationCoverageLabel(item), amount: Number(item.amount), appliedAmount: paymentAppliedAmount(item), unappliedCredit: paymentUnappliedCredit(item) })),
    feeBreakdown: [...feeMap.entries()].map(([label, value]) => ({ label, value })),
    expenseBreakdown: [...expenseMap.entries()].map(([label, value]) => ({ label, value })),
    lifetimeBilled: Number(billSummary._sum.totalAmount ?? 0),
    outstandingReceivables: Number(billSummary._sum.balance ?? 0),
    statusCounts: statusCounts.map((item) => ({ status: item.status, count: item._count, balance: Number(item._sum.balance ?? 0) })),
  };
}

export type FinancialReport = Awaited<ReturnType<typeof getFinancialReport>>;
