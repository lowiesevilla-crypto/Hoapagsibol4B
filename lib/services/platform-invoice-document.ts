import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { getAppUrl } from "@/lib/app-url";
import { platformPrisma as prisma } from "@/lib/db";

const ACCESS_LABEL = "hoahub-platform-invoice-document-v1";
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const PAGE_MARGIN = 44;

function authSecret() {
  const value = process.env.AUTH_SECRET?.trim();
  if (process.env.NODE_ENV === "production" && (!value || value.length < 32)) {
    throw new Error("AUTH_SECRET must contain at least 32 characters in production.");
  }
  return value || "development-only-secret-change-me-now";
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function platformInvoiceDocumentToken(invoiceId: string) {
  return createHmac("sha256", authSecret())
    .update(`${ACCESS_LABEL}:${invoiceId}`)
    .digest("hex");
}

export function verifyPlatformInvoiceDocumentToken(invoiceId: string, token: string) {
  return Boolean(invoiceId && token && safeEqual(platformInvoiceDocumentToken(invoiceId), token));
}

export function platformInvoiceDocumentUrl(invoiceId: string) {
  const url = new URL(`/subscription/invoice/${encodeURIComponent(invoiceId)}`, getAppUrl());
  url.searchParams.set("token", platformInvoiceDocumentToken(invoiceId));
  return url.toString();
}

export function platformInvoicePdfUrl(invoiceId: string) {
  const url = new URL(`/api/platform/billing/invoices/${encodeURIComponent(invoiceId)}/pdf`, getAppUrl());
  url.searchParams.set("token", platformInvoiceDocumentToken(invoiceId));
  return url.toString();
}

export function platformBillingIssuer() {
  return {
    name: process.env.PLATFORM_BILLING_LEGAL_NAME?.trim() || "HOAHub",
    address: process.env.PLATFORM_BILLING_ADDRESS?.trim() || "",
    email: process.env.PLATFORM_BILLING_EMAIL?.trim() || "support@hoahub.tech",
    contactNumber: process.env.PLATFORM_BILLING_CONTACT_NUMBER?.trim() || "",
    tinNumber: process.env.PLATFORM_BILLING_TIN?.trim() || "",
    website: process.env.PLATFORM_BILLING_WEBSITE?.trim() || "hoahub.tech",
  };
}

export async function getPlatformInvoiceDocument(invoiceId: string) {
  return prisma.platformInvoice.findUnique({
    where: { id: invoiceId },
    include: {
      tenant: { include: { billingProfile: true } },
      subscription: { include: { plan: true } },
      lines: { orderBy: { createdAt: "asc" } },
    },
  });
}

export type PlatformInvoiceDocument = NonNullable<Awaited<ReturnType<typeof getPlatformInvoiceDocument>>>;

function pdfSafe(value: string) {
  return value
    .replaceAll("₱", "PHP ")
    .replaceAll("–", "-")
    .replaceAll("—", "-")
    .replaceAll("“", '"')
    .replaceAll("”", '"')
    .replaceAll("’", "'")
    .replaceAll("•", "-")
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, "?");
}

function money(value: number, currency = "PHP") {
  return `${currency} ${new Intl.NumberFormat("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}`;
}

function formatDate(value: Date) {
  return value.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    timeZone: "UTC",
  });
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const lines: string[] = [];
  for (const paragraph of pdfSafe(text).split(/\r?\n/)) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }
    const words = paragraph.trim().split(/\s+/);
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      current = word;
    }
    if (current) lines.push(current);
  }
  return lines;
}

function drawWrapped(page: PDFPage, text: string, options: {
  x: number;
  y: number;
  maxWidth: number;
  font: PDFFont;
  size?: number;
  lineHeight?: number;
  color?: ReturnType<typeof rgb>;
}) {
  const size = options.size ?? 9;
  const lineHeight = options.lineHeight ?? size * 1.35;
  const lines = wrapText(text, options.font, size, options.maxWidth);
  let y = options.y;
  for (const line of lines) {
    page.drawText(line || " ", {
      x: options.x,
      y,
      size,
      font: options.font,
      color: options.color ?? rgb(0.19, 0.25, 0.31),
    });
    y -= lineHeight;
  }
  return y;
}

function drawLabelValue(page: PDFPage, input: {
  label: string;
  value: string;
  x: number;
  y: number;
  width: number;
  regular: PDFFont;
  bold: PDFFont;
}) {
  page.drawText(pdfSafe(input.label.toUpperCase()), {
    x: input.x,
    y: input.y,
    size: 7,
    font: input.bold,
    color: rgb(0.40, 0.47, 0.53),
  });
  return drawWrapped(page, input.value || "-", {
    x: input.x,
    y: input.y - 14,
    maxWidth: input.width,
    font: input.regular,
    size: 9.5,
    lineHeight: 12,
    color: rgb(0.08, 0.17, 0.23),
  });
}

export async function renderPlatformInvoicePdf(invoice: PlatformInvoiceDocument) {
  const issuer = platformBillingIssuer();
  const pdf = await PDFDocument.create();
  pdf.setTitle(`HOAHub Invoice ${invoice.invoiceNumber}`);
  pdf.setSubject("HOAHub tenant subscription invoice");
  pdf.setAuthor(issuer.name);
  pdf.setCreator("HOAHub");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pale = rgb(0.95, 0.98, 0.99);
  const navy = rgb(0.04, 0.23, 0.34);
  const blue = rgb(0.03, 0.55, 0.79);
  const ink = rgb(0.08, 0.17, 0.23);
  const muted = rgb(0.40, 0.47, 0.53);
  const border = rgb(0.84, 0.90, 0.93);

  let page = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
  let y = A4_HEIGHT - PAGE_MARGIN;

  const drawHeader = (target: PDFPage) => {
    target.drawRectangle({ x: 0, y: A4_HEIGHT - 126, width: A4_WIDTH, height: 126, color: navy });
    target.drawText("HOAHub", { x: PAGE_MARGIN, y: A4_HEIGHT - 64, size: 25, font: bold, color: rgb(1, 1, 1) });
    target.drawText("TENANT MANAGEMENT & HOA DIGITAL PLATFORM", { x: PAGE_MARGIN, y: A4_HEIGHT - 82, size: 7.5, font: bold, color: rgb(0.78, 0.94, 1) });
    target.drawText("INVOICE", { x: A4_WIDTH - PAGE_MARGIN - 110, y: A4_HEIGHT - 62, size: 22, font: bold, color: rgb(1, 1, 1) });
    target.drawText(pdfSafe(invoice.invoiceNumber), { x: A4_WIDTH - PAGE_MARGIN - 150, y: A4_HEIGHT - 84, size: 10, font: regular, color: rgb(0.86, 0.95, 0.99) });
  };

  drawHeader(page);
  y = A4_HEIGHT - 154;

  const billingName = invoice.tenant.billingProfile?.legalBusinessName || invoice.tenant.name;
  const billingAddress = invoice.tenant.billingProfile?.billingAddress || invoice.tenant.address || "Address not configured";
  const billingEmail = invoice.tenant.billingProfile?.billingEmail || invoice.tenant.email || "Email not configured";
  const billingTin = invoice.tenant.billingProfile?.tinNumber || invoice.tenant.tinNumber || "";
  const vatStatus = invoice.tenant.billingProfile?.vatStatus || "";

  page.drawText("FROM", { x: PAGE_MARGIN, y, size: 8, font: bold, color: muted });
  page.drawText("BILL TO", { x: 310, y, size: 8, font: bold, color: muted });
  y -= 18;
  page.drawText(pdfSafe(issuer.name), { x: PAGE_MARGIN, y, size: 13, font: bold, color: ink });
  page.drawText(pdfSafe(billingName), { x: 310, y, size: 13, font: bold, color: ink });
  const issuerDetails = [issuer.address, issuer.email, issuer.contactNumber, issuer.tinNumber ? `TIN: ${issuer.tinNumber}` : "", issuer.website].filter(Boolean).join("\n");
  const billDetails = [billingAddress, billingEmail, invoice.tenant.billingProfile?.contactNumber || invoice.tenant.contactNumber || "", billingTin ? `TIN: ${billingTin}` : "", vatStatus].filter(Boolean).join("\n");
  const leftY = drawWrapped(page, issuerDetails, { x: PAGE_MARGIN, y: y - 17, maxWidth: 220, font: regular, size: 8.7, lineHeight: 12, color: muted });
  const rightY = drawWrapped(page, billDetails, { x: 310, y: y - 17, maxWidth: 240, font: regular, size: 8.7, lineHeight: 12, color: muted });
  y = Math.min(leftY, rightY) - 18;

  page.drawRectangle({ x: PAGE_MARGIN, y: y - 82, width: A4_WIDTH - PAGE_MARGIN * 2, height: 82, color: pale, borderColor: border, borderWidth: 0.7 });
  const metaY = y - 18;
  drawLabelValue(page, { label: "Invoice date", value: formatDate(invoice.issueDate), x: PAGE_MARGIN + 14, y: metaY, width: 110, regular, bold });
  drawLabelValue(page, { label: "Due date", value: formatDate(invoice.dueDate), x: PAGE_MARGIN + 142, y: metaY, width: 100, regular, bold });
  drawLabelValue(page, { label: "Billing period", value: `${formatDate(invoice.billingPeriodStart)} - ${formatDate(invoice.billingPeriodEnd)}`, x: PAGE_MARGIN + 260, y: metaY, width: 140, regular, bold });
  drawLabelValue(page, { label: "Status", value: invoice.status.replaceAll("_", " "), x: PAGE_MARGIN + 418, y: metaY, width: 80, regular, bold });
  y -= 108;

  const tableX = PAGE_MARGIN;
  const tableWidth = A4_WIDTH - PAGE_MARGIN * 2;
  const descriptionWidth = 280;
  const qtyX = tableX + 300;
  const unitX = tableX + 360;
  const amountX = tableX + 445;
  page.drawRectangle({ x: tableX, y: y - 26, width: tableWidth, height: 26, color: navy });
  page.drawText("DESCRIPTION", { x: tableX + 10, y: y - 17, size: 7.5, font: bold, color: rgb(1, 1, 1) });
  page.drawText("QTY", { x: qtyX, y: y - 17, size: 7.5, font: bold, color: rgb(1, 1, 1) });
  page.drawText("UNIT", { x: unitX, y: y - 17, size: 7.5, font: bold, color: rgb(1, 1, 1) });
  page.drawText("AMOUNT", { x: amountX, y: y - 17, size: 7.5, font: bold, color: rgb(1, 1, 1) });
  y -= 34;

  for (const line of invoice.lines) {
    const descriptionLines = wrapText(line.description, regular, 9, descriptionWidth);
    const rowHeight = Math.max(30, descriptionLines.length * 12 + 12);
    if (y - rowHeight < 170) {
      page = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
      drawHeader(page);
      y = A4_HEIGHT - 160;
      page.drawRectangle({ x: tableX, y: y - 26, width: tableWidth, height: 26, color: navy });
      page.drawText("DESCRIPTION", { x: tableX + 10, y: y - 17, size: 7.5, font: bold, color: rgb(1, 1, 1) });
      page.drawText("QTY", { x: qtyX, y: y - 17, size: 7.5, font: bold, color: rgb(1, 1, 1) });
      page.drawText("UNIT", { x: unitX, y: y - 17, size: 7.5, font: bold, color: rgb(1, 1, 1) });
      page.drawText("AMOUNT", { x: amountX, y: y - 17, size: 7.5, font: bold, color: rgb(1, 1, 1) });
      y -= 34;
    }
    page.drawRectangle({ x: tableX, y: y - rowHeight, width: tableWidth, height: rowHeight, borderColor: border, borderWidth: 0.6, color: rgb(1, 1, 1) });
    let descY = y - 17;
    for (const text of descriptionLines) {
      page.drawText(text, { x: tableX + 10, y: descY, size: 9, font: regular, color: ink });
      descY -= 12;
    }
    page.drawText(String(line.quantity), { x: qtyX, y: y - 17, size: 9, font: regular, color: ink });
    page.drawText(money(Number(line.unitAmount), invoice.currency), { x: unitX, y: y - 17, size: 8.5, font: regular, color: ink });
    page.drawText(money(Number(line.lineTotal), invoice.currency), { x: amountX, y: y - 17, size: 8.5, font: bold, color: ink });
    y -= rowHeight;
  }

  y -= 18;
  const totalsX = 350;
  const totalsValueX = 455;
  const drawTotal = (label: string, value: string, strong = false) => {
    page.drawText(label, { x: totalsX, y, size: strong ? 10 : 8.5, font: strong ? bold : regular, color: strong ? ink : muted });
    page.drawText(pdfSafe(value), { x: totalsValueX, y, size: strong ? 10 : 8.5, font: strong ? bold : regular, color: strong ? navy : ink });
    y -= strong ? 20 : 16;
  };
  drawTotal("Subtotal", money(Number(invoice.subtotal), invoice.currency));
  if (Number(invoice.discount) > 0) drawTotal("Discount", `- ${money(Number(invoice.discount), invoice.currency)}`);
  if (Number(invoice.tax) > 0) drawTotal("Tax", money(Number(invoice.tax), invoice.currency));
  drawTotal("Invoice total", money(Number(invoice.total), invoice.currency), true);
  drawTotal("Amount paid", money(Number(invoice.amountPaid), invoice.currency));
  drawTotal("Outstanding", money(Number(invoice.outstandingBalance), invoice.currency), true);

  const noteText = invoice.notes?.trim();
  if (noteText) {
    if (y < 150) {
      page = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
      drawHeader(page);
      y = A4_HEIGHT - 160;
    }
    const noteLines = wrapText(noteText, regular, 9, tableWidth - 28);
    const noteHeight = Math.max(62, noteLines.length * 12 + 36);
    page.drawRectangle({ x: PAGE_MARGIN, y: y - noteHeight, width: tableWidth, height: noteHeight, color: pale, borderColor: border, borderWidth: 0.7 });
    page.drawText("INVOICE NOTE", { x: PAGE_MARGIN + 14, y: y - 18, size: 8, font: bold, color: blue });
    let noteY = y - 35;
    for (const line of noteLines) {
      page.drawText(line || " ", { x: PAGE_MARGIN + 14, y: noteY, size: 9, font: regular, color: ink });
      noteY -= 12;
    }
    y -= noteHeight + 18;
  }

  const paidMessage = Number(invoice.outstandingBalance) < 0.01
    ? `PAID${invoice.paidAt ? ` on ${formatDate(invoice.paidAt)}` : ""}`
    : `Payment due ${formatDate(invoice.dueDate)}`;
  page.drawText(pdfSafe(paidMessage), { x: PAGE_MARGIN, y: Math.max(65, y), size: 9, font: bold, color: Number(invoice.outstandingBalance) < 0.01 ? rgb(0.10, 0.49, 0.29) : navy });

  for (const pdfPage of pdf.getPages()) {
    pdfPage.drawLine({ start: { x: PAGE_MARGIN, y: 46 }, end: { x: A4_WIDTH - PAGE_MARGIN, y: 46 }, thickness: 0.6, color: border });
    pdfPage.drawText(pdfSafe(`${issuer.name} | ${issuer.email} | ${issuer.website}`), { x: PAGE_MARGIN, y: 29, size: 7.2, font: regular, color: muted });
    pdfPage.drawText(`Invoice ${pdfSafe(invoice.invoiceNumber)}`, { x: A4_WIDTH - PAGE_MARGIN - 120, y: 29, size: 7.2, font: regular, color: muted });
  }

  return pdf.save();
}
