import "server-only";

import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { homeownerAccountNumber } from "@/lib/homeowner-account";
import { paymentAllocationCoverageDisplay } from "@/lib/payment-coverage";
import { paymentAppliedAmount, paymentUnappliedCredit } from "@/lib/payment-credit";
import {
  buildStatementAging,
  buildStatementLedger,
  summarizeStatementAccount,
} from "@/lib/services/statement-calculations";
import { getAssociationSettings } from "@/lib/system-settings";
import { monthLabel } from "@/lib/utils";

export type { StatementLedgerEntry } from "@/lib/services/statement-calculations";

export async function getStatementOfAccount(homeownerId: string, tenantId: string, baseUrl: string, asOf = new Date()) {
  const [homeowner, bills, payments, collections, association] = await Promise.all([
    prisma.homeownerProfile.findFirst({ where: { id: homeownerId, tenantId }, include: { user: true } }),
    prisma.bill.findMany({
      where: { homeownerId, tenantId, archivedAt: null },
      orderBy: [{ billingMonth: "asc" }, { createdAt: "asc" }],
    }),
    prisma.payment.findMany({
      where: { homeownerId, tenantId },
      include: { bill: true, allocations: { include: { bill: true }, orderBy: { bill: { billingMonth: "asc" } } }, processedBy: true },
      orderBy: [{ paymentDate: "asc" }, { createdAt: "asc" }],
    }),
    prisma.collection.findMany({
      where: { homeownerId, tenantId },
      include: { createdBy: true, refunds: { include: { processedBy: true }, orderBy: { refundDate: "asc" } } },
      orderBy: [{ collectionDate: "asc" }, { createdAt: "asc" }],
    }),
    getAssociationSettings(tenantId),
  ]);

  if (!homeowner) notFound();

  const ledger = buildStatementLedger({ bills, payments, collections });
  const { summary } = summarizeStatementAccount({ bills, payments, ledger, asOf });
  const statementDate = new Date();
  const accountNumber = homeownerAccountNumber(homeowner);
  const statementCode = `SOA-${accountNumber.replace(/[^A-Z0-9]/gi, "").toUpperCase()}-${statementDate.toISOString().slice(0, 10).replaceAll("-", "")}`;
  const verifyUrl = `${baseUrl.replace(/\/$/, "")}/admin/homeowners/${homeowner.id}/soa`;

  return {
    association,
    homeowner,
    accountNumber,
    statementDate,
    statementCode,
    verifyUrl,
    summary,
    ledger,
    paymentHistory: [...payments].reverse().map((payment) => ({
      id: payment.id,
      paymentDate: payment.paymentDate,
      officialReceiptNo: payment.receiptNumber || payment.referenceNumber || paymentPublicReference(payment.paymentDate),
      paymentMethod: payment.method.replaceAll("_", " "),
      referenceNumber: payment.referenceNumber || "-",
      coverage: paymentAllocationCoverageDisplay(payment),
      amount: Number(payment.amount),
      appliedAmount: paymentAppliedAmount(payment),
      unappliedCredit: paymentUnappliedCredit(payment),
      status: payment.status === "VOIDED" ? "Void" : "Active",
      collector: payment.processedBy?.name ?? "Authorized HOA Collector",
    })),
    billingHistory: [...bills].reverse().map((bill) => ({
      id: bill.id,
      billingDate: bill.createdAt,
      billingType: "Monthly Dues",
      coverage: monthLabel(bill.billingMonth),
      amount: Number(bill.totalAmount),
      status: bill.status,
    })),
    aging: buildStatementAging(bills, asOf),
  };
}

function paymentPublicReference(paymentDate: Date) {
  return datedPublicReference("Payment", paymentDate);
}

function datedPublicReference(label: string, date: Date) {
  return `${label} ${date.toISOString().slice(0, 10)}`;
}
