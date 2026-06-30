import { existsSync, readFileSync } from "node:fs";
import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const envText = readFileSync(path.join(process.cwd(), ".env"), "utf8");
const databaseUrl = envText.match(/^DATABASE_URL="?([^"\r\n]+)"?/m)?.[1];
if (!databaseUrl) throw new Error("DATABASE_URL not found in .env");
process.env.DATABASE_URL = databaseUrl;

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");
const testText = /\b(TEST|SEED|SMOKE|FEATURE-QA)\b/i;

async function main() {
  const testUsers = await prisma.user.findMany({
    where: {
      role: { in: ["HOMEOWNER", "EMPLOYEE"] },
      OR: [
        { email: { endsWith: ".test" } },
        { email: { endsWith: ".example" } },
        { name: { startsWith: "TEST" } },
      ],
    },
    include: { homeownerProfile: true, employeeProfile: true },
  });
  const testUserIds = testUsers.map((item) => item.id);
  const testHomeownerIds = testUsers.flatMap((item) => item.homeownerProfile?.id ? [item.homeownerProfile.id] : []);
  const testEmployeeIds = testUsers.flatMap((item) => item.employeeProfile?.id ? [item.employeeProfile.id] : []);

  const testContractors = await prisma.contractorProfile.findMany({
    where: { OR: [{ email: { endsWith: ".example" } }, { companyName: { startsWith: "TEST" } }] },
  });
  const testContractorIds = testContractors.map((item) => item.id);
  const testAnnouncements = (await prisma.announcement.findMany()).filter((item) => testText.test(`${item.title} ${item.content}`));
  const testEvents = (await prisma.event.findMany()).filter((item) => testText.test(`${item.title} ${item.description}`));
  const testPayments = await prisma.payment.findMany({
    where: {
      OR: [
        ...(testHomeownerIds.length ? [{ homeownerId: { in: testHomeownerIds } }] : []),
        { referenceNumber: { startsWith: "TEST-" } },
        { referenceNumber: { startsWith: "SEED-" } },
        { remarks: { contains: "Test Payment" } },
      ],
    },
  });
  const testPaymentIds = testPayments.map((item) => item.id);
  const testPaymentRequests = await prisma.paymentRequest.findMany({
    where: {
      OR: [
        ...(testHomeownerIds.length ? [{ homeownerId: { in: testHomeownerIds } }] : []),
        ...(testPaymentIds.length ? [{ paymentId: { in: testPaymentIds } }] : []),
        { referenceNumber: { startsWith: "TEST-" } },
        { referenceNumber: { startsWith: "SEED-" } },
        { payerNotes: { contains: "Test Payment" } },
      ],
    },
  });
  const testPaymentRequestIds = testPaymentRequests.map((item) => item.id);
  const testBills = testHomeownerIds.length ? await prisma.bill.findMany({ where: { homeownerId: { in: testHomeownerIds } } }) : [];
  const testBillIds = testBills.map((item) => item.id);
  const testCollections = await prisma.collection.findMany({
    where: {
      OR: [
        ...(testHomeownerIds.length ? [{ homeownerId: { in: testHomeownerIds } }] : []),
        ...(testContractorIds.length ? [{ contractorId: { in: testContractorIds } }] : []),
        { referenceNumber: { startsWith: "TEST-" } },
        { referenceNumber: { startsWith: "SEED-" } },
      ],
    },
  });
  const testCollectionIds = testCollections.map((item) => item.id);
  const testVehicles = testHomeownerIds.length ? await prisma.vehicle.findMany({ where: { homeownerId: { in: testHomeownerIds } } }) : [];
  const testChatConversations = testUserIds.length ? await prisma.chatConversation.findMany({ where: { participants: { some: { userId: { in: testUserIds } } } } }) : [];
  const testChatConversationIds = testChatConversations.map((item) => item.id);
  const explicitTestMessages = await prisma.chatMessage.findMany({ where: { OR: [{ body: { contains: "test" } }, { body: { contains: "smoke" } }, { body: { contains: "FEATURE-QA" } }] }, include: { attachments: true } });
  const testConversationMessages = testChatConversationIds.length ? await prisma.chatMessage.findMany({ where: { conversationId: { in: testChatConversationIds } }, include: { attachments: true } }) : [];
  const testSchedules = testEmployeeIds.length ? await prisma.employeeSchedule.findMany({ where: { employeeId: { in: testEmployeeIds } } }) : [];
  const testAttendance = testEmployeeIds.length ? await prisma.attendance.findMany({ where: { employeeId: { in: testEmployeeIds } } }) : [];
  const testOvertime = testEmployeeIds.length ? await prisma.overtimeRecord.findMany({ where: { employeeId: { in: testEmployeeIds } } }) : [];
  const testDeductions = testEmployeeIds.length ? await prisma.payrollDeduction.findMany({ where: { employeeId: { in: testEmployeeIds } } }) : [];
  const testPayslips = testEmployeeIds.length ? await prisma.payslip.findMany({ where: { employeeId: { in: testEmployeeIds } } }) : [];
  const testLoans = testEmployeeIds.length ? await prisma.employeeLoan.findMany({ where: { employeeId: { in: testEmployeeIds } } }) : [];
  const payrollPeriods = await prisma.payrollPeriod.findMany({ include: { payslips: { select: { employeeId: true } }, deductions: { select: { employeeId: true } } } });
  const testPayrollPeriodIds = payrollPeriods.filter((period) => {
    const employeeIds = [...period.payslips.map((item) => item.employeeId), ...period.deductions.map((item) => item.employeeId)];
    return employeeIds.length > 0 && employeeIds.every((id) => testEmployeeIds.includes(id));
  }).map((period) => period.id);
  const testPayrollArchives = (await prisma.payrollArchive.findMany()).filter((item) => testText.test(JSON.stringify(item)) || testEmployeeIds.some((id) => JSON.stringify(item).includes(id)));
  const testPaymentArchives = testHomeownerIds.length ? await prisma.paymentArchive.findMany({ where: { homeownerId: { in: testHomeownerIds } } }) : [];

  const fileUrls = new Set<string>();
  for (const item of [...testPayments, ...testPaymentRequests]) {
    const url = "proofUrl" in item ? item.proofUrl : item.proofImageUrl;
    if (url) fileUrls.add(url);
  }
  for (const item of [...testAnnouncements, ...testEvents]) if (item.imageUrl) fileUrls.add(item.imageUrl);
  for (const message of [...testConversationMessages, ...explicitTestMessages]) for (const attachment of message.attachments) fileUrls.add(attachment.url);

  const entityIds = [
    ...testUserIds, ...testHomeownerIds, ...testEmployeeIds, ...testContractorIds, ...testPaymentIds,
    ...testPaymentRequestIds, ...testBillIds, ...testCollectionIds, ...testVehicles.map((item) => item.id),
    ...testAnnouncements.map((item) => item.id), ...testEvents.map((item) => item.id), ...testChatConversationIds,
    ...explicitTestMessages.map((item) => item.id), ...testSchedules.map((item) => item.id), ...testAttendance.map((item) => item.id),
    ...testOvertime.map((item) => item.id), ...testDeductions.map((item) => item.id), ...testPayslips.map((item) => item.id),
    ...testLoans.map((item) => item.id), ...testPayrollPeriodIds, ...testPayrollArchives.map((item) => item.id), ...testPaymentArchives.map((item) => item.id),
  ];

  const plan = {
    mode: apply ? "APPLY" : "DRY_RUN",
    preserved: {
      systemSettings: await prisma.systemSetting.count(),
      adminAndSystemUsers: await prisma.user.findMany({ where: { role: { in: ["ADMIN", "SYSTEM_ADMIN"] } }, select: { name: true, email: true, role: true } }),
      productionUsers: await prisma.user.findMany({ where: { role: { in: ["HOMEOWNER", "EMPLOYEE"] }, id: { notIn: testUserIds } }, select: { name: true, email: true, role: true } }),
      lookupTables: { deductionTypes: await prisma.payrollDeductionType.count(), expenseCategories: await prisma.expenseCategory.count(), payrollAccess: await prisma.payrollAccess.count() },
    },
    delete: {
      users: testUsers.map((item) => ({ id: item.id, name: item.name, email: item.email, role: item.role })),
      contractors: testContractors.map((item) => ({ id: item.id, companyName: item.companyName })),
      bills: testBillIds.length,
      payments: testPaymentIds.length,
      paymentRequests: testPaymentRequestIds.length,
      paymentArchives: testPaymentArchives.length,
      collections: testCollectionIds.length,
      vehicles: testVehicles.length,
      announcements: testAnnouncements.map((item) => item.title),
      events: testEvents.map((item) => item.title),
      chatConversations: testChatConversationIds.length,
      explicitTestMessages: explicitTestMessages.length,
      attendance: testAttendance.length,
      overtime: testOvertime.length,
      deductions: testDeductions.length,
      payslips: testPayslips.length,
      loans: testLoans.length,
      payrollPeriods: testPayrollPeriodIds.length,
      payrollArchives: testPayrollArchives.length,
      uploadedFiles: [...fileUrls],
    },
  };
  console.log(JSON.stringify(plan, null, 2));
  if (!apply) return;

  await prisma.$transaction(async (tx) => {
    if (entityIds.length || testUserIds.length) await tx.auditLog.deleteMany({ where: { OR: [...(entityIds.length ? [{ entityId: { in: entityIds } }] : []), ...(testUserIds.length ? [{ actorId: { in: testUserIds } }] : [])] } });
    if (explicitTestMessages.length) await tx.chatMessage.deleteMany({ where: { id: { in: explicitTestMessages.map((item) => item.id) } } });
    if (testChatConversationIds.length) await tx.chatConversation.deleteMany({ where: { id: { in: testChatConversationIds } } });
    if (testPaymentRequestIds.length) await tx.paymentRequest.deleteMany({ where: { id: { in: testPaymentRequestIds } } });
    if (testPaymentIds.length) await tx.payment.deleteMany({ where: { id: { in: testPaymentIds } } });
    if (testPaymentArchives.length) await tx.paymentArchive.deleteMany({ where: { id: { in: testPaymentArchives.map((item) => item.id) } } });
    if (testVehicles.length) await tx.vehicle.deleteMany({ where: { id: { in: testVehicles.map((item) => item.id) } } });
    if (testCollectionIds.length) {
      await tx.bondRefund.deleteMany({ where: { collectionId: { in: testCollectionIds } } });
      await tx.collection.deleteMany({ where: { id: { in: testCollectionIds } } });
    }
    if (testBillIds.length) await tx.bill.deleteMany({ where: { id: { in: testBillIds } } });
    if (testAnnouncements.length) await tx.announcement.deleteMany({ where: { id: { in: testAnnouncements.map((item) => item.id) } } });
    if (testEvents.length) await tx.event.deleteMany({ where: { id: { in: testEvents.map((item) => item.id) } } });
    if (testDeductions.length) await tx.payrollDeduction.deleteMany({ where: { id: { in: testDeductions.map((item) => item.id) } } });
    if (testPayslips.length) await tx.payslip.deleteMany({ where: { id: { in: testPayslips.map((item) => item.id) } } });
    if (testPayrollPeriodIds.length) await tx.payrollPeriod.deleteMany({ where: { id: { in: testPayrollPeriodIds } } });
    if (testOvertime.length) await tx.overtimeRecord.deleteMany({ where: { id: { in: testOvertime.map((item) => item.id) } } });
    if (testAttendance.length) await tx.attendance.deleteMany({ where: { id: { in: testAttendance.map((item) => item.id) } } });
    if (testSchedules.length) await tx.employeeSchedule.deleteMany({ where: { id: { in: testSchedules.map((item) => item.id) } } });
    if (testLoans.length) await tx.employeeLoan.deleteMany({ where: { id: { in: testLoans.map((item) => item.id) } } });
    if (testPayrollArchives.length) await tx.payrollArchive.deleteMany({ where: { id: { in: testPayrollArchives.map((item) => item.id) } } });
    if (testEmployeeIds.length) await tx.employeeProfile.deleteMany({ where: { id: { in: testEmployeeIds } } });
    if (testHomeownerIds.length) await tx.homeownerProfile.deleteMany({ where: { id: { in: testHomeownerIds } } });
    if (testContractorIds.length) await tx.contractorProfile.deleteMany({ where: { id: { in: testContractorIds } } });
    if (testUserIds.length) await tx.user.deleteMany({ where: { id: { in: testUserIds } } });
  });

  for (const url of fileUrls) await removeUploadUrl(url);
  await removeOrphanedUploads();
  console.log("TEST_DATA_CLEANUP_COMPLETE");
}

async function removeUploadUrl(url: string) {
  if (!url.startsWith("/uploads/")) return;
  const relative = url.split("/").filter(Boolean);
  const filePath = path.resolve(process.cwd(), "public", ...relative);
  const publicUploads = path.resolve(process.cwd(), "public", "uploads");
  if (!filePath.startsWith(publicUploads + path.sep)) return;
  await rm(filePath, { force: true });
}

async function removeOrphanedUploads() {
  const referenced = new Set<string>();
  const [payments, requests, announcements, events, attachments] = await Promise.all([
    prisma.payment.findMany({ select: { proofUrl: true } }),
    prisma.paymentRequest.findMany({ select: { proofImageUrl: true } }),
    prisma.announcement.findMany({ select: { imageUrl: true } }),
    prisma.event.findMany({ select: { imageUrl: true } }),
    prisma.chatAttachment.findMany({ select: { url: true } }),
  ]);
  for (const item of [...payments.map((item) => item.proofUrl), ...requests.map((item) => item.proofImageUrl), ...announcements.map((item) => item.imageUrl), ...events.map((item) => item.imageUrl), ...attachments.map((item) => item.url)]) if (item) referenced.add(item);
  const base = path.join(process.cwd(), "public", "uploads");
  if (!existsSync(base)) return;
  for (const file of await walkFiles(base)) {
    const url = `/${path.relative(path.join(process.cwd(), "public"), file).split(path.sep).join("/")}`;
    if (!referenced.has(url)) await rm(file, { force: true });
  }
}

async function walkFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory)) {
    const full = path.join(directory, entry);
    if ((await stat(full)).isDirectory()) files.push(...await walkFiles(full));
    else files.push(full);
  }
  return files;
}

void main().finally(() => prisma.$disconnect()).catch((error) => { console.error(error); process.exitCode = 1; });
