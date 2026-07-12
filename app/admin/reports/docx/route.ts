import { AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, ImageRun, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { getAssociationLogoAsset } from "@/lib/association-assets";
import { getFinancialReport } from "@/lib/services/financial-report";
import { getAssociationSettings } from "@/lib/system-settings";

const blue = "08618D";
const navy = "0A3B57";
const green = "58B832";
const lightBlue = "EDF8FD";
const money = (value: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Object.is(value, -0) ? 0 : value);

export async function GET(request: Request) {
  await requireUser(Role.ADMIN);
  const url = new URL(request.url);
  const [report, association] = await Promise.all([getFinancialReport(url.searchParams.get("from"), url.searchParams.get("to")), getAssociationSettings()]);
  const logo = await getAssociationLogoAsset(association.logoUrl);
  const children = [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: "FINANCIAL REPORT", bold: true, size: 34, color: blue })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 300 }, children: [new TextRun({ text: `Reporting period: ${report.fromText} to ${report.toText}`, size: 20, color: "5C6970" })] }),
    sectionHeading("Statement of Income and Expenses"),
    financialTable([
      ["Homeowner monthly dues", report.duesIncome],
      ...report.feeBreakdown.map((item) => [item.label, item.value] as [string, number]),
      ["Forfeited bond income", report.forfeitedIncome],
      ["Total revenue", report.recognizedIncome, true],
      ...report.expenseBreakdown.map((item) => [item.label, -item.value] as [string, number]),
      ["Employee payroll", -report.payrollExpense],
      ["Total operating expenses", -report.totalExpenses, true],
      ["NET OPERATING SURPLUS / (DEFICIT)", report.operatingSurplus, true],
    ]),
    sectionHeading("Statement of Cash Receipts and Disbursements"),
    financialTable([
      ["Monthly dues cash received", report.paymentCashReceived], ["Other fee collections", report.feeIncome], ["Refundable bonds received", report.bondsReceived], ["Total cash receipts", report.cashInflows, true],
      ["Operating expenses", -report.operatingExpenses], ["Employee payroll", -report.payrollExpense], ["Employee loans / cash advances issued", -report.employeeLoansIssued], ["Bond refunds", -report.bondsRefunded], ["Total cash disbursements", -report.cashOutflows, true], ["NET CASH MOVEMENT", report.netCashMovement, true],
    ]),
    sectionHeading("Payment Allocation Memorandum"),
    financialTable([["Amount applied to dues", report.duesIncome], ["Unapplied homeowner credits", report.unappliedCredits]]),
    sectionHeading("Monthly Dues Collection Detail"),
    duesCollectionTable(report.duesCollectionRows),
    sectionHeading("Bond Accountability and Dues Receivables"),
    financialTable([
      ["Refundable bonds held (ending liability)", report.bondsHeld, true], ["Lifetime dues billed", report.lifetimeBilled], ["Outstanding dues receivables", report.outstandingReceivables, true],
      ...report.statusCounts.map((item) => [`${item.status} bills (${item.count})`, item.balance] as [string, number]),
    ]),
    sectionHeading("Employee Loans and Cash Advances"),
    financialTable([
      ["Issued this period", report.employeeLoansIssued],
      ["Payroll repayments this period", report.employeeLoanRepayments],
      ["Total principal", report.employeeLoanPrincipal],
      ["Total paid", report.employeeLoanPaid],
      ["Outstanding employee loan balance", report.employeeLoanOutstanding, true],
      ...report.employeeLoanIssuanceRows.map((item) => [`${item.employee} - ${item.description}`, item.balance] as [string, number]),
    ]),
    new Paragraph({ spacing: { before: 500 }, children: [new TextRun({ text: "Prepared by: ______________________________", size: 20 }), new TextRun({ text: "                         Approved by: ______________________________", size: 20 })] }),
  ];
  const document = new Document({
    creator: association.documentTitle,
    title: `Financial Report ${report.fromText} to ${report.toText}`,
    description: "HOA statement of income, expenses, cash receipts, disbursements, bonds, and receivables",
    styles: { default: { document: { run: { font: "Arial", size: 20, color: navy }, paragraph: { spacing: { after: 100, line: 276 } } } } },
    sections: [{
      properties: { page: { margin: { top: 900, right: 900, bottom: 900, left: 900 } } },
      headers: { default: new Header({ children: [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: noBorders(), rows: [new TableRow({ children: [new TableCell({ width: { size: 14, type: WidthType.PERCENTAGE }, borders: noBorders(), children: [new Paragraph({ children: [new ImageRun({ data: logo.bytes, transformation: { width: 62, height: 62 }, type: logo.type })] })] }), new TableCell({ width: { size: 86, type: WidthType.PERCENTAGE }, borders: noBorders(), verticalAlign: "center", children: [new Paragraph({ spacing: { after: 30 }, children: [new TextRun({ text: association.name, bold: true, size: 28, color: navy })] }), new Paragraph({ children: [new TextRun({ text: "HOMEOWNERS ASSOCIATION", bold: true, size: 17, color: green })] }), ...(association.tinNumber ? [new Paragraph({ children: [new TextRun({ text: `TIN: ${association.tinNumber}`, size: 15, color: "60747E" })] })] : [])] })] })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, border: { top: { color: "BFDCEA", size: 4, style: BorderStyle.SINGLE, space: 8 } }, children: [new TextRun({ text: `${association.name} HOA  |  Generated ${new Date().toLocaleDateString("en-PH")}`, size: 16, color: "60747E" })] })] }) },
      children,
    }],
  });
  const bytes = await Packer.toBuffer(document);
  return new Response(Uint8Array.from(bytes).buffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename="pagsibol-financial-report-${report.fromText}-to-${report.toText}.docx"`, "Cache-Control": "no-store" } });
}

function sectionHeading(text: string) { return new Paragraph({ heading: HeadingLevel.HEADING_1, keepNext: true, spacing: { before: 360, after: 140 }, border: { bottom: { color: green, size: 12, style: BorderStyle.SINGLE, space: 4 } }, children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 23, color: navy })] }); }

function financialTable(rows: Array<[string, number, boolean?]>) { return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, columnWidths: [7000, 2360], rows: rows.map(([label, value, total]) => new TableRow({ cantSplit: true, children: [new TableCell({ width: { size: 7000, type: WidthType.DXA }, shading: total ? { fill: lightBlue, type: ShadingType.CLEAR } : undefined, margins: { top: 100, bottom: 100, left: 140, right: 140 }, children: [new Paragraph({ children: [new TextRun({ text: label, bold: total, size: total ? 20 : 19 })] })] }), new TableCell({ width: { size: 2360, type: WidthType.DXA }, shading: total ? { fill: lightBlue, type: ShadingType.CLEAR } : undefined, margins: { top: 100, bottom: 100, left: 140, right: 140 }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: money(value), bold: total, color: value < 0 ? "B4232C" : navy, size: total ? 20 : 19 })] })] })] })) }); }

function duesCollectionTable(rows: Array<{ receiptNumber: string; homeowner: string; paymentDate: Date; coverage: string; amount: number }>) {
  const values = rows.length ? rows : [{ receiptNumber: "-", homeowner: "No monthly dues collections", paymentDate: new Date(0), coverage: "-", amount: 0 }];
  const header = new TableRow({ tableHeader: true, children: ["Receipt", "Homeowner", "Date", "Payment Coverage", "Amount"].map((text) => new TableCell({ shading: { fill: lightBlue, type: ShadingType.CLEAR }, margins: { top: 90, bottom: 90, left: 90, right: 90 }, children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 17, color: navy })] })] })) });
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [header, ...values.map((item) => new TableRow({ cantSplit: true, children: [item.receiptNumber, item.homeowner, item.paymentDate.valueOf() ? item.paymentDate.toISOString().slice(0, 10) : "-", item.coverage, money(item.amount)].map((text, index) => new TableCell({ margins: { top: 80, bottom: 80, left: 90, right: 90 }, children: [new Paragraph({ alignment: index === 4 ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text, size: 16 })] })] })) }))] });
}

function noBorders() { return { top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } }; }
