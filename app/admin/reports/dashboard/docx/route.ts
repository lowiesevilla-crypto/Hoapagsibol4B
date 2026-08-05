import { Permission } from "@/lib/authorization/permissions";
import { requirePermission } from "@/lib/authorization/guards";

import { AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, ImageRun, PageNumber, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import { getAssociationLogoAsset } from "@/lib/association-assets";

import { assertFinanceDashboardAccess, FinanceDashboardAccessError } from "@/lib/finance-dashboard-access";
import { FinanceDashboardInputError, getFinanceDashboard } from "@/lib/services/finance-dashboard";
import { getAssociationSettings } from "@/lib/system-settings";

const blue = "08618D";
const navy = "0A3B57";
const green = "58B832";
const pale = "EDF8FD";

export async function GET(request: Request) {
  const user = await requirePermission(Permission.REPORTS_FINANCIAL);
  try {
    await assertFinanceDashboardAccess(user);
    const url = new URL(request.url);
    const [data, association] = await Promise.all([
      getFinanceDashboard({ tenantId: user.tenantId, fromInput: url.searchParams.get("from"), toInput: url.searchParams.get("to") }),
      getAssociationSettings(user.tenantId),
    ]);
    const logo = await getAssociationLogoAsset(association.logoUrl);
    const children = [
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: "EXECUTIVE FINANCE DASHBOARD", bold: true, size: 34, color: blue })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: `Reporting period: ${data.range.fromText} to ${data.range.toText}`, size: 20, color: "5C6970" })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 300 }, children: [new TextRun({ text: `Generated ${dateTime(data.generatedAt)} by ${user.name}`, size: 17, color: "5C6970" })] }),
      sectionHeading("Executive KPI Summary"),
      valueTable([
        ["Total Billed Amount", php(data.kpis.totalBilled)], ["Active Collections", php(data.kpis.activeCollections)], ["Voided Collections", php(data.kpis.voidedCollections)], ["Net Collections", php(data.kpis.netCollections)], ["Outstanding Receivables", php(data.kpis.outstandingReceivables)], ["Collection Rate", `${data.kpis.collectionRate.toFixed(1)}%`], ["Unapplied Homeowner Credit", php(data.kpis.unappliedCredit)], ["Active Receipt Count", String(data.kpis.activeReceiptCount)], ["Voided Receipt Count", String(data.kpis.voidedReceiptCount)], ["Pending Payment Request Count", String(data.kpis.pendingPaymentRequestCount)],
      ]),
      sectionHeading("Reconciliation Summary"),
      valueTable([
        ["Total billed", php(data.reconciliation.totalBilled)], ["Amount applied to bills", php(data.reconciliation.amountAppliedToBills)], ["Unapplied credit", php(data.reconciliation.unappliedCredit)], ["Total active payment received", php(data.reconciliation.activePaymentReceived)], ["Total voided payment received", php(data.reconciliation.voidedPaymentReceived)], ["Outstanding receivables", php(data.reconciliation.outstandingReceivables)], ["Reconciliation variance", php(data.reconciliation.variance)], ["Control status", data.reconciliation.balanced ? "Balanced" : "Variance requires review"],
      ]),
      sectionHeading("Key Observations"),
      ...dashboardObservations(data).map((text) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 90, line: 260 }, children: [new TextRun({ text, size: 18 })] })),
      sectionHeading("Monthly Collection Trend"),
      dataTable(["Month", "Active", "Applied", "Credit", "Voided"], data.monthlyTrend.map((row) => [row.label, php(row.activeCollections), php(row.amountAppliedToBills), php(row.unappliedCredit), php(row.voidedCollections)])),
      sectionHeading("Aging Summary"),
      dataTable(["Bucket", "Bill count", "Amount"], data.aging.map((row) => [row.label, String(row.billCount), php(row.amount)])),
      sectionHeading("Payment Method Breakdown"),
      dataTable(["Method", "Transactions", "Amount", "Share"], data.paymentMethods.map((row) => [row.label, String(row.transactionCount), php(row.totalAmount), `${row.percentage.toFixed(1)}%`])),
      sectionHeading("Revenue / Billing Type Breakdown"),
      dataTable(["Billing type", "Billed", "Collected / Applied", "Outstanding"], data.revenueBreakdown.map((row) => [row.label, php(row.billedAmount), php(row.collectedAmount), php(row.outstandingAmount)])),
      sectionHeading("Top Delinquent Homeowners"),
      dataTable(["Homeowner", "Account", "Block / Lot", "Outstanding", "Oldest unpaid", "Aging"], data.delinquent.exportRows.map((row) => [row.homeownerName, row.accountNumber, `${row.block} / ${row.lot}`, php(row.outstandingBalance), row.oldestUnpaidDate.toISOString().slice(0, 10), row.agingBucket])),
      sectionHeading("Certification"),
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: noBorders(), rows: [new TableRow({ cantSplit: true, children: [signatureCell("Prepared by"), signatureCell("Approved by")] })] }),
    ];
    const document = new Document({
      creator: association.documentTitle,
      title: `${association.name} Executive Finance Dashboard ${data.range.fromText} to ${data.range.toText}`,
      description: "Tenant-scoped executive finance dashboard and reconciliation report",
      styles: { default: { document: { run: { font: "Arial", size: 19, color: navy }, paragraph: { spacing: { after: 90, line: 260 } } } } },
      sections: [{
        properties: { page: { margin: { top: 900, right: 720, bottom: 900, left: 720 } } },
        headers: { default: new Header({ children: [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: noBorders(), rows: [new TableRow({ children: [new TableCell({ width: { size: 13, type: WidthType.PERCENTAGE }, borders: noBorders(), children: [new Paragraph({ children: [new ImageRun({ data: logo.bytes, transformation: { width: 58, height: 58 }, type: logo.type })] })] }), new TableCell({ width: { size: 87, type: WidthType.PERCENTAGE }, borders: noBorders(), verticalAlign: "center", children: [new Paragraph({ spacing: { after: 30 }, children: [new TextRun({ text: association.name, bold: true, size: 27, color: navy })] }), ...(association.address ? [new Paragraph({ children: [new TextRun({ text: association.address, size: 15, color: "60747E" })] })] : [])] })] })] })] }) },
        footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, border: { top: { color: "BFDCEA", size: 4, style: BorderStyle.SINGLE, space: 8 } }, children: [new TextRun({ text: `${association.name} | Executive Finance Dashboard | Confidential internal-use report | Page `, size: 15, color: "60747E" }), new TextRun({ children: [PageNumber.CURRENT], size: 15, color: "60747E" }), new TextRun({ text: " of ", size: 15, color: "60747E" }), new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 15, color: "60747E" })] })] }) },
        children,
      }],
    });
    const bytes = await Packer.toBuffer(document);
    return new Response(Uint8Array.from(bytes).buffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename="finance-dashboard-${data.range.fromText}-to-${data.range.toText}.docx"`, "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof FinanceDashboardInputError) return new Response(error.message, { status: 400 });
    if (error instanceof FinanceDashboardAccessError) return new Response(error.message, { status: 403 });
    throw error;
  }
}

function sectionHeading(text: string) { return new Paragraph({ heading: HeadingLevel.HEADING_1, keepNext: true, spacing: { before: 320, after: 120 }, border: { bottom: { color: green, size: 10, style: BorderStyle.SINGLE, space: 4 } }, children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 22, color: navy })] }); }
function valueTable(rows: string[][]) { return dataTable(["Metric", "Value"], rows); }
function dataTable(headers: string[], rows: string[][]) {
  const values = rows.length ? rows : [["No values for this reporting period.", ...headers.slice(1).map(() => "-")]];
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ tableHeader: true, children: headers.map((header) => new TableCell({ shading: { fill: pale, type: ShadingType.CLEAR }, margins: cellMargins(), children: [new Paragraph({ children: [new TextRun({ text: header, bold: true, size: 16, color: navy })] })] })) }), ...values.map((row) => new TableRow({ cantSplit: true, children: row.map((value, index) => new TableCell({ margins: cellMargins(), children: [new Paragraph({ alignment: index > 0 ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: value, bold: index === 0, size: 16 })] })] })) }))] });
}
function signatureCell(label: string) { return new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, borders: noBorders(), margins: { top: 700, bottom: 100, left: 100, right: 300 }, children: [new Paragraph({ border: { top: { color: "60747E", size: 6, style: BorderStyle.SINGLE, space: 4 } }, children: [new TextRun({ text: label, bold: true, size: 17 })] })] }); }
function cellMargins() { return { top: 85, bottom: 85, left: 90, right: 90 }; }
function php(value: number) { return `PHP ${new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Object.is(value, -0) ? 0 : value)}`; }
function dateTime(value: Date) { return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(value); }
function noBorders() { return { top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } }; }

function dashboardObservations(data: Awaited<ReturnType<typeof getFinanceDashboard>>) {
  const observations: string[] = [];
  observations.push(data.reconciliation.balanced ? "Reconciliation is within the PHP 0.01 tolerance." : `Reconciliation variance is ${php(data.reconciliation.variance)} and requires review.`);
  if (data.kpis.collectionRate > 100) observations.push("Collection rate exceeds 100% because selected-period receipts may settle earlier-period bills.");
  if (data.kpis.unappliedCredit > 0) observations.push(`${php(data.kpis.unappliedCredit)} is reported as unapplied homeowner credit and excluded from applied collections.`);
  if (!data.delinquent.exportRows.length) observations.push("No delinquent homeowners appear in the selected period and as-of date.");
  return observations;
}
