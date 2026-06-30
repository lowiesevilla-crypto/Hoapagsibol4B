import { prisma } from "@/lib/db";
import { paymentCoverageLabel } from "@/lib/payment-coverage";
import { collectionLabel, inputDate } from "@/lib/utils";

export async function getFinancialReport(fromInput?: string | null, toInput?: string | null) {
  const now = new Date();
  const fromText = /^\d{4}-\d{2}-\d{2}$/.test(fromInput ?? "") ? fromInput! : `${now.getUTCFullYear()}-01-01`;
  const toText = /^\d{4}-\d{2}-\d{2}$/.test(toInput ?? "") ? toInput! : inputDate(now);
  const from = new Date(`${fromText}T00:00:00.000Z`);
  const to = new Date(`${toText}T23:59:59.999Z`);
  if (from > to) throw new Error("Report start date must be on or before the end date.");
  const range = { gte: from, lte: to };
  const [payments, collections, refunds, expenses, payrolls, employeeLoanIssuances, employeeLoanRepaymentRowsRaw, allEmployeeLoanTotals, billSummary, statusCounts, allBondTotals] = await Promise.all([
    prisma.payment.findMany({ where: { status: "ACTIVE", paymentDate: range }, include: { homeowner: { include: { user: true } }, bill: true }, orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }] }),
    prisma.collection.findMany({ where: { OR: [{ collectionDate: range }, { forfeitedAt: range }] } }),
    prisma.bondRefund.findMany({ where: { refundDate: range } }),
    prisma.expense.findMany({ where: { expenseDate: range }, include: { category: true } }),
    prisma.payrollPeriod.findMany({ where: { payDate: range, status: { in: ["FINALIZED", "PAID"] } }, include: { payslips: true } }),
    prisma.employeeLoan.findMany({ where: { issuedDate: range, status: { not: "CANCELLED" } }, include: { employee: true }, orderBy: { issuedDate: "asc" } }),
    prisma.payrollDeduction.findMany({
      where: { employeeLoanId: { not: null }, payroll: { payDate: range, status: "PAID" } },
      include: { employee: true, employeeLoan: true, deductionType: true, payroll: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.employeeLoan.aggregate({ _sum: { principalAmount: true, amountPaid: true, balance: true }, where: { status: { not: "CANCELLED" } } }),
    prisma.bill.aggregate({ _sum: { totalAmount: true, balance: true } }),
    prisma.bill.groupBy({ by: ["status"], _count: true, _sum: { balance: true } }),
    prisma.collection.aggregate({ _sum: { amount: true, amountRefunded: true, amountForfeited: true }, where: { refundable: true } }),
  ]);
  const duesIncome = payments.reduce((sum, item) => sum + Number(item.amount), 0);
  const feeCollections = collections.filter((item) => !item.refundable && item.collectionDate >= from && item.collectionDate <= to);
  const feeIncome = feeCollections.reduce((sum, item) => sum + Number(item.amount), 0);
  const forfeitedIncome = collections.filter((item) => item.forfeitedAt && item.forfeitedAt >= from && item.forfeitedAt <= to).reduce((sum, item) => sum + Number(item.amountForfeited), 0);
  const operatingExpenses = expenses.reduce((sum, item) => sum + Number(item.amount), 0);
  const payrollExpense = payrolls.flatMap((period) => period.payslips).reduce((sum, item) => sum + Number(item.netPay), 0);
  const employeeLoansIssued = employeeLoanIssuances.reduce((sum, item) => sum + Number(item.principalAmount), 0);
  const employeeLoanRepayments = employeeLoanRepaymentRowsRaw.reduce((sum, item) => sum + Number(item.amount), 0);
  const bondsReceived = collections.filter((item) => item.refundable && item.collectionDate >= from && item.collectionDate <= to).reduce((sum, item) => sum + Number(item.amount), 0);
  const bondsRefunded = refunds.reduce((sum, item) => sum + Number(item.amount), 0);
  const recognizedIncome = duesIncome + feeIncome + forfeitedIncome;
  const totalExpenses = operatingExpenses + payrollExpense;
  const cashInflows = duesIncome + feeIncome + bondsReceived;
  const cashOutflows = operatingExpenses + payrollExpense + bondsRefunded + employeeLoansIssued;
  const bondsHeld = Number(allBondTotals._sum.amount ?? 0) - Number(allBondTotals._sum.amountRefunded ?? 0) - Number(allBondTotals._sum.amountForfeited ?? 0);
  const feeMap = new Map<string, number>();
  for (const item of feeCollections) feeMap.set(collectionLabel(item.type, item.description), (feeMap.get(collectionLabel(item.type, item.description)) ?? 0) + Number(item.amount));
  const expenseMap = new Map<string, number>();
  for (const item of expenses) expenseMap.set(item.category.name, (expenseMap.get(item.category.name) ?? 0) + Number(item.amount));
  return {
    from, to, fromText, toText,
    duesIncome, feeIncome, forfeitedIncome, recognizedIncome,
    operatingExpenses, payrollExpense, totalExpenses, operatingSurplus: recognizedIncome - totalExpenses,
    bondsReceived, bondsRefunded, bondsHeld, cashInflows, cashOutflows, netCashMovement: cashInflows - cashOutflows,
    employeeLoansIssued,
    employeeLoanRepayments,
    employeeLoanPrincipal: Number(allEmployeeLoanTotals._sum.principalAmount ?? 0),
    employeeLoanPaid: Number(allEmployeeLoanTotals._sum.amountPaid ?? 0),
    employeeLoanOutstanding: Number(allEmployeeLoanTotals._sum.balance ?? 0),
    employeeLoanIssuanceRows: employeeLoanIssuances.map((item) => ({ id: item.id, employee: item.employee.name, type: item.type, description: item.description, amount: Number(item.principalAmount), issuedDate: item.issuedDate, balance: Number(item.balance) })),
    employeeLoanRepaymentRows: employeeLoanRepaymentRowsRaw.map((item) => ({ id: item.id, employee: item.employee.name, type: item.employeeLoan?.type ?? "OTHER", description: item.employeeLoan?.description ?? item.deductionType.name, amount: Number(item.amount), payDate: item.payroll.payDate, balance: Number(item.employeeLoan?.balance ?? 0) })),
    duesCollectionRows: payments.map((item) => ({ id: item.id, receiptNumber: item.receiptNumber ?? "Legacy receipt", homeowner: item.homeowner.user.name, paymentDate: item.paymentDate, coverage: paymentCoverageLabel(item), amount: Number(item.amount) })),
    feeBreakdown: [...feeMap.entries()].map(([label, value]) => ({ label, value })),
    expenseBreakdown: [...expenseMap.entries()].map(([label, value]) => ({ label, value })),
    lifetimeBilled: Number(billSummary._sum.totalAmount ?? 0),
    outstandingReceivables: Number(billSummary._sum.balance ?? 0),
    statusCounts: statusCounts.map((item) => ({ status: item.status, count: item._count, balance: Number(item._sum.balance ?? 0) })),
  };
}

export type FinancialReport = Awaited<ReturnType<typeof getFinancialReport>>;
