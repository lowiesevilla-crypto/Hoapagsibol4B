import { PaymentStatus, RecurringChargeType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { PAYMONGO_PAYMENT_REQUEST_MARKER } from "@/lib/homeowner-payment-flow";
import { collectionLabel } from "@/lib/utils";
import { parseReportDateRange, roundMoney } from "@/lib/services/homeowner-balance-report";

export type TransactionHistoryReportRow = {
  transactionId: string;
  transactionDate: Date;
  transactionType: string;
  paymentType: string;
  paymentMode: string;
  homeownerName: string;
  block: string;
  lot: string;
  party: string;
  amount: number;
  balance: number | null;
  receiptNumber: string;
  referenceNumber: string;
  remarks: string;
};

export async function getTransactionHistoryReport(tenantId: string, fromInput?: string | null, toInput?: string | null) {
  const { from, to, fromText, toText } = parseReportDateRange(fromInput, toInput);
  const range = { gte: from, lte: to };
  const [payments, collections, refunds, expenses] = await Promise.all([
    prisma.payment.findMany({
      where: { tenantId, paymentDate: range },
      include: { homeowner: { include: { user: true } }, paymentRequest: true },
      orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
    }),
    prisma.collection.findMany({
      where: { tenantId, OR: [{ collectionDate: range }, { forfeitedAt: range }] },
      include: { homeowner: { include: { user: true } }, contractor: true },
      orderBy: [{ collectionDate: "desc" }, { createdAt: "desc" }],
    }),
    prisma.bondRefund.findMany({
      where: { tenantId, refundDate: range },
      include: { collection: { include: { homeowner: { include: { user: true } }, contractor: true } } },
      orderBy: { refundDate: "desc" },
    }),
    prisma.expense.findMany({
      where: { tenantId, expenseDate: range },
      include: { category: true },
      orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  const homeownerIds = [...new Set([
    ...payments.map((payment) => payment.homeownerId),
    ...collections.map((collection) => collection.homeownerId).filter((id): id is string => Boolean(id)),
    ...refunds.map((refund) => refund.collection.homeownerId).filter((id): id is string => Boolean(id)),
  ])];
  const balances = homeownerIds.length
    ? await prisma.bill.groupBy({
        by: ["homeownerId"],
        where: { tenantId, homeownerId: { in: homeownerIds }, archivedAt: null, recurringChargeType: RecurringChargeType.MONTHLY_DUES },
        _sum: { balance: true },
      })
    : [];
  const balanceByHomeowner = new Map(balances.map((row) => [row.homeownerId, roundMoney(Number(row._sum.balance ?? 0))]));

  const collectionParty = (item: (typeof collections)[number]) => item.payerName || item.homeowner?.user.name || item.contractor?.companyName || "Unknown";
  const collectionHomeowner = (item: (typeof collections)[number]) => ({
    homeownerName: item.homeowner?.user.name ?? "",
    block: item.homeowner?.block ?? "",
    lot: item.homeowner?.lot ?? "",
    balance: item.homeownerId ? balanceByHomeowner.get(item.homeownerId) ?? 0 : null,
  });
  const refundParty = (item: (typeof refunds)[number]) => item.collection.payerName || item.collection.homeowner?.user.name || item.collection.contractor?.companyName || "Unknown";
  const rows: TransactionHistoryReportRow[] = [
    ...payments.map((payment) => ({
      transactionId: payment.id,
      transactionDate: payment.paymentDate,
      transactionType: payment.status === PaymentStatus.VOIDED ? "Voided Monthly Dues Payment" : "Monthly Dues Payment",
      paymentType: payment.paymentRequest ? "Online Payment" : "Admin Recorded Payment",
      paymentMode: payment.paymentRequest?.proofContentType === PAYMONGO_PAYMENT_REQUEST_MARKER ? "PayMongo Online" : payment.method,
      homeownerName: payment.homeowner.user.name,
      block: payment.homeowner.block,
      lot: payment.homeowner.lot,
      party: payment.homeowner.user.name,
      amount: Number(payment.amount),
      balance: balanceByHomeowner.get(payment.homeownerId) ?? 0,
      receiptNumber: payment.receiptNumber ?? "",
      referenceNumber: payment.referenceNumber ?? "",
      remarks: payment.remarks ?? "",
    })),
    ...collections.filter((item) => item.collectionDate >= from && item.collectionDate <= to).map((item) => {
      const homeowner = collectionHomeowner(item);
      return {
        transactionId: item.id,
        transactionDate: item.collectionDate,
        transactionType: "Collection",
        paymentType: collectionLabel(item.type, item.description),
        paymentMode: item.method,
        homeownerName: homeowner.homeownerName,
        block: homeowner.block,
        lot: homeowner.lot,
        party: collectionParty(item),
        amount: Number(item.amount),
        balance: homeowner.balance,
        receiptNumber: item.receiptNumber ?? "",
        referenceNumber: item.referenceNumber ?? "",
        remarks: item.remarks ?? "",
      };
    }),
    ...collections.filter((item) => Number(item.amountForfeited) > 0 && item.forfeitedAt && item.forfeitedAt >= from && item.forfeitedAt <= to).map((item) => {
      const homeowner = collectionHomeowner(item);
      return {
        transactionId: `${item.id}-forfeiture`,
        transactionDate: item.forfeitedAt!,
        transactionType: "Forfeiture",
        paymentType: collectionLabel(item.type, item.description),
        paymentMode: item.method,
        homeownerName: homeowner.homeownerName,
        block: homeowner.block,
        lot: homeowner.lot,
        party: collectionParty(item),
        amount: Number(item.amountForfeited),
        balance: homeowner.balance,
        receiptNumber: item.receiptNumber ?? "",
        referenceNumber: item.referenceNumber ?? "",
        remarks: item.remarks ?? "Forfeited amount recognized.",
      };
    }),
    ...refunds.map((refund) => ({
      transactionId: refund.id,
      transactionDate: refund.refundDate,
      transactionType: "Refund",
      paymentType: collectionLabel(refund.collection.type, refund.collection.description),
      paymentMode: refund.method,
      homeownerName: refund.collection.homeowner?.user.name ?? "",
      block: refund.collection.homeowner?.block ?? "",
      lot: refund.collection.homeowner?.lot ?? "",
      party: refundParty(refund),
      amount: -Number(refund.amount),
      balance: refund.collection.homeownerId ? balanceByHomeowner.get(refund.collection.homeownerId) ?? 0 : null,
      receiptNumber: refund.collection.receiptNumber ?? "",
      referenceNumber: refund.referenceNumber ?? "",
      remarks: refund.remarks ?? "",
    })),
    ...expenses.map((expense) => ({
      transactionId: expense.id,
      transactionDate: expense.expenseDate,
      transactionType: "Expense",
      paymentType: expense.category.name,
      paymentMode: expense.method,
      homeownerName: "",
      block: "",
      lot: "",
      party: expense.payee,
      amount: -Number(expense.amount),
      balance: null,
      receiptNumber: expense.voucherNumber ?? "",
      referenceNumber: expense.referenceNumber ?? "",
      remarks: expense.description ?? "",
    })),
  ].sort((a, b) => b.transactionDate.getTime() - a.transactionDate.getTime() || a.transactionId.localeCompare(b.transactionId));

  const totals = rows.reduce((summary, row) => ({
    transactionCount: summary.transactionCount + 1,
    totalAmount: roundMoney(summary.totalAmount + row.amount),
  }), { transactionCount: 0, totalAmount: 0 });

  return { from, to, fromText, toText, rows, totals };
}
