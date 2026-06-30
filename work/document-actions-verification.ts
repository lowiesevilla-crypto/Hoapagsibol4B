import Module from "node:module";
import { DocumentType, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const checks: string[] = [];
const createdIds: string[] = [];
let originalCounter: { lastNumber: number } | null = null;
let testBillId: string | null = null;

function check(condition: unknown, label: string) { if (!condition) throw new Error(`FAILED: ${label}`); checks.push(label); }

async function main() {
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "SYSTEM_ADMIN" } });
  const homeowner = await prisma.homeownerProfile.findFirstOrThrow({ where: { bills: { none: { archivedAt: null, balance: { gt: 0 } } } }, include: { user: true } });
  const year = new Date().getUTCFullYear();
  originalCounter = await prisma.documentCounter.findUnique({ where: { type_year: { type: DocumentType.GATE_PASS, year } }, select: { lastNumber: true } });

  const moduleLoader = Module as typeof Module & { _load: (request: string, parent: unknown, isMain: boolean) => unknown };
  const originalLoad = moduleLoader._load;
  class RedirectResult extends Error { constructor(public url: string) { super(url); } }
  moduleLoader._load = function loadForVerification(request, parent, isMain) {
    if (request === "server-only") return {};
    if (request === "next/cache") return { revalidatePath() {} };
    if (request === "next/navigation") return { redirect(url: string) { throw new RedirectResult(url); } };
    if (request === "next/headers") return { cookies: async () => ({ get() { return undefined; }, set() {}, delete() {} }) };
    if (request === "@/lib/auth") return { requireUser: async () => ({ id: admin.id, name: admin.name, email: admin.email, role: admin.role, homeownerProfile: null, employeeProfile: null }) };
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const { archiveDocumentRequestAction, generateManualDocumentAction, processDocumentRequestAction, restoreDocumentRequestAction } = await import("../lib/actions/documents");
    const testBill = await prisma.bill.create({ data: { homeownerId: homeowner.id, billingMonth: new Date("2099-05-01T00:00:00.000Z"), amount: 321, penalty: 0, totalAmount: 321, amountPaid: 0, balance: 321, dueDate: new Date("2099-05-31T00:00:00.000Z"), status: "UNPAID", notes: "DOCUMENT ACTION QA TEMPORARY" } });
    testBillId = testBill.id;
    const submitted = await prisma.documentRequest.create({ data: { homeownerId: homeowner.id, type: DocumentType.GATE_PASS, status: "SUBMITTED", purpose: "Verification gate access", scheduledDate: new Date("2099-06-15T00:00:00.000Z"), startTime: "08:00", endTime: "17:00", partyName: "Original Visitor", vehicleDetails: "Original vehicle", histories: { create: { status: "SUBMITTED", actorId: homeowner.userId, note: "Verification submission" } } } });
    createdIds.push(submitted.id);
    const approve = new FormData();
    approve.set("id", submitted.id);
    approve.set("operation", "approve");
    approve.set("purpose", "Approved gate access");
    approve.set("adminRemarks", "Validated against homeowner account.");
    approve.set("validityDate", "2099-06-15");
    approve.set("scheduledDate", "2099-06-15");
    approve.set("partyName", "Approved Visitor");
    approve.set("vehicleDetails", "Truck QA-2099");
    let approvedRedirect = "";
    try { await processDocumentRequestAction(approve); } catch (error) { if (error instanceof RedirectResult) approvedRedirect = error.url; else throw error; }
    check(approvedRedirect.includes("success=approve"), "explicit approve operation generates the document");
    const generated = await prisma.documentRequest.findUniqueOrThrow({ where: { id: submitted.id }, include: { histories: true, processedBy: true, approvedBy: true, versions: true } });
    check(generated.status === "GENERATED" && Boolean(generated.documentNumber) && Boolean(generated.verificationCode), "approval automatically generates document number and verification code");
    check(generated.templateVersion === 1 && Boolean(generated.templateSnapshot) && Boolean(generated.generatedContent), "generated document archives its exact template version and content snapshot");
    check(generated.processedById === admin.id && generated.approvedById === admin.id && generated.processedBy?.name === admin.name, "generated document stores processor and approver identity");
    check(Number(generated.outstandingBalanceAtRequest) === 321 && !generated.allowDownloadDespiteBalance, "approval succeeds with a balance while download restriction remains enabled by default");
    check(Boolean(generated.associationSnapshot) && Boolean(generated.homeownerSnapshot) && Array.isArray(generated.organizationSnapshot), "generated document freezes association, homeowner, and organization snapshots");
    check(generated.purpose === "Approved gate access" && generated.partyName === "Approved Visitor" && generated.vehicleDetails === "Truck QA-2099", "administrator pass edits are stored before generation");
    check(generated.histories.some((item) => item.status === "APPROVED") && generated.histories.some((item) => item.status === "GENERATED"), "approval and generation history entries are retained");
    check(generated.currentVersion === 1 && generated.versions.length === 1 && generated.versions[0].version === 1, "initial generation creates immutable document version 1");

    const regenerate = new FormData(); regenerate.set("id", submitted.id); regenerate.set("operation", "regenerate"); regenerate.set("purpose", "Updated approved gate access"); regenerate.set("validityDate", "2099-06-15"); regenerate.set("scheduledDate", "2099-06-15"); regenerate.set("startTime", "08:00"); regenerate.set("endTime", "17:00"); regenerate.set("partyName", "Approved Visitor"); regenerate.set("vehicleDetails", "Truck QA-2099");
    try { await processDocumentRequestAction(regenerate); } catch (error) { if (!(error instanceof RedirectResult) || !error.url.includes("success=regenerate")) throw error; }
    const regenerated = await prisma.documentRequest.findUniqueOrThrow({ where: { id: submitted.id }, include: { versions: { orderBy: { version: "asc" } } } });
    check(regenerated.currentVersion === 2 && regenerated.versions.length === 2 && regenerated.purpose === "Updated approved gate access", "editing a generated document automatically creates version 2 and replaces the active content");
    check(regenerated.versions[0].generatedContent !== regenerated.versions[1].generatedContent, "previous generated content remains preserved in version history");

    const archive = new FormData(); archive.set("id", submitted.id); archive.set("reason", "QA archive verification");
    try { await archiveDocumentRequestAction(archive); } catch (error) { if (!(error instanceof RedirectResult) || !error.url.includes("success=archived")) throw error; }
    check(Boolean((await prisma.documentRequest.findUniqueOrThrow({ where: { id: submitted.id } })).archivedAt), "document request uses soft archive instead of permanent deletion");
    const restore = new FormData(); restore.set("id", submitted.id);
    try { await restoreDocumentRequestAction(restore); } catch (error) { if (!(error instanceof RedirectResult) || !error.url.includes("success=restored")) throw error; }
    check(!(await prisma.documentRequest.findUniqueOrThrow({ where: { id: submitted.id } })).archivedAt, "archived document request can be restored to active records");

    const manual = new FormData(); manual.set("homeownerId", homeowner.id); manual.set("type", "GATE_PASS"); manual.set("purpose", "QA manual walk-in generation"); manual.set("validityDate", "2099-07-01"); manual.set("scheduledDate", "2099-07-01"); manual.set("startTime", "09:00"); manual.set("endTime", "10:00"); manual.set("partyName", "Walk-in Visitor");
    try { await generateManualDocumentAction(manual); } catch (error) { if (!(error instanceof RedirectResult) || !error.url.includes("success=approve")) throw error; }
    const manualGenerated = await prisma.documentRequest.findFirstOrThrow({ where: { purpose: "QA manual walk-in generation" }, include: { versions: true } }); createdIds.push(manualGenerated.id);
    check(manualGenerated.origin === "ADMIN" && manualGenerated.initiatedById === admin.id && manualGenerated.status === "GENERATED", "administrator can generate a document without a homeowner submission");
    check(manualGenerated.homeownerId === homeowner.id && manualGenerated.versions.length === 1, "admin-generated document is synchronized to the selected homeowner with version history");

    const rejectedRequest = await prisma.documentRequest.create({ data: { homeownerId: homeowner.id, type: DocumentType.CERTIFICATE_OF_RESIDENCY, status: "SUBMITTED", purpose: "Verification rejection", histories: { create: { status: "SUBMITTED", actorId: homeowner.userId } } } });
    createdIds.push(rejectedRequest.id);
    const reject = new FormData();
    reject.set("id", rejectedRequest.id);
    reject.set("operation", "reject");
    reject.set("adminRemarks", "Verification rejection reason.");
    let rejectedRedirect = "";
    try { await processDocumentRequestAction(reject); } catch (error) { if (error instanceof RedirectResult) rejectedRedirect = error.url; else throw error; }
    const rejected = await prisma.documentRequest.findUniqueOrThrow({ where: { id: rejectedRequest.id }, include: { histories: true } });
    check(rejectedRedirect.includes("success=reject") && rejected.status === "REJECTED" && rejected.adminRemarks === "Verification rejection reason.", "administrator can reject with a required reason");
    check(rejected.histories.some((item) => item.status === "REJECTED"), "rejection is recorded in request history");
  } finally {
    moduleLoader._load = originalLoad;
    if (createdIds.length) {
      await prisma.documentRequest.deleteMany({ where: { id: { in: createdIds } } });
      await prisma.auditLog.deleteMany({ where: { entityType: "DocumentRequest", entityId: { in: createdIds } } });
    }
    if (testBillId) await prisma.bill.delete({ where: { id: testBillId } }).catch(() => {});
    if (originalCounter) await prisma.documentCounter.update({ where: { type_year: { type: DocumentType.GATE_PASS, year } }, data: { lastNumber: originalCounter.lastNumber } }).catch(() => {});
    else await prisma.documentCounter.delete({ where: { type_year: { type: DocumentType.GATE_PASS, year } } }).catch(() => {});
  }

  check(await prisma.documentRequest.count({ where: { id: { in: createdIds } } }) === 0, "document action verification records are fully cleaned up");
  check(!testBillId || await prisma.bill.count({ where: { id: testBillId } }) === 0, "temporary balance verification bill is fully cleaned up");
  console.log(`PASS ${checks.length} document action checks`);
  for (const label of checks) console.log(`- ${label}`);
  await prisma.$disconnect();
}

void main().catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
