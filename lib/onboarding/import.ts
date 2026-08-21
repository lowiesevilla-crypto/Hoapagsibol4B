import "server-only";

import { randomUUID } from "node:crypto";
import {
  BillStatus,
  DataMigrationKind,
  DataMigrationTag,
  HomeownerActivationStatus,
  HomeownerEmailVerificationStatus,
  Prisma,
  Role,
} from "@prisma/client";
import { hash } from "bcryptjs";
import { platformPrisma, prisma } from "@/lib/db";
import {
  parseOnboardingHomeownerCsv,
  type OnboardingHomeownerRow,
  type OnboardingImportError,
} from "@/lib/onboarding/csv";
import { updateTenantOnboardingState } from "@/lib/onboarding/state";
import { generateHomeownerAccountNumberCandidate } from "@/lib/services/homeowner-account-number";
import { homeownerNoEmailAddress } from "@/lib/services/homeowner-digital-activation";
import { createHomeownerActivationCredential, sendHomeownerActivationEmail } from "@/lib/services/homeowner-activation";
import { runWithTenant } from "@/lib/tenant-context";

export const ONBOARDING_INLINE_ACTIVATION_MAX_ROWS = 25;
export const ONBOARDING_IMPORT_TRANSACTION_TIMEOUT_MS = 300_000;
const ONBOARDING_IMPORT_WRITE_BATCH_SIZE = 500;

export type OnboardingImportValidation = {
  fileHash: string;
  templateVersion: string;
  validRows: number;
  errors: OnboardingImportError[];
  rows: OnboardingHomeownerRow[];
};

export type OnboardingImportResult = {
  fileHash: string;
  importedRows: number;
  openingBalancesPosted: number;
  activationEmailsAttempted: number;
  activationInvitationsDeferred: number;
};

export async function validateOnboardingImport(tenantId: string, csv: string): Promise<OnboardingImportValidation> {
  const parsed = parseOnboardingHomeownerCsv(csv);
  if (parsed.errors.length || !parsed.rows.length) {
    return {
      fileHash: parsed.fileHash,
      templateVersion: parsed.templateVersion,
      validRows: parsed.rows.length,
      errors: parsed.errors,
      rows: parsed.rows,
    };
  }

  const emails = parsed.rows.map((row) => row.email).filter(Boolean);
  const properties = parsed.rows.map((row) => ({ block: row.block, lot: row.lot }));
  const suppliedAccounts = parsed.rows.map((row) => row.accountNumber).filter((value): value is string => Boolean(value));
  const [users, profiles, accountProfiles, accountReservations] = await Promise.all([
    emails.length
      ? platformPrisma.user.findMany({
          where: { tenantId, email: { in: emails } },
          select: { email: true },
        })
      : Promise.resolve([]),
    platformPrisma.homeownerProfile.findMany({
      where: { tenantId, OR: properties },
      select: { block: true, lot: true },
    }),
    suppliedAccounts.length
      ? platformPrisma.homeownerProfile.findMany({ where: { accountNumber: { in: suppliedAccounts } }, select: { accountNumber: true } })
      : Promise.resolve([]),
    suppliedAccounts.length
      ? platformPrisma.homeownerAccountNumberReservation.findMany({ where: { accountNumber: { in: suppliedAccounts } }, select: { accountNumber: true } })
      : Promise.resolve([]),
  ]);

  const errors: OnboardingImportError[] = [];
  const existingEmails = new Set(users.map((user) => user.email.toLowerCase()));
  const existingProperties = new Set(profiles.map((profile) => `${profile.block.toLowerCase()}|${profile.lot.toLowerCase()}`));
  const existingAccounts = new Set([
    ...accountProfiles.map((profile) => profile.accountNumber).filter(Boolean),
    ...accountReservations.map((reservation) => reservation.accountNumber),
  ]);

  for (const row of parsed.rows) {
    if (row.email && existingEmails.has(row.email)) errors.push({ rowNumber: row.rowNumber, field: "email", message: "A homeowner with this email already exists in this tenant." });
    if (existingProperties.has(`${row.block.toLowerCase()}|${row.lot.toLowerCase()}`)) errors.push({ rowNumber: row.rowNumber, field: "block/lot", message: "This property already exists in this tenant." });
    if (row.accountNumber && existingAccounts.has(row.accountNumber)) errors.push({ rowNumber: row.rowNumber, field: "accountNumber", message: "This account number is already assigned or reserved." });
  }

  return {
    fileHash: parsed.fileHash,
    templateVersion: parsed.templateVersion,
    validRows: parsed.rows.length,
    errors,
    rows: parsed.rows,
  };
}

export async function applyOnboardingImport(input: {
  tenantId: string;
  actorId: string;
  csv: string;
  expectedFileHash: string;
  fileName: string;
}): Promise<OnboardingImportResult> {
  const validation = await validateOnboardingImport(input.tenantId, input.csv);
  if (validation.fileHash !== input.expectedFileHash) throw new Error("The CSV changed after validation. Run the dry-run validation again.");
  if (validation.errors.length) throw new Error("The CSV has validation errors. No homeowner records were imported.");
  if (!validation.rows.length) throw new Error("The CSV does not contain homeowner rows.");

  const deferActivationInvitations = validation.rows.length > ONBOARDING_INLINE_ACTIVATION_MAX_ROWS;
  const activationInvitationsDeferred = deferActivationInvitations
    ? validation.rows.filter((row) => Boolean(row.email)).length
    : 0;

  // Imported accounts cannot authenticate with this internal placeholder. A single high-entropy
  // batch hash avoids thousands of redundant bcrypt operations before a large transactional import;
  // real activation credentials remain unique when an invitation is actually issued.
  const batchPlaceholderPasswordHash = await hash(`activation-only-${randomUUID()}`, 12);
  const suppliedAccountNumbers = new Set(
    validation.rows.map((row) => row.accountNumber).filter((value): value is string => Boolean(value)),
  );
  const missingAccountCount = validation.rows.reduce((count, row) => count + (row.accountNumber ? 0 : 1), 0);
  const generatedAccountNumbers = await allocateUniqueHomeownerAccountNumbers(missingAccountCount, suppliedAccountNumbers);
  let generatedAccountIndex = 0;
  const prepared = validation.rows.map((row) => ({
    row,
    accountNumber: row.accountNumber ?? generatedAccountNumbers[generatedAccountIndex++],
    passwordHash: batchPlaceholderPasswordHash,
  }));

  const activationJobs = await runWithTenant(
    input.tenantId,
    async () => await prisma.$transaction(async (tx) => {
      const currentStateSetting = await tx.systemSetting.findFirst({
        where: { tenantId: input.tenantId, category: "ASSOCIATION", key: "TENANT_ONBOARDING_V1" },
        select: { value: true },
      });
      if (currentStateSetting?.value) {
        try {
          const state = JSON.parse(currentStateSetting.value) as { import?: { appliedAt?: string; fileHash?: string } };
          if (state.import?.appliedAt && state.import.fileHash === validation.fileHash) throw new Error("This onboarding file has already been applied.");
        } catch (error) {
          if (error instanceof Error && error.message.includes("already been applied")) throw error;
        }
      }

      const jobs: Array<{
        userId: string;
        name: string;
        email: string;
        accountNumber: string;
        temporaryPassword: string;
        emailVerificationToken: string;
        expiresAt: Date;
      }> = [];
      const reservationRows: Array<{
        tenantId: string;
        homeownerId: string;
        accountNumber: string;
        reason: string;
      }> = [];
      const homeownerAuditRows: Array<{
        tenantId: string;
        actorId: string;
        module: string;
        action: string;
        entityType: string;
        entityId: string;
        metadata: Prisma.InputJsonValue;
      }> = [];
      let openingBalancesPosted = 0;

      for (const item of prepared) {
        const emailProvided = Boolean(item.row.email);
        const inlineActivation = emailProvided && !deferActivationInvitations;
        const storedEmail = item.row.email || homeownerNoEmailAddress(item.accountNumber);
        const user = await tx.user.create({
          data: {
            tenantId: input.tenantId,
            name: item.row.name,
            email: storedEmail,
            passwordHash: item.passwordHash,
            role: Role.HOMEOWNER,
            active: true,
            homeownerProfile: {
              create: {
                tenantId: input.tenantId,
                phone: item.row.phone,
                address: item.row.address,
                block: item.row.block,
                lot: item.row.lot,
                phase: item.row.phase,
                propertyType: item.row.propertyType,
                occupancyStatus: item.row.occupancyStatus,
                accountNumber: item.accountNumber,
                status: item.row.status,
                activationStatus: inlineActivation ? HomeownerActivationStatus.INVITATION_SENT : HomeownerActivationStatus.NOT_INVITED,
                emailStatus: HomeownerEmailVerificationStatus.UNVERIFIED,
                activationSentAt: inlineActivation ? new Date() : null,
                monthlyDuesAmount: item.row.monthlyDuesAmount,
              },
            },
            userRoleAssignments: {
              create: {
                tenantId: input.tenantId,
                role: Role.HOMEOWNER,
                assignedBy: input.actorId,
                active: true,
              },
            },
          },
          include: { homeownerProfile: true },
        });
        const homeowner = user.homeownerProfile;
        if (!homeowner) throw new Error(`Homeowner profile was not created for row ${item.row.rowNumber}.`);

        reservationRows.push({
          tenantId: input.tenantId,
          homeownerId: homeowner.id,
          accountNumber: item.accountNumber,
          reason: "ONBOARDING_IMPORT",
        });

        const activation = inlineActivation
          ? await createHomeownerActivationCredential({
              tenantId: input.tenantId,
              userId: user.id,
              createdById: input.actorId,
              tx,
            })
          : null;

        if (item.row.openingBalance > 0 && item.row.openingBalanceAsOf) {
          const period = new Date(Date.UTC(item.row.openingBalanceAsOf.getUTCFullYear(), item.row.openingBalanceAsOf.getUTCMonth(), 1));
          const dueDate = new Date(Date.UTC(period.getUTCFullYear(), period.getUTCMonth() + 1, 0));
          const bill = await tx.bill.create({
            data: {
              tenantId: input.tenantId,
              homeowner: { connect: { id: homeowner.id } },
              billingMonth: period,
              coverageYear: period.getUTCFullYear(),
              coverageMonth: period.getUTCMonth() + 1,
              amount: item.row.openingBalance,
              penalty: 0,
              totalAmount: item.row.openingBalance,
              amountPaid: 0,
              balance: item.row.openingBalance,
              dueDate,
              status: dueDate < startOfTodayUtc() ? BillStatus.OVERDUE : BillStatus.UNPAID,
              notes: `[MIGRATED][OPENING_BALANCE] Tenant onboarding import ${validation.fileHash.slice(0, 12)}`,
            },
          });
          const dedupeKey = `ONBOARDING|${validation.fileHash}|${item.row.rowNumber}|DUES_OPENING_BALANCE`;
          const migration = await tx.dataMigration.create({
            data: {
              tenantId: input.tenantId,
              kind: DataMigrationKind.DUES_OPENING_BALANCE,
              tag: DataMigrationTag.OPENING_BALANCE,
              homeowner: { connect: { id: homeowner.id } },
              period,
              amount: item.row.openingBalance,
              remarks: `Tenant onboarding opening balance from ${input.fileName}`,
              postedRecordType: "Bill",
              postedRecordId: bill.id,
              dedupeKey,
              createdBy: { connect: { id: input.actorId } },
            },
          });
          await tx.auditLog.create({
            data: {
              tenantId: input.tenantId,
              actorId: input.actorId,
              module: "DATA_MIGRATION",
              action: "POST_DUES_OPENING_BALANCE",
              entityType: "DataMigration",
              entityId: migration.id,
              metadata: { source: "TENANT_ONBOARDING", fileHash: validation.fileHash, rowNumber: item.row.rowNumber, amount: item.row.openingBalance, billId: bill.id },
            },
          });
          openingBalancesPosted++;
        }

        homeownerAuditRows.push({
          tenantId: input.tenantId,
          actorId: input.actorId,
          module: "ONBOARDING",
          action: "HOMEOWNER_IMPORTED",
          entityType: "HomeownerProfile",
          entityId: homeowner.id,
          metadata: {
            fileHash: validation.fileHash,
            rowNumber: item.row.rowNumber,
            openingBalance: item.row.openingBalance > 0,
            accountNumberProvided: Boolean(item.row.accountNumber),
            emailProvided,
            activationDeferred: emailProvided && deferActivationInvitations,
          },
        });

        if (activation) {
          jobs.push({
            userId: user.id,
            name: user.name,
            email: item.row.email,
            accountNumber: item.accountNumber,
            ...activation,
          });
        }
      }

      for (let index = 0; index < reservationRows.length; index += ONBOARDING_IMPORT_WRITE_BATCH_SIZE) {
        await tx.homeownerAccountNumberReservation.createMany({
          data: reservationRows.slice(index, index + ONBOARDING_IMPORT_WRITE_BATCH_SIZE),
        });
      }
      for (let index = 0; index < homeownerAuditRows.length; index += ONBOARDING_IMPORT_WRITE_BATCH_SIZE) {
        await tx.auditLog.createMany({
          data: homeownerAuditRows.slice(index, index + ONBOARDING_IMPORT_WRITE_BATCH_SIZE),
        });
      }

      await updateTenantOnboardingState(input.tenantId, input.actorId, (state) => ({
        ...state,
        import: {
          templateVersion: validation.templateVersion,
          fileHash: validation.fileHash,
          fileName: input.fileName,
          validatedAt: state.import?.validatedAt ?? new Date().toISOString(),
          validRows: validation.rows.length,
          errors: [],
          appliedAt: new Date().toISOString(),
          importedRows: validation.rows.length,
          openingBalancesPosted,
          activationInvitationsDeferred,
        },
      }), tx);

      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          actorId: input.actorId,
          module: "ONBOARDING",
          action: "HOMEOWNER_IMPORT_APPLIED",
          entityType: "Tenant",
          entityId: input.tenantId,
          metadata: {
            fileHash: validation.fileHash,
            templateVersion: validation.templateVersion,
            importedRows: validation.rows.length,
            openingBalancesPosted,
            activationEmailsAttempted: jobs.length,
            activationInvitationsDeferred,
            activationMode: deferActivationInvitations ? "DEFERRED_CLIENT_SCALE" : "INLINE_SMALL_IMPORT",
          },
        },
      });

      return { jobs, openingBalancesPosted };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: ONBOARDING_IMPORT_TRANSACTION_TIMEOUT_MS,
    }),
    { role: Role.HOA_ADMIN },
  );

  for (const job of activationJobs.jobs) {
    await runWithTenant(
      input.tenantId,
      () => sendHomeownerActivationEmail({
        tenantId: input.tenantId,
        actorId: input.actorId,
        ...job,
      }),
      { role: Role.HOA_ADMIN },
    );
  }

  return {
    fileHash: validation.fileHash,
    importedRows: validation.rows.length,
    openingBalancesPosted: activationJobs.openingBalancesPosted,
    activationEmailsAttempted: activationJobs.jobs.length,
    activationInvitationsDeferred,
  };
}

async function allocateUniqueHomeownerAccountNumbers(count: number, blockedAccountNumbers: Set<string>) {
  if (count <= 0) return [];
  const allocated: string[] = [];
  const seen = new Set(blockedAccountNumbers);

  while (allocated.length < count) {
    const remaining = count - allocated.length;
    const candidates: string[] = [];
    const targetCandidateCount = Math.min(remaining + Math.max(8, Math.ceil(remaining * 0.02)), 5_000);
    while (candidates.length < targetCandidateCount) {
      const candidate = generateHomeownerAccountNumberCandidate();
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      candidates.push(candidate);
    }

    const [existingProfiles, existingReservations] = await Promise.all([
      platformPrisma.homeownerProfile.findMany({
        where: { accountNumber: { in: candidates } },
        select: { accountNumber: true },
      }),
      platformPrisma.homeownerAccountNumberReservation.findMany({
        where: { accountNumber: { in: candidates } },
        select: { accountNumber: true },
      }),
    ]);
    const unavailable = new Set([
      ...existingProfiles.map((profile) => profile.accountNumber).filter((value): value is string => Boolean(value)),
      ...existingReservations.map((reservation) => reservation.accountNumber),
    ]);
    for (const candidate of candidates) {
      if (unavailable.has(candidate)) continue;
      allocated.push(candidate);
      if (allocated.length === count) break;
    }
  }

  return allocated;
}

function startOfTodayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
