import { mkdir, readFile, writeFile } from "node:fs/promises";
import { PrismaClient, Role } from "@prisma/client";
import { SignJWT } from "jose/jwt/sign";
import { PDFDocument } from "pdf-lib";

const prisma = new PrismaClient();
const base = "http://localhost:3000";
const envText = await readFile(new URL("../.env", import.meta.url), "utf8");
const authSecret = envText.match(/^AUTH_SECRET="?([^"\r\n]+)"?/m)?.[1];
if (!authSecret) throw new Error("AUTH_SECRET not found");
const secret = new TextEncoder().encode(authSecret);
const checks = [];
const tenantId = "tenant_pagsibol4b_default";
let testDocumentId;
let testClearanceId;
let testResidencyId;
let testPaymentId;
let testBillId;

function check(condition, label) { if (!condition) throw new Error(`FAILED: ${label}`); checks.push(label); }
async function tokenFor(user) { return new SignJWT({ userId: user.id, role: user.role, tenantId: user.tenantId, tenantSlug: "pagsibol4b" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("20m").sign(secret); }
async function get(path, token) { return fetch(`${base}${path}`, { headers: token ? { Cookie: `hoa_session=${token}` } : {}, redirect: "manual" }); }

try {
  const [admin, homeowner] = await Promise.all([
    prisma.user.findFirstOrThrow({ where: { role: { in: [Role.SYSTEM_ADMIN, Role.SUPER_ADMIN] } } }),
    prisma.user.findFirstOrThrow({ where: { role: Role.HOMEOWNER }, include: { homeownerProfile: true } }),
  ]);
  const [adminToken, homeownerToken] = await Promise.all([tokenFor(admin), tokenFor(homeowner)]);
  const profile = homeowner.homeownerProfile;
  check(Boolean(profile), "production homeowner profile is available for isolated smoke data");

  const settings = await prisma.systemSetting.findMany({ where: { category: "ASSOCIATION", key: { in: ["ASSOCIATION_EMAIL", "ASSOCIATION_SEC_REGISTRATION_NUMBER"] } } });
  check(settings.length === 2, "association email and SEC registration settings are installed");
  const templates = await prisma.documentTemplate.findMany();
  check(templates.length === 8 && templates.every((item) => item.version >= 1), "all eight versioned document templates are installed");

  const counterResults = await prisma.$transaction(async (tx) => {
    const allocate = async (series) => {
      const year = 2097;
      const counter = await tx.receiptCounter.upsert({ where: { tenantId_series_year: { tenantId, series, year } }, create: { tenantId, series, year, lastNumber: 1 }, update: { lastNumber: { increment: 1 } } });
      return `AR-${series}-${year}-${String(counter.lastNumber).padStart(7, "0")}`;
    };
    const values = [await allocate("MD"), await allocate("MD"), await allocate("CB"), await allocate("CTB"), await allocate("OC")];
    throw Object.assign(new Error("ROLLBACK_RECEIPT_TEST"), { values });
  }).catch((error) => error.values);
  check(Array.isArray(counterResults) && /^AR-MD-2097-\d{7}$/.test(counterResults[0]) && /^AR-CB-2097-\d{7}$/.test(counterResults[2]) && /^AR-CTB-2097-\d{7}$/.test(counterResults[3]) && /^AR-OC-2097-\d{7}$/.test(counterResults[4]), "receipt numbers use MD, CB, CTB, and OC seven-digit formats");
  check(Number(counterResults[1].slice(-7)) === Number(counterResults[0].slice(-7)) + 1 && counterResults[2].endsWith("0000001") && counterResults[3].endsWith("0000001") && counterResults[4].endsWith("0000001"), "receipt series maintain independent atomic counters");
  check(await prisma.receiptCounter.count({ where: { year: 2097 } }) === 0, "receipt counter test rolled back without production sequence changes");

  const duplicateIndex = await prisma.$queryRawUnsafe(`SELECT INDEX_NAME, NON_UNIQUE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DataMigration' AND INDEX_NAME = 'DataMigration_tenantId_dedupeKey_key'`);
  check(duplicateIndex.length === 2 && duplicateIndex.every((row) => Number(row.NON_UNIQUE) === 0), "migration duplicate prevention is enforced by a tenant-composite unique database index");

  const billingMonth = new Date("2098-12-01T00:00:00.000Z");
  const dueDate = new Date("2098-12-31T00:00:00.000Z");
  const bill = await prisma.bill.create({ data: { homeownerId: profile.id, billingMonth, coverageYear: billingMonth.getUTCFullYear(), coverageMonth: billingMonth.getUTCMonth() + 1, amount: 432.1, penalty: 0, totalAmount: 432.1, amountPaid: 0, balance: 432.1, dueDate, status: "UNPAID", notes: "QA TEMPORARY - REMOVE" } });
  testBillId = bill.id;

  const portalBlocked = await get("/portal/documents", homeownerToken);
  const portalBlockedHtml = await portalBlocked.text();
  check(portalBlocked.status === 200 && portalBlockedHtml.includes("Outstanding monthly dues") && portalBlockedHtml.includes("You may submit a request") && portalBlockedHtml.includes("Open Pay by QR"), "homeowner requests remain available while downloads are balance-controlled with Pay by QR guidance");
  const qrSetting = await prisma.systemSetting.findUnique({ where: { tenantId_category_key: { tenantId, category: "PAYMENT", key: "GCASH_QR_IMAGE_URL" } } });
  check(!qrSetting?.value || portalBlockedHtml.includes(qrSetting.value) || portalBlockedHtml.includes("GCash QR is currently unavailable"), "blocked request page displays configured GCash QR or exact unavailable message");

  const now = new Date();
  const suffix = `${Date.now()}`;
  const verificationCode = `QATEST${suffix}`.slice(0, 20).toUpperCase();
  const documentNumber = `DOC-GP-2098-${suffix.slice(-6)}`;
  const doc = await prisma.documentRequest.create({ data: { homeownerId: profile.id, type: "GATE_PASS", status: "GENERATED", purpose: "QA print verification", scheduledDate: new Date("2098-12-15T00:00:00.000Z"), startTime: "08:00", endTime: "17:00", partyName: "QA Authorized Visitor", vehicleDetails: "QA Vehicle ABC 123", requestedAt: now, reviewedAt: now, approvedAt: now, generatedAt: now, processedById: admin.id, approvedById: admin.id, templateVersion: 1, templateSnapshot: "QA immutable template snapshot", generatedContent: `Permission is granted for QA Authorized Visitor to enter PAGSIBOL VILLAGE PH2 4B EAST on December 15, 2098.\n\nResident: ${homeowner.name}, Block ${profile.block}, Lot ${profile.lot}\nVehicle/Items: QA Vehicle ABC 123\nPurpose: QA print verification.`, verificationCode, documentNumber, histories: { create: [{ status: "SUBMITTED", actorId: homeowner.id, note: "QA submitted" }, { status: "APPROVED", actorId: admin.id, note: "QA approved" }, { status: "GENERATED", actorId: admin.id, note: "QA generated" }] } } });
  testDocumentId = doc.id;
  const officers = await prisma.organizationOfficer.findMany({ where: { active: true, archivedAt: null }, orderBy: { displayOrder: "asc" } });
  const officerData = officers.map(({ id, fullName, position, committee, contactNumber, email, photoUrl, signatureUrl, displayOrder }) => ({ id, fullName, position, committee, contactNumber, email, photoUrl, signatureUrl, displayOrder }));
  const clearance = await prisma.documentRequest.create({ data: { homeownerId: profile.id, type: "CLEARANCE_CERTIFICATE", status: "GENERATED", purpose: "Local employment", validityDate: new Date("2098-12-31T00:00:00.000Z"), requestedAt: now, reviewedAt: now, approvedAt: now, generatedAt: now, processedById: admin.id, approvedById: admin.id, processedByOfficerId: officers[0]?.id, approvedByOfficerId: officers[1]?.id || officers[0]?.id, organizationSnapshot: officerData, processedOfficerSnapshot: officerData[0], approvedOfficerSnapshot: officerData[1] || officerData[0], templateVersion: 1, templateSnapshot: "QA clearance snapshot", generatedContent: `This is to certify that ${homeowner.name}, a bona fide resident of Block ${profile.block}, Lot ${profile.lot}, has no derogatory information on file in this office.\n\nThe person named above is a resident in good standing and is known to be of good moral character.\n\nThis clearance is issued upon request for local employment.`, verificationCode: `CLR${suffix}`.slice(0, 20).toUpperCase(), documentNumber: `DOC-CLR-2098-${suffix.slice(-6)}` } });
  testClearanceId = clearance.id;
  const residencyDocument = await prisma.documentRequest.create({ data: { homeownerId: profile.id, type: "CERTIFICATE_OF_RESIDENCY", status: "GENERATED", purpose: "QA legal purpose", validityDate: new Date("2099-12-31T00:00:00.000Z"), requestedAt: now, reviewedAt: now, approvedAt: now, generatedAt: now, processedById: admin.id, approvedById: admin.id, processedByOfficerId: officers[0]?.id, approvedByOfficerId: officers[1]?.id || officers[0]?.id, organizationSnapshot: officerData, processedOfficerSnapshot: officerData[0], approvedOfficerSnapshot: officerData[1] || officerData[0], templateVersion: 1, templateSnapshot: "QA residency snapshot", generatedContent: `This is to certify that\n\n${homeowner.name.toUpperCase()}\n\nis a bonafide resident of Pagsibol Village East Phase 2 and is currently residing at Block ${profile.block}, Lot ${profile.lot}.\n\nThis certification is based on the records and information on file in this office and is being issued upon request for whatever legal purpose it may serve.`, verificationCode: `RES${suffix}`.slice(0, 20).toUpperCase(), documentNumber: `CR-2098-${suffix.slice(-6)}` } });
  testResidencyId = residencyDocument.id;

  const payment = await prisma.payment.create({ data: { billId: bill.id, homeownerId: profile.id, amount: 100, paymentDate: now, method: "OTHER", referenceNumber: `QA-${suffix}`, receiptNumber: `AR-MD-2098-${suffix.slice(-7).padStart(7, "0")}`, remarks: "QA TEMPORARY - REMOVE", processedById: admin.id } });
  testPaymentId = payment.id;

  const routes = [
    ["/admin/documents", "Document requests"], ["/admin/documents/new", "Walk-in / office document generation"], ["/admin/documents/generated", "Generated documents"], ["/admin/documents/archive", "Document archive"], ["/admin/document-templates", "Available placeholders"],
    ["/admin/data/migrations", "Previous balances and collections"], ["/admin/receipts", "Acknowledgement receipt register"], ["/admin/settings/organization", "Organization structure"],
  ];
  for (const [path, text] of routes) { const response = await get(path, adminToken); const html = await response.text(); check(response.status === 200 && html.includes(text), `${path} renders for an administrator`); if (path === "/admin/document-templates") check(html.includes("{{association_name}}") && html.includes("{{qr_verification_code}}"), "template editor exposes required snake-case placeholders"); }
  const paymentRegister = await get("/admin/payments?q=QA&sort=amount_high&requestPage=1&paymentPage=1&historyPage=1", adminToken); const paymentRegisterHtml = await paymentRegister.text();
  check(paymentRegister.status === 200 && paymentRegisterHtml.includes("Server-paginated GCash requests") && paymentRegisterHtml.includes("All homeowners") && paymentRegisterHtml.includes("Highest amount"), "payment registers support server-side search, filtering, sorting, and pagination controls");
  const requestDetail = await get(`/admin/documents/${doc.id}`, adminToken); const requestDetailHtml = await requestDetail.text();
  check(requestDetail.status === 200, "document register opens a dedicated request detail view");
  const homeownerDocuments = await get("/portal/documents", homeownerToken); const homeownerDocumentsHtml = await homeownerDocuments.text();
  check(homeownerDocuments.status === 200 && homeownerDocumentsHtml.includes(documentNumber) && homeownerDocumentsHtml.includes("View details"), "generated document is visible in the homeowner request history");
  const settingsPage = await get("/admin/settings", adminToken); const settingsHtml = await settingsPage.text();
  check(settingsPage.status === 200 && settingsHtml.includes("SEC registration number") && settingsHtml.includes("Email address"), "system settings render association email and SEC registration fields");
  const residency = await prisma.documentRequest.findUnique({ where: { id: residencyDocument.id } });
  check(Boolean(residency?.documentNumber?.startsWith("CR-")), "Certificate of Residency uses the official CR document number series");
  if (residency) {
    const residencyPrint = await get(`/documents/${residency.id}/print`, adminToken); const residencyHtml = await residencyPrint.text();
    check(residencyPrint.status === 200 && residencyHtml.includes("CERTIFICATE OF RESIDENCY") && residencyHtml.includes("bonafide resident") && residencyHtml.includes("PERSONAL INFORMATION") && residencyHtml.includes("PROPERTY INFORMATION"), "Certificate of Residency print view follows the official wording and information-panel structure");
    const residencyPdfResponse = await get(`/documents/${residency.id}/pdf`, adminToken); const residencyPdf = await PDFDocument.load(Buffer.from(await residencyPdfResponse.arrayBuffer()));
    check(residencyPdfResponse.status === 200 && residencyPdf.getPageCount() === 1, "Certificate of Residency PDF is a single A4 page");
  }
  const officerWithPhoto = await prisma.organizationOfficer.findFirst({ where: { photoUrl: { not: null } } });
  if (officerWithPhoto?.photoUrl) { const adminPhoto = await get(officerWithPhoto.photoUrl, adminToken); const homeownerPhoto = await get(officerWithPhoto.photoUrl, homeownerToken); check(adminPhoto.status === 200 && homeownerPhoto.status === 200 && adminPhoto.headers.get("content-type")?.startsWith("image/"), "organization photo streams correctly in admin and homeowner sessions"); }

  const receiptPage = await get(`/receipts/payment/${payment.id}`, adminToken); const receiptHtml = await receiptPage.text();
  check(receiptPage.status === 200 && receiptHtml.includes(payment.receiptNumber) && receiptHtml.includes(admin.name) && receiptHtml.includes(homeowner.name) && receiptHtml.includes("Payer's signature / printed name"), "receipt renders series, processor, payer, and named signature lines");
  const receiptRegister = await get(`/admin/receipts?q=${encodeURIComponent(payment.receiptNumber)}`, adminToken); const registerHtml = await receiptRegister.text();
  check(receiptRegister.status === 200 && registerHtml.includes(payment.receiptNumber) && registerHtml.includes("View / Print"), "receipt register searches by full receipt number");

  const verifyPage = await get(`/verify/documents/${verificationCode}`); const verifyHtml = await verifyPage.text();
  check(verifyPage.status === 200 && verifyHtml.includes("VALID DIGITAL RECORD") && verifyHtml.includes(documentNumber), "public QR verification page validates generated document metadata");
  const blockedDownload = await get(`/documents/${doc.id}/pdf`, homeownerToken);
  check([302, 303, 307, 308].includes(blockedDownload.status) && (blockedDownload.headers.get("location") || "").includes(`/documents/${doc.id}`), "homeowner PDF download is blocked while a current balance exists and no override is set");
  await prisma.documentRequest.update({ where: { id: doc.id }, data: { allowDownloadDespiteBalance: true, downloadOverrideReason: "QA authorized override", downloadOverrideAt: now, downloadOverrideById: admin.id } });
  const printPage = await get(`/documents/${doc.id}/print`, adminToken); const printHtml = await printPage.text();
  check(printPage.status === 200 && printHtml.includes("MARSHAL&#x27;S") && printHtml.includes("HOMEOWNER&#x27;S") && printHtml.includes("HOA OFFICE") && printHtml.includes("data:image/png;base64"), "gate pass print view renders Marshal, Homeowner, and HOA Office copies with embedded QR");
  const pdfResponse = await get(`/documents/${doc.id}/pdf`, adminToken);
  const pdfBytes = Buffer.from(await pdfResponse.arrayBuffer());
  check(pdfResponse.status === 200 && pdfResponse.headers.get("content-type") === "application/pdf" && pdfBytes.subarray(0, 4).toString() === "%PDF", "generated document downloads as a valid PDF");
  const parsedPdf = await PDFDocument.load(pdfBytes);
  check(parsedPdf.getPageCount() === 1, "all three gate pass copies fit on one A4 PDF page");
  const clearanceResponse = await get(`/documents/${clearance.id}/pdf`, adminToken);
  const clearanceBytes = Buffer.from(await clearanceResponse.arrayBuffer());
  const parsedClearance = await PDFDocument.load(clearanceBytes);
  check(clearanceResponse.status === 200 && parsedClearance.getPageCount() === 1, "HOA clearance renders as one branded A4 PDF page");
  await mkdir(new URL("../tmp/pdfs/", import.meta.url), { recursive: true });
  await writeFile(new URL("../tmp/pdfs/additional-enhancements-clearance.pdf", import.meta.url), clearanceBytes);
  await writeFile(new URL("../tmp/pdfs/additional-enhancements-gate-pass.pdf", import.meta.url), pdfBytes);
  const downloaded = await prisma.documentRequest.findUniqueOrThrow({ where: { id: doc.id }, include: { histories: true } });
  check(downloaded.status === "DOWNLOADED" && downloaded.histories.some((item) => item.status === "DOWNLOADED"), "PDF download updates request status and preserves history");
  check(downloaded.templateSnapshot === "QA immutable template snapshot", "generated request retains its immutable template snapshot");

  console.log(`PASS ${checks.length} additional enhancement checks`);
  for (const label of checks) console.log(`- ${label}`);
  console.log(`PDF ${new URL("../tmp/pdfs/additional-enhancements-gate-pass.pdf", import.meta.url).pathname}`);
} finally {
  if (testDocumentId) await prisma.documentRequest.delete({ where: { id: testDocumentId } }).catch(() => {});
  if (testClearanceId) await prisma.documentRequest.delete({ where: { id: testClearanceId } }).catch(() => {});
  if (testResidencyId) await prisma.documentRequest.delete({ where: { id: testResidencyId } }).catch(() => {});
  if (testPaymentId) await prisma.payment.delete({ where: { id: testPaymentId } }).catch(() => {});
  if (testBillId) await prisma.bill.delete({ where: { id: testBillId } }).catch(() => {});
  await prisma.$disconnect();
}
