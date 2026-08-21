import { Role } from "@prisma/client";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { NextResponse } from "next/server";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSingleCollectionPayerMetadata } from "@/lib/collection-payer";
import { prisma } from "@/lib/db";
import { homeownerAccountNumber, homeownerPropertyLabel } from "@/lib/homeowner-account";
import { getPaymentReceiptData } from "@/lib/services/payment-receipt";
import { getAssociationSettings } from "@/lib/system-settings";
import { roleLabel } from "@/lib/tenant-roles";
import { amountInWords, collectionLabel, money, receiptDateTime, shortDate } from "@/lib/utils";

type PdfReceipt = {
  association: Awaited<ReturnType<typeof getAssociationSettings>>;
  number: string;
  date: Date;
  payer: string;
  address: string;
  paymentFor: string;
  amount: number;
  method: string;
  reference: string | null;
  remarks: string | null;
  processorName: string;
  processorRole: string;
  processedAt: Date;
  processorTimestampLabel: string;
  payerAcknowledgedAt: Date;
  payerAcknowledgementLabel: string;
  onlinePayment: boolean;
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
      payer: payment.payer,
      address: `${payment.address} | ${payment.property} | Account ${payment.account}`,
      paymentFor: payment.purpose,
      amount: payment.amount,
      method: payment.method,
      reference: payment.reference,
      remarks: payment.remarks,
      processorName: payment.processorName,
      processorRole: payment.processorRole,
      processedAt: payment.processedAt,
      processorTimestampLabel: payment.processorTimestampLabel,
      payerAcknowledgedAt: payment.payerAcknowledgedAt,
      payerAcknowledgementLabel: payment.payerAcknowledgementLabel,
      onlinePayment: payment.onlinePayment,
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
    const metadata = await getSingleCollectionPayerMetadata(user.tenantId, item.id);
    const category = metadata?.payerCategory ?? item.payerType;
    const external = category === "RENTER" || category === "OTHER";
    const purpose = collectionLabel(item.type, item.description);
    receipt = {
      association: await getAssociationSettings(item.tenantId),
      number: item.receiptNumber || `AR-${item.id.slice(-8).toUpperCase()}`,
      date: item.collectionDate,
      payer: external ? metadata?.payerName || "Unknown payer" : item.homeowner?.user.name ?? item.contractor?.companyName ?? "Unknown payer",
      address: external ? `${category === "RENTER" ? "Renter" : "Other"} payer` : item.homeowner ? `${item.homeowner.address} | ${homeownerPropertyLabel(item.homeowner)} | Account ${homeownerAccountNumber(item.homeowner)}` : item.contractor?.address ?? "",
      paymentFor: purpose,
      amount: Number(item.amount),
      method: item.method.replaceAll("_", " "),
      reference: item.referenceNumber,
      remarks: item.remarks,
      processorName: item.createdBy.name || "Authorized HOA Processor",
      processorRole: roleLabel(item.createdBy.role),
      processedAt: item.createdAt,
      processorTimestampLabel: "Recorded on",
      payerAcknowledgedAt: item.createdAt,
      payerAcknowledgementLabel: "Payment acknowledged on",
      onlinePayment: false,
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

  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const firstPage = pdf.addPage([595.28, 841.89]);
  drawReceipt(firstPage, receipt, regular, bold);
  drawAllocationContinuationPages(pdf, receipt, regular, bold);
  pdf.setTitle(`${receipt.number} - Acknowledgement Receipt`);
  pdf.setAuthor(receipt.association.name);
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

function drawReceipt(page: PDFPage, receipt: PdfReceipt, regular: PDFFont, bold: PDFFont) {
  const navy = rgb(0.03, 0.16, 0.38);
  const muted = rgb(.3, .34, .4);
  page.drawRectangle({ x: 26, y: 32, width: 543, height: 777, borderColor: navy, borderWidth: 1.5 });
  page.drawText(safe(receipt.association.name), { x: 42, y: 770, font: bold, size: 16, color: navy, maxWidth: 365 });
  page.drawText("HOMEOWNERS ASSOCIATION", { x: 42, y: 750, font: bold, size: 8, color: navy });
  page.drawText("OFFICIAL ACKNOWLEDGEMENT RECEIPT", { x: 42, y: 735, font: regular, size: 8, color: muted });
  if (receipt.association.address) page.drawText(safe(receipt.association.address), { x: 42, y: 720, font: regular, size: 7.5, color: muted, maxWidth: 365 });
  page.drawText("RECEIPT NO.", { x: 430, y: 774, font: bold, size: 7, color: navy });
  page.drawText(safe(receipt.number), { x: 430, y: 756, font: bold, size: 10.5, color: rgb(.8, 0, 0), maxWidth: 120 });
  page.drawText(`DATE: ${safe(shortDate(receipt.date))}`, { x: 430, y: 735, font: bold, size: 8, color: navy });
  page.drawText(receipt.status === "VOIDED" ? "VOID" : "ACTIVE", { x: 430, y: 719, font: bold, size: 8, color: receipt.status === "VOIDED" ? rgb(.8, 0, 0) : rgb(0, .45, .2) });
  page.drawLine({ start: { x: 42, y: 700 }, end: { x: 553, y: 700 }, color: navy, thickness: 1 });

  let y = 672;
  y = drawField(page, "Received From", receipt.payer, y, regular, bold);
  y = drawField(page, "Address / Account", receipt.address, y, regular, bold);
  y = drawField(page, "The Sum Of", amountInWords(receipt.amount), y, regular, bold);
  drawField(page, "Payment For", receipt.paymentFor, y, regular, bold);

  page.drawRectangle({ x: 42, y: 390, width: 511, height: 150, borderColor: navy, borderWidth: .8 });
  page.drawRectangle({ x: 42, y: 510, width: 511, height: 30, color: rgb(.94, .97, .94), borderColor: navy, borderWidth: .8 });
  page.drawText("COVERED BILLING / PARTICULARS", { x: 52, y: 521, font: bold, size: 8, color: navy });
  page.drawText("AMOUNT APPLIED", { x: 440, y: 521, font: bold, size: 8, color: navy });
  const firstAllocations = receipt.allocations.slice(0, 8);
  firstAllocations.forEach((allocation, index) => {
    const rowY = 492 - index * 12;
    page.drawText(safe(`${allocation.coverage} - ${allocation.billType}`), { x: 52, y: rowY, font: regular, size: 7.5, color: rgb(.08, .1, .12), maxWidth: 365 });
    page.drawText(safe(pdfMoney(allocation.amount)), { x: 455, y: rowY, font: bold, size: 7.5, color: navy, maxWidth: 85 });
  });
  if (receipt.allocations.length > firstAllocations.length) {
    page.drawText(`${receipt.allocations.length - firstAllocations.length} additional allocation(s) continue on the next page.`, { x: 52, y: 397, font: bold, size: 7, color: navy });
  }
  page.drawText("AMOUNT APPLIED TO BILLS", { x: 330, y: 372, font: bold, size: 8, color: navy });
  page.drawText(safe(pdfMoney(receipt.appliedAmount)), { x: 455, y: 372, font: bold, size: 10, color: navy, maxWidth: 85 });

  page.drawText(`TOTAL AMOUNT RECEIVED: ${safe(pdfMoney(receipt.amount))}`, { x: 42, y: 348, font: bold, size: 8, color: navy });
  page.drawText(`UNAPPLIED CREDIT: ${safe(pdfMoney(receipt.unappliedCredit))}`, { x: 300, y: 348, font: bold, size: 8, color: navy });
  if (receipt.homeownerCreditBalance !== null) page.drawText(`HOMEOWNER CREDIT BALANCE: ${safe(pdfMoney(receipt.homeownerCreditBalance))}`, { x: 42, y: 333, font: bold, size: 7.5, color: navy });
  if (receipt.remainingBalance !== null) page.drawText(`REMAINING ACCOUNT BALANCE: ${safe(pdfMoney(receipt.remainingBalance))}`, { x: 300, y: 333, font: bold, size: 7.5, color: navy });

  if (receipt.remarks || receipt.reference) {
    page.drawRectangle({ x: 42, y: 277, width: 511, height: 42, borderColor: rgb(.75, .78, .82), borderWidth: .6 });
    if (receipt.remarks) page.drawText(`Remarks: ${safe(receipt.remarks)}`, { x: 50, y: 302, font: regular, size: 7, color: muted, maxWidth: 490 });
    if (receipt.reference) page.drawText(`Reference: ${safe(receipt.reference)}`, { x: 50, y: 286, font: regular, size: 7, color: muted, maxWidth: 490 });
  }

  page.drawText("PAYMENT METHOD", { x: 42, y: 255, font: bold, size: 7, color: navy });
  page.drawText(safe(receipt.method), { x: 42, y: 238, font: bold, size: 10, color: rgb(.08, .1, .12) });

  page.drawLine({ start: { x: 42, y: 170 }, end: { x: 260, y: 170 }, color: navy, thickness: .7 });
  drawCentered(page, safe(receipt.payer), 42, 260, 155, bold, 8, navy);
  drawCentered(page, receipt.onlinePayment ? "Payer / online payment acknowledgement" : "Payer's signature / printed name", 42, 260, 142, regular, 7, muted);
  drawCentered(page, safe(`${receipt.payerAcknowledgementLabel}: ${receiptDateTime(receipt.payerAcknowledgedAt)}`), 42, 260, 129, regular, 6.5, muted);

  page.drawLine({ start: { x: 335, y: 170 }, end: { x: 553, y: 170 }, color: navy, thickness: .7 });
  drawCentered(page, safe(receipt.processorName), 335, 553, 155, bold, 8, navy);
  drawCentered(page, safe(receipt.processorRole), 335, 553, 142, regular, 7, muted);
  drawCentered(page, safe(`${receipt.processorTimestampLabel}: ${receiptDateTime(receipt.processedAt)}`), 335, 553, 129, regular, 6.5, muted);

  page.drawText(`Generated by ${safe(receipt.association.name)} HOA Digital Hub`, { x: 42, y: 62, font: regular, size: 7, color: rgb(.4, .44, .5) });
}

function drawAllocationContinuationPages(pdf: PDFDocument, receipt: PdfReceipt, regular: PDFFont, bold: PDFFont) {
  const remaining = receipt.allocations.slice(8);
  if (!remaining.length) return;
  const navy = rgb(0.03, 0.16, 0.38);
  const pageSize = 30;
  for (let offset = 0; offset < remaining.length; offset += pageSize) {
    const rows = remaining.slice(offset, offset + pageSize);
    const page = pdf.addPage([595.28, 841.89]);
    page.drawRectangle({ x: 26, y: 32, width: 543, height: 777, borderColor: navy, borderWidth: 1.5 });
    page.drawText(safe(receipt.association.name), { x: 42, y: 775, font: bold, size: 14, color: navy, maxWidth: 350 });
    page.drawText("ACKNOWLEDGEMENT RECEIPT - ALLOCATION CONTINUATION", { x: 42, y: 754, font: bold, size: 8, color: rgb(.25, .3, .36) });
    page.drawText(safe(receipt.number), { x: 430, y: 766, font: bold, size: 10, color: rgb(.8, 0, 0), maxWidth: 120 });
    page.drawText(safe(receipt.payer), { x: 42, y: 730, font: regular, size: 9, color: rgb(.08, .1, .12), maxWidth: 350 });
    page.drawRectangle({ x: 42, y: 95, width: 511, height: 610, borderColor: navy, borderWidth: .8 });
    page.drawRectangle({ x: 42, y: 675, width: 511, height: 30, color: rgb(.94, .97, .94), borderColor: navy, borderWidth: .8 });
    page.drawText("COVERED BILLING / PARTICULARS", { x: 52, y: 686, font: bold, size: 8, color: navy });
    page.drawText("ALLOCATED AMOUNT", { x: 440, y: 686, font: bold, size: 8, color: navy });
    rows.forEach((allocation, index) => {
      const rowY = 655 - index * 18;
      page.drawText(safe(`${allocation.coverage} - ${allocation.billType}`), { x: 52, y: rowY, font: regular, size: 8, color: rgb(.08, .1, .12), maxWidth: 350 });
      page.drawText(safe(pdfMoney(allocation.amount)), { x: 455, y: rowY, font: bold, size: 8, color: navy, maxWidth: 85 });
      page.drawLine({ start: { x: 42, y: rowY - 6 }, end: { x: 553, y: rowY - 6 }, color: rgb(.82, .84, .86), thickness: .4 });
    });
    page.drawText(`Allocation lines ${9 + offset} to ${8 + offset + rows.length} of ${receipt.allocations.length}`, { x: 42, y: 62, font: regular, size: 7, color: rgb(.4, .44, .5) });
  }
}

function drawField(page: PDFPage, label: string, value: string, y: number, regular: PDFFont, bold: PDFFont) {
  page.drawText(label.toUpperCase(), { x: 42, y, font: bold, size: 7, color: rgb(.03, .16, .38) });
  const lines = wrap(safe(value), regular, 9, 390).slice(0, 2);
  lines.forEach((line, index) => page.drawText(line, { x: 155, y: y - index * 12, font: regular, size: 9, color: rgb(.08, .1, .12) }));
  page.drawLine({ start: { x: 150, y: y - 4 - (lines.length - 1) * 12 }, end: { x: 553, y: y - 4 - (lines.length - 1) * 12 }, color: rgb(.03, .16, .38), thickness: .5 });
  return y - Math.max(38, 25 + (lines.length - 1) * 12);
}

function drawCentered(page: PDFPage, text: string, left: number, right: number, y: number, font: PDFFont, size: number, color: ReturnType<typeof rgb>) {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: Math.max(left, left + (right - left - width) / 2), y, font, size, color, maxWidth: right - left });
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || font.widthOfTextAtSize(candidate, size) <= maxWidth) current = candidate;
    else { lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function pdfMoney(value: number) {
  return money(value).replace("₱", "PHP ");
}

function safe(value: unknown) {
  return String(value ?? "").replace(/[^\x20-\x7E]/g, " ").trim();
}