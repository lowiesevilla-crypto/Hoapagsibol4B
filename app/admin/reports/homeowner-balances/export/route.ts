import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { getHomeownerBalanceReport } from "@/lib/services/homeowner-balance-report";
import { createXlsxWorkbook, type XlsxCell } from "@/lib/xlsx-workbook";

const moneyCell = (value: number): XlsxCell => ({ value, style: 3 });
const percentCell = (value: number): XlsxCell => ({ value: value / 100, style: 4 });
const headerCell = (value: string): XlsxCell => ({ value, style: 2 });
const sectionCell = (value: string): XlsxCell => ({ value, style: 5 });
const wrapCell = (value: string): XlsxCell => ({ value, style: 6 });

export async function GET(request: Request) {
  const user = await requireUser(Role.ADMIN);
  const url = new URL(request.url);
  let report;
  try {
    report = await getHomeownerBalanceReport(user.tenantId, url.searchParams.get("from"), url.searchParams.get("to"), url.searchParams.get("status"));
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Homeowner balance report could not be generated.", { status: 400 });
  }

  const detailHeader = ["Account Number", "Homeowner Name", "Block", "Lot", "Phase", "Status", "Monthly Due Amount", "Total Bill", "Total Paid", "Current Balance", "Bill Count", "Paid Bill Count", "Payment Standing", "Remarks / Payment Details"].map(headerCell);
  const detailRows: XlsxCell[][] = [
    [{ value: "HOMEOWNER MONTHLY DUES BALANCE REPORT", style: 1 }],
    [{ value: report.tenant.name, style: 7 }],
    [report.tenant.address],
    [`Reporting Period: ${report.fromText} to ${report.toText}`],
    [`Homeowner Scope: ${report.status === "ALL" ? "Active and Inactive" : report.status}`],
    [],
    detailHeader,
    ...report.rows.map((row) => [
      row.accountNumber,
      row.homeownerName,
      row.block,
      row.lot,
      row.phase,
      row.status,
      moneyCell(row.monthlyDuesAmount),
      moneyCell(row.totalBill),
      moneyCell(row.totalPaid),
      moneyCell(row.currentBalance),
      row.billCount,
      row.paidBillCount,
      standingLabel(row.paymentStanding),
      wrapCell(row.remarks),
    ]),
    [],
    [sectionCell("TOTAL"), "", "", "", "", "", "", moneyCell(report.totals.totalBill), moneyCell(report.totals.totalPaid), moneyCell(report.totals.currentBalance), "", "", "", `${report.totals.homeowners} homeowner(s)`],
  ];

  const analytics = report.analytics;
  const summaryRows: XlsxCell[][] = [
    [{ value: "HOMEOWNER MONTHLY DUES BALANCE REPORT", style: 1 }],
    [{ value: "SUMMARY & ANALYTICS — HOA BOARD REVIEW", style: 7 }],
    [{ value: report.tenant.name, style: 7 }],
    [report.tenant.address],
    [`Reporting Period: ${report.fromText} to ${report.toText}`],
    [`Homeowner Scope: ${report.status === "ALL" ? "Active and Inactive" : report.status}`],
    [],
    [sectionCell("EXECUTIVE SUMMARY")],
    ...analytics.boardReviewHighlights.map((highlight) => [wrapCell(`• ${highlight}`)]),
    [],
    [sectionCell("KEY PERFORMANCE INDICATORS")],
    [headerCell("Metric"), headerCell("Value")],
    ["Homeowners in report", analytics.homeowners],
    ["Total Monthly Dues billed", moneyCell(analytics.totalBill)],
    ["Total payments recorded", moneyCell(analytics.totalPaid)],
    ["Outstanding Monthly Dues", moneyCell(analytics.currentBalance)],
    ["Collection rate", percentCell(analytics.collectionRatePct)],
    ["Average balance among accounts with outstanding dues", moneyCell(analytics.averageOutstandingBalance)],
    [],
    [sectionCell("PAYMENT STANDING ANALYTICS")],
    [headerCell("Standing"), headerCell("Homeowners"), headerCell("Share of report")],
    ["Full Paid", analytics.fullyPaidHomeowners, percentCell(analytics.homeowners ? (analytics.fullyPaidHomeowners / analytics.homeowners) * 100 : 0)],
    ["Partial", analytics.partialHomeowners, percentCell(analytics.homeowners ? (analytics.partialHomeowners / analytics.homeowners) * 100 : 0)],
    ["None Payment", analytics.nonePaymentHomeowners, percentCell(analytics.homeowners ? (analytics.nonePaymentHomeowners / analytics.homeowners) * 100 : 0)],
    ["No Monthly Dues bill", analytics.noBillHomeowners, percentCell(analytics.homeowners ? (analytics.noBillHomeowners / analytics.homeowners) * 100 : 0)],
    [],
    [sectionCell("OUTSTANDING BALANCE BY BLOCK")],
    [headerCell("Block"), headerCell("Homeowners"), headerCell("Total Bill"), headerCell("Total Paid"), headerCell("Current Balance"), headerCell("Collection Rate")],
    ...analytics.byBlock.map((block) => [block.block, block.homeowners, moneyCell(block.totalBill), moneyCell(block.totalPaid), moneyCell(block.currentBalance), percentCell(block.collectionRatePct)]),
    [],
    [sectionCell("TOP OUTSTANDING HOMEOWNER ACCOUNTS")],
    [headerCell("Homeowner"), headerCell("Block"), headerCell("Lot"), headerCell("Total Bill"), headerCell("Total Paid"), headerCell("Current Balance"), headerCell("Standing")],
    ...analytics.topOutstanding.map((row) => [row.homeownerName, row.block, row.lot, moneyCell(row.totalBill), moneyCell(row.totalPaid), moneyCell(row.currentBalance), standingLabel(row.paymentStanding)]),
    [],
    [wrapCell("Board Review Note: This schedule is a tenant-scoped operational report derived from the selected Monthly Dues billing period and recorded payment allocations. Review material balances and collection actions together with the underlying official receipts and accounting records before approving collection decisions.")],
  ];

  const workbook = createXlsxWorkbook([
    {
      name: "Monthly Dues Balance",
      rows: detailRows,
      widths: [16, 28, 10, 10, 12, 12, 18, 16, 16, 18, 12, 14, 16, 70],
      merges: ["A1:N1", "A2:N2", "A3:N3", "A4:N4", "A5:N5"],
      freezeRows: 7,
      autoFilter: `A7:N${Math.max(7, 7 + report.rows.length)}`,
      orientation: "landscape",
    },
    {
      name: "Summary & Analytics",
      rows: summaryRows,
      widths: [40, 18, 18, 18, 18, 18, 18],
      merges: ["A1:G1", "A2:G2", "A3:G3", "A4:G4", "A5:G5", "A6:G6", "A8:G8", ...analytics.boardReviewHighlights.map((_, index) => `A${9 + index}:G${9 + index}`)],
      orientation: "landscape",
    },
  ]);

  return new Response(new Uint8Array(workbook), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="homeowner-monthly-dues-balance-${report.status.toLowerCase()}-${report.fromText}-to-${report.toText}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}

function standingLabel(standing: "FULL_PAID" | "PARTIAL" | "NONE_PAYMENT" | "NO_BILL") {
  if (standing === "FULL_PAID") return "Full Paid";
  if (standing === "PARTIAL") return "Partial";
  if (standing === "NONE_PAYMENT") return "None Payment";
  return "No Monthly Dues Bill";
}
