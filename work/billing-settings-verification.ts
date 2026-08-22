import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient, TenantModule } from "@prisma/client";
import { resolveGcashQrImage, removeStoredGcashQrImage } from "../lib/gcash-qr";
import { updatePaymentAmountLedger, voidPaymentLedger } from "../lib/services/payment-ledger";
import { paymentAmountUpdateSchema } from "../lib/validation";
import { setTenantContext } from "../lib/tenant-context";

const envText = readFileSync(path.join(process.cwd(), ".env"), "utf8");
const databaseUrl = envText.match(/^DATABASE_URL="?([^"\r\n]+)"?/m)?.[1];
if (!databaseUrl) throw new Error("DATABASE_URL not found in .env");
process.env.DATABASE_URL = databaseUrl;

const prisma = new PrismaClient();
const pngBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNkYGD4z8DAwMDEAAUADikBAQvI8WQAAAAASUVORK5CYII=", "base64");
const marker = `BILLING-QA-${Date.now()}`;
let billId = "";
let paymentId = "";
let archiveId = "";
const temporaryQrUrls: string[] = [];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`PASS: ${message}`);
}

async function main() {
  const actor = await prisma.user.findFirstOrThrow({ where: { role: { in: ["SYSTEM_ADMIN", "ADMIN"] } }, orderBy: { role: "asc" } });
  setTenantContext({ tenantId: actor.tenantId, role: actor.role, platform: false, enabledModules: new Set(Object.values(TenantModule)) });
  const homeowner = await prisma.homeownerProfile.findFirstOrThrow({ include: { user: true }, orderBy: { createdAt: "asc" } });
  const previousQrSetting = await prisma.systemSetting.findUnique({ where: { tenantId_category_key: { tenantId: actor.tenantId, category: "PAYMENT", key: "GCASH_QR_IMAGE_URL" } } });

  try {
    const firstForm = new FormData();
    firstForm.set("GCASH_QR_IMAGE_FILE", new File([pngBytes], "gcash-qr.png", { type: "image/png" }));
    const firstQr = await resolveGcashQrImage(firstForm, "pagsibol4b", null);
    assert(Boolean(firstQr.url?.endsWith(".png")), "GCash QR PNG upload is stored with an internal application path");
    temporaryQrUrls.push(firstQr.url!);
    await setQrValue(actor.tenantId, firstQr.url!, actor.id);
    assert((await currentQrValue(actor.tenantId)) === firstQr.url, "uploaded GCash QR path is saved in system settings");
    assert(existsSync(qrDiskPath(firstQr.url!)), "uploaded GCash QR file exists in application storage");

    const replacementForm = new FormData();
    replacementForm.set("GCASH_QR_IMAGE_FILE", new File([pngBytes], "replacement.webp", { type: "image/webp" }));
    const replacementQr = await resolveGcashQrImage(replacementForm, "pagsibol4b", firstQr.url);
    assert(Boolean(replacementQr.url?.endsWith(".webp")) && replacementQr.obsoleteUrl === firstQr.url, "GCash QR replacement returns the new path and old file reference");
    temporaryQrUrls.push(replacementQr.url!);
    await setQrValue(actor.tenantId, replacementQr.url!, actor.id);
    await removeStoredGcashQrImage("pagsibol4b", replacementQr.obsoleteUrl);
    assert(!existsSync(qrDiskPath(firstQr.url!)) && existsSync(qrDiskPath(replacementQr.url!)), "replacing GCash QR removes the old stored image");

    const removeForm = new FormData();
    removeForm.set("GCASH_QR_IMAGE_REMOVE", "on");
    const removedQr = await resolveGcashQrImage(removeForm, "pagsibol4b", replacementQr.url);
    await setQrValue(actor.tenantId, removedQr.url, actor.id);
    await removeStoredGcashQrImage("pagsibol4b", removedQr.obsoleteUrl);
    assert((await currentQrValue(actor.tenantId)) === "" && !existsSync(qrDiskPath(replacementQr.url!)), "Admin can remove the current GCash QR image");

    const invalidForm = new FormData();
    invalidForm.set("GCASH_QR_IMAGE_FILE", new File([Buffer.from("bad")], "qr.txt", { type: "text/plain" }));
    let invalidRejected = false;
    try { await resolveGcashQrImage(invalidForm, "pagsibol4b", null); } catch (error) { invalidRejected = error instanceof Error && error.message.includes("JPG"); }
    assert(invalidRejected, "unsupported GCash QR file types are rejected");

    const oversizedForm = new FormData();
    oversizedForm.set("GCASH_QR_IMAGE_FILE", new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.png", { type: "image/png" }));
    let oversizedRejected = false;
    try { await resolveGcashQrImage(oversizedForm, "pagsibol4b", null); } catch (error) { oversizedRejected = error instanceof Error && error.message.includes("5MB"); }
    assert(oversizedRejected, "GCash QR files over 5MB are rejected");

    const billingMonth = await findUnusedBillingMonth(homeowner.id);
    const bill = await prisma.bill.create({ data: { homeownerId: homeowner.id, billingMonth, coverageYear: billingMonth.getUTCFullYear(), coverageMonth: billingMonth.getUTCMonth() + 1, amount: 1000, totalAmount: 1000, amountPaid: 400, balance: 600, dueDate: new Date(Date.UTC(billingMonth.getUTCFullYear(), billingMonth.getUTCMonth(), 28)), status: "PARTIAL", notes: marker } });
    billId = bill.id;
    const payment = await prisma.payment.create({ data: { billId: bill.id, homeownerId: homeowner.id, amount: 400, paymentDate: new Date(), method: "GCASH", referenceNumber: marker, receiptNumber: marker, remarks: marker } });
    paymentId = payment.id;

    const updated = await updatePaymentAmountLedger({ paymentId: payment.id, amount: 1250, actor, reason: `${marker} overpayment verification` });
    assert(updated.previousAmount === 400 && updated.newAmount === 1250, "authorized payment amount update records old and new amounts");
    const updatedBill = await prisma.bill.findUniqueOrThrow({ where: { id: bill.id } });
    assert(Number(updatedBill.amountPaid) === 1250 && Number(updatedBill.balance) === 0 && updatedBill.status === "PAID", "overpayment recalculates total paid, zero balance, and PAID status");
    const updateAudit = await prisma.auditLog.findFirst({ where: { action: "UPDATE_PAYMENT_AMOUNT", entityId: payment.id }, orderBy: { createdAt: "desc" } });
    const auditMetadata = updateAudit?.metadata as Record<string, unknown> | undefined;
    assert(Boolean(updateAudit) && auditMetadata?.previousAmount === 400 && auditMetadata?.newAmount === 1250 && Boolean(auditMetadata?.updatedBy) && Boolean(auditMetadata?.updatedAt) && Boolean(auditMetadata?.reason), "payment amount update writes a complete audit log");

    const voided = await voidPaymentLedger({ paymentId: payment.id, actor, reason: `${marker} void verification` });
    if (!voided.archiveId) throw new Error("FAILED: voiding a billed payment must create a transaction archive");
    archiveId = voided.archiveId;
    const [voidedPayment, archive, recalculatedBill] = await Promise.all([
      prisma.payment.findUniqueOrThrow({ where: { id: payment.id } }),
      prisma.paymentArchive.findUniqueOrThrow({ where: { originalPaymentId: payment.id } }),
      prisma.bill.findUniqueOrThrow({ where: { id: bill.id } }),
    ]);
    assert(voidedPayment.status === "VOIDED" && Boolean(voidedPayment.voidedAt), "voided payment is removed from ACTIVE status");
    assert(Number(archive.amount) === 1250 && archive.homeownerName === homeowner.user.name && archive.referenceNumber === marker && Boolean(archive.voidedById) && Boolean(archive.voidedAt) && Boolean(archive.voidReason), "void archive stores transaction, homeowner, amount, reference, actor, date, and reason");
    assert(Number(recalculatedBill.amountPaid) === 0 && Number(recalculatedBill.balance) === 1000 && recalculatedBill.status === "UNPAID", "voiding recalculates billing paid amount, balance, and status");
    assert(await prisma.payment.count({ where: { id: payment.id, status: "ACTIVE" } }) === 0, "voided transaction is absent from active payment queries");
    assert(paymentAmountUpdateSchema.safeParse({ id: payment.id, amount: "1.00" }).success && !paymentAmountUpdateSchema.safeParse({ id: payment.id, amount: "0" }).success, "payment amount validation requires a numeric value greater than zero");
  } finally {
    if (archiveId) {
      await prisma.auditLog.deleteMany({ where: { entityId: archiveId } });
      await prisma.paymentArchive.deleteMany({ where: { id: archiveId } });
    }
    if (paymentId) {
      await prisma.auditLog.deleteMany({ where: { entityId: paymentId } });
      await prisma.payment.deleteMany({ where: { id: paymentId } });
    }
    if (billId) await prisma.bill.deleteMany({ where: { id: billId } });
    for (const url of temporaryQrUrls) await removeStoredGcashQrImage("pagsibol4b", url);
    if (previousQrSetting) await prisma.systemSetting.update({ where: { id: previousQrSetting.id }, data: { label: previousQrSetting.label, value: previousQrSetting.value, isSecret: previousQrSetting.isSecret, updatedById: previousQrSetting.updatedById } });
    else await prisma.systemSetting.deleteMany({ where: { category: "PAYMENT", key: "GCASH_QR_IMAGE_URL" } });
    await prisma.$disconnect();
  }
  console.log("BILLING_AND_SETTINGS_VERIFICATION_COMPLETE");
}

async function setQrValue(tenantId: string, value: string | null, updatedById: string) {
  await prisma.systemSetting.upsert({ where: { tenantId_category_key: { tenantId, category: "PAYMENT", key: "GCASH_QR_IMAGE_URL" } }, create: { tenantId, category: "PAYMENT", key: "GCASH_QR_IMAGE_URL", label: "GCash QR image", value, updatedById }, update: { label: "GCash QR image", value, updatedById } });
}

async function currentQrValue(tenantId: string) {
  return (await prisma.systemSetting.findUnique({ where: { tenantId_category_key: { tenantId, category: "PAYMENT", key: "GCASH_QR_IMAGE_URL" } }, select: { value: true } }))?.value ?? "";
}

function qrDiskPath(url: string) {
  return path.join(process.cwd(), "storage", "uploads", "tenants", "pagsibol4b", "settings", "gcash", url.split("/").at(-1)!);
}

async function findUnusedBillingMonth(homeownerId: string) {
  for (let year = 2090; year <= 2099; year += 1) for (let month = 0; month < 12; month += 1) {
    const billingMonth = new Date(Date.UTC(year, month, 1));
    if (!await prisma.bill.findUnique({ where: { homeownerId_billingMonth: { homeownerId, billingMonth } }, select: { id: true } })) return billingMonth;
  }
  throw new Error("No temporary billing month is available for verification.");
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });