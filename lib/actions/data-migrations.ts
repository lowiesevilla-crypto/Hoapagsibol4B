"use server";

import { Permission } from "@/lib/authorization/permissions";
import { requirePermission } from "@/lib/authorization/guards";
import { randomUUID } from "node:crypto";
import { BillStatus, CollectionType, DataMigrationKind, DataMigrationTag, PaymentMethod, PayerType, Prisma, RefundStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { buildPaymentCoverage, migratedPaymentCoverageDisplay } from "@/lib/payment-coverage";
import { recalculateBillFromActivePayments } from "@/lib/services/payment-ledger";
import { allocateReceiptNumber, collectionReceiptSeries } from "@/lib/services/receipt";
import { monthLabel } from "@/lib/utils";

export type MigrationImportState = { success: boolean; message: string; imported: number; errors: string[] };

export type MigrationInput = {
  kind: DataMigrationKind;
  homeownerId?: string;
  contractorId?: string;
  period?: Date;
  amount: number;
  remarks: string;
  referenceNumber?: string;
  relatedReceiptNumber?: string;
  dedupeNonce?: string;
};

const openingKinds = new Set<DataMigrationKind>([
  DataMigrationKind.DUES_OPENING_BALANCE,
  DataMigrationKind.CONSTRUCTION_BOND_OPENING_BALANCE,
  DataMigrationKind.CONTRACTOR_BOND_OPENING_BALANCE,
]);
const duesKinds = new Set<DataMigrationKind>([DataMigrationKind.DUES_OPENING_BALANCE, DataMigrationKind.DUES_PREVIOUS_COLLECTION]);
const homeownerKinds = new Set<DataMigrationKind>([
  ...duesKinds,
  DataMigrationKind.CONSTRUCTION_BOND_OPENING_BALANCE,
  DataMigrationKind.CONSTRUCTION_BOND_PREVIOUS_COLLECTION,
]);
const contractorKinds = new Set<DataMigrationKind>([
  DataMigrationKind.CONTRACTOR_BOND_OPENING_BALANCE,
  DataMigrationKind.CONTRACTOR_BOND_PREVIOUS_COLLECTION,
]);
const adjustmentKinds = new Set<DataMigrationKind>([
  DataMigrationKind.CONSTRUCTION_BOND_REFUND,
  DataMigrationKind.CONTRACTOR_BOND_REFUND,
  DataMigrationKind.CONSTRUCTION_BOND_FORFEITURE,
  DataMigrationKind.CONTRACTOR_BOND_FORFEITURE,
]);

export async function postDataMigrationAction(formData: FormData) {
  const admin = await requirePermission(Permission.DATA_MIGRATE);
  let input: MigrationInput;
  try {
    input = parseManualInput(formData);
    await prisma.$transaction((tx) => postMigration(tx as unknown as Prisma.TransactionClient, input, admin.id, admin.tenantId), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    redirect(`/admin/data/migrations?error=${encodeURIComponent(error instanceof Error ? error.message : "Migration entry could not be posted.")}`);
  }
  revalidateMigrationPages();
  redirect("/admin/data/migrations?success=posted&message=Migration%20entry%20posted%20and%20balances%20recalculated.");
}

export async function importDataMigrationsAction(_state: MigrationImportState, formData: FormData): Promise<MigrationImportState> {
  const admin = await requirePermission(Permission.DATA_MIGRATE);
  const file = formData.get("file");
  if (!isUploadedFile(file) || !file.size) return failure("Upload a CSV file.", ["CSV file is required."]);
  if (file.size > 2 * 1024 * 1024) return failure("Upload is too large.", ["CSV files are limited to 2 MB."]);
  const parsed = parseCsv(await file.text());
  const required = ["kind", "amount", "remarks"];
  const missing = required.filter((field) => !parsed.headers.includes(field));
  if (missing.length) return failure("Template validation failed.", missing.map((field) => `Missing required column: ${field}`));
  if (!parsed.rows.length) return failure("No records found.", ["CSV file does not contain data rows."]);

  const homeownerEmails = [...new Set(parsed.rows.map((row) => value(row, "homeownerEmail").toLowerCase()).filter(Boolean))];
  const [homeowners, contractors] = await Promise.all([
    prisma.homeownerProfile.findMany({ where: { user: { email: { in: homeownerEmails } } }, include: { user: true } }),
    prisma.contractorProfile.findMany({ where: { companyName: { in: parsed.rows.map((row) => value(row, "contractorCompany")).filter(Boolean) } } }),
  ]);
  const homeownerByEmail = new Map(homeowners.map((item) => [item.user.email.toLowerCase(), item.id]));
  const contractorByCompany = new Map(contractors.map((item) => [item.companyName.toLowerCase(), item.id]));
  const errors: string[] = [];
  const inputs: MigrationInput[] = [];
  const seen = new Set<string>();

  parsed.rows.forEach((row, index) => {
    try {
      const input = parseRowInput(row, homeownerByEmail, contractorByCompany);
      if (["1", "true", "yes"].includes(value(row, "allowDuplicate").toLowerCase())) input.dedupeNonce = `approved-override-${Date.now()}-${index}`;
      const key = migrationDedupeKey(input);
      if (seen.has(key)) throw new Error("Duplicate entry inside this upload.");
      seen.add(key);
      inputs.push(input);
    } catch (error) {
      errors.push(`Row ${index + 2}: ${error instanceof Error ? error.message : "Invalid data."}`);
    }
  });
  if (errors.length) return failure("Upload has validation errors. No entries were posted.", errors);

  const duplicateKeys = await prisma.dataMigration.findMany({ where: { dedupeKey: { in: inputs.map(migrationDedupeKey) } }, select: { dedupeKey: true } });
  if (duplicateKeys.length) return failure("Duplicate migrations found. No entries were posted.", duplicateKeys.map((item) => `Already posted: ${item.dedupeKey}`));

  try {
    await prisma.$transaction(async (tx) => {
      for (const input of inputs) await postMigration(tx as unknown as Prisma.TransactionClient, input, admin.id, admin.tenantId);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
  } catch (error) {
    return failure("Import could not be posted. No entries were saved.", [error instanceof Error ? error.message : "Database error."]);
  }
  revalidateMigrationPages();
  return { success: true, message: `${inputs.length} migration entr${inputs.length === 1 ? "y" : "ies"} posted successfully.`, imported: inputs.length, errors: [] };
}

export async function postMigration(tx: Prisma.TransactionClient, input: MigrationInput, actorId: string, tenantId: string) {
  validateInput(input);
  const dedupeKey = migrationDedupeKey(input);
  if (await tx.dataMigration.count({ where: { tenantId, dedupeKey } })) throw new Error("This migration entry has already been posted.");
  const tag = openingKinds.has(input.kind) ? DataMigrationTag.OPENING_BALANCE : input.kind.toString().includes("PREVIOUS_COLLECTION") ? DataMigrationTag.PREVIOUS_COLLECTION : DataMigrationTag.MIGRATED;
  const note = `[MIGRATED][${tag}] ${input.remarks}`;
  let postedRecordType = "";
  let postedRecordId = "";
  let homeownerId = input.homeownerId;
  let contractorId = input.contractorId;

  if (input.kind === DataMigrationKind.DUES_OPENING_BALANCE) {
    const period = input.period!;
    if (await tx.bill.count({ where: { tenantId, homeownerId: input.homeownerId!, billingMonth: period } })) throw new Error("A billing record already exists for this homeowner and period.");
    const dueDate = monthEnd(period);
    const coverage = periodCoverage(period);
    const bill = await tx.bill.create({ data: { tenantId, homeownerId: input.homeownerId!, billingMonth: period, ...coverage, amount: input.amount, penalty: 0, totalAmount: input.amount, amountPaid: 0, balance: input.amount, dueDate, status: dueDate < todayUtc() ? BillStatus.OVERDUE : BillStatus.UNPAID, notes: note } });
    postedRecordType = "Bill";
    postedRecordId = bill.id;
  } else if (input.kind === DataMigrationKind.DUES_PREVIOUS_COLLECTION) {
    const period = input.period!;
    let bill = await tx.bill.findFirst({ where: { tenantId, homeownerId: input.homeownerId!, billingMonth: period } });
    if (!bill) {
      const dueDate = monthEnd(period);
      const coverage = periodCoverage(period);
      bill = await tx.bill.create({ data: { tenantId, homeownerId: input.homeownerId!, billingMonth: period, ...coverage, amount: input.amount, penalty: 0, totalAmount: input.amount, amountPaid: 0, balance: input.amount, dueDate, status: BillStatus.UNPAID, notes: note } });
    }
    const paymentDate = input.period ?? new Date();
    const receiptNumber = await allocateReceiptNumber(tx, tenantId, paymentDate, "MD");
    const coverage = buildPaymentCoverage([bill.billingMonth]);
    const payment = await tx.payment.create({ data: { billId: null, homeownerId: input.homeownerId!, amount: input.amount, paymentDate, method: PaymentMethod.OTHER, referenceNumber: input.referenceNumber, paymentBatchId: randomUUID(), ...coverage, paymentCoverageDisplay: migratedPaymentCoverageDisplay(), receiptNumber, remarks: note, processedById: actorId } });
    await tx.paymentAllocation.create({ data: { tenantId, paymentId: payment.id, billId: bill.id, amount: input.amount, coverageYear: bill.coverageYear, coverageMonth: bill.coverageMonth, coverageLabel: monthLabel(bill.billingMonth) } });
    await recalculateBillFromActivePayments(tx, bill);
    await receiptAudit(tx, actorId, "MD", "Payment", payment.id, receiptNumber, input.amount);
    postedRecordType = "Payment";
    postedRecordId = payment.id;
  } else if (!adjustmentKinds.has(input.kind)) {
    const isConstruction = input.kind.toString().startsWith("CONSTRUCTION_BOND");
    const type = isConstruction ? CollectionType.CONSTRUCTION_BOND : CollectionType.CONTRACTOR_BOND;
    const collectionDate = input.period ?? new Date();
    const series = collectionReceiptSeries(type);
    const receiptNumber = await allocateReceiptNumber(tx, tenantId, collectionDate, series);
    const collection = await tx.collection.create({ data: { type, payerType: isConstruction ? PayerType.HOMEOWNER : PayerType.CONTRACTOR, homeownerId: isConstruction ? input.homeownerId : null, contractorId: isConstruction ? null : input.contractorId, amount: input.amount, collectionDate, method: PaymentMethod.OTHER, referenceNumber: input.referenceNumber, receiptNumber, remarks: note, refundable: true, refundStatus: RefundStatus.HELD, createdById: actorId } });
    await receiptAudit(tx, actorId, series, "Collection", collection.id, receiptNumber, input.amount);
    postedRecordType = "Collection";
    postedRecordId = collection.id;
  } else {
    const collection = await tx.collection.findFirst({ where: { receiptNumber: input.relatedReceiptNumber! } });
    if (!collection || !collection.refundable) throw new Error("The related refundable bond receipt was not found.");
    const expectsConstruction = input.kind.toString().startsWith("CONSTRUCTION_BOND");
    if ((expectsConstruction && collection.type !== CollectionType.CONSTRUCTION_BOND) || (!expectsConstruction && collection.type !== CollectionType.CONTRACTOR_BOND)) throw new Error("The related receipt belongs to a different bond type.");
    const available = Number(collection.amount) - Number(collection.amountRefunded) - Number(collection.amountForfeited);
    if (input.amount > available) throw new Error("Adjustment exceeds the remaining bond balance.");
    homeownerId = collection.homeownerId ?? undefined;
    contractorId = collection.contractorId ?? undefined;
    if (input.kind.toString().endsWith("REFUND")) {
      const refund = await tx.bondRefund.create({ data: { collectionId: collection.id, amount: input.amount, refundDate: input.period ?? new Date(), method: PaymentMethod.OTHER, referenceNumber: input.referenceNumber, remarks: note, processedById: actorId } });
      const amountRefunded = Number(collection.amountRefunded) + input.amount;
      const remaining = Number(collection.amount) - amountRefunded - Number(collection.amountForfeited);
      await tx.collection.update({ where: { id: collection.id }, data: { amountRefunded, refundStatus: remaining <= 0 ? RefundStatus.REFUNDED : RefundStatus.PARTIALLY_REFUNDED } });
      postedRecordType = "BondRefund";
      postedRecordId = refund.id;
    } else {
      const amountForfeited = Number(collection.amountForfeited) + input.amount;
      const remaining = Number(collection.amount) - Number(collection.amountRefunded) - amountForfeited;
      await tx.collection.update({ where: { id: collection.id }, data: { amountForfeited, refundStatus: remaining <= 0 ? RefundStatus.FORFEITED : RefundStatus.HELD, forfeitedAt: input.period ?? new Date(), forfeitedById: actorId, remarks: [collection.remarks, note].filter(Boolean).join("\n") } });
      postedRecordType = "CollectionForfeiture";
      postedRecordId = collection.id;
    }
  }

  const migration = await tx.dataMigration.create({ data: { kind: input.kind, tag, homeownerId: homeownerId || null, contractorId: contractorId || null, period: input.period || null, amount: input.amount, remarks: input.remarks, referenceNumber: input.referenceNumber || null, relatedReceiptNumber: input.relatedReceiptNumber || null, postedRecordType, postedRecordId, dedupeKey, createdById: actorId } });
  await tx.auditLog.create({ data: { actorId, module: "DATA_MIGRATION", action: `POST_${input.kind}`, entityType: "DataMigration", entityId: migration.id, metadata: { tag, amount: input.amount, homeownerId, contractorId, period: input.period, postedRecordType, postedRecordId, duplicateOverride: Boolean(input.dedupeNonce) } } });
  return migration;
}

function parseManualInput(formData: FormData): MigrationInput {
  const rawKind = String(formData.get("kind") || "");
  if (!Object.values(DataMigrationKind).includes(rawKind as DataMigrationKind)) throw new Error("Select a valid migration type.");
  const rawPeriod = String(formData.get("period") || "");
  return { kind: rawKind as DataMigrationKind, homeownerId: clean(formData.get("homeownerId")), contractorId: clean(formData.get("contractorId")), period: rawPeriod ? parseDate(rawPeriod) : undefined, amount: Number(formData.get("amount")), remarks: String(formData.get("remarks") || "").trim(), referenceNumber: clean(formData.get("referenceNumber")), relatedReceiptNumber: clean(formData.get("relatedReceiptNumber")), dedupeNonce: formData.get("allowDuplicate") === "on" ? `approved-override-${randomUUID()}` : undefined };
}

function parseRowInput(row: Record<string, string>, homeownerByEmail: Map<string, string>, contractorByCompany: Map<string, string>): MigrationInput {
  const rawKind = value(row, "kind") as DataMigrationKind;
  if (!Object.values(DataMigrationKind).includes(rawKind)) throw new Error(`Invalid kind: ${rawKind || "blank"}.`);
  const email = value(row, "homeownerEmail").toLowerCase();
  const company = value(row, "contractorCompany").toLowerCase();
  if (email && !homeownerByEmail.has(email)) throw new Error(`Homeowner email not found: ${email}.`);
  if (company && !contractorByCompany.has(company)) throw new Error(`Contractor company not found: ${value(row, "contractorCompany")}.`);
  const period = value(row, "period");
  const input = { kind: rawKind, homeownerId: email ? homeownerByEmail.get(email) : undefined, contractorId: company ? contractorByCompany.get(company) : undefined, period: period ? parseDate(period) : undefined, amount: Number(value(row, "amount")), remarks: value(row, "remarks"), referenceNumber: value(row, "referenceNumber") || undefined, relatedReceiptNumber: value(row, "relatedReceiptNumber") || undefined };
  validateInput(input);
  return input;
}

function validateInput(input: MigrationInput) {
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Amount must be greater than zero.");
  if (!input.remarks || input.remarks.length < 3) throw new Error("Remarks are required for audit and migration history.");
  if (input.remarks.length > 1000) throw new Error("Remarks must not exceed 1,000 characters.");
  if (duesKinds.has(input.kind) && !input.period) throw new Error("Billing period is required for monthly dues migration.");
  if (homeownerKinds.has(input.kind) && !input.homeownerId) throw new Error("Select the homeowner for this migration type.");
  if (contractorKinds.has(input.kind) && !input.contractorId) throw new Error("Select the contractor for this migration type.");
  if (adjustmentKinds.has(input.kind) && !input.relatedReceiptNumber) throw new Error("Related bond receipt number is required for refund or forfeiture migration.");
}

function migrationDedupeKey(input: MigrationInput) {
  return [input.kind, input.homeownerId || "", input.contractorId || "", input.period?.toISOString().slice(0, 10) || "", input.amount.toFixed(2), input.referenceNumber?.toLowerCase() || "", input.relatedReceiptNumber?.toLowerCase() || "", input.dedupeNonce || ""].join(":");
}

async function receiptAudit(tx: Prisma.TransactionClient, actorId: string, series: string, entityType: string, entityId: string, receiptNumber: string, amount: number) {
  await tx.auditLog.create({ data: { actorId, module: "RECEIPTS", action: `GENERATE_${series}_RECEIPT`, entityType, entityId, metadata: { receiptNumber, amount, source: "DATA_MIGRATION" } } });
}

function revalidateMigrationPages() {
  for (const path of ["/admin/data/migrations", "/admin/billing", "/admin/collections", "/admin/reports", "/portal/billing", "/portal/payments", "/portal/collections", "/portal/dashboard"]) revalidatePath(path);
}
function parseDate(input: string) { const date = new Date(`${input}T00:00:00.000Z`); if (!/^\d{4}-\d{2}-\d{2}$/.test(input) || Number.isNaN(date.valueOf())) throw new Error(`Invalid date: ${input}. Use YYYY-MM-DD.`); return date; }
function periodCoverage(date: Date) { return { coverageYear: date.getUTCFullYear(), coverageMonth: date.getUTCMonth() + 1 }; }
function todayUtc() { const now = new Date(); return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())); }
function monthEnd(date: Date) { return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)); }
function clean(value: FormDataEntryValue | null) { return String(value || "").trim() || undefined; }
function failure(message: string, errors: string[]): MigrationImportState { return { success: false, message, imported: 0, errors }; }
function value(row: Record<string, string>, field: string) { return String(row[field] || "").trim(); }
function isUploadedFile(file: FormDataEntryValue | null): file is File { return typeof file === "object" && file !== null && "size" in file && "text" in file; }
function parseCsv(input: string) {
  const records: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  for (let i = 0; i < input.length; i++) { const char = input[i]; const next = input[i + 1]; if (quoted && char === '"' && next === '"') { cell += '"'; i++; } else if (char === '"') quoted = !quoted; else if (!quoted && char === ",") { row.push(cell.trim()); cell = ""; } else if (!quoted && (char === "\n" || char === "\r")) { if (char === "\r" && next === "\n") i++; row.push(cell.trim()); if (row.some(Boolean)) records.push(row); row = []; cell = ""; } else cell += char; }
  row.push(cell.trim()); if (row.some(Boolean)) records.push(row); const headers = (records.shift() || []).map((item) => item.trim()); return { headers, rows: records.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]))) };
}
