import { Role } from "@prisma/client";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { getAssociationLogoAsset } from "@/lib/association-assets";
import { requireUser } from "@/lib/auth";
import { assertFinanceDashboardAccess, FinanceDashboardAccessError } from "@/lib/finance-dashboard-access";
import { FinanceDashboardInputError, getFinanceDashboard, type FinanceDashboardData } from "@/lib/services/finance-dashboard";
import { getAssociationSettings } from "@/lib/system-settings";

const pageSize: [number, number] = [595.28, 841.89];
const navy = rgb(0.04, 0.23, 0.34);
const blue = rgb(0.03, 0.38, 0.55);
const green = rgb(0.31, 0.72, 0.19);
const pale = rgb(0.94, 0.98, 0.99);
const gray = rgb(0.35, 0.42, 0.47);

export async function GET(request: Request) {
  const user = await requireUser(Role.ADMIN);
  try {
    await assertFinanceDashboardAccess(user);
    const url = new URL(request.url);
    const [data, association] = await Promise.all([
      getFinanceDashboard({ tenantId: user.tenantId, fromInput: url.searchParams.get("from"), toInput: url.searchParams.get("to") }),
      getAssociationSettings(user.tenantId),
    ]);
    const pdf = await PDFDocument.create();
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const logoAsset = await getAssociationLogoAsset(association.logoUrl);
    const logo = logoAsset.type === "jpg" ? await pdf.embedJpg(logoAsset.bytes) : await pdf.embedPng(logoAsset.bytes);
    const report = new PdfReport(pdf, regular, bold, logo, association.name, association.address || "", data, user.name);

    report.addTitle();
    report.moneySection("Executive KPI Summary", [
      ["Total Billed Amount", data.kpis.totalBilled], ["Active Collections", data.kpis.activeCollections], ["Voided Collections", data.kpis.voidedCollections], ["Net Collections", data.kpis.netCollections], ["Outstanding Receivables", data.kpis.outstandingReceivables], ["Collection Rate", data.kpis.collectionRate, true], ["Unapplied Homeowner Credit", data.kpis.unappliedCredit], ["Active Receipt Count", data.kpis.activeReceiptCount, false, true], ["Voided Receipt Count", data.kpis.voidedReceiptCount, false, true], ["Pending Payment Request Count", data.kpis.pendingPaymentRequestCount, false, true],
    ]);
    report.moneySection("Reconciliation Summary", [
      ["Total billed", data.reconciliation.totalBilled], ["Amount applied to bills", data.reconciliation.amountAppliedToBills], ["Unapplied credit", data.reconciliation.unappliedCredit], ["Total active payment received", data.reconciliation.activePaymentReceived], ["Total voided payment received", data.reconciliation.voidedPaymentReceived], ["Outstanding receivables", data.reconciliation.outstandingReceivables], ["Reconciliation variance", data.reconciliation.variance],
    ]);
    report.textSection("Key Observations", dashboardObservations(data));
    report.table("Monthly Collection Trend", ["Month", "Active", "Applied", "Credit", "Voided"], data.monthlyTrend.map((row) => [row.label, pdfMoney(row.activeCollections), pdfMoney(row.amountAppliedToBills), pdfMoney(row.unappliedCredit), pdfMoney(row.voidedCollections)]), [88, 104, 104, 104, 104]);
    report.table("Aging Summary", ["Bucket", "Bill count", "Amount"], data.aging.map((row) => [row.label, String(row.billCount), pdfMoney(row.amount)]), [210, 100, 194]);
    report.table("Payment Method Breakdown", ["Method", "Transactions", "Amount", "Share"], data.paymentMethods.map((row) => [row.label, String(row.transactionCount), pdfMoney(row.totalAmount), `${row.percentage.toFixed(1)}%`]), [154, 100, 150, 100]);
    report.table("Revenue / Billing Type Breakdown", ["Billing type", "Billed", "Collected / Applied", "Outstanding"], data.revenueBreakdown.map((row) => [row.label, pdfMoney(row.billedAmount), pdfMoney(row.collectedAmount), pdfMoney(row.outstandingAmount)]), [164, 110, 120, 110]);
    report.table("Top Delinquent Homeowners", ["Homeowner", "Account", "Block / Lot", "Outstanding", "Oldest", "Aging"], data.delinquent.exportRows.map((row) => [row.homeownerName, row.accountNumber, `${row.block} / ${row.lot}`, pdfMoney(row.outstandingBalance), isoDate(row.oldestUnpaidDate), row.agingBucket]), [112, 92, 60, 91, 70, 79]);
    report.signatures();
    report.finish();

    pdf.setTitle(`${association.name} Executive Finance Dashboard ${data.range.fromText} to ${data.range.toText}`);
    pdf.setAuthor(association.documentTitle);
    pdf.setSubject("Tenant-scoped executive finance dashboard and reconciliation report");
    const bytes = await pdf.save();
    return new Response(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="finance-dashboard-${data.range.fromText}-to-${data.range.toText}.pdf"`, "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof FinanceDashboardInputError) return new Response(error.message, { status: 400 });
    if (error instanceof FinanceDashboardAccessError) return new Response(error.message, { status: 403 });
    throw error;
  }
}

class PdfReport {
  private page: PDFPage;
  private y = 0;
  private readonly pages: PDFPage[] = [];

  constructor(
    private readonly document: PDFDocument,
    private readonly regular: PDFFont,
    private readonly bold: PDFFont,
    private readonly logo: PDFImage,
    private readonly associationName: string,
    private readonly associationAddress: string,
    private readonly data: FinanceDashboardData,
    private readonly generatedBy: string,
  ) {
    this.page = this.newPage();
  }

  addTitle() {
    this.page.drawText("EXECUTIVE FINANCE DASHBOARD", { x: 42, y: this.y, size: 20, font: this.bold, color: blue });
    this.y -= 23;
    this.page.drawText(`Reporting period: ${this.data.range.fromText} to ${this.data.range.toText}`, { x: 42, y: this.y, size: 9.5, font: this.regular, color: gray });
    this.y -= 15;
    this.page.drawText(`Generated: ${dateTime(this.data.generatedAt)}  |  Generated by: ${safe(this.generatedBy)}`, { x: 42, y: this.y, size: 8.5, font: this.regular, color: gray, maxWidth: 511 });
    this.y -= 20;
  }

  moneySection(title: string, rows: Array<[string, number, boolean?, boolean?]>) {
    this.section(title, 30 + rows.length * 19);
    for (const [label, value, percentage, count] of rows) {
      this.ensure(19);
      this.page.drawText(safe(label), { x: 50, y: this.y, size: 8.8, font: this.regular, color: navy, maxWidth: 330 });
      const display = percentage ? `${value.toFixed(1)}%` : count ? value.toLocaleString("en-PH") : pdfMoney(value);
      drawRight(this.page, display, this.bold, 8.8, 545, this.y, value < 0 ? rgb(0.7, 0.12, 0.16) : navy);
      this.y -= 19;
    }
    this.y -= 5;
  }

  textSection(title: string, rows: string[]) {
    this.section(title, 30 + rows.length * 18);
    for (const row of rows.length ? rows : ["No notable exceptions for this reporting period."]) {
      const lines = wrapText(safe(row), this.regular, 8.2, 486);
      this.ensure(lines.length * 11 + 8);
      lines.forEach((line, index) => this.page.drawText(index === 0 ? `- ${line}` : `  ${line}`, { x: 54, y: this.y - index * 10, size: 8.2, font: this.regular, color: navy }));
      this.y -= lines.length * 10 + 6;
    }
    this.y -= 4;
  }

  table(title: string, headers: string[], rows: string[][], widths: number[]) {
    this.section(title, 62);
    this.tableHeader(headers, widths);
    if (!rows.length) {
      const emptyRow = ["No records", ...headers.slice(1).map(() => "-")];
      this.tableRow(emptyRow, widths, this.tableRowHeight(emptyRow, widths));
    }
    for (const row of rows) {
      const height = this.tableRowHeight(row, widths);
      if (this.y - height < 72) {
        this.page = this.newPage();
        this.section(`${title} (continued)`, 62);
        this.tableHeader(headers, widths);
      }
      this.tableRow(row, widths, height);
    }
    this.y -= 8;
  }

  signatures() {
    this.ensure(92);
    this.section("Certification", 84);
    this.y -= 36;
    this.page.drawLine({ start: { x: 50, y: this.y }, end: { x: 250, y: this.y }, thickness: 0.8, color: gray });
    this.page.drawLine({ start: { x: 345, y: this.y }, end: { x: 545, y: this.y }, thickness: 0.8, color: gray });
    this.page.drawText("Prepared by", { x: 50, y: this.y - 14, size: 8.5, font: this.bold, color: navy });
    this.page.drawText("Approved by", { x: 345, y: this.y - 14, size: 8.5, font: this.bold, color: navy });
    this.y -= 30;
  }

  finish() {
    this.pages.forEach((page, index) => {
      page.drawLine({ start: { x: 42, y: 43 }, end: { x: 553, y: 43 }, thickness: 0.5, color: rgb(0.78, 0.84, 0.87) });
      page.drawText(`${safe(this.associationName)} | Executive Finance Dashboard | Confidential internal-use report`, { x: 42, y: 28, size: 7.2, font: this.regular, color: gray, maxWidth: 405 });
      drawRight(page, `Page ${index + 1} of ${this.pages.length}`, this.regular, 7.5, 553, 28, gray);
    });
  }

  private section(title: string, requiredSpace: number) {
    this.ensure(requiredSpace);
    this.page.drawRectangle({ x: 42, y: this.y - 5, width: 511, height: 23, color: pale });
    this.page.drawRectangle({ x: 42, y: this.y - 5, width: 4, height: 23, color: green });
    this.page.drawText(title.toUpperCase(), { x: 52, y: this.y + 3, size: 9.5, font: this.bold, color: navy });
    this.y -= 31;
  }

  private tableHeader(headers: string[], widths: number[]) {
    let x = 42;
    this.page.drawRectangle({ x, y: this.y - 5, width: 511, height: 20, color: navy });
    headers.forEach((header, index) => { this.page.drawText(truncate(header, widths[index], 7.5), { x: x + 4, y: this.y + 2, size: 7.5, font: this.bold, color: rgb(1, 1, 1) }); x += widths[index]; });
    this.y -= 20;
  }

  private tableRow(values: string[], widths: number[], height: number) {
    let x = 42;
    values.forEach((value, index) => {
      const lines = wrapText(safe(value), index === 0 ? this.bold : this.regular, 7.2, widths[index] - 8);
      lines.forEach((line, lineIndex) => {
        const y = this.y - lineIndex * 9;
        const rightAligned = index > 0 && (line.startsWith("PHP ") || line.endsWith("%") || /^\d+$/.test(line));
        if (rightAligned) drawRight(this.page, line, index === 0 ? this.bold : this.regular, 7.2, x + widths[index] - 4, y, navy);
        else this.page.drawText(line, { x: x + 4, y, size: 7.2, font: index === 0 ? this.bold : this.regular, color: navy });
      });
      x += widths[index];
    });
    this.page.drawLine({ start: { x: 42, y: this.y - height + 5 }, end: { x: 553, y: this.y - height + 5 }, thickness: 0.35, color: rgb(0.86, 0.89, 0.91) });
    this.y -= height;
  }

  private tableRowHeight(values: string[], widths: number[]) {
    const lineCounts = values.map((value, index) => wrapText(safe(value), index === 0 ? this.bold : this.regular, 7.2, widths[index] - 8).length);
    return Math.max(18, Math.max(...lineCounts) * 9 + 9);
  }

  private ensure(space: number) {
    if (this.y - space >= 64) return;
    this.page = this.newPage();
  }

  private newPage() {
    const page = this.document.addPage(pageSize);
    this.pages.push(page);
    page.drawRectangle({ x: 0, y: 760, width: pageSize[0], height: 82, color: navy });
    page.drawRectangle({ x: 0, y: 754, width: pageSize[0], height: 6, color: green });
    page.drawImage(this.logo, { x: 42, y: 774, width: 48, height: 48 });
    page.drawText(truncate(this.associationName.toUpperCase(), 370, 14), { x: 105, y: 802, size: 14, font: this.bold, color: rgb(1, 1, 1) });
    if (this.associationAddress) page.drawText(truncate(this.associationAddress, 370, 8), { x: 105, y: 784, size: 8, font: this.regular, color: rgb(0.8, 0.92, 0.97) });
    page.drawText(`${this.data.range.fromText} to ${this.data.range.toText}`, { x: 446, y: 768, size: 7.5, font: this.regular, color: rgb(0.8, 0.92, 0.97) });
    this.y = 724;
    return page;
  }
}

function pdfMoney(value: number) { return `PHP ${new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Object.is(value, -0) ? 0 : value)}`; }
function isoDate(value: Date) { return value.toISOString().slice(0, 10); }
function dateTime(value: Date) { return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(value); }
function safe(value: string) { return value.replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim(); }
function truncate(text: string, width: number, size: number) { const limit = Math.max(4, Math.floor(width / (size * 0.52))); return text.length > limit ? `${text.slice(0, Math.max(1, limit - 3))}...` : text; }
function drawRight(page: PDFPage, text: string, font: PDFFont, size: number, x: number, y: number, color: ReturnType<typeof rgb>) { page.drawText(text, { x: x - font.widthOfTextAtSize(text, size), y, size, font, color }); }

function dashboardObservations(data: FinanceDashboardData) {
  const observations: string[] = [];
  observations.push(data.reconciliation.balanced ? "Reconciliation is within the PHP 0.01 tolerance." : `Reconciliation variance is ${pdfMoney(data.reconciliation.variance)} and requires review.`);
  if (data.kpis.collectionRate > 100) observations.push("Collection rate exceeds 100% because selected-period receipts may settle earlier-period bills.");
  if (data.kpis.unappliedCredit > 0) observations.push(`${pdfMoney(data.kpis.unappliedCredit)} is reported as unapplied homeowner credit and excluded from applied collections.`);
  if (!data.delinquent.exportRows.length) observations.push("No delinquent homeowners appear in the selected period and as-of date.");
  return observations;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  if (!text) return [""];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (font.widthOfTextAtSize(word, size) > maxWidth) {
      if (line) {
        lines.push(line);
        line = "";
      }
      let chunk = "";
      for (const char of word) {
        const candidate = `${chunk}${char}`;
        if (font.widthOfTextAtSize(candidate, size) <= maxWidth) chunk = candidate;
        else {
          if (chunk) lines.push(chunk);
          chunk = char;
        }
      }
      if (chunk) line = chunk;
      continue;
    }
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
    else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}
