import {
  DocumentRequestStatus,
  DocumentSubjectType,
  DocumentType,
  HomeownerActivationStatus,
  HomeownerEmailVerificationStatus,
  HomeownerStatus,
  RecurringChargeType,
  Role,
  TenantModule,
} from "@prisma/client";
import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const primaryTenantId = "tenant_pagsibol4b_default";
const secondaryTenantId = "tenant_e2e_browser_isolation";
const secondaryTenantSlug = "e2e-browser-isolation";

const primaryHomeownerUserId = "e2e_browser_homeowner_user";
const primaryHomeownerId = "e2e_browser_homeowner";
const secondaryHomeownerUserId = "e2e_browser_other_user";
const secondaryHomeownerId = "e2e_browser_other_homeowner";
const billingRuleId = "e2e_browser_billing_rule";
const documentRequestId = "e2e_browser_document_request";

const primaryEmail = process.env.E2E_HOMEOWNER_EMAIL || "ci-homeowner@example.invalid";
const secondaryEmail = process.env.E2E_OTHER_HOMEOWNER_EMAIL || "ci-other-homeowner@example.invalid";
const homeownerPassword = process.env.E2E_HOMEOWNER_PASSWORD || "CI-Homeowner-Password-2026!";
const announcementTitle = process.env.E2E_ANNOUNCEMENT_TITLE || "E2E Tenant Visibility Notice";
const coverageYear = Number(process.env.E2E_COVERAGE_YEAR || 2099);
const coverageMonth = Number(process.env.E2E_COVERAGE_MONTH || 1);

function assertSafeDatabase() {
  const allowLocal = process.env.HOAHUB_E2E_ALLOW_LOCAL === "1";
  if (process.env.CI !== "true" && !allowLocal) {
    throw new Error("Critical browser fixtures are restricted to CI. Set HOAHUB_E2E_ALLOW_LOCAL=1 for an explicit local disposable-database run.");
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for critical browser fixtures.");
  const host = new URL(databaseUrl).hostname;
  if (!allowLocal && !["127.0.0.1", "localhost", "mysql"].includes(host)) {
    throw new Error(`Refusing to prepare browser fixtures against non-disposable database host: ${host}`);
  }
  if (!Number.isInteger(coverageYear) || coverageYear < 2090 || coverageYear > 2200) {
    throw new Error("E2E_COVERAGE_YEAR must be a reserved future year between 2090 and 2200.");
  }
  if (!Number.isInteger(coverageMonth) || coverageMonth < 1 || coverageMonth > 12) {
    throw new Error("E2E_COVERAGE_MONTH must be between 1 and 12.");
  }
}

async function removeDynamicFixtures() {
  await prisma.userSession.deleteMany({
    where: { userId: { in: [primaryHomeownerUserId, secondaryHomeownerUserId] } },
  });
  await prisma.paymentAllocation.deleteMany({
    where: { tenantId: primaryTenantId, payment: { homeownerId: primaryHomeownerId } },
  });
  await prisma.paymentRequest.deleteMany({
    where: { tenantId: primaryTenantId, homeownerId: primaryHomeownerId },
  });
  await prisma.paymentArchive.deleteMany({
    where: { tenantId: primaryTenantId, homeownerId: primaryHomeownerId },
  });
  await prisma.payment.deleteMany({
    where: { tenantId: primaryTenantId, homeownerId: primaryHomeownerId },
  });
  await prisma.bill.deleteMany({
    where: { tenantId: primaryTenantId, homeownerId: primaryHomeownerId },
  });
  await prisma.documentRequest.deleteMany({
    where: { tenantId: primaryTenantId, id: documentRequestId },
  });
  await prisma.announcement.deleteMany({
    where: { tenantId: primaryTenantId, title: announcementTitle },
  });
}

async function ensureEntitlements(tenantId: string, modules: TenantModule[]) {
  for (const tenantModule of modules) {
    await prisma.tenantModuleEntitlement.upsert({
      where: { tenantId_module: { tenantId, module: tenantModule } },
      update: { enabled: true },
      create: { tenantId, module: tenantModule, enabled: true },
    });
  }
}

async function ensureHomeowner(input: {
  tenantId: string;
  userId: string;
  homeownerId: string;
  email: string;
  name: string;
  accountNumber: string;
  block: string;
  lot: string;
}) {
  const passwordHash = await hash(homeownerPassword, 12);
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: input.tenantId, email: input.email } },
    update: {
      id: input.userId,
      name: input.name,
      passwordHash,
      role: Role.HOMEOWNER,
      active: true,
    },
    create: {
      id: input.userId,
      tenantId: input.tenantId,
      name: input.name,
      email: input.email,
      passwordHash,
      role: Role.HOMEOWNER,
      active: true,
    },
  });

  await prisma.homeownerProfile.upsert({
    where: { id: input.homeownerId },
    update: {
      userId: input.userId,
      address: `${input.block}-${input.lot} E2E Test Street`,
      block: input.block,
      lot: input.lot,
      phone: "09000000000",
      accountNumber: input.accountNumber,
      status: HomeownerStatus.ACTIVE,
      activationStatus: HomeownerActivationStatus.ACTIVE,
      emailStatus: HomeownerEmailVerificationStatus.VERIFIED,
      emailVerifiedAt: new Date(),
      activatedAt: new Date(),
      monthlyDuesAmount: 1250,
    },
    create: {
      id: input.homeownerId,
      tenantId: input.tenantId,
      userId: input.userId,
      address: `${input.block}-${input.lot} E2E Test Street`,
      block: input.block,
      lot: input.lot,
      phone: "09000000000",
      accountNumber: input.accountNumber,
      status: HomeownerStatus.ACTIVE,
      activationStatus: HomeownerActivationStatus.ACTIVE,
      emailStatus: HomeownerEmailVerificationStatus.VERIFIED,
      emailVerifiedAt: new Date(),
      activatedAt: new Date(),
      monthlyDuesAmount: 1250,
    },
  });
}

async function setup() {
  assertSafeDatabase();
  const administratorEmail = process.env.SEED_SYSTEM_ADMIN_EMAIL?.trim().toLowerCase();
  if (!administratorEmail) throw new Error("SEED_SYSTEM_ADMIN_EMAIL is required for browser fixtures.");
  const administrator = await prisma.user.findFirst({
    where: { tenantId: primaryTenantId, email: administratorEmail, role: Role.SYSTEM_ADMIN, active: true },
  });
  if (!administrator) throw new Error("The seeded system administrator was not found. Run pnpm db:seed first.");

  await prisma.tenant.upsert({
    where: { id: secondaryTenantId },
    update: { name: "E2E Isolation HOA", shortName: "E2E-B", slug: secondaryTenantSlug },
    create: { id: secondaryTenantId, name: "E2E Isolation HOA", shortName: "E2E-B", slug: secondaryTenantSlug },
  });

  await ensureEntitlements(primaryTenantId, [TenantModule.BILLING, TenantModule.DOCUMENTS, TenantModule.ANNOUNCEMENTS]);
  await ensureEntitlements(secondaryTenantId, [TenantModule.ANNOUNCEMENTS]);

  await ensureHomeowner({
    tenantId: primaryTenantId,
    userId: primaryHomeownerUserId,
    homeownerId: primaryHomeownerId,
    email: primaryEmail,
    name: "E2E Browser Homeowner",
    accountNumber: "99000000001",
    block: "E2E-A",
    lot: "001",
  });
  await ensureHomeowner({
    tenantId: secondaryTenantId,
    userId: secondaryHomeownerUserId,
    homeownerId: secondaryHomeownerId,
    email: secondaryEmail,
    name: "E2E Other Tenant Homeowner",
    accountNumber: "99000000002",
    block: "E2E-B",
    lot: "001",
  });

  await removeDynamicFixtures();

  await prisma.billingRule.upsert({
    where: { id: billingRuleId },
    update: {
      tenantId: primaryTenantId,
      recurringChargeType: RecurringChargeType.MONTHLY_DUES,
      amount: 1250,
      effectiveStartYear: coverageYear,
      effectiveStartMonth: coverageMonth,
      effectiveEndYear: coverageYear,
      effectiveEndMonth: coverageMonth,
      resolutionReference: "E2E-RES-2099-001",
      active: true,
      createdById: administrator.id,
      updatedById: administrator.id,
    },
    create: {
      id: billingRuleId,
      tenantId: primaryTenantId,
      recurringChargeType: RecurringChargeType.MONTHLY_DUES,
      amount: 1250,
      effectiveStartYear: coverageYear,
      effectiveStartMonth: coverageMonth,
      effectiveEndYear: coverageYear,
      effectiveEndMonth: coverageMonth,
      resolutionReference: "E2E-RES-2099-001",
      active: true,
      createdById: administrator.id,
      updatedById: administrator.id,
    },
  });

  await prisma.documentRequest.create({
    data: {
      id: documentRequestId,
      tenantId: primaryTenantId,
      submissionKey: "e2e-browser-document-request",
      homeownerId: primaryHomeownerId,
      type: DocumentType.CLEARANCE_CERTIFICATE,
      status: DocumentRequestStatus.SUBMITTED,
      subjectType: DocumentSubjectType.SELF,
      subjectSnapshot: { fullName: "E2E Browser Homeowner", relationship: "Registered homeowner" },
      requestDataSnapshot: { purpose: "E2E browser document request" },
      purpose: "E2E browser document request",
      numberOfCopies: 1,
      outstandingBalanceAtRequest: 0,
    },
  });

  console.log("Critical browser fixtures prepared.");
  console.log(`Primary homeowner: ${primaryEmail}`);
  console.log(`Secondary homeowner: ${secondaryEmail}`);
  console.log(`Coverage: ${coverageYear}-${String(coverageMonth).padStart(2, "0")}`);
}

async function cleanup() {
  assertSafeDatabase();
  await removeDynamicFixtures();
  console.log("Critical browser dynamic fixtures removed.");
}

const operation = process.argv[2] || "setup";

(operation === "cleanup" ? cleanup() : setup())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
