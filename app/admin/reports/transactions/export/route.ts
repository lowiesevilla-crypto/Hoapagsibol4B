import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { getTransactionHistoryReport } from "@/lib/services/transaction-history-report";

function cell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const user = await requireUser(Role.ADMIN);
  const url = new URL(request.url);
  let report;
  try {
    report = await getTransactionHistoryReport(user.tenantId, url.searchParams.get("from"), url.searchParams.get("to"));
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Transaction history report could not be generated.", { status: 400 });
  }

  const header = ["Transaction ID", "Date", "Transaction Type", "Payment Type", "Mode of Payment", "Homeowner Name", "Block", "Lot", "Party / Payee", "Amount", "Balance", "Receipt No.", "Reference No.", "Remarks"];
  const rows = [
    header,
    ...report.rows.map((row) => [
      row.transactionId,
      row.transactionDate.toISOString().slice(0, 10),
      row.transactionType,
      row.paymentType,
      row.paymentMode,
      row.homeownerName,
      row.block,
      row.lot,
      row.party,
      row.amount.toFixed(2),
      row.balance === null ? "" : row.balance.toFixed(2),
      row.receiptNumber,
      row.referenceNumber,
      row.remarks,
    ]),
    [],
    ["TOTAL", "", "", "", "", "", "", "", `${report.totals.transactionCount} transaction(s)`, report.totals.totalAmount.toFixed(2), "", "", "", ""],
  ];
  const csv = rows.map((row) => row.map(cell).join(",")).join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="transaction-history-${report.fromText}-to-${report.toText}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
