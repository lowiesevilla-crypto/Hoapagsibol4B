import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { resolveContentImage } from "../lib/content-images";
import { savePaymentProof } from "../lib/payment-proofs";
import { paymentAmountUpdateSchema } from "../lib/validation";

const prisma = new PrismaClient();
const statePath = path.join(process.cwd(), "work", "feature-test-state.json");
const pngBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNkYGD4z8DAwMDEAAUADikBAQvI8WQAAAAASUVORK5CYII=", "base64");
const pdfBytes = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF", "utf8");

type State = {
  marker: string;
  adminId: string;
  homeownerId: string;
  homeownerUserId: string;
  imageRequestId: string;
  pdfRequestId: string;
  announcementId: string;
  eventId: string;
  chatConversationId: string;
  fileUrls: string[];
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAILED: ${message}`);
}

async function setup() {
  const marker = `FEATURE-QA-${Date.now()}`;
  const admin = await prisma.user.findFirstOrThrow({ where: { role: { in: ["ADMIN", "SYSTEM_ADMIN"] } }, orderBy: { role: "asc" } });
  const homeowner = await prisma.homeownerProfile.findFirstOrThrow({ where: { status: "ACTIVE" }, include: { user: true } });

  const noProof = await savePaymentProof(new FormData(), "pagsibol4b");
  assert(noProof === null, "payment proof is optional");

  const imageProofForm = new FormData();
  imageProofForm.set("proofFile", new File([pngBytes], "gcash-proof.png", { type: "image/png" }));
  const imageProof = await savePaymentProof(imageProofForm, "pagsibol4b");
  assert(imageProof?.url.endsWith(".png"), "PNG payment proof is stored");

  const pdfProofForm = new FormData();
  pdfProofForm.set("proofFile", new File([pdfBytes], "gcash-proof.pdf", { type: "application/pdf" }));
  const pdfProof = await savePaymentProof(pdfProofForm, "pagsibol4b");
  assert(pdfProof?.url.endsWith(".pdf"), "PDF payment proof is stored");

  const contentForm = new FormData();
  contentForm.set("image", new File([pngBytes], "community-banner.png", { type: "image/png" }));
  const contentImage = await resolveContentImage(contentForm, "pagsibol4b");
  assert(contentImage.url?.endsWith(".png"), "announcement/event content image is stored");

  const [imageRequest, pdfRequest, announcement, event, conversation] = await prisma.$transaction([
    prisma.paymentRequest.create({ data: { type: "OTHER_COLLECTION", homeownerId: homeowner.id, collectionType: "OTHER", description: `${marker} image proof`, amount: 1, paymentDate: new Date(), referenceNumber: `${marker}-IMG`, proofImageUrl: imageProof!.url, proofFileName: imageProof!.fileName, proofContentType: imageProof!.contentType, proofFileSize: imageProof!.size } }),
    prisma.paymentRequest.create({ data: { type: "OTHER_COLLECTION", homeownerId: homeowner.id, collectionType: "OTHER", description: `${marker} PDF proof`, amount: 1, paymentDate: new Date(), referenceNumber: `${marker}-PDF`, proofImageUrl: pdfProof!.url, proofFileName: pdfProof!.fileName, proofContentType: pdfProof!.contentType, proofFileSize: pdfProof!.size } }),
    prisma.announcement.create({ data: { title: `${marker} announcement`, content: "Responsive full-image verification announcement.", type: "GENERAL", status: "PUBLISHED", imageUrl: contentImage.url, createdById: admin.id } }),
    prisma.event.create({ data: { title: `${marker} event`, description: "Responsive full-image verification event.", type: "COMMUNITY", status: "PUBLISHED", eventDate: new Date(Date.UTC(2026, 6, 30)), eventTime: "09:00 - 10:00", startTime: "09:00", endTime: "10:00", location: "QA Clubhouse", imageUrl: contentImage.url, createdById: admin.id } }),
    prisma.chatConversation.create({ data: { subject: marker, createdById: homeowner.userId, assignedToId: admin.id, participants: { create: [{ userId: homeowner.userId, lastReadAt: new Date() }, { userId: admin.id, lastReadAt: new Date() }] } } }),
  ]);

  const state: State = { marker, adminId: admin.id, homeownerId: homeowner.id, homeownerUserId: homeowner.userId, imageRequestId: imageRequest.id, pdfRequestId: pdfRequest.id, announcementId: announcement.id, eventId: event.id, chatConversationId: conversation.id, fileUrls: [imageProof!.url, pdfProof!.url, contentImage.url!] };
  await writeFile(statePath, JSON.stringify(state, null, 2), "utf8");
  console.log(JSON.stringify(state));
}

async function emitChat() {
  const state = JSON.parse(await readFile(statePath, "utf8")) as State;
  await prisma.chatMessage.create({ data: { conversationId: state.chatConversationId, senderId: state.homeownerUserId, body: `${state.marker} unread notification` } });
  await prisma.chatConversation.update({ where: { id: state.chatConversationId }, data: { lastMessageAt: new Date() } });
  console.log("CHAT_MESSAGE_CREATED");
}

async function setAnnouncementImage(broken: boolean) {
  const state = JSON.parse(await readFile(statePath, "utf8")) as State;
  await prisma.announcement.update({ where: { id: state.announcementId }, data: { imageUrl: broken ? "/uploads/content/missing-feature-qa.png" : state.fileUrls[2] } });
  console.log(broken ? "IMAGE_BROKEN_FOR_FALLBACK_TEST" : "IMAGE_RESTORED");
}

async function verifyDatabase() {
  const payment = await prisma.payment.findFirstOrThrow({ where: { referenceNumber: "REGGGS111" }, include: { bill: true, allocations: { include: { bill: true } } } });
  const bill = payment.allocations[0]?.bill ?? payment.bill;
  assert(Boolean(bill), "payment retains a legacy bill or allocation relationship");
  const totals = await prisma.paymentAllocation.aggregate({ where: { billId: bill!.id, payment: { status: "ACTIVE" } }, _sum: { amount: true } });
  const sum = Number(totals._sum.amount ?? 0);
  assert(Number(bill!.amountPaid) === sum, "bill paid amount equals the sum of active allocations");
  assert(Number(bill!.balance) === Math.max(0, Number(bill!.totalAmount) - sum), "bill unpaid balance was recalculated");
  const logs = await prisma.auditLog.findMany({ where: { action: "UPDATE_PAYMENT_AMOUNT", entityId: payment.id }, orderBy: { createdAt: "desc" }, take: 2 });
  assert(logs.length === 2, "each verified payment amount change has an audit log");
  const metadata = logs.map((log) => log.metadata as Record<string, unknown>);
  assert(metadata.every((item) => typeof item.previousAmount === "number" && typeof item.newAmount === "number" && Boolean(item.updatedBy) && typeof item.updatedAt === "string"), "payment audit logs include previous amount, new amount, updater, and timestamp");
  console.log("DATABASE_VERIFICATION_PASS");
}

async function validateUploads() {
  const oversized = new FormData();
  oversized.set("proofFile", new File([new Uint8Array(5 * 1024 * 1024 + 1)], "too-large.png", { type: "image/png" }));
  let sizeRejected = false;
  try { await savePaymentProof(oversized, "pagsibol4b"); } catch (error) { sizeRejected = error instanceof Error && error.message.includes("5MB"); }
  assert(sizeRejected, "payment proof files over 5MB are rejected");
  const invalid = new FormData();
  invalid.set("proofFile", new File([Buffer.from("not allowed")], "proof.txt", { type: "text/plain" }));
  let typeRejected = false;
  try { await savePaymentProof(invalid, "pagsibol4b"); } catch (error) { typeRejected = error instanceof Error && error.message.includes("JPG"); }
  assert(typeRejected, "unsupported payment proof file types are rejected");
  console.log("UPLOAD_VALIDATION_PASS");
}

function validatePaymentAmounts() {
  assert(!paymentAmountUpdateSchema.safeParse({ id: "payment", amount: "" }).success, "blank payment amounts are rejected");
  assert(!paymentAmountUpdateSchema.safeParse({ id: "payment", amount: "not-a-number" }).success, "nonnumeric payment amounts are rejected");
  assert(!paymentAmountUpdateSchema.safeParse({ id: "payment", amount: "-0.01" }).success, "negative payment amounts are rejected");
  assert(!paymentAmountUpdateSchema.safeParse({ id: "payment", amount: "0" }).success, "zero payment amounts are rejected");
  console.log("PAYMENT_AMOUNT_VALIDATION_PASS");
}

async function cleanup() {
  const state = JSON.parse(await readFile(statePath, "utf8")) as State;
  await prisma.$transaction([
    prisma.chatConversation.deleteMany({ where: { id: state.chatConversationId } }),
    prisma.paymentRequest.deleteMany({ where: { referenceNumber: { startsWith: state.marker } } }),
    prisma.announcement.deleteMany({ where: { id: state.announcementId } }),
    prisma.event.deleteMany({ where: { id: state.eventId } }),
  ]);
  for (const url of state.fileUrls) await rm(path.join(process.cwd(), "public", ...url.split("/").filter(Boolean)), { force: true });
  await rm(statePath, { force: true });
  console.log("FEATURE_TEST_DATA_CLEANED");
}

async function main() {
  const mode = process.argv[2];
  try {
    if (mode === "setup") await setup();
    else if (mode === "emit-chat") await emitChat();
    else if (mode === "break-image") await setAnnouncementImage(true);
    else if (mode === "restore-image") await setAnnouncementImage(false);
    else if (mode === "verify-db") await verifyDatabase();
    else if (mode === "validate-uploads") await validateUploads();
    else if (mode === "validate-amounts") validatePaymentAmounts();
    else if (mode === "cleanup") await cleanup();
    else throw new Error("Use setup, emit-chat, break-image, restore-image, verify-db, validate-uploads, validate-amounts, or cleanup.");
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
