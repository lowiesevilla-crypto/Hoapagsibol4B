import { Prisma, Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { paymentAllocationCoverageDisplay } from "@/lib/payment-coverage";
import { paymentAppliedAmount, paymentUnappliedCredit } from "@/lib/payment-credit";
import { collectionLabel } from "@/lib/utils";

function cell(value: unknown) { return `"${String(value ?? "").replaceAll('"', '""')}"`; }
type RentalAllocationExport = { collectionId: string; invoiceNumber: string; chargeType: "RENT" | "SECURITY_DEPOSIT" | "OTHER" };

export async function GET() {
  const user = await requireUser(Role.ADMIN);
  const [payments, collections, refunds, expenses, payrolls, employeeLoans, employeeLoanRepayments, rentalAllocations] = await Promise.all([
    prisma.payment.findMany({ where: { status: "ACTIVE" }, include: { homeowner: { include: { user: true } }, bill: true, allocations: { include: { bill: true }, orderBy: { bill: { billingMonth: "asc" } } } }, orderBy: { paymentDate: "desc" } }),
    prisma.collection.findMany({ include: { homeowner: { include: { user: true } }, contractor: true }, orderBy: { collectionDate: "desc" } }),
    prisma.bondRefund.findMany({ include: { collection: { include: { homeowner: { include: { user: true } }, contractor: true } } }, orderBy: { refundDate: "desc" } }),
    prisma.expense.findMany({ include: { category: true }, orderBy: { expenseDate: "desc" } }),
    prisma.payrollPeriod.findMany({ where: { status: { in: ["POSTED", "PAID"] } }, include: { payslips: { include: { employee: true } } }, orderBy: { payDate: "desc" } }),
    prisma.employeeLoan.findMany({ where: { status: { not: "CANCELLED" } }, include: { employee: true }, orderBy: { issuedDate: "desc" } }),
    prisma.payrollDeduction.findMany({ where: { employeeLoanId: { not: null }, payroll: { status: "PAID" } }, include: { employee: true, employeeLoan: true, payroll: true }, orderBy: { createdAt: "desc" } }),
    prisma.$queryRaw<RentalAllocationExport[]>(Prisma.sql`SELECT a.collectionId,i.invoiceNumber,i.chargeType FROM RentalPaymentAllocation a JOIN RentalInvoice i ON i.tenantId=a.tenantId AND i.id=a.invoiceId WHERE a.tenantId=${user.tenantId}`),
  ]);
  const rentalByCollection = new Map<string, RentalAllocationExport[]>();
  for (const allocation of rentalAllocations) rentalByCollection.set(allocation.collectionId, [...(rentalByCollection.get(allocation.collectionId) ?? []), allocation]);
  const collectionPayerName = (item: (typeof collections)[number]) => item.payerName || item.homeowner?.user.name || item.contractor?.companyName || "Unknown";
  const collectionTreatment = (item: (typeof collections)[number]) => {
    if (item.refundable) return "Refundable liability";
    const allocations = rentalByCollection.get(item.id) ?? [];
    if (!allocations.length) return "Income";
    return allocations.every((allocation) => allocation.chargeType === "SECURITY_DEPOSIT") ? "Refundable rental deposit liability" : "Rental income";
  };
  const collectionCoverage = (item: (typeof collections)[number]) => (rentalByCollection.get(item.id) ?? []).map((allocation) => allocation.invoiceNumber).join("; ");
  const header = ["Transaction ID", "Document No.", "Transaction", "Category", "Party", "Date", "Method", "Reference", "Amount", "Payment Coverage", "Accounting treatment"];
  const rows = [
    header,
    ...payments.flatMap((item) => [
      [item.id, item.receiptNumber ?? "", "Collection", "Monthly dues applied", item.homeowner.user.name, item.paymentDate.toISOString().slice(0, 10), item.method, item.referenceNumber ?? "", paymentAppliedAmount(item), paymentAllocationCoverageDisplay(item), "Income"],
      ...(paymentUnappliedCredit(item) > 0 ? [[`${item.id}-credit`, item.receiptNumber ?? "", "Collection", "Unapplied homeowner credit", item.homeowner.user.name, item.paymentDate.toISOString().slice(0, 10), item.method, item.referenceNumber ?? "", paymentUnappliedCredit(item), "", "Liability"]] : []),
    ]),
    ...collections.map((item) => [item.id, item.receiptNumber ?? "", "Collection", collectionLabel(item.type, item.description), collectionPayerName(item), item.collectionDate.toISOString().slice(0, 10), item.method, item.referenceNumber ?? "", item.amount.toString(), collectionCoverage(item), collectionTreatment(item)]),
    ...collections.filter((item) => Number(item.amountForfeited) > 0).map((item) => [`${item.id}-forfeiture`, "", "Forfeiture", collectionLabel(item.type), collectionPayerName(item), item.forfeitedAt?.toISOString().slice(0, 10) ?? "", "OTHER", "", item.amountForfeited.toString(), "", "Income"]),
    ...refunds.map((item) => { const source = collections.find((collection) => collection.id === item.collection.id); return [item.id, "", "Refund", collectionLabel(item.collection.type), source ? collectionPayerName(source) : item.collection.homeowner?.user.name ?? item.collection.contractor?.companyName ?? "Unknown", item.refundDate.toISOString().slice(0, 10), item.method, item.referenceNumber ?? "", `-${item.amount.toString()}`, "", "Liability reduction"]; }),
    ...expenses.map((item) => [item.id, item.voucherNumber ?? "", "Expense", item.category.name, item.payee, item.expenseDate.toISOString().slice(0, 10), item.method, item.referenceNumber ?? "", `-${item.amount.toString()}`, "", "Operating expense"]),
    ...payrolls.flatMap((period) => period.payslips.map((item) => [item.id, `PAY-${period.payDate.toISOString().slice(0, 10)}`, "Payroll", "Employee payroll", item.employee.name, period.payDate.toISOString().slice(0, 10), "OTHER", "", `-${(Number(item.grossPay) + Number(item.employerContribution)).toFixed(2)}`, "", "Posted payroll expense including employer contributions"])),
    ...employeeLoans.map((item) => [item.id, item.referenceNumber ?? "", "Employee loan issued", item.type.replaceAll("_", " "), item.employee.name, item.issuedDate.toISOString().slice(0, 10), "OTHER", item.referenceNumber ?? "", `-${item.principalAmount.toString()}`, "", "Employee receivable"]),
    ...employeeLoanRepayments.map((item) => [item.id, `PAY-${item.payroll.payDate.toISOString().slice(0, 10)}`, "Employee loan payroll repayment", item.employeeLoan?.type.replaceAll("_", " ") ?? "LOAN", item.employee.name, item.payroll.payDate.toISOString().slice(0, 10), "PAYROLL_DEDUCTION", "", item.amount.toString(), "", "Receivable reduction"]),
  ];
  const csv = rows.map((row) => row.map(cell).join(",")).join("\r\n");
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="pagsibol-financial-transactions-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" } });
}
