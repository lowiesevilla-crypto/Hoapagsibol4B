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
const ONBOARDING_IMPORT_WRITE_BATCH_SIZE = 250;

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

type PreparedOnboardingRow = {
  row: OnboardingHomeownerRow;
  accountNumber: string;
  passwordHash: string;
  userId: string;
  homeownerId: string;
};

type ActivationJob = {
  userId: string;
  name: string;
  email: string;
  accountNumber: string;
  temporaryPassword: string;
  emailVerificationToken: string;
  expiresAt: Date;
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
  // batch hash is used only until each homeowner completes the separately authorized activation flow.
  const batchPlaceholderPasswordHash = await hash(`activation-only-${randomUUID()}`, 12);
  const suppliedAccountNumbers = new Set(
    validation.rows.map((row) => row.accountNumber).filter((value): value is string => Boolean(value)),
  );
  const missingAccountCount = validation.rows.reduce((count, row) => count + (row.accountNumber ? 0 : 1), 0);
  const generatedAccountNumbers = await allocateUniqueHomeownerAccountNumbers(missingAccountCount, suppliedAccountNumbers);
  let generatedAccountIndex = 0;
  const prepared: PreparedOnboardingRow[] = validation.rows.map((row) => {
    const generatedAccountNumber = row.accountNumber ? null : generatedAccountNumbers[generatedAccountIndex++];
    const accountNumber = row.accountNumber ?? generatedAccountNumber;
    if (!accountNumber) throw new Error(`Unable to allocate an account number for row ${row.rowNumber}.`);
    return {
      row,
      accountNumber,
      passwordHash: batchPlaceholderPasswordHash,
      userId: randomUUID(),
      homeownerId: randomUUID(),
    };
  });

  const activationJobs = await runWithTenant(
    input.tenantId,
    async () => await prisma.$transaction(async (tx) => {
      // The tenant-boundary extension remains active at runtime. The cast only restores the
      // canonical Prisma transaction surface expected by shared onboarding helpers.
      const transaction = tx as unknown as Prisma.TransactionClient;
      await assertImportNotAlreadyApplied(transaction, input.tenantId, validation.fileHash);

      const applied = deferActivationInvitations
        ? await applyClientScaleRows(transaction, input, validation, prepared)
        : await applyInlineRows(transaction, input, validation, prepared);

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
          openingBalancesPosted: applied.openingBalancesPosted,
          activationInvitationsDeferred,
        },
      }), transaction);

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
            openingBalancesPosted: applied.openingBalancesPosted,
            activationEmailsAttempted: applied.jobs.length,
            activationInvitationsDeferred,
            activationMode: deferActivationInvitations ? "DEFERRED_CLIENT_SCALE" : "INLINE_SMALL_IMPORT",
          },
        },
      });

      return applied;
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

async function assertImportNotAlreadyApplied(tx: Prisma.TransactionClient, tenantId: string, fileHash: string) {
  const currentStateSetting = await tx.systemSetting.findFirst({
    where: { tenantId, category: "ASSOCIATION", key: "TENANT_ONBOARDING_V1" },
    select: { value: true },
  });
  if (!currentStateSetting?.value) return;
  try {
    const state = JSON.parse(currentStateSetting.value) as { import?: { appliedAt?: string; fileHash?: string } };
    if (state.import?.appliedAt && state.import.fileHash === fileHash) throw new Error("This onboarding file has already been applied.");
  } catch (error) {
    if (error instanceof Error && error.message.includes("already been applied")) throw error;
  }
}

async function applyClientScaleRows(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; actorId: string; fileName: string },
  validation: OnboardingImportValidation,
  prepared: PreparedOnboardingRow[],
) {
  const userRows: Prisma.UserCreateManyInput[] = [];
  const profileRows: Prisma.HomeownerProfileCreateManyInput[] = [];
  const roleRows: Prisma.UserRoleAssignmentCreateManyInput[] = [];
  const reservationRows: Prisma.HomeownerAccountNumberReservationCreateManyInput[] = [];
  const billRows: Prisma.BillCreateManyInput[] = [];
  const migrationRows: Prisma.DataMigrationCreateManyInput[] = [];
  const auditRows: Prisma.AuditLogCreateManyInput[] = [];
  const today = startOfTodayUtc();

  for (const item of prepared) {
    const emailProvided = Boolean(item.row.email);
    const storedEmail = item.row.email || homeownerNoEmailAddress(item.accountNumber);
    userRows.push({
      id: item.userId,
      tenantId: input.tenantId,
      name: item.row.name,
      email: storedEmail,
      passwordHash: item.passwordHash,
      role: Role.HOMEOWNER,
      active: true,
    });
    profileRows.push({
      id: item.homeownerId,
      tenantId: input.tenantId,
      userId: item.userId,
      phone: item.row.phone,
      address: item.row.address,
      block: item.row.block,
      lot: item.row.lot,
      phase: item.row.phase,
      propertyType: item.row.propertyType,
      occupancyStatus: item.row.occupancyStatus,
      accountNumber: item.accountNumber,
      status: item.row.status,
      activationStatus: HomeownerActivationStatus.NOT_INVITED,
      emailStatus: HomeownerEmailVerificationStatus.UNVERIFIED,
      activationSentAt: null,
      monthlyDuesAmount: item.row.monthlyDuesAmount,
    });
    roleRows.push({
      tenantId: input.tenantId,
      userId: item.userId,
      role: Role.HOMEOWNER,
      assignedBy: input.actorId,
      active: true,
    });
    reservationRows.push({
      tenantId: input.tenantId,
      homeownerId: item.homeownerId,
      accountNumber: item.accountNumber,
      reason: "ONBOARDING_IMPORT",
    });
    auditRows.push({
      tenantId: input.tenantId,
      actorId: input.actorId,
      module: "ONBOARDING",
      action: "HOMEOWNER_IMPORTED",
      entityType: "HomeownerProfile",
      entityId: item.homeownerId,
      metadata: {
        fileHash: validation.fileHash,
        rowNumber: item.row.rowNumber,
        openingBalance: item.row.openingBalance > 0,
        accountNumberProvided: Boolean(item.row.accountNumber),
        emailProvided,
        activationDeferred: emailProvided,
      },
    });

    if (item.row.openingBalance > 0 && item.row.openingBalanceAsOf) {
      const period = new Date(Date.UTC(item.row.openingBalanceAsOf.getUTCFullYear(), item.row.openingBalanceAsOf.getUTCMonth(), 1));
      const dueDate = new Date(Date.UTC(period.getUTCFullYear(), period.getUTCMonth() + 1, 0));
      const billId = randomUUID();
      const migrationId = randomUUID();
      billRows.push({
        id: billId,
        tenantId: input.tenantId,
        homeownerId: item.homeownerId,
        billingMonth: period,
        coverageYear: period.getUTCFullYear(),
        coverageMonth: period.getUTCMonth() + 1,
        amount: item.row.openingBalance,
        penalty: 0,
        totalAmount: item.row.openingBalance,
        amountPaid: 0,
        balance: item.row.openingBalance,
        dueDate,
        status: dueDate < today ? BillStatus.OVERDUE : BillStatus.UNPAID,
        notes: `[MIGRATED][OPENING_BALANCE] Tenant onboarding import ${validation.fileHash.slice(0, 12)}`,
      });
      migrationRows.push({
        id: migrationId,
        tenantId: input.tenantId,
        kind: DataMigrationKind.DUES_OPENING_BALANCE,
        tag: DataMigrationTag.OPENING_BALANCE,
        homeownerId: item.homeownerId,
        period,
        amount: item.row.openingBalance,
        remarks: `Tenant onboarding opening balance from ${input.fileName}`,
        postedRecordType: "Bill",
        postedRecordId: billId,
        dedupeKey: `ONBOARDING|${validation.fileHash}|${item.row.rowNumber}|DUES_OPENING_BALANCE`,
        createdById: input.actorId,
      });
      auditRows.push({
        tenantId: input.tenantId,
        actorId: input.actorId,
        module: "DATA_MIGRATION",
        action: "POST_DUES_OPENING_BALANCE",
        entityType: "DataMigration",
        entityId: migrationId,
        metadata: {
          source: "TENANT_ONBOARDING",
          fileHash: validation.fileHash,
          rowNumber: item.row.rowNumber,
          amount: item.row.openingBalance,
          billId,
        },
      });
    }
  }

  await createManyInBatches(userRows, (data) => tx.user.createMany({ data }));
  await createManyInBatches(profileRows, (data) => tx.homeownerProfile.createMany({ data }));
  await createManyInBatches(roleRows, (data) => tx.userRoleAssignment.createMany({ data }));
  await createManyInBatches(reservationRows, (data) => tx.homeownerAccountNumberReservation.createMany({ data }));
  await createManyInBatches(billRows, (data) => tx.bill.createMany({ data }));
  await createManyInBatches(migrationRows, (data) => tx.dataMigration.createMany({ data }));
  await createManyInBatches(auditRows, (data) => tx.auditLog.createMany({ data }));

  return { jobs: [] as ActivationJob[], openingBalancesPosted: billRows.length };
}

async function applyInlineRows(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; actorId: string; fileName: string },
  validation: OnboardingImportValidation,
  prepared: PreparedOnboardingRow[],
) {
  const jobs: ActivationJob[] = [];
  let openingBalancesPosted = 0;

  for (const item of prepared) {
    const emailProvided = Boolean(item.row.email);
    const storedEmail = item.row.email || homeownerNoEmailAddress(item.accountNumber);
    const user = await tx.user.create({
      data: {
        id: item.userId,
        tenantId: input.tenantId,
        name: item.row.name,
        email: storedEmail,
        passwordHash: item.passwordHash,
        role: Role.HOMEOWNER,
        active: true,
        homeownerProfile: {
          create: {
            id: item.homeownerId,
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
            activationStatus: emailProvided ? HomeownerActivationStatus.INVITATION_SENT : HomeownerActivationStatus.NOT_INVITED,
            emailStatus: HomeownerEmailVerificationStatus.UNVERIFIED,
            activationSentAt: emailProvided ? new Date() : null,
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

    await tx.homeownerAccountNumberReservation.create({
      data: {
        tenantId: input.tenantId,
        homeownerId: homeowner.id,
        accountNumber: item.accountNumber,
        reason: "ONBOARDING_IMPORT",
      },
    });

    const activation = emailProvided
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
          dedupeKey: `ONBOARDING|${validation.fileHash}|${item.row.rowNumber}|DUES_OPENING_BALANCE`,
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

    await tx.auditLog.create({
      data: {
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
          activationDeferred: false,
        },
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

  return { jobs, openingBalancesPosted };
}

async function createManyInBatches<T>(rows: T[], create: (batch: T[]) => Promise<unknown>) {
  for (let index = 0; index < rows.length; index += ONBOARDING_IMPORT_WRITE_BATCH_SIZE) {
    await create(rows.slice(index, index + ONBOARDING_IMPORT_WRITE_BATCH_SIZE));
  }
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
