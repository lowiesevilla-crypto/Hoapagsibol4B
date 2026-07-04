import { DocumentType, Prisma } from "@prisma/client";

export const documentTypeOptions: Array<{ value: DocumentType; label: string; prefix: string }> = [
  { value: DocumentType.CERTIFICATE_OF_RESIDENCY, label: "Certificate of Residency", prefix: "RES" },
  { value: DocumentType.CERTIFICATE_OF_GOOD_STANDING, label: "Certificate of Good Standing", prefix: "CGS" },
  { value: DocumentType.CLEARANCE_CERTIFICATE, label: "Clearance Certificate", prefix: "CLR" },
  { value: DocumentType.PAYMENT_CERTIFICATION, label: "Payment Certification", prefix: "PAY" },
  { value: DocumentType.CONSTRUCTION_BOND_CERTIFICATION, label: "Construction Bond Certification", prefix: "CB" },
  { value: DocumentType.CONTRACTOR_BOND_CERTIFICATION, label: "Contractor Bond Certification", prefix: "CTB" },
  { value: DocumentType.GATE_PASS, label: "Gate Pass", prefix: "GP" },
  { value: DocumentType.MOVE_IN_OUT_PASS, label: "Move In / Move Out Pass", prefix: "MIO" },
];

export function documentTypeLabel(type: DocumentType | string) {
  return documentTypeOptions.find((item) => item.value === type)?.label ?? type.replaceAll("_", " ");
}

export function isPassDocument(type: DocumentType) {
  return type === DocumentType.GATE_PASS || type === DocumentType.MOVE_IN_OUT_PASS;
}

export async function allocateDocumentNumber(tx: Prisma.TransactionClient, tenantId: string, type: DocumentType, date = new Date()) {
  const year = date.getUTCFullYear();
  const counter = await tx.documentCounter.upsert({ where: { tenantId_type_year: { tenantId, type, year } }, create: { tenantId, type, year, lastNumber: 1 }, update: { lastNumber: { increment: 1 } }, select: { lastNumber: true } });
  if (type === DocumentType.CERTIFICATE_OF_RESIDENCY) return `CR-${year}-${String(counter.lastNumber).padStart(6, "0")}`;
  const prefix = documentTypeOptions.find((item) => item.value === type)?.prefix ?? "DOC";
  return `DOC-${prefix}-${year}-${String(counter.lastNumber).padStart(6, "0")}`;
}

export function renderDocumentTemplate(template: string, values: Record<string, string>) {
  return template.replace(/{{\s*([A-Za-z0-9_]+)\s*}}/g, (_match, key: string) => values[key] ?? "");
}

export const documentPlaceholders = [
  "association_name", "association_address", "association_contact", "association_email", "sec_registration_number",
  "homeowner_name", "property_address", "block_lot", "document_number", "request_date", "approval_date", "validity_date",
  "processed_by", "approved_by", "qr_verification_code", "remarks",
  "issue_day_ordinal", "issue_month_year", "office_location", "age", "civil_status", "citizenship", "occupation", "residency_date", "phase", "property_type", "occupancy_status", "contact_number",
  "associationName", "homeownerName", "propertyAddress", "block", "lot", "purpose", "issueDate", "validityDate",
  "scheduledDate", "startTime", "endTime", "passType", "vehicleDetails", "partyName", "contractorDetails",
  "totalPayments", "constructionBondBalance", "documentNumber",
];
