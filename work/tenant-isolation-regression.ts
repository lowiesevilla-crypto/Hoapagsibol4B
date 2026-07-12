import { PrismaClient, TenantModule } from "@prisma/client";
import { platformPrisma, prisma } from "../lib/db";
import { runAsPlatform, runWithTenant } from "../lib/tenant-context";

const raw = new PrismaClient();
const marker = `TENANT-ISOLATION-${Date.now()}`;
const allModules = Object.values(TenantModule);
const checks: string[] = [];

function check(condition: unknown, label: string) {
  if (!condition) throw new Error(`FAILED: ${label}`);
  checks.push(label);
}

async function fixture(suffix: string) {
  const tenant = await raw.tenant.create({ data: { name: `${marker} HOA ${suffix}`, shortName: `TI${suffix}`, slug: `${marker.toLowerCase()}-${suffix.toLowerCase()}`, moduleEntitlements: { create: allModules.map((module) => ({ module, enabled: true })) } } });
  const admin = await raw.user.create({ data: { tenantId: tenant.id, name: `Admin ${suffix}`, email: `${marker.toLowerCase()}-admin@example.invalid`, username: `${marker.toLowerCase()}-admin`, passwordHash: "not-used", role: "HOA_ADMIN" } });
  const resident = await raw.user.create({ data: { tenantId: tenant.id, name: `Resident ${suffix}`, email: `${marker.toLowerCase()}-resident@example.invalid`, username: `${marker.toLowerCase()}-resident`, passwordHash: "not-used", role: "HOMEOWNER" } });
  const homeowner = await raw.homeownerProfile.create({ data: { tenantId: tenant.id, userId: resident.id, address: "Shared test address", block: "ISO", lot: "1", phone: "09000000000", monthlyDuesAmount: 100 } });
  const contractor = await raw.contractorProfile.create({ data: { tenantId: tenant.id, companyName: `${marker} Builders`, contactPerson: "Test", phone: "09000000000", address: "Test" } });
  const bill = await raw.bill.create({ data: { tenantId: tenant.id, homeownerId: homeowner.id, billingMonth: new Date("2098-01-01T00:00:00.000Z"), coverageYear: 2098, coverageMonth: 1, amount: 100, totalAmount: 100, balance: 100, dueDate: new Date("2098-01-31T00:00:00.000Z") } });
  const payment = await raw.payment.create({ data: { tenantId: tenant.id, billId: null, homeownerId: homeowner.id, amount: 10, paymentDate: new Date("2098-01-10T00:00:00.000Z"), method: "CASH", receiptNumber: `${marker}-RECEIPT` } });
  const paymentAllocation = await raw.paymentAllocation.create({ data: { tenantId: tenant.id, paymentId: payment.id, billId: bill.id, amount: 10, coverageYear: bill.coverageYear, coverageMonth: bill.coverageMonth, coverageLabel: "January 2098" } });
  const collection = await raw.collection.create({ data: { tenantId: tenant.id, type: "CONSTRUCTION_BOND", payerType: "HOMEOWNER", homeownerId: homeowner.id, amount: 100, collectionDate: new Date("2098-01-10T00:00:00.000Z"), method: "CASH", receiptNumber: `${marker}-COLLECTION`, refundable: true, refundStatus: "HELD", createdById: admin.id } });
  const vehicle = await raw.vehicle.create({ data: { tenantId: tenant.id, homeownerId: homeowner.id, plateNumber: `${marker}-PLATE`, vehicleType: "CAR", make: "Test", model: "Test", color: "White", stickerNumber: `${marker}-STICKER`, issuedAt: new Date("2098-01-01T00:00:00.000Z") } });
  const employee = await raw.employeeProfile.create({ data: { tenantId: tenant.id, employeeNumber: `${marker}-EMP`, name: `Employee ${suffix}`, position: "Tester", phone: "09000000000", address: "Test", hireDate: new Date("2098-01-01T00:00:00.000Z"), salaryType: "MONTHLY", baseRate: 1000 } });
  const attendance = await raw.attendance.create({ data: { tenantId: tenant.id, employeeId: employee.id, date: new Date("2098-01-02T00:00:00.000Z"), status: "PRESENT" } });
  const payroll = await raw.payrollPeriod.create({ data: { tenantId: tenant.id, startDate: new Date("2098-01-01T00:00:00.000Z"), endDate: new Date("2098-01-15T00:00:00.000Z"), payDate: new Date("2098-01-16T00:00:00.000Z"), createdById: admin.id } });
  const loan = await raw.employeeLoan.create({ data: { tenantId: tenant.id, employeeId: employee.id, type: "LOAN", description: `${marker} loan`, principalAmount: 500, balance: 500, issuedDate: new Date("2098-01-01T00:00:00.000Z") } });
  const category = await raw.expenseCategory.create({ data: { tenantId: tenant.id, name: `${marker} Category` } });
  const expense = await raw.expense.create({ data: { tenantId: tenant.id, categoryId: category.id, description: "Isolation expense", payee: "Vendor", amount: 10, expenseDate: new Date("2098-01-02T00:00:00.000Z"), method: "CASH", createdById: admin.id } });
  const announcement = await raw.announcement.create({ data: { tenantId: tenant.id, title: `${marker} announcement`, content: "Isolation", createdById: admin.id } });
  const event = await raw.event.create({ data: { tenantId: tenant.id, title: `${marker} event`, description: "Isolation", eventDate: new Date("2098-01-10T00:00:00.000Z"), eventTime: "09:00", location: "Test", createdById: admin.id } });
  const document = await raw.documentRequest.create({ data: { tenantId: tenant.id, documentNumber: `${marker}-DOC`, homeownerId: homeowner.id, type: "CERTIFICATE_OF_RESIDENCY" } });
  await raw.documentTemplate.create({ data: { tenantId: tenant.id, type: "CERTIFICATE_OF_RESIDENCY", title: "Shared template", body: "Test" } });
  await raw.systemSetting.create({ data: { tenantId: tenant.id, category: "ASSOCIATION", key: "ISOLATION_KEY", label: "Isolation", value: suffix } });
  const chat = await raw.chatConversation.create({ data: { tenantId: tenant.id, subject: "Isolation", homeownerId: resident.id, createdById: resident.id, participants: { create: { tenantId: tenant.id, userId: resident.id } } } });
  return { tenant, admin, resident, homeowner, contractor, bill, payment, paymentAllocation, collection, vehicle, employee, attendance, payroll, loan, expense, announcement, event, document, chat };
}

async function cleanup(tenantId: string) {
  await raw.chatAttachment.deleteMany({ where: { tenantId } });
  await raw.chatMessage.deleteMany({ where: { tenantId } });
  await raw.chatParticipant.deleteMany({ where: { tenantId } });
  await raw.chatConversation.deleteMany({ where: { tenantId } });
  await raw.documentRequestHistory.deleteMany({ where: { tenantId } });
  await raw.documentVersion.deleteMany({ where: { tenantId } });
  await raw.documentRequest.deleteMany({ where: { tenantId } });
  await raw.documentTemplate.deleteMany({ where: { tenantId } });
  await raw.paymentRequest.deleteMany({ where: { tenantId } });
  await raw.paymentArchive.deleteMany({ where: { tenantId } });
  await raw.paymentAllocation.deleteMany({ where: { tenantId } });
  await raw.payment.deleteMany({ where: { tenantId } });
  await raw.bill.deleteMany({ where: { tenantId } });
  await raw.vehicle.deleteMany({ where: { tenantId } });
  await raw.bondRefund.deleteMany({ where: { tenantId } });
  await raw.collection.deleteMany({ where: { tenantId } });
  await raw.contractorProfile.deleteMany({ where: { tenantId } });
  await raw.payrollDeduction.deleteMany({ where: { tenantId } });
  await raw.payslip.deleteMany({ where: { tenantId } });
  await raw.payrollPeriod.deleteMany({ where: { tenantId } });
  await raw.attendanceAdjustment.deleteMany({ where: { tenantId } });
  await raw.overtimeRecord.deleteMany({ where: { tenantId } });
  await raw.attendance.deleteMany({ where: { tenantId } });
  await raw.employeeLoan.deleteMany({ where: { tenantId } });
  await raw.employeeProfile.deleteMany({ where: { tenantId } });
  await raw.expense.deleteMany({ where: { tenantId } });
  await raw.expenseCategory.deleteMany({ where: { tenantId } });
  await raw.announcement.deleteMany({ where: { tenantId } });
  await raw.event.deleteMany({ where: { tenantId } });
  await raw.systemSetting.deleteMany({ where: { tenantId } });
  await raw.auditLog.deleteMany({ where: { tenantId } });
  await raw.homeownerProfile.deleteMany({ where: { tenantId } });
  await raw.user.deleteMany({ where: { tenantId } });
  await raw.tenantSequence.deleteMany({ where: { tenantId } });
  await raw.tenantAdvisory.deleteMany({ where: { tenantId } });
  await raw.tenantModuleEntitlement.deleteMany({ where: { tenantId } });
  await raw.tenant.deleteMany({ where: { id: tenantId } });
}

async function main() {
  let a: Awaited<ReturnType<typeof fixture>> | undefined;
  let b: Awaited<ReturnType<typeof fixture>> | undefined;
  try {
    a = await fixture("A");
    b = await fixture("B");
    check(a.admin.email === b.admin.email && a.resident.username === b.resident.username, "tenant-composite email and username values may repeat safely");
    check(a.homeowner.block === b.homeowner.block && a.contractor.companyName === b.contractor.companyName && a.vehicle.plateNumber === b.vehicle.plateNumber, "tenant-composite business identifiers may repeat safely");

    await runWithTenant(a.tenant.id, async () => {
      const targets = [
        ["billing", "bill", b!.bill.id], ["payments", "payment", b!.payment.id], ["payment allocations", "paymentAllocation", b!.paymentAllocation.id], ["construction", "collection", b!.collection.id],
        ["contractors", "contractorProfile", b!.contractor.id], ["vehicles", "vehicle", b!.vehicle.id], ["payroll", "payrollPeriod", b!.payroll.id],
        ["attendance", "attendance", b!.attendance.id], ["loans", "employeeLoan", b!.loan.id], ["reports", "expense", b!.expense.id],
        ["announcements", "announcement", b!.announcement.id], ["events", "event", b!.event.id], ["documents", "documentRequest", b!.document.id], ["chat", "chatConversation", b!.chat.id],
      ] as const;
      const client = prisma as unknown as Record<string, { findUnique(args: { where: { id: string } }): Promise<{ id: string } | null> }>;
      for (const [label, model, id] of targets) check(await client[model].findUnique({ where: { id } }) === null, `${label} blocks malicious cross-tenant IDs`);

      let updateBlocked = false;
      try { await prisma.bill.update({ where: { id: b!.bill.id }, data: { notes: "must not change" } }); } catch { updateBlocked = true; }
      check(updateBlocked, "cross-tenant update is blocked at the database client boundary");

      let relationBlocked = false;
      try { await prisma.bill.create({ data: { homeownerId: b!.homeowner.id, billingMonth: new Date("2098-02-01T00:00:00.000Z"), coverageYear: 2098, coverageMonth: 2, amount: 1, totalAmount: 1, balance: 1, dueDate: new Date("2098-02-28T00:00:00.000Z") } }); } catch (error) { relationBlocked = error instanceof Error && error.message.includes("Cross-tenant relation blocked"); }
      check(relationBlocked, "cross-tenant scalar foreign keys are blocked before write");

      let allocationRelationBlocked = false;
      try { await prisma.paymentAllocation.create({ data: { tenantId: a!.tenant.id, paymentId: a!.payment.id, billId: b!.bill.id, amount: 1 } }); } catch (error) { allocationRelationBlocked = error instanceof Error && (error.message.includes("Cross-tenant relation blocked") || error.message.includes("Foreign key constraint")); }
      check(allocationRelationBlocked, "payment allocations reject cross-tenant payment and bill relationships");

      const nested = await prisma.documentRequest.create({ data: { homeownerId: a!.homeowner.id, type: "GATE_PASS", histories: { create: { status: "SUBMITTED", actorId: a!.admin.id, note: marker } } }, include: { histories: true } });
      check(nested.tenantId === a!.tenant.id && nested.histories[0]?.tenantId === a!.tenant.id, "nested writes inherit the authenticated tenant automatically");
      await prisma.documentRequest.delete({ where: { id: nested.id } });
    }, { enabledModules: allModules });

    let disabledModuleBlocked = false;
    await runWithTenant(a.tenant.id, async () => {
      try { await prisma.chatConversation.findMany(); } catch (error) { disabledModuleBlocked = error instanceof Error && error.message.includes("subscription plan"); }
    }, { enabledModules: [TenantModule.BILLING] });
    check(disabledModuleBlocked, "disabled subscription modules are blocked at direct-query level");

    const platformCount = await runAsPlatform(() => platformPrisma.user.count({ where: { tenantId: { in: [a!.tenant.id, b!.tenant.id] } } }));
    check(platformCount === 4, "platform context can intentionally inspect multiple tenants");
  } finally {
    if (a) await cleanup(a.tenant.id);
    if (b) await cleanup(b.tenant.id);
    await raw.$disconnect();
    await platformPrisma.$disconnect();
  }
  console.log(`PASS ${checks.length} tenant isolation checks`);
  for (const label of checks) console.log(`- ${label}`);
  console.log("TENANT_ISOLATION_TEST_DATA_CLEANED");
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
