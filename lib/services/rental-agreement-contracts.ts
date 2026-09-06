import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel } from "docx";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { prisma } from "@/lib/db";

export type RentalAgreementContractSnapshot = {
  agreementId: string;
  associationName: string;
  associationShortName: string;
  associationAddress: string | null;
  associationContactNumber: string | null;
  associationEmail: string | null;
  associationSecRegistrationNumber: string | null;
  associationTinNumber: string | null;
  renterName: string;
  renterEmail: string | null;
  renterPhone: string | null;
  renterAddress: string | null;
  homeownerId: string | null;
  homeownerName: string | null;
  homeownerAccountNumber: string | null;
  homeownerBlock: string | null;
  homeownerLot: string | null;
  assetCode: string;
  assetName: string;
  assetType: string;
  assetLocation: string | null;
  startDate: string;
  endDate: string | null;
  monthlyRate: string;
  securityDeposit: string;
  billingDay: number;
  dueDay: number;
  notes: string | null;
};

type ContractSourceRow = RentalAgreementContractSnapshot & {
  tenantId: string;
  agreementCreatedAt: Date;
};

type AgreementAccessRow = {
  agreementId: string;
  status: string;
  renterHomeownerId: string | null;
};

export type RentalAgreementContractRecord = {
  id: string;
  tenantId: string;
  agreementId: string;
  version: number;
  contractNumber: string;
  snapshot: RentalAgreementContractSnapshot;
  generatedAt: Date;
  signedOriginalName: string | null;
  signedStoredName: string | null;
  signedContentType: string | null;
  signedFileSize: number | null;
  signedSha256: string | null;
  signedUploadedAt: Date | null;
};

type ContractRow = Omit<RentalAgreementContractRecord, "snapshot"> & { snapshot: unknown };

function contractNumber(startDate: string, agreementId: string) {
  return `RA-${startDate.slice(0, 4)}-${agreementId.replace(/[^A-Za-z0-9]/g, "").slice(-12).toUpperCase()}`;
}

function normalizeSnapshot(value: unknown): RentalAgreementContractSnapshot {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== "object") throw new Error("Rental agreement contract snapshot is invalid.");
  return parsed as RentalAgreementContractSnapshot;
}

async function loadContractSource(db: Prisma.TransactionClient, tenantId: string, agreementId: string) {
  const rows = await db.$queryRaw<ContractSourceRow[]>(Prisma.sql`
    SELECT
      a.tenantId,
      a.id AS agreementId,
      t.name AS associationName,
      t.shortName AS associationShortName,
      t.address AS associationAddress,
      t.contactNumber AS associationContactNumber,
      t.email AS associationEmail,
      t.secRegistrationNumber AS associationSecRegistrationNumber,
      t.tinNumber AS associationTinNumber,
      r.fullName AS renterName,
      r.email AS renterEmail,
      r.phone AS renterPhone,
      r.address AS renterAddress,
      r.homeownerId AS homeownerId,
      u.name AS homeownerName,
      h.accountNumber AS homeownerAccountNumber,
      h.block AS homeownerBlock,
      h.lot AS homeownerLot,
      ra.code AS assetCode,
      ra.name AS assetName,
      ra.type AS assetType,
      ra.location AS assetLocation,
      DATE_FORMAT(a.startDate, '%Y-%m-%d') AS startDate,
      IF(a.endDate IS NULL, NULL, DATE_FORMAT(a.endDate, '%Y-%m-%d')) AS endDate,
      CAST(a.monthlyRate AS CHAR) AS monthlyRate,
      CAST(a.securityDeposit AS CHAR) AS securityDeposit,
      a.billingDay,
      a.dueDay,
      a.notes,
      a.createdAt AS agreementCreatedAt
    FROM RentalAgreement a
    JOIN RentalAsset ra ON ra.tenantId=a.tenantId AND ra.id=a.assetId
    JOIN Renter r ON r.tenantId=a.tenantId AND r.id=a.renterId
    JOIN Tenant t ON t.id=a.tenantId
    LEFT JOIN HomeownerProfile h ON h.tenantId=r.tenantId AND h.id=r.homeownerId
    LEFT JOIN User u ON u.id=h.userId
    WHERE a.tenantId=${tenantId} AND a.id=${agreementId}
    LIMIT 1
    FOR UPDATE
  `);
  return rows[0] ?? null;
}

function snapshotFromSource(source: ContractSourceRow): RentalAgreementContractSnapshot {
  return {
    agreementId: source.agreementId,
    associationName: source.associationName,
    associationShortName: source.associationShortName,
    associationAddress: source.associationAddress,
    associationContactNumber: source.associationContactNumber,
    associationEmail: source.associationEmail,
    associationSecRegistrationNumber: source.associationSecRegistrationNumber,
    associationTinNumber: source.associationTinNumber,
    renterName: source.renterName,
    renterEmail: source.renterEmail,
    renterPhone: source.renterPhone,
    renterAddress: source.renterAddress,
    homeownerId: source.homeownerId,
    homeownerName: source.homeownerName,
    homeownerAccountNumber: source.homeownerAccountNumber,
    homeownerBlock: source.homeownerBlock,
    homeownerLot: source.homeownerLot,
    assetCode: source.assetCode,
    assetName: source.assetName,
    assetType: source.assetType,
    assetLocation: source.assetLocation,
    startDate: source.startDate,
    endDate: source.endDate,
    monthlyRate: source.monthlyRate,
    securityDeposit: source.securityDeposit,
    billingDay: Number(source.billingDay),
    dueDay: Number(source.dueDay),
    notes: source.notes,
  };
}

export async function createRentalAgreementContractSnapshot(
  db: Prisma.TransactionClient,
  input: { tenantId: string; agreementId: string; generatedById?: string | null },
) {
  const existing = await db.$queryRaw<Array<{ id: string; contractNumber: string }>>(Prisma.sql`
    SELECT id,contractNumber
    FROM RentalAgreementDocument
    WHERE tenantId=${input.tenantId} AND agreementId=${input.agreementId} AND version=1
    LIMIT 1
    FOR UPDATE
  `);
  if (existing[0]) return existing[0];

  const source = await loadContractSource(db, input.tenantId, input.agreementId);
  if (!source) throw new Error("Rental agreement was not found for contract generation.");
  const snapshot = snapshotFromSource(source);
  const id = randomUUID();
  const number = contractNumber(snapshot.startDate, input.agreementId);
  await db.$executeRaw(Prisma.sql`
    INSERT INTO RentalAgreementDocument
      (tenantId,id,agreementId,version,contractNumber,snapshot,generatedById,generatedAt,createdAt,updatedAt)
    VALUES
      (${input.tenantId},${id},${input.agreementId},1,${number},${JSON.stringify(snapshot)},${input.generatedById ?? null},NOW(3),NOW(3),NOW(3))
  `);
  await db.auditLog.create({
    data: {
      tenantId: input.tenantId,
      actorId: input.generatedById ?? null,
      module: "RENTALS",
      action: "GENERATE_RENTAL_AGREEMENT_CONTRACT",
      entityType: "RentalAgreementDocument",
      entityId: id,
      metadata: { agreementId: input.agreementId, contractNumber: number, version: 1 },
    },
  });
  return { id, contractNumber: number };
}

async function ensureRentalAgreementContract(tenantId: string, agreementId: string) {
  return prisma.$transaction(async (tx) => createRentalAgreementContractSnapshot(tx as unknown as Prisma.TransactionClient, {
    tenantId,
    agreementId,
    generatedById: null,
  }), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function contractRow(tenantId: string, agreementId: string) {
  const rows = await prisma.$queryRaw<ContractRow[]>(Prisma.sql`
    SELECT id,tenantId,agreementId,version,contractNumber,snapshot,generatedAt,
      signedOriginalName,signedStoredName,signedContentType,signedFileSize,signedSha256,signedUploadedAt
    FROM RentalAgreementDocument
    WHERE tenantId=${tenantId} AND agreementId=${agreementId}
    ORDER BY version DESC
    LIMIT 1
  `);
  const row = rows[0];
  return row ? { ...row, snapshot: normalizeSnapshot(row.snapshot) } : null;
}

export async function getRentalAgreementContractForViewer(input: {
  tenantId: string;
  agreementId: string;
  homeownerId?: string | null;
  canReadAllRentalAgreements?: boolean;
}) {
  const accessRows = await prisma.$queryRaw<AgreementAccessRow[]>(Prisma.sql`
    SELECT a.id AS agreementId,a.status,r.homeownerId AS renterHomeownerId
    FROM RentalAgreement a
    JOIN Renter r ON r.tenantId=a.tenantId AND r.id=a.renterId
    WHERE a.tenantId=${input.tenantId} AND a.id=${input.agreementId}
    LIMIT 1
  `);
  const access = accessRows[0];
  if (!access) return null;
  const homeownerOwnsAgreement = Boolean(input.homeownerId && access.renterHomeownerId === input.homeownerId);
  if (!input.canReadAllRentalAgreements && !homeownerOwnsAgreement) return null;

  let record = await contractRow(input.tenantId, input.agreementId);
  if (!record) {
    await ensureRentalAgreementContract(input.tenantId, input.agreementId);
    record = await contractRow(input.tenantId, input.agreementId);
  }
  return record ? { ...record, agreementStatus: access.status } : null;
}

function asMoney(value: string | number) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? `PHP ${amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "PHP 0.00";
}

function prettyDate(value: string | null) {
  if (!value) return "until lawfully terminated in accordance with this Agreement";
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

function contactLine(snapshot: RentalAgreementContractSnapshot) {
  return [snapshot.associationAddress, snapshot.associationContactNumber, snapshot.associationEmail].filter(Boolean).join(" | ");
}

export function rentalAgreementContractLines(record: RentalAgreementContractRecord) {
  const s = record.snapshot;
  const renterAddress = s.renterAddress || [s.homeownerBlock && `Block ${s.homeownerBlock}`, s.homeownerLot && `Lot ${s.homeownerLot}`].filter(Boolean).join(", ") || "address on association record";
  const asset = `${s.assetName} (${s.assetCode})${s.assetLocation ? ` located at ${s.assetLocation}` : ""}`;
  const associationRegistration = [
    s.associationSecRegistrationNumber && `SEC/Registration No. ${s.associationSecRegistrationNumber}`,
    s.associationTinNumber && `TIN ${s.associationTinNumber}`,
  ].filter(Boolean).join("; ");
  const period = s.endDate ? `${prettyDate(s.startDate)} to ${prettyDate(s.endDate)}` : `starting ${prettyDate(s.startDate)} and continuing until lawfully terminated`;

  return [
    "RENTAL AGREEMENT",
    `Contract No. ${record.contractNumber}`,
    "",
    `This Rental Agreement (the \"Agreement\") is entered into by and between ${s.associationName}${associationRegistration ? ` (${associationRegistration})` : ""}, hereinafter referred to as the \"ASSOCIATION\", and ${s.renterName}, of ${renterAddress}, hereinafter referred to as the \"RENTER\". The parties agree to the following terms and conditions:`,
    "",
    `1. RENTAL ASSET. The ASSOCIATION grants the RENTER the right to use the association rental asset identified as ${asset}, subject to this Agreement, the Association's governing documents, house rules, policies, resolutions, and lawful directives.`,
    `2. TERM. The rental term shall be ${period}. Continued occupancy or use after the stated term, when permitted by the ASSOCIATION, shall remain subject to the Association's rules and any written renewal or extension approved by the parties.`,
    `3. MONTHLY RENT. The RENTER shall pay monthly rent of ${asMoney(s.monthlyRate)}. Rental billing is scheduled on day ${s.billingDay} of each applicable month and is due on day ${s.dueDay}, subject to the Association's approved billing and collection policies.`,
    `4. SECURITY DEPOSIT. The security deposit is ${asMoney(s.securityDeposit)}. Any refundable portion shall be governed by the condition of the rental asset, unsettled obligations, lawful deductions, and the Association's approved policies.`,
    "5. PERMITTED USE AND COMPLIANCE. The RENTER shall use the rental asset only for its authorized purpose and shall comply with applicable Philippine laws, ordinances, Association rules, safety requirements, and reasonable property-management instructions. The RENTER shall not assign, sublease, transfer, or allow unauthorized use without the prior written approval of the ASSOCIATION.",
    "6. CARE, DAMAGE AND TURNOVER. The RENTER shall exercise due care and shall be responsible for loss or damage attributable to the RENTER, household members, guests, employees, agents, or invitees, subject to applicable law. At the end of the rental, the asset shall be surrendered in substantially the condition received, ordinary wear and tear excepted.",
    "7. DEFAULT AND REMEDIES. Failure to pay amounts when due or a material violation of this Agreement or Association rules may result in collection measures, suspension of rental privileges, termination, recovery of possession or control of the asset, and other remedies available under the governing documents and applicable law, subject to required notice and due process.",
    "8. TERMINATION. The Agreement may be ended at the expiration of the agreed term, by mutual written agreement, for material breach, or for another lawful ground recognized by the Association's governing documents and applicable law. Accrued financial obligations survive termination until fully settled.",
    "9. ENTIRE AGREEMENT AND AMENDMENTS. This generated contract records the rental terms approved in HOAHub when the rental agreement was activated. Any amendment that changes a material contractual term should be documented in writing and approved by the parties. System billing adjustments do not by themselves amend a signed contract unless expressly agreed in writing.",
    "10. DATA AND RECORDS. The parties acknowledge that HOAHub may maintain an electronic record of this Agreement, related billing, payments, approvals, and uploaded signed copies for legitimate Association administration, audit, compliance, and record-retention purposes, subject to applicable privacy requirements.",
    "11. SEVERABILITY AND GOVERNING LAW. If any provision is held invalid or unenforceable, the remaining provisions shall continue to the extent allowed by law. This Agreement shall be interpreted under applicable laws of the Republic of the Philippines and the Association's valid governing documents.",
    s.notes ? `12. ADDITIONAL AGREED TERMS / NOTES. ${s.notes}` : "",
    "",
    "IN WITNESS WHEREOF, the parties signify their conformity to this Agreement.",
    "",
    `ASSOCIATION: ${s.associationName}`,
    "Authorized Representative: ______________________________",
    "Signature: ______________________________    Date: __________________",
    "",
    `RENTER: ${s.renterName}`,
    "Signature: ______________________________    Date: __________________",
    "",
    "Witness / Acknowledgment (if required by the Association): ______________________________",
    "",
    contactLine(s) ? `Association contact: ${contactLine(s)}` : "",
  ].filter((line) => line !== "");
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export function renderRentalAgreementContractHtml(record: RentalAgreementContractRecord) {
  const lines = rentalAgreementContractLines(record);
  const body = lines.map((line, index) => {
    if (index === 0) return `<h1>${escapeHtml(line)}</h1>`;
    if (index === 1) return `<p class="contract-number">${escapeHtml(line)}</p>`;
    if (/^\d+\./.test(line)) return `<p class="clause">${escapeHtml(line)}</p>`;
    return `<p>${escapeHtml(line)}</p>`;
  }).join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(record.contractNumber)} Rental Agreement</title><style>
    @page{size:A4;margin:18mm 18mm 20mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#111827;max-width:178mm;margin:0 auto;padding:20px;font-size:11pt;line-height:1.55}h1{text-align:center;font-size:18pt;margin:0 0 4px}.contract-number{text-align:center;font-weight:700;margin:0 0 24px}.clause{text-align:justify;margin:12px 0}p{white-space:pre-wrap}.toolbar{position:sticky;top:0;display:flex;gap:8px;justify-content:center;background:#fff;padding:10px;border-bottom:1px solid #ddd;margin-bottom:20px}.toolbar button{border:0;border-radius:8px;background:#166534;color:white;padding:10px 16px;font-weight:700;cursor:pointer}@media print{.toolbar{display:none}body{padding:0;max-width:none}}</style></head><body><div class="toolbar"><button type="button" onclick="window.print()">Print Agreement</button></div>${body}</body></html>`;
}

function safePdfText(value: string) {
  return value.normalize("NFKD").replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}

function wrapPdfText(text: string, font: Awaited<ReturnType<PDFDocument["embedFont"]>>, size: number, maxWidth: number) {
  const words = safePdfText(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) current = candidate;
    else { lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines;
}

export async function renderRentalAgreementContractPdf(record: RentalAgreementContractRecord) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const width = 595.28;
  const height = 841.89;
  const margin = 52;
  const maxWidth = width - margin * 2;
  let page = pdf.addPage([width, height]);
  let y = height - margin;

  const newPage = () => { page = pdf.addPage([width, height]); y = height - margin; };
  const drawParagraph = (text: string, options?: { bold?: boolean; centered?: boolean; size?: number; gap?: number }) => {
    const textFont = options?.bold ? bold : font;
    const size = options?.size ?? 10.5;
    const lineHeight = size * 1.45;
    const lines = wrapPdfText(text, textFont, size, maxWidth);
    for (const line of lines) {
      if (y < margin + lineHeight) newPage();
      const lineWidth = textFont.widthOfTextAtSize(line, size);
      page.drawText(line, { x: options?.centered ? (width - lineWidth) / 2 : margin, y, size, font: textFont });
      y -= lineHeight;
    }
    y -= options?.gap ?? 7;
  };

  const lines = rentalAgreementContractLines(record);
  lines.forEach((line, index) => {
    if (index === 0) drawParagraph(line, { bold: true, centered: true, size: 16, gap: 3 });
    else if (index === 1) drawParagraph(line, { bold: true, centered: true, size: 10.5, gap: 16 });
    else drawParagraph(line, { bold: /^(ASSOCIATION:|RENTER:)/.test(line), gap: /^\d+\./.test(line) ? 8 : 5 });
  });
  return pdf.save();
}

export async function renderRentalAgreementContractDocx(record: RentalAgreementContractRecord) {
  const lines = rentalAgreementContractLines(record);
  const children = lines.map((line, index) => {
    if (index === 0) return new Paragraph({ text: line, heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, spacing: { after: 80 } });
    if (index === 1) return new Paragraph({ children: [new TextRun({ text: line, bold: true })], alignment: AlignmentType.CENTER, spacing: { after: 300 } });
    return new Paragraph({
      children: [new TextRun({ text: line, bold: /^(ASSOCIATION:|RENTER:)/.test(line) })],
      alignment: /^\d+\./.test(line) ? AlignmentType.JUSTIFIED : AlignmentType.LEFT,
      spacing: { after: /^\d+\./.test(line) ? 180 : 100, line: 300 },
    });
  });
  const document = new Document({
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1020, right: 1020, bottom: 1134, left: 1020 } } },
      children,
    }],
  });
  return Packer.toBuffer(document);
}
