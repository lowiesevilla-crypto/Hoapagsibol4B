import { prisma } from "@/lib/db";
import { paymentCoverageDisplay } from "@/lib/payment-coverage";
import { paymentAppliedAmount, paymentUnappliedCredit, totalUnappliedCredit } from "@/lib/payment-credit";
import { monthLabel } from "@/lib/utils";

export async function getPaymentReceiptData(id: string) {
  const payment = await prisma.payment.findFirst({
    where: { id, status: "ACTIVE" },
    include: {
      homeowner: { include: { user: true } },
      bill: true,
      allocations: { include: { bill: true }, orderBy: { bill: { billingMonth: "asc" } } },
      processedBy: true,
    },
  });
  if (!payment) return null;

  const allocations = payment.allocations.length
    ? payment.allocations.map((allocation) => ({
        id: allocation.id,
        billId: allocation.billId,
        coverage: allocation.coverageLabel || monthLabel(allocation.bill.billingMonth),
        amount: Number(allocation.amount),
        remainingBalance: Number(allocation.bill.balance),
      }))
    : payment.bill
      ? [{ id: `legacy-${payment.id}`, billId: payment.bill.id, coverage: monthLabel(payment.bill.billingMonth), amount: Number(payment.amount), remainingBalance: Number(payment.bill.balance) }]
      : [];
  const [outstanding, activePayments] = await Promise.all([
    prisma.bill.aggregate({
      where: { homeownerId: payment.homeownerId, archivedAt: null, balance: { gt: 0 } },
      _sum: { balance: true },
    }),
    prisma.payment.findMany({
      where: { homeownerId: payment.homeownerId, status: "ACTIVE" },
      select: { amount: true, allocations: { select: { amount: true } } },
    }),
  ]);

  return {
    id: payment.id,
    homeownerId: payment.homeownerId,
    number: payment.receiptNumber || `AR-${payment.id.slice(-8).toUpperCase()}`,
    date: payment.paymentDate,
    payer: payment.homeowner.user.name,
    address: payment.homeowner.address,
    property: `Block ${payment.homeowner.block}, Lot ${payment.homeowner.lot}`,
    account: payment.homeowner.id,
    purpose: paymentCoverageDisplay(payment),
    amount: Number(payment.amount),
    method: payment.method,
    reference: payment.referenceNumber,
    remarks: payment.remarks,
    processedBy: payment.processedBy?.name ?? "Authorized HOA Treasurer / Collector",
    allocations,
    allocationTotal: paymentAppliedAmount(payment),
    unappliedCredit: paymentUnappliedCredit(payment),
    homeownerCreditBalance: totalUnappliedCredit(activePayments),
    remainingBalance: Number(outstanding._sum.balance ?? 0),
  };
}
