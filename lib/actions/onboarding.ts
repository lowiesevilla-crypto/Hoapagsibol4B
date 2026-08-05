"use server";

import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { DataMigrationKind, HomeownerActivationStatus, Prisma, Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { postMigration } from "@/lib/actions/data-migrations";
import { parseOnboardingHomeownerCsv, type OnboardingImportPreview } from "@/lib/services/onboarding-homeowner-import";
import { generateUniqueHomeownerAccountNumber } from "@/lib/services/homeowner-account-number";
import { createHomeownerActivationCredential, sendHomeownerActivationEmail } from "@/lib/services/homeowner-activation";

export type OnboardingImportState = {
  success: boolean;
  committed: boolean;
  message: string;
  preview?: OnboardingImportPreview;
  imported: number;
};

const emptyState: OnboardingImportState = { success: false, committed: false, message: "", imported: 0 };

export async function previewOnboardingHomeownersAction(_state: OnboardingImportState = emptyState, formData: FormData): Promise<OnboardingImportState> {
  const user = await requireUser();
  assertPermission(user.permissions, "homeowners.manage");
  const file = formData.get("file");
  if (!isCsvFile(file)) return { ...emptyState, message: "Upload a CSV file no larger than 2 MB." };
  const preview = parseOnboardingHomeownerCsv(await file.text());
  const databaseErrors = await validateExistingRecords(user.tenantId, preview);
  preview.errors.push(...databaseErrors);
  await prisma.auditLog.create({
    data: {
      tenantId: user.tenantId,
      actorId: user.id,
      module: "ONBOARDING",
      action: "HOMEOWNER_IMPORT_PREVIEWED",
      entityType: "Tenant",
      entityId: user.tenantId,
      metadata: { fingerprint: preview.fingerprint, rows: preview.totals.rows, errors: preview.errors.length, openingBalance: preview.totals.openingBalance },
    },
  });
  return { success: preview.errors.length === 0, committed: false, message: preview.errors.length ? "Resolve all validation errors before import." : "Preview passed. Re-select the same file and explicitly commit the import.", preview, imported: 0 };
}

export async function commitOnboardingHomeownersAction(_state: OnboardingImportState = emptyState, formData: FormData): Promise<OnboardingImportState> {
  const user = await requireUser();
  assertPermission(user.permissions, "homeowners.manage");
  const file = formData.get("file");
  const reason = String(formData.get("reason") || "").trim();
  const confirmed = formData.get("confirm") === "on";
  if (!confirmed || reason.length < 10) return { ...emptyState, message: "Confirm the import and provide an operational reason of at least 10 characters." };
  if (!isCsvFile(file)) return { ...emptyState, message: "Upload the validated CSV file again to commit." };
  const preview = parseOnboardingHomeownerCsv(await file.text());
  preview.errors.push(...await validateExistingRecords(user.tenantId, preview));
  if (preview.errors.length) return { ...emptyState, message: "The file changed or now conflicts with existing data. Run preview again.", preview };
  const needsOpeningBalance = preview.rows.some((row) => Number(row.data.openingBalance || 0) > 0);
  if (needsOpeningBalance) assertPermission(user.permissions, "billing.adjust");

  const invitations: Array<{ userId: string; name: string; email: string; accountNumber: string; temporaryPassword: string; emailVerificationToken: string; expiresAt: Date }> = [];
  await prisma.$transaction(async (tx) => {
    for (const row of preview.rows) {
      const accountNumber = row.data.accountNumber || await generateUniqueHomeownerAccountNumber(tx as never);
      const created = await tx.user.create({
        data: {
          tenantId: user.tenantId,
          name: row.data.name,
          email: row.data.email.toLowerCase(),
          passwordHash: await hash(randomBytes(32).toString("base64url"), 12),
          role: Role.HOMEOWNER,
          userRoleAssignments: { create: { tenantId: user.tenantId, role: Role.HOMEOWNER, assignedBy: user.id } },
          homeownerProfile: {
            create: {
              tenantId: user.tenantId,
              phone: row.data.phone,
              address: row.data.address,
              block: row.data.block,
              lot: row.data.lot,
              phase: row.data.phase || null,
              propertyType: row.data.propertyType || null,
              occupancyStatus: row.data.occupancyStatus || null,
              accountNumber,
              monthlyDuesAmount: Number(row.data.monthlyDuesAmount),
              activationStatus: HomeownerActivationStatus.INVITATION_SENT,
              activationSentAt: new Date(),
            },
          },
        },
        include: { homeownerProfile: true },
      });
      await tx.homeownerAccountNumberReservation.create({ data: { tenantId: user.tenantId, homeownerId: created.homeownerProfile!.id, accountNumber, reason: "ONBOARDING_IMPORT" } });
      const credential = await createHomeownerActivationCredential({ tenantId: user.tenantId, userId: created.id, createdById: user.id, tx });
      invitations.push({ userId: created.id, name: created.name, email: created.email, accountNumber, ...credential });
      const openingBalance = Number(row.data.openingBalance || 0);
      if (openingBalance > 0) {
        await postMigration(tx, {
          kind: DataMigrationKind.DUES_OPENING_BALANCE,
          homeownerId: created.homeownerProfile!.id,
          period: firstDayOfCurrentMonth(),
          amount: openingBalance,
          remarks: `Tenant onboarding opening balance: ${reason}`,
        }, user.id, user.tenantId);
      }
    }
    await tx.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorId: user.id,
        module: "ONBOARDING",
        action: "HOMEOWNER_IMPORT_COMMITTED",
        entityType: "Tenant",
        entityId: user.tenantId,
        metadata: { fingerprint: preview.fingerprint, imported: preview.rows.length, openingBalance: preview.totals.openingBalance, reason },
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60_000 });

  for (const invitation of invitations) {
    await sendHomeownerActivationEmail({ tenantId: user.tenantId, actorId: user.id, ...invitation });
  }
  revalidatePath("/admin/onboarding");
  revalidatePath("/admin/homeowners");
  return { success: true, committed: true, message: `${invitations.length} homeowner${invitations.length === 1 ? "" : "s"} imported and invited securely.`, preview, imported: invitations.length };
}

async function validateExistingRecords(tenantId: string, preview: OnboardingImportPreview) {
  if (preview.errors.length || !preview.rows.length) return [];
  const emails = preview.rows.map((row) => row.data.email.toLowerCase());
  const accounts = preview.rows.map((row) => row.data.accountNumber).filter(Boolean);
  const properties = preview.rows.map((row) => ({ block: row.data.block, lot: row.data.lot }));
  const [users, profiles, accountProfiles] = await Promise.all([
    prisma.user.findMany({ where: { tenantId, email: { in: emails } }, select: { email: true } }),
    prisma.homeownerProfile.findMany({ where: { tenantId, OR: properties }, select: { block: true, lot: true } }),
    accounts.length ? prisma.homeownerProfile.findMany({ where: { accountNumber: { in: accounts } }, select: { accountNumber: true } }) : [],
  ]);
  return [
    ...users.map((item) => ({ row: 0, field: "email", message: `Already exists in this tenant: ${item.email}` })),
    ...profiles.map((item) => ({ row: 0, field: "lot", message: `Property already exists in this tenant: Block ${item.block}, Lot ${item.lot}` })),
    ...accountProfiles.map((item) => ({ row: 0, field: "accountNumber", message: `Account number is already reserved: ${item.accountNumber}` })),
  ];
}

function assertPermission(permissions: readonly string[], permission: string) {
  if (!permissions.includes(permission)) throw new Error(`Missing required permission: ${permission}`);
}
function isCsvFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File && value.size > 0 && value.size <= 2 * 1024 * 1024 && value.name.toLowerCase().endsWith(".csv");
}
function firstDayOfCurrentMonth() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
