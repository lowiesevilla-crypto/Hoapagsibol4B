import "server-only";

import { AgreementTemplateVersionStatus, TenantAgreementStatus } from "@prisma/client";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { platformPrisma as prisma } from "@/lib/db";

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 46;
const BODY_WIDTH = A4_WIDTH - MARGIN * 2;

export async function getAgreementDocument(agreementId: string) {
  return prisma.tenantSubscriptionAgreement.findUnique({
    where: { id: agreementId },
    include: {
      templateVersion: { include: { template: true } },
      auditEvents: { orderBy: { createdAt: "asc" } },
    },
  });
}

export type AgreementDocument = NonNullable<Awaited<ReturnType<typeof getAgreementDocument>>>;

export function agreementPdfUrl(agreementId: string) {
  return `/api/subscription/agreements/${encodeURIComponent(agreementId)}/pdf`;
}

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

function formatDateTime(value: Date) {
  return value.toLocaleString("en-PH", {
    year: "numeric",
    month: "long",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  });
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const lines: string[] = [];
  const words = pdfSafe(text).trim().split(/\s+/).filter(Boolean);
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
  return lines.length ? lines : [""];
}

function isMajorHeading(line: string) {
  return /^\d+\.\s+[A-Z][A-Z\s,&/-]+$/.test(line) || /^ELECTRONIC ACCEPTANCE$/.test(line) || /^CUSTOMER AUTHORIZED REPRESENTATIVE$/.test(line) || /^PROVIDER$/.test(line);
}

function isCoverHeading(line: string) {
  return /^HOAHUB SOFTWARE SUBSCRIPTION AND SERVICES AGREEMENT$/.test(line) || /^COMMERCIAL ORDER$/.test(line);
}

function templateWarning(agreement: AgreementDocument) {
  if (agreement.status === TenantAgreementStatus.SIGNED) return "SIGNED ELECTRONICALLY";
  if (agreement.templateVersion.status !== AgreementTemplateVersionStatus.ACTIVE && agreement.templateVersion.status !== AgreementTemplateVersionStatus.RETIRED) {
    return "DRAFT - PENDING LEGAL APPROVAL - NOT FOR SIGNATURE";
  }
  return "DRAFT / UNEXECUTED COPY";
}

export async function renderAgreementPdf(agreement: AgreementDocument) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${agreement.title} ${agreement.agreementNumber}`);
  pdf.setSubject("HOAHub tenant software subscription agreement");
  pdf.setCreator("HOAHub");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0.04, 0.23, 0.34);
  const blue = rgb(0.03, 0.55, 0.79);
  const ink = rgb(0.08, 0.17, 0.23);
  const muted = rgb(0.40, 0.47, 0.53);
  const pale = rgb(0.95, 0.98, 0.99);
  const border = rgb(0.84, 0.90, 0.93);
  const green = rgb(0.04, 0.43, 0.34);

  let page = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
  let y = 0;
  const pages: PDFPage[] = [page];

  const decoratePage = () => {
    page.drawRectangle({ x: 0, y: A4_HEIGHT - 72, width: A4_WIDTH, height: 72, color: navy });
    page.drawText("HOAHub", { x: MARGIN, y: A4_HEIGHT - 42, size: 18, font: bold, color: rgb(1, 1, 1) });
    page.drawText(pdfSafe(agreement.agreementNumber), { x: A4_WIDTH - MARGIN - 160, y: A4_HEIGHT - 40, size: 9, font: bold, color: rgb(0.84, 0.95, 1) });
    page.drawText(templateWarning(agreement), { x: MARGIN, y: A4_HEIGHT - 59, size: 6.8, font: bold, color: agreement.status === TenantAgreementStatus.SIGNED ? rgb(0.75, 1, 0.83) : rgb(1, 0.88, 0.56) });
    y = A4_HEIGHT - 100;
  };

  const addPage = () => {
    page = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
    pages.push(page);
    decoratePage();
  };

  const ensureSpace = (height: number) => {
    if (y - height < 58) addPage();
  };

  decoratePage();
  const bodyLines = agreement.renderedContent.split(/\r?\n/);
  for (const raw of bodyLines) {
    const line = raw.trim();
    if (!line) {
      y -= 7;
      continue;
    }
    const cover = isCoverHeading(line);
    const heading = isMajorHeading(line);
    const labelLine = /^(Version|Agreement No\.|Plan|Billing Frequency|Subscription Fee|Discount Per Billing Cycle|Currency|Subscription Start|Initial Term|Initial Term End|Auto-Renewal|Payment Terms|Enabled Modules):/.test(line);
    const size = cover ? 14 : heading ? 10.8 : 8.8;
    const lineHeight = cover ? 19 : heading ? 15 : 12.2;
    const font = cover || heading || labelLine ? bold : regular;
    const color = cover ? navy : heading ? blue : ink;
    const indent = /^\d+\.\d+\s/.test(line) ? 10 : 0;
    const wrapped = wrapText(line, font, size, BODY_WIDTH - indent);
    ensureSpace(wrapped.length * lineHeight + (cover || heading ? 8 : 2));
    if (cover || heading) y -= 4;
    for (const text of wrapped) {
      page.drawText(text || " ", { x: MARGIN + indent, y, size, font, color });
      y -= lineHeight;
    }
    if (cover || heading) y -= 5;
  }

  ensureSpace(155);
  y -= 12;
  page.drawRectangle({ x: MARGIN, y: y - 120, width: BODY_WIDTH, height: 120, color: pale, borderColor: border, borderWidth: 0.8 });
  page.drawText("ELECTRONIC EXECUTION CERTIFICATE", { x: MARGIN + 14, y: y - 22, size: 9.5, font: bold, color: navy });
  if (agreement.status === TenantAgreementStatus.SIGNED && agreement.signedAt) {
    const certificate = [
      `Signer: ${agreement.signerName || "Recorded signer"}`,
      `Capacity: ${agreement.signerTitle || "Recorded capacity"}`,
      `Email: ${agreement.signerEmail || "Recorded email"}`,
      `Signed: ${formatDateTime(agreement.signedAt)}`,
      `Agreement SHA-256: ${agreement.contentHash}`,
      `Signed record SHA-256: ${agreement.signedContentHash || "Not recorded"}`,
    ];
    let cy = y - 40;
    for (const line of certificate) {
      const wrapped = wrapText(line, regular, 7.8, BODY_WIDTH - 28);
      for (const text of wrapped) {
        page.drawText(text, { x: MARGIN + 14, y: cy, size: 7.8, font: regular, color: ink });
        cy -= 10.5;
      }
    }
    page.drawText("Identity verification, network metadata, and signing events are retained in the HOAHub agreement audit trail.", { x: MARGIN + 14, y: y - 108, size: 6.8, font: regular, color: green });
  } else {
    page.drawText("This copy has not been electronically executed. No signature certificate has been issued.", { x: MARGIN + 14, y: y - 44, size: 8.5, font: bold, color: muted });
    page.drawText(`Agreement SHA-256: ${agreement.contentHash}`, { x: MARGIN + 14, y: y - 65, size: 7.5, font: regular, color: ink });
    page.drawText("Electronic signing becomes available only for an agreement issued from an approved HOAHub legal template.", { x: MARGIN + 14, y: y - 87, size: 7.4, font: regular, color: muted });
  }

  const totalPages = pages.length;
  pages.forEach((target, index) => {
    target.drawLine({ start: { x: MARGIN, y: 40 }, end: { x: A4_WIDTH - MARGIN, y: 40 }, thickness: 0.5, color: border });
    target.drawText(`HOAHub Agreement ${pdfSafe(agreement.agreementNumber)}`, { x: MARGIN, y: 24, size: 6.5, font: regular, color: muted });
    const pageText = `Page ${index + 1} of ${totalPages}`;
    target.drawText(pageText, { x: A4_WIDTH - MARGIN - regular.widthOfTextAtSize(pageText, 6.5), y: 24, size: 6.5, font: regular, color: muted });
  });

  return pdf.save();
}
