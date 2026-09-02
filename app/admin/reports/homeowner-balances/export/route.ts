import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { getHomeownerBalanceReport } from "@/lib/services/homeowner-balance-report";

function cell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const user = await requireUser(Role.ADMIN);
  const url = new URL(request.url);
  let report;
  try {
    report = await getHomeownerBalanceReport(user.tenantId, url.searchParams.get("from"), url.searchParams.get("to"), url.searchParams.get("status"));
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Homeowner balance report could not be generated.", { status: 400 });
  }

  const header = ["Homeowner ID", "Account Number", "Homeowner Name", "Email", "Block", "Lot", "Phase", "Status", "Monthly Due Amount", "Total Bill", "Total Paid", "Current Balance", "Bill Count", "Paid Bill Count", "Consolidated Remarks"];
  const rows = [
    header,
    ...report.rows.map((row) => [row.homeownerId, row.accountNumber, row.homeownerName, row.email, row.block, row.lot, row.phase, row.status, row.monthlyDuesAmount.toFixed(2), row.totalBill.toFixed(2), row.totalPaid.toFixed(2), row.currentBalance.toFixed(2), row.billCount, row.paidBillCount, row.remarks]),
    [],
    ["TOTAL", "", "", "", "", "", "", report.status, "", report.totals.totalBill.toFixed(2), report.totals.totalPaid.toFixed(2), report.totals.currentBalance.toFixed(2), "", "", `${report.totals.homeowners} homeowner(s)`],
  ];
  const csv = rows.map((row) => row.map(cell).join(",")).join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="homeowner-monthly-dues-balances-${report.status.toLowerCase()}-${report.fromText}-to-${report.toText}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
