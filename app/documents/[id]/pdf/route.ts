import { readFile } from "node:fs/promises";
import path from "node:path";
import { DocumentRequestStatus } from "@prisma/client";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import { NextRequest, NextResponse } from "next/server";
import { getAccessibleGeneratedDocument } from "@/lib/document-access";
import { prisma } from "@/lib/db";
import { documentTypeLabel, isPassDocument } from "@/lib/services/documents";
import { getAssociationSettings } from "@/lib/system-settings";
import { shortDate } from "@/lib/utils";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ user, request: documentRequest }, association] = await Promise.all([getAccessibleGeneratedDocument(id, { requireDownload: true }), getAssociationSettings()]);
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || request.nextUrl.host;
  const proto = request.headers.get("x-forwarded-proto") || (host.includes("localhost") || host.startsWith("127.") ? "http" : "https");
  const verifyUrl = `${proto}://${host}/verify/documents/${documentRequest.verificationCode}`;
  const savedAssociation = documentRequest.associationSnapshot && typeof documentRequest.associationSnapshot === "object" ? documentRequest.associationSnapshot as Partial<typeof association> : {};
  const documentAssociation = { ...association, ...savedAssociation };
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const serifItalic = await pdf.embedFont(StandardFonts.TimesRomanBoldItalic);
  const qr = await pdf.embedPng(await QRCode.toBuffer(verifyUrl, { type: "png", width: 300, margin: 1, errorCorrectionLevel: "M" }));
  const [logo, processedSignature, approvedSignature] = await Promise.all([loadLogo(pdf, documentAssociation.logoUrl), loadSnapshotImage(pdf, documentRequest.processedOfficerSnapshot, "signatureUrl"), loadSnapshotImage(pdf, documentRequest.approvedOfficerSnapshot, "signatureUrl")]);
  const drawInput = { documentRequest, association: documentAssociation, regular, bold, serifBold, serifItalic, qr, logo, processedSignature, approvedSignature, copy: "", verifyUrl };
  if (isPassDocument(documentRequest.type)) drawPassSheet(pdf.addPage([595.28, 841.89]), drawInput);
  else if (documentRequest.type === "CERTIFICATE_OF_RESIDENCY") drawResidencyCertificate(pdf.addPage([595.28, 841.89]), drawInput);
  else drawDocumentPage(pdf.addPage([595.28, 841.89]), drawInput);
  pdf.setTitle(`${documentRequest.documentNumber} - ${documentTypeLabel(documentRequest.type)}`);
  pdf.setAuthor(association.name);
  pdf.setSubject("Official HOA document with online verification");
  const bytes = await pdf.save();

  if (documentRequest.status !== DocumentRequestStatus.DOWNLOADED) {
    await prisma.$transaction([
      prisma.documentRequest.update({ where: { id }, data: { status: DocumentRequestStatus.DOWNLOADED, downloadedAt: new Date(), histories: { create: { status: DocumentRequestStatus.DOWNLOADED, actorId: user.id, note: "PDF downloaded." } } } }),
      prisma.auditLog.create({ data: { actorId: user.id, module: "DOCUMENTS", action: "DOWNLOAD_PDF", entityType: "DocumentRequest", entityId: id, metadata: { documentNumber: documentRequest.documentNumber } } }),
    ]);
  }
  return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${documentRequest.documentNumber}.pdf"`, "Cache-Control": "private, no-store" } });
}

function drawPassSheet(page: PDFPage, input: DrawInput) {
  const { documentRequest: request, association, regular, bold, qr, logo } = input;
  const navy = rgb(0.03, 0.16, 0.38);
  if (logo) page.drawImage(logo, { x: 28, y: 764, width: 58, height: 58 });
  page.drawRectangle({ x: 115, y: 787, width: 330, height: 30, color: navy });
  drawCenteredWithin(page, safeText(documentTypeLabel(request.type).toUpperCase()), bold, 16, 115, 445, 796, rgb(1, 1, 1));
  drawCenteredWithin(page, safeText(association.name), bold, 13, 92, 470, 766, navy);
  drawCenteredWithin(page, safeText(association.address), regular, 6.5, 92, 470, 753, rgb(.2, .25, .3));
  drawCenteredWithin(page, safeText([association.contactNumber, association.email].filter(Boolean).join(" | ")), regular, 6.5, 92, 470, 742, rgb(.2, .25, .3));
  page.drawText(`PASS NO.\n${request.documentNumber}`, { x: 468, y: 791, font: bold, size: 7, lineHeight: 11, color: navy });
  page.drawImage(qr, { x: 518, y: 754, width: 48, height: 48 });
  page.drawText("SCAN TO VERIFY", { x: 513, y: 744, font: bold, size: 5.5, color: navy });
  const bands = [
    { label: "MARSHAL'S COPY", color: rgb(.18, .55, .12), note: "Present to the marshal at the gate." },
    { label: "HOMEOWNER'S COPY", color: rgb(.04, .35, .72), note: "Please keep this copy." },
    { label: "HOA OFFICE COPY", color: rgb(.94, .33, .02), note: "Retain for record and reference." },
  ];
  bands.forEach((band, index) => {
    const top = 724 - index * 219;
    const bottom = top - 202;
    page.drawRectangle({ x: 22, y: bottom, width: 551, height: 202, borderColor: band.color, borderWidth: 1 });
    page.drawRectangle({ x: 22, y: bottom, width: 82, height: 202, color: band.color });
    drawCenteredWithin(page, String(index + 1), bold, 24, 22, 104, top - 42, rgb(1, 1, 1));
    const labelLines = band.label === "HOA OFFICE COPY" ? ["HOA OFFICE", "COPY"] : [band.label.replace(" COPY", ""), "COPY"];
    drawCenteredWithin(page, labelLines[0], bold, 7.5, 25, 101, top - 67, rgb(1, 1, 1));
    drawCenteredWithin(page, labelLines[1], bold, 8, 25, 101, top - 79, rgb(1, 1, 1));
    for (const [label, value, x, y, width] of passRows(request, top)) {
      page.drawText(label, { x, y, font: bold, size: 5.5, color: navy });
      page.drawText(safeText(value), { x, y: y - 11, font: regular, size: 7.5, color: rgb(.05, .07, .1), maxWidth: width });
    }
    page.drawLine({ start: { x: 112, y: bottom + 46 }, end: { x: 489, y: bottom + 46 }, color: band.color, thickness: .5 });
    page.drawText("PROCESSED BY", { x: 116, y: bottom + 34, font: bold, size: 5.5, color: navy });
    page.drawText(safeText(officerName(request.processedOfficerSnapshot, request.processedByOfficer?.fullName || request.processedBy?.name)), { x: 116, y: bottom + 21, font: bold, size: 7, color: navy, maxWidth: 125 });
    page.drawText("APPROVED BY", { x: 250, y: bottom + 34, font: bold, size: 5.5, color: navy });
    page.drawText(safeText(officerName(request.approvedOfficerSnapshot, request.approvedByOfficer?.fullName || request.approvedBy?.name)), { x: 250, y: bottom + 21, font: bold, size: 7, color: navy, maxWidth: 125 });
    page.drawText(index === 2 ? "RECEIVED BY (HOA OFFICE)" : "CONFIRMED BY (MARSHAL)", { x: 381, y: bottom + 34, font: bold, size: 5.5, color: navy });
    page.drawLine({ start: { x: 381, y: bottom + 17 }, end: { x: 476, y: bottom + 17 }, color: rgb(.2, .2, .2), thickness: .6 });
    page.drawImage(qr, { x: 500, y: bottom + 104, width: 57, height: 57 });
    drawCenteredWithin(page, request.documentNumber!, bold, 6.5, 487, 570, bottom + 86, navy);
    drawCenteredWithin(page, safeText(band.note), regular, 5.5, 490, 570, bottom + 67, rgb(.15, .15, .15));
    if (index < 2) { page.drawLine({ start: { x: 18, y: bottom - 9 }, end: { x: 577, y: bottom - 9 }, dashArray: [5, 4], thickness: .7, color: rgb(.3, .3, .3) }); page.drawText("CUT", { x: 22, y: bottom - 19, font: bold, size: 5, color: rgb(.3, .3, .3) }); }
  });
  page.drawText("IMPORTANT: Valid only on the stated date and time. Present the applicable copy at the gate. Scan the QR code to verify authenticity.", { x: 28, y: 35, font: bold, size: 6.5, color: navy, maxWidth: 535 });
}

function passRows(request: DrawInput["documentRequest"], top: number): Array<[string, string, number, number, number]> {
  return [
    ["TYPE OF PASS", request.passType?.replaceAll("_", "-") || documentTypeLabel(request.type), 116, top - 20, 100],
    ["SCHEDULED DATE / TIME", `${request.scheduledDate ? shortDate(request.scheduledDate) : "-"} ${request.startTime || ""}-${request.endTime || ""}`, 235, top - 20, 130],
    ["VALID UNTIL", request.validityDate ? shortDate(request.validityDate) : "-", 383, top - 20, 95],
    ["HOMEOWNER", request.homeowner.user.name, 116, top - 54, 145],
    ["BLOCK & LOT", `Block ${request.homeowner.block}, Lot ${request.homeowner.lot}`, 275, top - 54, 95],
    ["CONTACT NUMBER", request.homeowner.phone || "-", 383, top - 54, 95],
    ["VEHICLE / TRUCK DETAILS", request.vehicleDetails || "None specified", 116, top - 88, 145],
    ["CONTRACTOR / MOVER", request.contractorDetails || request.partyName || "-", 275, top - 88, 95],
    ["DRIVER / REPRESENTATIVE", request.representativeName || request.partyName || "-", 383, top - 88, 95],
    ["PURPOSE / ITEMS", request.purpose || "-", 116, top - 122, 250],
    ["REMARKS / INSTRUCTIONS", request.adminRemarks || request.remarks || "-", 383, top - 122, 95],
  ];
}

function officerName(snapshot: unknown, fallback?: string | null) {
  if (snapshot && typeof snapshot === "object" && "fullName" in snapshot && typeof snapshot.fullName === "string") return snapshot.fullName;
  return fallback || "Authorized HOA Officer";
}

type DrawInput = {
  documentRequest: Awaited<ReturnType<typeof getAccessibleGeneratedDocument>>["request"];
  association: Awaited<ReturnType<typeof getAssociationSettings>>;
  regular: PDFFont;
  bold: PDFFont;
  serifBold: PDFFont;
  serifItalic: PDFFont;
  qr: Awaited<ReturnType<PDFDocument["embedPng"]>>;
  logo: Awaited<ReturnType<PDFDocument["embedPng"]>> | Awaited<ReturnType<PDFDocument["embedJpg"]>> | null;
  processedSignature: Awaited<ReturnType<PDFDocument["embedPng"]>> | Awaited<ReturnType<PDFDocument["embedJpg"]>> | null;
  approvedSignature: Awaited<ReturnType<PDFDocument["embedPng"]>> | Awaited<ReturnType<PDFDocument["embedJpg"]>> | null;
  copy: string;
  verifyUrl: string;
};

function drawResidencyCertificate(page: PDFPage, input: DrawInput) {
  const { documentRequest: request, association, regular, bold, serifBold, serifItalic, qr, logo, processedSignature, approvedSignature } = input;
  const navy = rgb(.02, .13, .34); const green = rgb(.12, .48, .08); const gray = rgb(.25, .27, .3);
  page.drawRectangle({ x: 0, y: 0, width: 595.28, height: 841.89, color: rgb(1, 1, 1) });
  const issued = request.generatedAt || request.approvedAt || new Date();
  const validUntil = request.validityDate || new Date(Date.UTC(issued.getUTCFullYear() + 1, issued.getUTCMonth(), issued.getUTCDate()));
  if (logo) page.drawImage(logo, { x: 24, y: 725, width: 88, height: 88 });
  const associationLines = wrapText(safeText(association.name.toUpperCase()), bold, 16, 275).slice(0, 2);
  associationLines.forEach((line, index) => page.drawText(line, { x: 125, y: 790 - index * 19, font: bold, size: 16, color: navy }));
  page.drawText(safeText(association.address), { x: 126, y: 742, font: regular, size: 7.5, color: rgb(.08, .08, .08), maxWidth: 280 });
  page.drawText(safeText([association.contactNumber, association.email].filter(Boolean).join("  |  ")), { x: 126, y: 727, font: regular, size: 7.5, color: rgb(.08, .08, .08), maxWidth: 280 });
  page.drawText(safeText(`SEC Registration No.: ${association.secRegistrationNumber || "Not specified"}`), { x: 126, y: 709, font: regular, size: 7.5, color: rgb(.08, .08, .08) });
  page.drawLine({ start: { x: 416, y: 703 }, end: { x: 416, y: 812 }, color: rgb(.75, .77, .8), thickness: .8 });
  page.drawText("DOCUMENT NO.", { x: 428, y: 798, font: bold, size: 6.5, color: navy });
  page.drawText(request.documentNumber!, { x: 428, y: 783, font: bold, size: 9.5, color: rgb(.85, 0, 0), maxWidth: 88 });
  page.drawText("DATE ISSUED", { x: 428, y: 759, font: bold, size: 6.5, color: navy });
  page.drawText(shortDate(issued), { x: 428, y: 745, font: bold, size: 8, color: rgb(.05, .05, .05) });
  page.drawText("VALID UNTIL", { x: 428, y: 722, font: bold, size: 6.5, color: navy });
  page.drawText(shortDate(validUntil), { x: 428, y: 708, font: bold, size: 8, color: rgb(.05, .05, .05) });
  page.drawImage(qr, { x: 520, y: 735, width: 58, height: 58 });
  drawCenteredWithin(page, "SCAN TO VERIFY", bold, 5.5, 510, 585, 722, navy);
  page.drawLine({ start: { x: 18, y: 687 }, end: { x: 578, y: 687 }, color: green, thickness: 2 });
  page.drawLine({ start: { x: 342, y: 687 }, end: { x: 578, y: 687 }, color: navy, thickness: 2 });

  page.drawRectangle({ x: 18, y: 623, width: 97, height: 22, color: navy });
  drawCenteredWithin(page, "HOA OFFICERS", bold, 10, 18, 115, 630, rgb(1, 1, 1));
  drawCenteredWithin(page, "CY 2025-2026", bold, 8, 18, 115, 608, navy);
  page.drawLine({ start: { x: 130, y: 190 }, end: { x: 130, y: 657 }, color: navy, thickness: .8 });
  const organization = Array.isArray(request.organizationSnapshot) ? request.organizationSnapshot : [];
  let officerY = 580;
  for (const entry of organization.slice(0, 8)) {
    const officer = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    page.drawText(safeText(String(officer.fullName || "")), { x: 30, y: officerY, font: bold, size: 6.2, color: rgb(.05, .05, .05), maxWidth: 88 });
    page.drawText(safeText(String(officer.position || "")).toUpperCase(), { x: 30, y: officerY - 10, font: bold, size: 5.5, color: navy, maxWidth: 88 });
    page.drawLine({ start: { x: 28, y: officerY - 19 }, end: { x: 118, y: officerY - 19 }, color: rgb(.8, .82, .84), thickness: .35 });
    officerY -= 39;
  }
  const sideNote = "This certificate is issued upon the request of the above-named individual for whatever legal purpose it may serve.";
  wrapText(sideNote, regular, 6.5, 86).forEach((line, index) => page.drawText(line, { x: 25, y: 238 - index * 10, font: regular, size: 6.5, color: rgb(.08, .08, .08) }));

  drawCenteredWithin(page, "CERTIFICATE OF RESIDENCY", serifBold, 25, 145, 580, 625, navy);
  drawCenteredWithin(page, "~  TO WHOM IT MAY CONCERN:  ~", serifItalic, 11, 145, 580, 597, navy);
  if (logo) page.drawImage(logo, { x: 246, y: 300, width: 230, height: 230, opacity: .045 });
  page.drawText("This is to certify that", { x: 176, y: 550, font: regular, size: 11, color: rgb(.05, .05, .05) });
  page.drawText(safeText(request.homeowner.user.name.toUpperCase()), { x: 176, y: 516, font: bold, size: 21, color: navy, maxWidth: 365 });
  let bodyY = 492;
  const paragraphs = [
    `is a bonafide resident of ${association.name}, Brgy. Sabang, Naic, Cavite, and is currently residing at the address indicated below.`,
    "This certification is based on the records and information on file in this office and is being issued upon the request of the above-named individual for whatever legal purpose it may serve.",
    `Issued this ${ordinal(issued.getUTCDate())} day of ${issued.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })} at ${association.name} HOA Office, ${association.address}.`,
  ];
  for (const paragraph of paragraphs) { for (const line of wrapText(safeText(paragraph), regular, 10, 370)) { page.drawText(line, { x: 176, y: bodyY, font: regular, size: 10, color: rgb(.05, .05, .05) }); bodyY -= 14; } bodyY -= 15; }

  page.drawRectangle({ x: 145, y: 185, width: 430, height: 150, color: rgb(.985, .99, .98), borderColor: rgb(.45, .62, .42), borderWidth: .65 });
  page.drawLine({ start: { x: 360, y: 195 }, end: { x: 360, y: 325 }, color: rgb(.7, .75, .72), thickness: .5 });
  drawCenteredWithin(page, "PERSONAL INFORMATION", bold, 8, 150, 355, 317, navy);
  drawCenteredWithin(page, "PROPERTY INFORMATION", bold, 8, 365, 570, 317, green);
  const age = request.homeowner.birthDate ? String(ageAt(request.homeowner.birthDate, issued)) : "Not specified";
  const personal = [["Full Name", request.homeowner.user.name], ["Age", age], ["Civil Status", request.homeowner.civilStatus || "Not specified"], ["Citizenship", request.homeowner.citizenship || "Not specified"], ["Occupation", request.homeowner.occupation || "Not specified"], ["Date of Residency", request.homeowner.residencyDate ? shortDate(request.homeowner.residencyDate) : "Not specified"], ["Contact Number", request.homeowner.phone]];
  const property = [["Phase", request.homeowner.phase || association.name], ["Block & Lot", `Block ${request.homeowner.block} - Lot ${request.homeowner.lot}`], ["Property Address", request.homeowner.address], ["Type", request.homeowner.propertyType || "Not specified"], ["Status", request.homeowner.occupancyStatus || "Not specified"]];
  drawInfoRows(page, personal, 154, 297, 245, regular, bold, navy, 16, 105);
  drawInfoRows(page, property, 368, 297, 455, regular, bold, navy, 21, 112);

  page.drawLine({ start: { x: 18, y: 170 }, end: { x: 578, y: 170 }, color: navy, thickness: .8 });
  const dateRows = [["DATE REQUESTED", shortDate(request.requestedAt)], ["DATE ISSUED", shortDate(issued)], ["VALID UNTIL", shortDate(validUntil)]];
  drawInfoRows(page, dateRows, 28, 152, 110, regular, bold, navy, 18);
  page.drawLine({ start: { x: 205, y: 85 }, end: { x: 205, y: 165 }, color: rgb(.75, .77, .8), thickness: .5 });
  page.drawText("REMARKS", { x: 224, y: 150, font: bold, size: 7, color: navy });
  page.drawText(safeText(request.adminRemarks || request.remarks || "N/A"), { x: 224, y: 131, font: regular, size: 7.5, color: rgb(.05, .05, .05), maxWidth: 80 });
  page.drawLine({ start: { x: 224, y: 96 }, end: { x: 286, y: 96 }, color: rgb(.2, .2, .2), thickness: .6 });
  if (processedSignature) page.drawImage(processedSignature, { x: 340, y: 113, width: 68, height: 36 });
  if (approvedSignature) page.drawImage(approvedSignature, { x: 470, y: 113, width: 68, height: 36 });
  drawCenteredWithin(page, "PROCESSED BY", bold, 6.5, 305, 435, 155, navy);
  drawCenteredWithin(page, officerName(request.processedOfficerSnapshot, request.processedByOfficer?.fullName || request.processedBy?.name).toUpperCase(), bold, 7, 305, 435, 104, navy);
  drawCenteredWithin(page, "Admin Staff", regular, 6.5, 305, 435, 92, gray);
  drawCenteredWithin(page, "APPROVED BY", bold, 6.5, 440, 575, 155, navy);
  drawCenteredWithin(page, officerName(request.approvedOfficerSnapshot, request.approvedByOfficer?.fullName || request.approvedBy?.name).toUpperCase(), bold, 7, 440, 575, 104, navy);
  drawCenteredWithin(page, "President", regular, 6.5, 440, 575, 92, gray);
  page.drawRectangle({ x: 18, y: 18, width: 560, height: 64, color: rgb(.985, .99, .985), borderColor: rgb(.78, .8, .82), borderWidth: .6 });
  page.drawText("This is a system-generated document.\nNo signature required.\nScan QR Code to verify authenticity.", { x: 72, y: 62, font: bold, size: 6.2, lineHeight: 11, color: rgb(.05, .05, .05) });
  page.drawText("NOTE:", { x: 326, y: 65, font: bold, size: 7, color: green });
  page.drawText("This certificate is valid only within the validity date indicated.\nAny erasure, alteration, or tampering hereon shall invalidate this document.\nThis certificate does not waive any outstanding balance or obligation\nof the homeowner to the association.", { x: 326, y: 53, font: regular, size: 5.8, lineHeight: 9, color: rgb(.05, .05, .05) });
}

function drawInfoRows(page: PDFPage, rows: string[][], x: number, y: number, valueX: number, regular: PDFFont, bold: PDFFont, color: ReturnType<typeof rgb>, gap = 17, maxWidth = 105) {
  rows.forEach(([label, value], index) => { const rowY = y - index * gap; page.drawText(label, { x, y: rowY, font: bold, size: 6.7, color }); page.drawText(":", { x: valueX - 9, y: rowY, font: bold, size: 6.7, color }); const lines = wrapText(safeText(value), regular, 7, maxWidth); lines.slice(0, 2).forEach((line, lineIndex) => page.drawText(line, { x: valueX, y: rowY - lineIndex * 10, font: regular, size: 7, color: rgb(.04, .04, .04) })); });
}

function ordinal(day: number) { const suffix = day % 100 >= 11 && day % 100 <= 13 ? "th" : day % 10 === 1 ? "st" : day % 10 === 2 ? "nd" : day % 10 === 3 ? "rd" : "th"; return `${day}${suffix}`; }
function ageAt(birthDate: Date, at: Date) { let age = at.getUTCFullYear() - birthDate.getUTCFullYear(); if (at.getUTCMonth() < birthDate.getUTCMonth() || (at.getUTCMonth() === birthDate.getUTCMonth() && at.getUTCDate() < birthDate.getUTCDate())) age--; return Math.max(0, age); }

function drawDocumentPage(page: PDFPage, input: DrawInput) {
  const { documentRequest: request, association, regular, bold, qr, logo, copy, verifyUrl, processedSignature, approvedSignature } = input;
  const pine = rgb(0.04, 0.25, 0.17);
  page.drawRectangle({ x: 28, y: 28, width: 539.28, height: 785.89, borderWidth: 2, borderColor: pine });
  if (logo) page.drawImage(logo, { x: 46, y: 744, width: 62, height: 62 });
  drawCentered(page, safeText(association.name), bold, 16, 744, pine);
  drawCentered(page, "HOMEOWNERS ASSOCIATION", bold, 8, 729, pine);
  drawCentered(page, safeText(association.address), regular, 7.5, 716, rgb(0.3, 0.35, 0.38));
  drawCentered(page, safeText([association.contactNumber, association.email].filter(Boolean).join(" | ")), regular, 7.5, 705, rgb(0.3, 0.35, 0.38));
  drawCentered(page, safeText([association.tinNumber && `TIN ${association.tinNumber}`, association.secRegistrationNumber && `SEC ${association.secRegistrationNumber}`].filter(Boolean).join(" | ")), regular, 7.5, 694, rgb(0.3, 0.35, 0.38));
  page.drawLine({ start: { x: 44, y: 681 }, end: { x: 551, y: 681 }, thickness: 1.5, color: pine });
  if (copy) page.drawText(copy, { x: 455, y: 786, font: bold, size: 8, color: pine });
  drawCentered(page, request.documentNumber!, bold, 8, 652, rgb(0.35, 0.35, 0.35));
  drawCentered(page, safeText(documentTypeLabel(request.type).toUpperCase()), bold, 20, 625, pine);
  drawCentered(page, safeText(`Requested ${shortDate(request.requestedAt)} | Approved ${shortDate(request.approvedAt!)}${request.validityDate ? ` | Valid until ${shortDate(request.validityDate)}` : ""}`), regular, 7.5, 605, rgb(0.35, 0.35, 0.35));
  drawCentered(page, safeText(`${request.homeowner.user.name} - Block ${request.homeowner.block}, Lot ${request.homeowner.lot}`), bold, 8.5, 590, pine);

  const organization = Array.isArray(request.organizationSnapshot) ? request.organizationSnapshot : [];
  page.drawRectangle({ x: 44, y: 190, width: 118, height: 374, color: rgb(.97, .99, .96), borderColor: rgb(.55, .75, .48), borderWidth: .6 });
  drawCenteredWithin(page, "HOA OFFICERS", bold, 8, 46, 160, 545, pine);
  let officerY = 524;
  for (const entry of organization.slice(0, 8)) {
    const officer = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    page.drawText(safeText(String(officer.fullName || "")), { x: 51, y: officerY, font: bold, size: 6.2, color: rgb(.08, .12, .14), maxWidth: 104 });
    page.drawText(safeText(String(officer.position || "")), { x: 51, y: officerY - 9, font: regular, size: 5.5, color: pine, maxWidth: 104 });
    page.drawLine({ start: { x: 51, y: officerY - 16 }, end: { x: 155, y: officerY - 16 }, thickness: .25, color: rgb(.75, .8, .75) });
    officerY -= 39;
  }

  let y = 575;
  for (const paragraph of request.generatedContent!.split(/\n+/)) {
    const lines = wrapText(safeText(paragraph), regular, 10.5, 365);
    for (const line of lines) { page.drawText(line, { x: 180, y, font: regular, size: 10.5, color: rgb(0.08, 0.1, 0.12) }); y -= 16; }
    y -= 10;
  }
  const issued = `Issued on ${shortDate(request.generatedAt!)}${request.validityDate ? ` and valid until ${shortDate(request.validityDate)}` : ""}.`;
  page.drawText(safeText(issued), { x: 180, y: Math.max(235, y - 14), font: regular, size: 8.5, color: rgb(0.15, 0.18, 0.2) });
  if (request.adminRemarks || request.remarks) page.drawText(safeText(`Remarks: ${request.adminRemarks || request.remarks}`), { x: 180, y: 215, font: regular, size: 8, color: rgb(0.25, 0.28, 0.3), maxWidth: 335 });

  page.drawLine({ start: { x: 60, y: 145 }, end: { x: 220, y: 145 }, thickness: 0.8, color: rgb(0.1, 0.1, 0.1) });
  if (processedSignature) page.drawImage(processedSignature, { x: 105, y: 142, width: 70, height: 32 });
  drawCenteredWithin(page, safeText(officerName(request.processedOfficerSnapshot, request.processedByOfficer?.fullName || request.processedBy?.name)), bold, 9, 60, 220, 130, rgb(0.08, 0.1, 0.12));
  drawCenteredWithin(page, "Processed by", regular, 7.5, 60, 220, 118, rgb(0.35, 0.35, 0.35));
  page.drawLine({ start: { x: 245, y: 145 }, end: { x: 395, y: 145 }, thickness: 0.8, color: rgb(0.1, 0.1, 0.1) });
  if (approvedSignature) page.drawImage(approvedSignature, { x: 285, y: 142, width: 70, height: 32 });
  drawCenteredWithin(page, safeText(officerName(request.approvedOfficerSnapshot, request.approvedByOfficer?.fullName || request.approvedBy?.name)), bold, 9, 245, 395, 130, rgb(0.08, 0.1, 0.12));
  drawCenteredWithin(page, "Approved by", regular, 7.5, 245, 395, 118, rgb(0.35, 0.35, 0.35));
  page.drawImage(qr, { x: 408, y: 104, width: 95, height: 95 });
  drawCenteredWithin(page, request.verificationCode!, bold, 7.5, 386, 525, 92, pine);
  drawCenteredWithin(page, "Scan to verify this document", regular, 6.5, 386, 525, 81, rgb(0.35, 0.35, 0.35));
  drawCenteredWithin(page, safeText(verifyUrl), regular, 4.5, 350, 560, 70, rgb(0.4, 0.4, 0.4));
}

async function loadLogo(pdf: PDFDocument, logoUrl: string) {
  if (!logoUrl.startsWith("/")) return null;
  try {
    const organizationPrefix = "/uploads/organization-file/";
    const fullPath = logoUrl.startsWith(organizationPrefix)
      ? path.join(process.cwd(), "storage", "uploads", "organization", logoUrl.slice(organizationPrefix.length))
      : path.join(process.cwd(), "public", logoUrl.replace(/^\/+/, ""));
    const bytes = await readFile(fullPath);
    return /\.jpe?g$/i.test(logoUrl) ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
  } catch { return null; }
}

async function loadSnapshotImage(pdf: PDFDocument, snapshot: unknown, key: string) {
  if (!snapshot || typeof snapshot !== "object" || !(key in snapshot)) return null;
  const url = String((snapshot as Record<string, unknown>)[key] || "");
  return loadLogo(pdf, url);
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  if (!text) return [""];
  const words = text.split(/\s+/); const lines: string[] = []; let line = "";
  for (const word of words) { const candidate = line ? `${line} ${word}` : word; if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate; else { if (line) lines.push(line); line = word; } }
  if (line) lines.push(line); return lines;
}
function drawCentered(page: PDFPage, text: string, font: PDFFont, size: number, y: number, color: ReturnType<typeof rgb>) { const width = font.widthOfTextAtSize(text, size); page.drawText(text, { x: Math.max(120, (595.28 - width) / 2), y, font, size, color }); }
function drawCenteredWithin(page: PDFPage, text: string, font: PDFFont, size: number, x1: number, x2: number, y: number, color: ReturnType<typeof rgb>) { const width = font.widthOfTextAtSize(text, size); page.drawText(text, { x: x1 + Math.max(0, (x2 - x1 - width) / 2), y, font, size, color }); }
function safeText(value: string) { return value.normalize("NFKD").replace(/[^\x20-\x7E]/g, ""); }
