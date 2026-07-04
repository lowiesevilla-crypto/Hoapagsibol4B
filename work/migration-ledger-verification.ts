import { DataMigrationKind, Prisma, PrismaClient } from "@prisma/client";
import Module from "node:module";
import type { MigrationInput } from "../lib/actions/data-migrations";

const prisma = new PrismaClient();
const checks: string[] = [];
const marker = `QA ROLLBACK ${Date.now()}`;

function check(condition: unknown, label: string) {
  if (!condition) throw new Error(`FAILED: ${label}`);
  checks.push(label);
}

const period = new Date("2095-01-01T00:00:00.000Z");
const rollback = new Error("EXPECTED_VERIFICATION_ROLLBACK");

async function main() {
const moduleLoader = Module as typeof Module & { _load: (request: string, parent: unknown, isMain: boolean) => unknown };
const originalLoad = moduleLoader._load;
moduleLoader._load = function loadForVerification(request, parent, isMain) {
  if (request === "server-only") return {};
  if (request === "next/cache") return { revalidatePath() {} };
  if (request === "next/navigation") return { redirect(url: string) { throw new Error(`Unexpected redirect during ledger verification: ${url}`); } };
  if (request === "next/headers") return { cookies: async () => ({ get() { return undefined; }, set() {}, delete() {} }) };
  return originalLoad.call(this, request, parent, isMain);
};
const { postMigration } = await import("../lib/actions/data-migrations");
try {
  await prisma.$transaction(async (tx) => {
    const admin = await tx.user.findFirstOrThrow({ where: { role: { in: ["SYSTEM_ADMIN", "SUPER_ADMIN"] } } });
    const homeowner = await tx.homeownerProfile.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
    const contractor = await tx.contractorProfile.findFirst() ?? await tx.contractorProfile.create({ data: { companyName: `QA Contractor ${Date.now()}`, contactPerson: "QA Contact", phone: "09000000000", address: "Rolled back verification record", status: "ACTIVE" } });
    const input = (kind: DataMigrationKind, amount: number, remarks: string, extra: Partial<MigrationInput> = {}): MigrationInput => ({ kind, amount, remarks: `${marker} ${remarks}`, period, ...extra });

    await postMigration(tx, input(DataMigrationKind.DUES_OPENING_BALANCE, 321.23, "dues opening", { homeownerId: homeowner.id }), admin.id, admin.tenantId);
    await postMigration(tx, input(DataMigrationKind.DUES_PREVIOUS_COLLECTION, 100, "dues previous", { homeownerId: homeowner.id, referenceNumber: `${marker}-MD` }), admin.id, admin.tenantId);
    await postMigration(tx, input(DataMigrationKind.CONSTRUCTION_BOND_OPENING_BALANCE, 1000, "construction opening", { homeownerId: homeowner.id }), admin.id, admin.tenantId);
    await postMigration(tx, input(DataMigrationKind.CONSTRUCTION_BOND_PREVIOUS_COLLECTION, 500, "construction previous", { homeownerId: homeowner.id, referenceNumber: `${marker}-CB2` }), admin.id, admin.tenantId);
    await postMigration(tx, input(DataMigrationKind.CONTRACTOR_BOND_OPENING_BALANCE, 800, "contractor opening", { contractorId: contractor.id }), admin.id, admin.tenantId);
    await postMigration(tx, input(DataMigrationKind.CONTRACTOR_BOND_PREVIOUS_COLLECTION, 400, "contractor previous", { contractorId: contractor.id, referenceNumber: `${marker}-CTB2` }), admin.id, admin.tenantId);

    const [constructionBond, contractorBond] = await Promise.all([
      tx.collection.findFirstOrThrow({ where: { remarks: { contains: `${marker} construction opening` } } }),
      tx.collection.findFirstOrThrow({ where: { remarks: { contains: `${marker} contractor opening` } } }),
    ]);
    await postMigration(tx, input(DataMigrationKind.CONSTRUCTION_BOND_REFUND, 100, "construction refund", { relatedReceiptNumber: constructionBond.receiptNumber!, referenceNumber: `${marker}-CBR` }), admin.id, admin.tenantId);
    await postMigration(tx, input(DataMigrationKind.CONSTRUCTION_BOND_FORFEITURE, 50, "construction forfeiture", { relatedReceiptNumber: constructionBond.receiptNumber! }), admin.id, admin.tenantId);
    await postMigration(tx, input(DataMigrationKind.CONTRACTOR_BOND_REFUND, 80, "contractor refund", { relatedReceiptNumber: contractorBond.receiptNumber!, referenceNumber: `${marker}-CTBR` }), admin.id, admin.tenantId);
    await postMigration(tx, input(DataMigrationKind.CONTRACTOR_BOND_FORFEITURE, 40, "contractor forfeiture", { relatedReceiptNumber: contractorBond.receiptNumber! }), admin.id, admin.tenantId);

    let duplicateRejected = false;
    try {
      await postMigration(tx, input(DataMigrationKind.DUES_PREVIOUS_COLLECTION, 100, "dues previous", { homeownerId: homeowner.id, referenceNumber: `${marker}-MD` }), admin.id, admin.tenantId);
    } catch (error) {
      duplicateRejected = error instanceof Error && error.message.includes("already been posted");
    }
    check(duplicateRejected, "duplicate migration is rejected before ledger mutation");
    await postMigration(tx, input(DataMigrationKind.DUES_PREVIOUS_COLLECTION, 100, "dues previous", { homeownerId: homeowner.id, referenceNumber: `${marker}-MD`, dedupeNonce: "approved-override-verification" }), admin.id, admin.tenantId);

    const [bill, migrations, payments, collections, audits] = await Promise.all([
      tx.bill.findUniqueOrThrow({ where: { homeownerId_billingMonth: { homeownerId: homeowner.id, billingMonth: period } } }),
      tx.dataMigration.findMany({ where: { remarks: { startsWith: marker } } }),
      tx.payment.findMany({ where: { remarks: { contains: marker } } }),
      tx.collection.findMany({ where: { remarks: { contains: marker } } }),
      tx.auditLog.findMany({ where: { module: { in: ["DATA_MIGRATION", "RECEIPTS"] }, createdAt: { gte: new Date(Date.now() - 60_000) } } }),
    ]);
    check(migrations.length === 11 && migrations.some((item) => item.dedupeKey.includes("approved-override")), "all ten migration kinds and explicit duplicate override are traceable");
    check(Number(bill.amountPaid) === 200 && Number(bill.balance) === 121.23 && bill.status === "PARTIAL", "monthly dues migration recalculates paid amount, balance, and status");
    check(payments.length === 2 && payments.every((item) => /^AR-MD-2095-\d{7}$/.test(item.receiptNumber || "")), "previous dues collections receive MD receipt series");
    check(collections.some((item) => /^AR-CB-2095-\d{7}$/.test(item.receiptNumber || "")) && collections.some((item) => /^AR-CTB-2095-\d{7}$/.test(item.receiptNumber || "")), "construction and contractor bonds receive independent receipt series");
    check(collections.every((item) => item.remarks?.includes("[MIGRATED]")), "migrated bond ledger records retain visible migration tags and remarks");
    const updatedConstruction = collections.find((item) => item.id === constructionBond.id)!;
    const updatedContractor = collections.find((item) => item.id === contractorBond.id)!;
    check(Number(updatedConstruction.amountRefunded) === 100 && Number(updatedConstruction.amountForfeited) === 50, "construction refund and forfeiture update the remaining bond balance");
    check(Number(updatedContractor.amountRefunded) === 80 && Number(updatedContractor.amountForfeited) === 40, "contractor refund and forfeiture update the remaining bond balance");
    check(audits.some((item) => item.action === "POST_DUES_OPENING_BALANCE") && audits.some((item) => item.action === "GENERATE_MD_RECEIPT"), "migration and receipt generation actions write audit logs");
    throw rollback;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
} catch (error) {
  if (error !== rollback) throw error;
}

const residual = await prisma.dataMigration.count({ where: { remarks: { startsWith: marker } } });
check(residual === 0 && await prisma.receiptCounter.count({ where: { year: 2095 } }) === 0, "verification transaction rolled back records and receipt counters");
console.log(`PASS ${checks.length} migration ledger checks`);
for (const label of checks) console.log(`- ${label}`);
await prisma.$disconnect();
moduleLoader._load = originalLoad;
}

void main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
