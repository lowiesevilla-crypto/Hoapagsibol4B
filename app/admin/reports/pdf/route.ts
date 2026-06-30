import { PDFDocument, StandardFonts, rgb, type PDFImage, type PDFPage, type PDFFont } from "pdf-lib";
import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { getAssociationLogoAsset } from "@/lib/association-assets";
import { getFinancialReport, type FinancialReport } from "@/lib/services/financial-report";
import { getAssociationSettings } from "@/lib/system-settings";

const blue = rgb(0.03, 0.38, 0.55);
const navy = rgb(0.04, 0.23, 0.34);
const green = rgb(0.31, 0.72, 0.19);
const pale = rgb(0.95, 0.98, 0.99);
const gray = rgb(0.35, 0.42, 0.47);

export async function GET(request: Request) {
  await requireUser(Role.ADMIN);
  const url = new URL(request.url);
  const [report, association] = await Promise.all([getFinancialReport(url.searchParams.get("from"), url.searchParams.get("to")), getAssociationSettings()]);
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const logoAsset = await getAssociationLogoAsset(association.logoUrl);
  const logo = logoAsset.type === "jpg" ? await document.embedJpg(logoAsset.bytes) : await document.embedPng(logoAsset.bytes);
  document.setTitle(`${association.name} Financial Report ${report.fromText} to ${report.toText}`);
  document.setAuthor(association.documentTitle);
  let page = document.addPage([595.28, 841.89]);
  let y = drawHeader(page, report, association, logo, bold, regular);
  const row = (label: string, value: number, emphasis = false) => { if (y < 72) { page = document.addPage([595.28, 841.89]); y = drawContinuationHeader(page, report, association, bold, regular); } y = drawMoneyRow(page, y, label, value, emphasis, regular, bold); };
  const section = (title: string) => { if (y < 105) { page = document.addPage([595.28, 841.89]); y = drawContinuationHeader(page, report, association, bold, regular); } y -= 8; page.drawRectangle({ x: 42, y: y - 3, width: 511, height: 24, color: pale }); page.drawText(title, { x: 52, y: y + 5, size: 10, font: bold, color: navy }); y -= 30; };
  section("STATEMENT OF INCOME AND EXPENSES");
  row("Homeowner monthly dues", report.duesIncome);
  report.feeBreakdown.forEach((item) => row(item.label, item.value));
  row("Forfeited bond income", report.forfeitedIncome);
  row("Total revenue", report.recognizedIncome, true);
  report.expenseBreakdown.forEach((item) => row(item.label, -item.value));
  row("Employee payroll", -report.payrollExpense);
  row("Total operating expenses", -report.totalExpenses, true);
  row("NET OPERATING SURPLUS / (DEFICIT)", report.operatingSurplus, true);
  section("STATEMENT OF CASH RECEIPTS AND DISBURSEMENTS");
  row("Monthly dues collections", report.duesIncome);
  row("Other fee collections", report.feeIncome);
  row("Refundable bonds received", report.bondsReceived);
  row("Total cash receipts", report.cashInflows, true);
  row("Operating expenses", -report.operatingExpenses);
  row("Employee payroll", -report.payrollExpense);
  row("Employee loans / cash advances issued", -report.employeeLoansIssued);
  row("Bond refunds", -report.bondsRefunded);
  row("Total cash disbursements", -report.cashOutflows, true);
  row("NET CASH MOVEMENT", report.netCashMovement, true);
  section("MONTHLY DUES COLLECTION DETAIL");
  if (!report.duesCollectionRows.length) row("No monthly dues collections in this reporting period", 0);
  for (const item of report.duesCollectionRows) row(`${item.coverage} | ${item.homeowner} | ${item.receiptNumber} | ${item.paymentDate.toISOString().slice(0, 10)}`, item.amount);
  section("BOND ACCOUNTABILITY AND RECEIVABLES");
  row("Refundable bonds held (ending liability)", report.bondsHeld, true);
  row("Lifetime dues billed", report.lifetimeBilled);
  row("Outstanding dues receivables", report.outstandingReceivables, true);
  for (const status of report.statusCounts) row(`${status.status} bills (${status.count})`, status.balance);
  section("EMPLOYEE LOANS AND CASH ADVANCES");
  row("Issued this period", report.employeeLoansIssued);
  row("Payroll repayments this period", report.employeeLoanRepayments);
  row("Total principal", report.employeeLoanPrincipal);
  row("Total paid", report.employeeLoanPaid);
  row("Outstanding employee loan balance", report.employeeLoanOutstanding, true);
  for (const loan of report.employeeLoanIssuanceRows) row(`${loan.employee} - ${loan.description}`, loan.balance);
  const pages = document.getPages();
  pages.forEach((item, index) => { item.drawLine({ start: { x: 42, y: 42 }, end: { x: 553, y: 42 }, thickness: 0.5, color: rgb(0.8, 0.86, 0.89) }); item.drawText(`${association.name} HOA  |  Page ${index + 1} of ${pages.length}`, { x: 42, y: 27, size: 8, font: regular, color: gray }); });
  const bytes = await document.save();
  return new Response(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="pagsibol-financial-report-${report.fromText}-to-${report.toText}.pdf"`, "Cache-Control": "no-store" } });
}

function drawHeader(page: PDFPage, report: FinancialReport, association: Awaited<ReturnType<typeof getAssociationSettings>>, logo: PDFImage, bold: PDFFont, regular: PDFFont) {
  page.drawRectangle({ x: 0, y: 750, width: 595.28, height: 91.89, color: navy });
  page.drawRectangle({ x: 0, y: 744, width: 595.28, height: 6, color: green });
  page.drawImage(logo, { x: 42, y: 764, width: 58, height: 58 });
  page.drawText(association.name, { x: 116, y: 799, size: 17, font: bold, color: rgb(1, 1, 1) });
  page.drawText("HOMEOWNERS ASSOCIATION", { x: 116, y: 779, size: 9, font: regular, color: rgb(0.78, 0.92, 0.98) });
  if (association.tinNumber) page.drawText(`TIN: ${association.tinNumber}`, { x: 116, y: 765, size: 8, font: regular, color: rgb(0.78, 0.92, 0.98) });
  page.drawText("FINANCIAL REPORT", { x: 42, y: 712, size: 21, font: bold, color: blue });
  page.drawText(`Reporting period: ${report.fromText} to ${report.toText}`, { x: 42, y: 691, size: 10, font: regular, color: gray });
  page.drawText(`Generated: ${new Date().toLocaleDateString("en-PH")}`, { x: 425, y: 691, size: 9, font: regular, color: gray });
  return 660;
}

function drawContinuationHeader(page: PDFPage, report: FinancialReport, association: Awaited<ReturnType<typeof getAssociationSettings>>, bold: PDFFont, regular: PDFFont) { page.drawRectangle({ x: 0, y: 792, width: 595.28, height: 49.89, color: navy }); page.drawText(`${association.name} FINANCIAL REPORT`, { x: 42, y: 816, size: 12, font: bold, color: rgb(1, 1, 1) }); page.drawText(`${report.fromText} to ${report.toText}`, { x: 417, y: 816, size: 9, font: regular, color: rgb(0.78, 0.92, 0.98) }); return 770; }

function drawMoneyRow(page: PDFPage, y: number, label: string, value: number, emphasis: boolean, regular: PDFFont, bold: PDFFont) { const normalized = Object.is(value, -0) ? 0 : value; if (emphasis) page.drawLine({ start: { x: 48, y: y + 7 }, end: { x: 547, y: y + 7 }, thickness: 0.7, color: rgb(0.7, 0.78, 0.82) }); page.drawText(label, { x: 52, y: y - 8, size: emphasis ? 10 : 9.5, font: emphasis ? bold : regular, color: navy, maxWidth: 380 }); const text = `PHP ${new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(normalized)}`; page.drawText(text, { x: 547 - (emphasis ? bold : regular).widthOfTextAtSize(text, emphasis ? 10 : 9.5), y: y - 8, size: emphasis ? 10 : 9.5, font: emphasis ? bold : regular, color: normalized < 0 ? rgb(0.7, 0.12, 0.16) : navy }); return y - 23; }
