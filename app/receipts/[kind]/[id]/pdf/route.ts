import { Role } from "@prisma/client";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { NextResponse } from "next/server";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { homeownerAccountNumber, homeownerPropertyLabel } from "@/lib/homeowner-account";
import { getPaymentReceiptData } from "@/lib/services/payment-receipt";
import { getAssociationSettings } from "@/lib/system-settings";
import { amountInWords, collectionLabel, money, shortDate } from "@/lib/utils";

type PdfReceipt = {
  association: Awaited<ReturnType<typeof getAssociationSettings>>;
  number: string;
  date: Date;
  transactionDateTime: Date;
  payer: string;
  address: string;
  paymentFor: string;
  particulars: string;
  amount: number;
  method: string;
  reference: string | null;
  remarks: string | null;
  processorName: string;
  processorRole: string;
  status: string;
  allocations: Array<{ coverage: string; billType: string; amount: number; remainingBalance: number | null }>;
  appliedAmount: number;
  unappliedCredit: number;
  homeownerCreditBalance: number | null;
  remainingBalance: number | null;
};

export async function GET(_request: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const user = await requireUser();
  const { kind, id } = await params;
  let receipt: PdfReceipt | null = null;

  if (kind === "payment") {
    const payment = await getPaymentReceiptData(id, user.tenantId);
    if (!payment) notFound();
    if (user.role === Role.HOMEOWNER && user.homeownerProfile?.id !== payment.homeownerId) {
      return NextResponse.json({ error: "Receipt access denied." }, { status: 403 });
    }
    receipt = {
      association: payment.association,
      number: payment.number,
      date: payment.date,
      transactionDateTime: payment.transactionDateTime,
      payer: payment.payer,
      address: `${payment.address} | ${payment.property} | Account ${payment.account}`,
      paymentFor: payment.purpose,
      particulars: payment.purpose,
      amount: payment.amount,
      method: payment.method,
      reference: payment.reference,
      remarks: payment.remarks,
      processorName: payment.processorName,
      processorRole: payment.processorRole,
      status: payment.status,
      allocations: payment.allocations,
      appliedAmount: payment.appliedAmount,
      unappliedCredit: payment.unappliedCredit,
      homeownerCreditBalance: payment.homeownerCreditBalance,
      remainingBalance: payment.remainingBalance,
    };
  } else if (kind === "collection") {
    const item = await prisma.collection.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { homeowner: { include: { user: true } }, contractor: true, createdBy: true },
    });
    if (!item) notFound();
    if (user.role === Role.HOMEOWNER && user.homeownerProfile?.id !== item.homeownerId) {
      return NextResponse.json({ error: "Receipt access denied." }, { status: 403 });
    }
    const purpose = collectionLabel(item.type, item.description);
    receipt = {
      association: await getAssociationSettings(item.tenantId),
      number: item.receiptNumber || `AR-${item.id.slice(-8).toUpperCase()}`,
      date: item.collectionDate,
      transactionDateTime: item.createdAt,
      payer: item.homeowner?.user.name ?? item.contractor?.companyName ?? "Unknown payer",
      address: item.homeowner ? `${item.homeowner.address} | ${homeownerPropertyLabel(item.homeowner)} | Account ${homeownerAccountNumber(item.homeowner)}` : item.contractor?.address ?? "",
      paymentFor: purpose,
      particulars: purpose,
      amount: Number(item.amount),
      method: item.method,
      reference: item.referenceNumber,
      remarks: item.remarks,
      processorName: item.createdBy.name || "Authorized HOA Processor",
      processorRole: "Authorized HOA Processor",
      status: "ACTIVE",
      allocations: [{ coverage: purpose, billType: purpose, amount: Number(item.amount), remainingBalance: null }],
      appliedAmount: Number(item.amount),
      unappliedCredit: 0,
      homeownerCreditBalance: null,
      remainingBalance: null,
    };
  } else {
    notFound();
  }

  const association = receipt.association;
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  drawReceipt(page, receipt, association, regular, bold);
  drawAllocationContinuationPages(pdf, receipt, association.name, regular, bold);
  pdf.setTitle(`${receipt.number} - Acknowledgement Receipt`);
  pdf.setAuthor(association.name);
  const bytes = await pdf.save();
  const filename = `${receipt.number.replace(/[^A-Za-z0-9_-]/g, "-")}.pdf`;
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function drawReceipt(page: PDFPage, receipt: PdfReceipt, association: Awaited<ReturnType<typeof getAssociationSettings>>, regular: PDFFont, bold: PDFFont) {
  const navy = rgb(0.03, 0.16, 0.38);
  const transactionDateTime = safe(formatReceiptDateTime(receipt.transactionDateTime));
  page.drawRectangle({ x: 26, y: 32, width: 543, height: 777, borderColor: navy, borderWidth: 1.5 });
  page.drawText(safe(association.name), { x: 42, y: 770, font: bold, size: 16, color: navy, maxWidth: 365 });
  page.drawText("OFFICIAL ACKNOWLEDGEMENT RECEIPT", { x: 42, y: 748, font: bold, size: 9, color: rgb(.25, .3, .36) });
  page.drawText(safe(association.address), { x: 42, y: 732, font: regular, size: 8, color: rgb(.3, .34, .4), maxWidth: 365 });
  page.drawText("RECEIPT NO.", { x: 430, y: 774, font: bold, size: 7, color: navy });
  page.drawText(safe(receipt.number), { x: 430, y: 756, font: bold, size: 11, color: rgb(.8, 0, 0), maxWidth: 120 });
  page.drawText(`DATE: ${safe(shortDate(receipt.date))}`, { x: 430, y: 735, font: bold, size: 8, color: navy });
  page.drawText(receipt.status === "VOIDED" ? "VOID" : "ACTIVE", { x: 430, y: 720, font: bold, size: 8, color: receipt.status === "VOIDED" ? rgb(.8, 0, 0) : rgb(0, .45, .2) });
  page.drawLine({ start: { x: 42, y: 710 }, end: { x: 553, y: 710 }, color: navy, thickness: 1 });

  let y = 680;
  y = drawField(page, "Received From", receipt.payer, y, regular, bold);
  y = drawField(page, "Address", receipt.address, y, regular, bold);
  y = drawField(page, "The Sum Of", amountInWords(receipt.amount), y, regular, bold);
  drawField(page, "Payment For", receipt.paymentFor, y, regular, bold);

  page.drawRectangle({ x: 42, y: 375, width: 511, height: 145, borderColor: navy, borderWidth: .8 });
  page.drawRectangle({ x: 42, y: 490, width: 511, height: 30, color: rgb(.94, .97, .94), borderColor: navy, borderWidth: .8 });
  page.drawText("PARTICULARS", { x: 52, y: 501, font: bold, size: 8, color: navy });
  page.drawText("AMOUNT", { x: 465, y: 501, font: bold, size: 8, color: navy });
  const allocationLines = receipt.allocations.slice(0, 9);
  allocationLines.forEach((allocation, index) => {
    const rowY = 467 - index * 10;
    page.drawText(safe(allocation.coverage), { x: 52, y: rowY, font: regular, size: 7.5, color: rgb(.08, .1, .12), maxWidth: 350 });
    page.drawText(safe(money(allocation.amount).replace("₱", "PHP ")), { x: 448, y: rowY, font: bold, size: 7.5, color: navy, maxWidth: 95 });
  });
  if (receipt.allocations.length > allocationLines.length) page.drawText(`${receipt.allocations.length - allocationLines.length} additional allocation(s) continue on the next page.`, { x: 52, y: 377, font: bold, size: 7, color: navy });
  if (receipt.remarks) {
    for (const [index, line] of wrap(safe(receipt.remarks), regular, 7.5, 350).slice(0, 2).entries()) {
      page.drawText(line, { x: 52, y: 355 - index * 10, font: regular, size: 7.5, color: rgb(.3, .34, .4) });
    }
  }
  page.drawText("TOTAL AMOUNT RECEIVED", { x: 330, y: 390, font: bold, size: 8, color: navy });
  page.drawText(safe(money(receipt.amount).replace("₱", "PHP ")), { x: 448, y: 390, font: bold, size: 10, color: navy, maxWidth: 95 });

  page.drawText("PAYMENT METHOD", { x: 42, y: 340, font: bold, size: 7, color: navy });
  page.drawText(safe(receipt.method.replaceAll("_", " ")), { x: 42, y: 323, font: bold, size: 9, color: rgb(.08, .1, .12) });
  page.drawText("REFERENCE NUMBER", { x: 250, y: 340, font: bold, size: 7, color: navy });
  page.drawText(safe(receipt.reference || (receipt.method === "CASH" ? "Not required for Cash" : "Not provided")), { x: 250, y: 323, font: regular, size: 9, color: rgb(.08, .1, .12) });
  page.drawText(`AMOUNT APPLIED TO BILLS: ${safe(money(receipt.appliedAmount).replace("₱", "PHP "))}`, { x: 42, y: 302, font: bold, size: 7.5, color: navy });
  page.drawText(`UNAPPLIED CREDIT: ${safe(money(receipt.unappliedCredit).replace("₱", "PHP "))}`, { x: 250, y: 302, font: bold, size: 7.5, color: navy });
  if (receipt.homeownerCreditBalance !== null) page.drawText(`HOMEOWNER CREDIT BALANCE: ${safe(money(receipt.homeownerCreditBalance).replace("₱", "PHP "))}`, { x: 42, y: 287, font: bold, size: 7.5, color: navy });
  if (receipt.remainingBalance !== null) page.drawText(`REMAINING ACCOUNT BALANCE: ${safe(money(receipt.remainingBalance).replace("₱", "PHP "))}`, { x: 250, y: 287, font: bold, size: 7.5, color: navy });
  page.drawText(`TRANSACTION DATE & TIME: ${transactionDateTime}`, { x: 42, y: 270, font: bold, size: 7.5, color: navy });

  page.drawText("PAYER'S SIGNATURE / PRINTED NAME", { x: 72, y: 236, font: bold, size: 7, color: rgb(.3, .34, .4) });
  page.drawText("PROCESSOR", { x: 410, y: 236, font: bold, size: 7, color: rgb(.3, .34, .4) });
  page.drawLine({ start: { x: 42, y: 210 }, end: { x: 250, y: 210 }, color: navy, thickness: .7 });
  page.drawLine({ start: { x: 345, y: 210 }, end: { x: 553, y: 210 }, color: navy, thickness: .7 });
  drawCentered(page, safe(receipt.payer), 42, 250, 194, bold, 8, navy);
  drawCentered(page, safe(receipt.processorName), 345, 553, 194, bold, 8, navy);
  drawCentered(page, "Date & Time: " + transactionDateTime, 42, 250, 180, regular, 6.5, rgb(.3, .34, .4));
  drawCentered(page, safe(receipt.processorRole), 345, 553, 181, regular, 7, rgb(.3, .34, .4));
  drawCentered(page, "Processed: " + transactionDateTime, 345, 553, 168, regular, 6.5, rgb(.3, .34, .4));
  page.drawText(`Generated by ${safe(association.name)} HOA Digital Hub`, { x: 42, y: 62, font: regular, size: 7, color: rgb(.4, .44, .5) });
}

function drawAllocationContinuationPages(pdf: PDFDocument, receipt: PdfReceipt, associationName: string, regular: PDFFont, bold: PDFFont) {
  const remaining = receipt.allocations.slice(9);
  const pageSize = 30;
  const navy = rgb(0.03, 0.16, 0.38);
  for (let offset = 0; offset < remaining.length; offset += pageSize) {
    const rows = remaining.slice(offset, offset + pageSize);
    const page = pdf.addPage([595.28, 841.89]);
    page.drawRectangle({ x: 26, y: 32, width: 543, height: 777, borderColor: navy, borderWidth: 1.5 });
    page.drawText(safe(associationName), { x: 42, y: 775, font: bold, size: 14, color: navy, maxWidth: 350 });
    page.drawText("OFFICIAL RECEIPT - ALLOCATION CONTINUATION", { x: 42, y: 754, font: bold, size: 8, color: rgb(.25, .3, .36) });
    page.drawText(safe(receipt.number), { x: 430, y: 766, font: bold, size: 10, color: rgb(.8, 0, 0), maxWidth: 120 });
    page.drawText(safe(receipt.payer), { x: 42, y: 730, font: regular, size: 9, color: rgb(.08, .1, .12), maxWidth: 350 });
    page.drawRectangle({ x: 42, y: 95, width: 511, height: 610, borderColor: navy, borderWidth: .8 });
    page.drawRectangle({ x: 42, y: 675, width: 511, height: 30, color: rgb(.94, .97, .94), borderColor: navy, borderWidth: .8 });
    page.drawText("COVERED BILLING / PARTICULARS", { x: 52, y: 686, font: bold, size: 8, color: navy });
    page.drawText("ALLOCATED AMOUNT", { x: 440, y: 686, font: bold, size: 8, color: navy });
    rows.forEach((allocation, index) => {
      const rowY = 655 - index * 18;
      page.drawText(safe(allocation.coverage), { x: 52, y: rowY, font: regular, size: 8, color: rgb(.08, .1, .12), maxWidth: 350 });
      page.drawText(safe(money(allocation.amount).replace("₱", "PHP ")), { x: 448, y: rowY, font: bold, size: 8, color: navy, maxWidth: 95 });
      page.drawLine({ start: { x: 42, y: rowY - 6 }, end: { x: 553, y: rowY - 6 }, color: rgb(.82, .84, .86), thickness: .4 });
    });
    page.drawText(`Allocation lines ${10 + offset} to ${9 + offset + rows.length} of ${receipt.allocations.length}`, { x: 42, y: 62, font: regular, size: 7, color: rgb(.4, .44, .5) });
  }
}

function drawField(page: PDFPage, label: string, value: string, y: number, regular: PDFFont, bold: PDFFont) {
  page.drawText(label.toUpperCase(), { x: 42, y, font: bold, size: 7, color: rgb(.03, .16, .38) });
  const lines = wrap(safe(value), regular, 9, 390).slice(0, 2);
  lines.forEach((line, index) => page.drawText(line, { x: 155, y: y - index * 12, font: regular, size: 9, color: rgb(.08, .1, .12) }));
  page.drawLine({ start: { x: 150, y: y - 5 - (lines.length - 1) * 12 }, end: { x: 553, y: y - 5 - (lines.length - 1) * 12 }, color: rgb(.55, .58, .62), thickness: .5 });
  return y - 48;
}

function drawCentered(page: PDFPage, text: string, x1: number, x2: number, y: number, font: PDFFont, size: number, color: ReturnType<typeof rgb>) {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: x1 + Math.max(0, (x2 - x1 - width) / 2), y, font, size, color, maxWidth: x2 - x1 });
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = text.split(/\s+/).filter(Boolean); const lines: string[] = []; let line = "";
  for (const word of words) { const candidate = line ? `${line} ${word}` : word; if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate; else { if (line) lines.push(line); line = word; } }
  if (line) lines.push(line); return lines.length ? lines : [""];
}

function formatReceiptDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(value);
}

function safe(value: string) {
  return value.normalize("NFKD").replace(/[^\x20-\x7E]/g, "");
}
