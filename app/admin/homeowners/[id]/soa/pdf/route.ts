import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import { requireUser } from "@/lib/auth";
import { getAssociationLogoAsset } from "@/lib/association-assets";
import { getStatementOfAccount, type StatementLedgerEntry } from "@/lib/services/statement-of-account";
import { shortDate } from "@/lib/utils";

type StatementOfAccount = Awaited<ReturnType<typeof getStatementOfAccount>>;
const pageSize: [number, number] = [595.28, 841.89];
const marginX = 36;
const contentWidth = 523;
const topY = 792;
const bottomY = 42;
const tableHeaderHeight = 18;
const tableGapAfter = 10;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(Role.ADMIN);
  const { id } = await params;
  const baseUrl = request.nextUrl.origin;
  const soa = await getStatementOfAccount(id, user.tenantId, baseUrl);
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const qr = await pdf.embedPng(await QRCode.toBuffer(soa.verifyUrl, { type: "png", width: 300, margin: 1, errorCorrectionLevel: "M" }));
  const logoAsset = await getAssociationLogoAsset(soa.association.logoUrl);
  const logo = logoAsset.type === "jpg" ? await pdf.embedJpg(logoAsset.bytes) : await pdf.embedPng(logoAsset.bytes);
  const doc = { pdf, page: pdf.addPage(pageSize), regular, bold, y: topY, pageNumber: 1 };

  drawHeader(doc, soa, logo, qr);
  drawInfoBlocks(doc, soa);
  drawAging(doc, soa);
  drawLedger(doc, soa.ledger);
  drawPayments(doc, soa);
  drawBilling(doc, soa);
  drawFooter(doc, soa);

  pdf.setTitle(`${soa.statementCode} - Statement of Account`);
  pdf.setAuthor(soa.association.name);
  pdf.setSubject("Homeowner Statement of Account");
  const bytes = await pdf.save();
  const filename = `${soa.statementCode}.pdf`;
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function drawHeader(doc: PdfDoc, soa: StatementOfAccount, logo: PDFImage, qr: PDFImage) {
  const pine = rgb(0.03, 0.24, 0.17);
  doc.page.drawImage(logo, { x: 36, y: 744, width: 58, height: 58 });
  doc.page.drawText("STATEMENT OF ACCOUNT", { x: 112, y: 790, font: doc.bold, size: 9, color: pine });
  doc.page.drawText(safe(soa.association.name.toUpperCase()), { x: 112, y: 770, font: doc.bold, size: 16, color: pine, maxWidth: 330 });
  doc.page.drawText(safe(soa.association.address || ""), { x: 112, y: 752, font: doc.regular, size: 8, color: rgb(0.25, 0.28, 0.3), maxWidth: 330 });
  doc.page.drawText(safe([soa.association.contactNumber, soa.association.email].filter(Boolean).join(" | ")), { x: 112, y: 739, font: doc.regular, size: 8, color: rgb(0.25, 0.28, 0.3), maxWidth: 330 });
  doc.page.drawText(soa.statementCode, { x: 112, y: 721, font: doc.bold, size: 8, color: rgb(0.7, 0, 0) });
  doc.page.drawImage(qr, { x: 494, y: 744, width: 62, height: 62 });
  labelValue(doc.page, doc.bold, doc.regular, "Statement Date", shortDate(soa.statementDate), 405, 785, 80);
  labelValue(doc.page, doc.bold, doc.regular, "Scan", "Open SOA", 405, 752, 80);
  doc.page.drawLine({ start: { x: 36, y: 706 }, end: { x: 559, y: 706 }, thickness: 1.5, color: pine });
  doc.y = 680;
}

function drawInfoBlocks(doc: PdfDoc, soa: StatementOfAccount) {
  sectionTitle(doc, "Homeowner Information");
  const left = [
    ["Homeowner Name", soa.homeowner.user.name],
    ["Account Number", soa.accountNumber],
    ["Block / Lot", `Block ${soa.homeowner.block}, Lot ${soa.homeowner.lot}`],
    ["Property Address", soa.homeowner.address],
  ];
  const right = [
    ["Contact Number", soa.homeowner.phone || "-"],
    ["Email", soa.homeowner.user.email],
    ["Status", soa.homeowner.status.replaceAll("_", " ")],
    ["Collection Status", soa.summary.collectionStatus],
  ];
  const startY = doc.y;
  const leftHeight = drawKeyValues(doc, left, marginX, startY, 250);
  const rightHeight = drawKeyValues(doc, right, 312, startY, 247);
  doc.y = startY - Math.max(leftHeight, rightHeight) - 22;

  sectionTitle(doc, "Account Summary");
  const summary = [
    ["Outstanding Balance", pdfMoney(soa.summary.currentOutstandingBalance)],
    ["Total Amount Billed", pdfMoney(soa.summary.totalAmountBilled)],
    ["Total Payments", pdfMoney(soa.summary.totalPayments)],
    ["Total Credits", pdfMoney(soa.summary.totalCredits)],
    ["Total Penalties", pdfMoney(soa.summary.totalPenalties)],
    ["Last Payment Date", soa.summary.lastPaymentDate ? shortDate(soa.summary.lastPaymentDate) : "-"],
  ];
  drawSummaryGrid(doc, summary);
  doc.y -= 8;
}

function drawAging(doc: PdfDoc, soa: StatementOfAccount) {
  ensureSpace(doc, 68);
  sectionTitle(doc, "Aging Summary");
  const aging = [
    ["Current", soa.aging.current],
    ["30 Days", soa.aging.thirtyDays],
    ["60 Days", soa.aging.sixtyDays],
    ["90 Days", soa.aging.ninetyDays],
    ["120+", soa.aging.overOneHundredTwenty],
  ];
  const width = 104;
  aging.forEach(([label, value], index) => {
    const x = 36 + index * width;
    doc.page.drawRectangle({ x, y: doc.y - 34, width: width - 6, height: 34, borderColor: rgb(0.83, 0.86, 0.88), borderWidth: 0.6 });
    doc.page.drawText(String(label), { x: x + 6, y: doc.y - 13, font: doc.bold, size: 7, color: rgb(0.32, 0.36, 0.4) });
    doc.page.drawText(pdfMoney(Number(value)), { x: x + 6, y: doc.y - 27, font: doc.bold, size: 9, color: rgb(0.05, 0.08, 0.1) });
  });
  doc.y -= 54;
}

function drawLedger(doc: PdfDoc, ledger: StatementLedgerEntry[]) {
  table(doc, "Running Ledger", ["Date", "Description", "Reference", "Debit", "Credit", "Balance", "Type"], [58, 138, 82, 62, 62, 68, 53], ledger.map((entry) => [
    shortDate(entry.date),
    entry.description,
    entry.reference,
    entry.debit ? pdfMoney(entry.debit) : "-",
    entry.credit ? pdfMoney(entry.credit) : "-",
    pdfMoney(entry.runningBalance),
    entry.transactionType,
  ]));
}

function drawPayments(doc: PdfDoc, soa: StatementOfAccount) {
  table(doc, "Payment History", ["Date", "OR No.", "Method", "Reference", "Coverage", "Amount", "Collector"], [58, 82, 64, 72, 132, 62, 53], soa.paymentHistory.map((payment) => [
    shortDate(payment.paymentDate),
    payment.officialReceiptNo,
    payment.paymentMethod,
    payment.referenceNumber,
    payment.coverage,
    pdfMoney(payment.amount),
    payment.collector,
  ]));
}

function drawBilling(doc: PdfDoc, soa: StatementOfAccount) {
  table(doc, "Billing History", ["Billing Date", "Type", "Coverage", "Amount", "Status"], [92, 118, 145, 84, 84], soa.billingHistory.map((bill) => [
    shortDate(bill.billingDate),
    bill.billingType,
    bill.coverage,
    pdfMoney(bill.amount),
    bill.status,
  ]));
}

function drawFooter(doc: PdfDoc, soa: StatementOfAccount) {
  const footerHeight = 56;
  ensureSpace(doc, footerHeight);
  const signatureLineY = doc.y - 24;
  const labelY = signatureLineY - 12;
  const generatedY = labelY - 18;
  doc.page.drawLine({ start: { x: 78, y: signatureLineY }, end: { x: 232, y: signatureLineY }, thickness: 0.45, color: rgb(0.45, 0.48, 0.5) });
  doc.page.drawLine({ start: { x: 362, y: signatureLineY }, end: { x: 516, y: signatureLineY }, thickness: 0.45, color: rgb(0.45, 0.48, 0.5) });
  drawCenteredWithin(doc.page, "Prepared by HOAHub Finance Engine", doc.regular, 7, 72, 238, labelY, rgb(0.25, 0.28, 0.3));
  drawCenteredWithin(doc.page, "Treasurer / Authorized HOA Representative", doc.regular, 7, 356, 522, labelY, rgb(0.25, 0.28, 0.3));
  drawCenteredWithin(doc.page, safe(`Generated for ${soa.homeowner.user.name} on ${shortDate(soa.statementDate)}. Page ${doc.pageNumber}`), doc.regular, 6.5, marginX, 559, generatedY, rgb(0.45, 0.48, 0.5));
  doc.y -= footerHeight;
}

function table(doc: PdfDoc, title: string, headers: string[], widths: number[], rows: string[][]) {
  const firstRowHeight = rows.length ? rowHeight(doc, rows[0], widths) : 20;
  ensureSpace(doc, 16 + tableHeaderHeight + firstRowHeight + tableGapAfter);
  sectionTitle(doc, title);
  drawTableHeader(doc, headers, widths);
  if (!rows.length) {
    const height = 20;
    ensureSpace(doc, height + tableGapAfter, () => drawTableHeader(doc, headers, widths));
    doc.page.drawRectangle({ x: marginX, y: doc.y - height, width: contentWidth, height, borderColor: rgb(0.86, 0.88, 0.9), borderWidth: 0.35 });
    doc.page.drawText("No records found.", { x: marginX + 8, y: doc.y - 13, font: doc.regular, size: 7.2, color: rgb(0.35, 0.38, 0.4) });
    doc.y -= height + tableGapAfter;
    return;
  }
  for (const row of rows) {
    const lines = row.map((cell, index) => wrapText(safe(cell), doc.regular, 6.5, widths[index] - 8).slice(0, 4));
    const height = Math.max(18, Math.max(...lines.map((line) => line.length)) * 8 + 7);
    ensureSpace(doc, height + 8, () => drawTableHeader(doc, headers, widths));
    let x = marginX;
    row.forEach((_, index) => {
      doc.page.drawRectangle({ x, y: doc.y - height, width: widths[index], height, borderColor: rgb(0.86, 0.88, 0.9), borderWidth: 0.35 });
      lines[index].forEach((line, lineIndex) => doc.page.drawText(line, { x: x + 4, y: doc.y - 11 - lineIndex * 8, font: doc.regular, size: 6.5, color: rgb(0.08, 0.1, 0.12) }));
      x += widths[index];
    });
    doc.y -= height;
  }
  doc.y -= tableGapAfter;
}

function drawTableHeader(doc: PdfDoc, headers: string[], widths: number[]) {
  const pine = rgb(0.03, 0.24, 0.17);
  let x = marginX;
  for (let index = 0; index < headers.length; index++) {
    doc.page.drawRectangle({ x, y: doc.y - tableHeaderHeight, width: widths[index], height: tableHeaderHeight, color: pine });
    doc.page.drawText(headers[index], { x: x + 4, y: doc.y - 12, font: doc.bold, size: 6.3, color: rgb(1, 1, 1) });
    x += widths[index];
  }
  doc.y -= tableHeaderHeight;
}

function sectionTitle(doc: PdfDoc, title: string) {
  ensureSpace(doc, 24);
  doc.page.drawText(title.toUpperCase(), { x: 36, y: doc.y, font: doc.bold, size: 9, color: rgb(0.03, 0.24, 0.17) });
  doc.y -= 16;
}

function drawKeyValues(doc: PdfDoc, rows: string[][], x: number, y: number, width: number) {
  let cursorY = y;
  const labelWidth = 88;
  for (const [label, value] of rows) {
    const valueX = x + labelWidth + 8;
    const valueWidth = width - labelWidth - 8;
    const lines = wrapText(safe(value), doc.regular, 8, valueWidth);
    const rowHeight = Math.max(18, lines.length * 10 + 6);
    doc.page.drawText(label.toUpperCase(), { x, y: cursorY, font: doc.bold, size: 6.5, color: rgb(0.35, 0.38, 0.4), maxWidth: labelWidth });
    lines.forEach((line, lineIndex) => doc.page.drawText(line, { x: valueX, y: cursorY - lineIndex * 10, font: doc.regular, size: 8, color: rgb(0.05, 0.07, 0.09) }));
    cursorY -= rowHeight;
  }
  return y - cursorY;
}

function drawSummaryGrid(doc: PdfDoc, rows: string[][]) {
  const [outstanding, ...rest] = rows;
  const pine = rgb(0.03, 0.24, 0.17);
  doc.page.drawRectangle({ x: marginX, y: doc.y - 38, width: contentWidth, height: 38, color: rgb(0.94, 0.98, 0.95), borderColor: pine, borderWidth: 1 });
  doc.page.drawText(outstanding[0].toUpperCase(), { x: 46, y: doc.y - 16, font: doc.bold, size: 7, color: rgb(0.28, 0.34, 0.34) });
  drawRightAligned(doc.page, outstanding[1], doc.bold, 13, 546, doc.y - 24, pine);
  doc.y -= 48;

  const cellWidth = 250;
  const cellGap = 23;
  const rowHeight = 30;
  rest.forEach(([label, value], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = 36 + column * (cellWidth + cellGap);
    const y = doc.y - row * rowHeight;
    doc.page.drawRectangle({ x, y: y - 24, width: cellWidth, height: 24, borderColor: rgb(0.83, 0.86, 0.88), borderWidth: 0.5 });
    doc.page.drawText(label.toUpperCase(), { x: x + 7, y: y - 10, font: doc.bold, size: 6.2, color: rgb(0.35, 0.38, 0.4), maxWidth: 105 });
    drawRightAligned(doc.page, safe(value), doc.bold, 8, x + cellWidth - 7, y - 17, rgb(0.05, 0.07, 0.09));
  });
  doc.y -= Math.ceil(rest.length / 2) * rowHeight;
}

function labelValue(page: PDFPage, bold: PDFFont, regular: PDFFont, label: string, value: string, x: number, y: number, width: number) {
  page.drawText(label.toUpperCase(), { x, y, font: bold, size: 6.5, color: rgb(0.35, 0.38, 0.4) });
  page.drawText(safe(value), { x, y: y - 13, font: regular, size: 8, color: rgb(0.05, 0.07, 0.09), maxWidth: width });
}

function ensureSpace(doc: PdfDoc, needed: number, afterPage?: () => void) {
  if (doc.y - needed >= bottomY) return;
  doc.page = doc.pdf.addPage(pageSize);
  doc.pageNumber += 1;
  doc.y = topY;
  doc.page.drawText(`Statement of Account - Page ${doc.pageNumber}`, { x: marginX, y: 812, font: doc.bold, size: 8, color: rgb(0.35, 0.38, 0.4) });
  doc.y = 792;
  afterPage?.();
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  if (!text) return [""];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
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

function rowHeight(doc: PdfDoc, row: string[], widths: number[]) {
  const lines = row.map((cell, index) => wrapText(safe(cell), doc.regular, 6.5, widths[index] - 8).slice(0, 4));
  return Math.max(18, Math.max(...lines.map((line) => line.length)) * 8 + 7);
}

function drawCenteredWithin(page: PDFPage, text: string, font: PDFFont, size: number, x1: number, x2: number, y: number, color: ReturnType<typeof rgb>) {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: x1 + Math.max(0, (x2 - x1 - width) / 2), y, font, size, color });
}

function drawRightAligned(page: PDFPage, text: string, font: PDFFont, size: number, rightX: number, y: number, color: ReturnType<typeof rgb>) {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: rightX - width, y, font, size, color });
}

function pdfMoney(value: number) {
  return `PHP ${value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function safe(value: string) {
  return value.normalize("NFKD").replace(/[^\x20-\x7E]/g, "");
}

type PdfDoc = {
  pdf: PDFDocument;
  page: PDFPage;
  regular: PDFFont;
  bold: PDFFont;
  y: number;
  pageNumber: number;
};
