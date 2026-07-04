import { Role } from "@prisma/client";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { NextResponse } from "next/server";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { paymentCoverageDisplay } from "@/lib/payment-coverage";
import { getAssociationSettings } from "@/lib/system-settings";
import { amountInWords, collectionLabel, money, shortDate } from "@/lib/utils";

type PdfReceipt = {
  number: string;
  date: Date;
  payer: string;
  address: string;
  paymentFor: string;
  particulars: string;
  amount: number;
  method: string;
  reference: string | null;
  remarks: string | null;
  processedBy: string;
};

export async function GET(_request: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const user = await requireUser();
  const { kind, id } = await params;
  let receipt: PdfReceipt | null = null;

  if (kind === "payment") {
    const payment = await prisma.payment.findFirst({
      where: { id, status: "ACTIVE" },
      include: { homeowner: { include: { user: true } }, bill: true, processedBy: true },
    });
    if (!payment) notFound();
    if (user.role === Role.HOMEOWNER && user.homeownerProfile?.id !== payment.homeownerId) {
      return NextResponse.json({ error: "Receipt access denied." }, { status: 403 });
    }
    const coverage = paymentCoverageDisplay(payment);
    receipt = {
      number: payment.receiptNumber || `AR-${payment.id.slice(-8).toUpperCase()}`,
      date: payment.paymentDate,
      payer: payment.homeowner.user.name,
      address: payment.homeowner.address,
      paymentFor: coverage,
      particulars: coverage,
      amount: Number(payment.amount),
      method: payment.method,
      reference: payment.referenceNumber,
      remarks: payment.remarks,
      processedBy: payment.processedBy?.name ?? "Authorized HOA Treasurer / Collector",
    };
  } else if (kind === "collection") {
    const item = await prisma.collection.findUnique({
      where: { id },
      include: { homeowner: { include: { user: true } }, contractor: true, createdBy: true },
    });
    if (!item) notFound();
    if (user.role === Role.HOMEOWNER && user.homeownerProfile?.id !== item.homeownerId) {
      return NextResponse.json({ error: "Receipt access denied." }, { status: 403 });
    }
    const purpose = collectionLabel(item.type, item.description);
    receipt = {
      number: item.receiptNumber || `AR-${item.id.slice(-8).toUpperCase()}`,
      date: item.collectionDate,
      payer: item.homeowner?.user.name ?? item.contractor?.companyName ?? "Unknown payer",
      address: item.homeowner?.address ?? item.contractor?.address ?? "",
      paymentFor: purpose,
      particulars: purpose,
      amount: Number(item.amount),
      method: item.method,
      reference: item.referenceNumber,
      remarks: item.remarks,
      processedBy: item.createdBy.name,
    };
  } else {
    notFound();
  }

  const association = await getAssociationSettings();
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  drawReceipt(page, receipt, association, regular, bold);
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
  page.drawRectangle({ x: 26, y: 32, width: 543, height: 777, borderColor: navy, borderWidth: 1.5 });
  page.drawText(safe(association.name), { x: 42, y: 770, font: bold, size: 16, color: navy, maxWidth: 365 });
  page.drawText("OFFICIAL ACKNOWLEDGEMENT RECEIPT", { x: 42, y: 748, font: bold, size: 9, color: rgb(.25, .3, .36) });
  page.drawText(safe(association.address), { x: 42, y: 732, font: regular, size: 8, color: rgb(.3, .34, .4), maxWidth: 365 });
  page.drawText("RECEIPT NO.", { x: 430, y: 774, font: bold, size: 7, color: navy });
  page.drawText(safe(receipt.number), { x: 430, y: 756, font: bold, size: 11, color: rgb(.8, 0, 0), maxWidth: 120 });
  page.drawText(`DATE: ${safe(shortDate(receipt.date))}`, { x: 430, y: 735, font: bold, size: 8, color: navy });
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
  for (const [index, line] of wrap(safe(receipt.particulars), regular, 9, 350).slice(0, 3).entries()) {
    page.drawText(line, { x: 52, y: 465 - index * 14, font: index === 0 ? bold : regular, size: 9, color: rgb(.08, .1, .12) });
  }
  if (receipt.remarks) {
    for (const [index, line] of wrap(safe(receipt.remarks), regular, 7.5, 350).slice(0, 4).entries()) {
      page.drawText(line, { x: 52, y: 415 - index * 12, font: regular, size: 7.5, color: rgb(.3, .34, .4) });
    }
  }
  page.drawText(safe(money(receipt.amount).replace("₱", "PHP ")), { x: 448, y: 462, font: bold, size: 11, color: navy, maxWidth: 95 });
  page.drawText("TOTAL", { x: 385, y: 390, font: bold, size: 9, color: navy });
  page.drawText(safe(money(receipt.amount).replace("₱", "PHP ")), { x: 448, y: 390, font: bold, size: 10, color: navy, maxWidth: 95 });

  page.drawText("PAYMENT METHOD", { x: 42, y: 340, font: bold, size: 7, color: navy });
  page.drawText(safe(receipt.method.replaceAll("_", " ")), { x: 42, y: 323, font: bold, size: 9, color: rgb(.08, .1, .12) });
  page.drawText("REFERENCE NUMBER", { x: 250, y: 340, font: bold, size: 7, color: navy });
  page.drawText(safe(receipt.reference || (receipt.method === "CASH" ? "Not required for Cash" : "Not provided")), { x: 250, y: 323, font: regular, size: 9, color: rgb(.08, .1, .12) });
  page.drawText("Received and acknowledged by:", { x: 354, y: 270, font: regular, size: 8, color: rgb(.3, .34, .4) });
  page.drawLine({ start: { x: 350, y: 210 }, end: { x: 535, y: 210 }, color: navy, thickness: .7 });
  drawCentered(page, safe(receipt.processedBy), 350, 535, 194, bold, 8, navy);
  drawCentered(page, "Authorized HOA processor", 350, 535, 181, regular, 7, rgb(.3, .34, .4));
  page.drawText(`Generated by ${safe(association.name)} HOA Digital Hub`, { x: 42, y: 62, font: regular, size: 7, color: rgb(.4, .44, .5) });
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

function safe(value: string) {
  return value.normalize("NFKD").replace(/[^\x20-\x7E]/g, "");
}
