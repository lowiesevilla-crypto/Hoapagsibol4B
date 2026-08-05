import { readFile, writeFile } from "node:fs/promises";

const file = "prisma/schema.prisma";
const before = await readFile(file, "utf8");
let after = before;

function replaceOnce(search, replacement, label) {
  const first = after.indexOf(search);
  if (first < 0) throw new Error(`missing ${label}`);
  if (after.indexOf(search, first + search.length) >= 0) throw new Error(`duplicate ${label}`);
  after = after.slice(0, first) + replacement + after.slice(first + search.length);
}

replaceOnce(
  `enum HomeownerEmailVerificationStatus {
  UNVERIFIED
  VERIFIED
}
`,
  `enum HomeownerEmailVerificationStatus {
  UNVERIFIED
  VERIFIED
}

enum TenantOnboardingStatus {
  NOT_STARTED
  IN_PROGRESS
  READY
  COMPLETE
}

enum TenantImportKind {
  HOMEOWNERS_PROPERTIES
}

enum TenantImportStatus {
  VALIDATING
  INVALID
  READY
  COMMITTING
  COMMITTED
  FAILED
}

enum TenantImportRowStatus {
  VALID
  INVALID
  CREATED
  SKIPPED
  FAILED
}
`,
  "onboarding enums",
);

replaceOnce(
  `  tinNumber                  String?
  status                     TenantStatus`,
  `  tinNumber                  String?
  locale                     String                               @default("en-PH") @db.VarChar(20)
  timezone                   String                               @default("Asia/Manila") @db.VarChar(80)
  currency                   String                               @default("PHP") @db.VarChar(3)
  fiscalYearStartMonth       Int                                  @default(1)
  defaultBillingDay          Int                                  @default(1)
  defaultDueDay              Int                                  @default(15)
  supportEmail               String?
  supportPhone               String?                              @db.VarChar(50)
  status                     TenantStatus`,
  "tenant onboarding configuration fields",
);

replaceOnce(
  `  userRoleAssignments        UserRoleAssignment[]
  billingRules               BillingRule[]`,
  `  userRoleAssignments        UserRoleAssignment[]
  onboarding                 TenantOnboarding?
  importBatches              TenantImportBatch[]
  importRows                 TenantImportRow[]
  billingRules               BillingRule[]`,
  "tenant onboarding relations",
);

replaceOnce(
  `  userRoleAssignments                   UserRoleAssignment[]
  assignedRoleAssignments               UserRoleAssignment[]              @relation("UserRoleAssignmentAssignedBy")
  tenant                                Tenant`,
  `  userRoleAssignments                   UserRoleAssignment[]
  assignedRoleAssignments               UserRoleAssignment[]              @relation("UserRoleAssignmentAssignedBy")
  tenantOnboardingPrivacyAccepted       TenantOnboarding[]                 @relation("TenantOnboardingPrivacyAcceptedBy")
  tenantOnboardingLastSaved             TenantOnboarding[]                 @relation("TenantOnboardingLastSavedBy")
  tenantImportBatchesCreated            TenantImportBatch[]                @relation("TenantImportBatchCreatedBy")
  tenantImportBatchesCommitted          TenantImportBatch[]                @relation("TenantImportBatchCommittedBy")
  tenant                                Tenant`,
  "user onboarding relations",
);

replaceOnce(
  `model TenantModuleEntitlement {`,
  `model TenantOnboarding {
  tenantId              String                   @id
  status                TenantOnboardingStatus   @default(NOT_STARTED)
  currentStep           String                   @default("PROFILE") @db.VarChar(40)
  completedSteps        Json?
  privacyNoticeVersion  String?                  @db.VarChar(40)
  privacyAcceptedAt     DateTime?
  privacyAcceptedById   String?
  lastSavedById         String?
  startedAt             DateTime                 @default(now())
  completedAt           DateTime?
  createdAt             DateTime                 @default(now())
  updatedAt             DateTime                 @updatedAt
  tenant                Tenant                   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  privacyAcceptedBy     User?                    @relation("TenantOnboardingPrivacyAcceptedBy", fields: [privacyAcceptedById], references: [id], onDelete: SetNull)
  lastSavedBy           User?                    @relation("TenantOnboardingLastSavedBy", fields: [lastSavedById], references: [id], onDelete: SetNull)

  @@index([status, updatedAt])
}

model TenantImportBatch {
  id                 String             @id @default(cuid())
  tenantId           String
  kind               TenantImportKind
  templateVersion    String             @db.VarChar(20)
  originalFileName   String             @db.VarChar(255)
  fileHash           String             @db.VarChar(64)
  status             TenantImportStatus @default(VALIDATING)
  rowCount           Int                @default(0)
  validCount         Int                @default(0)
  invalidCount       Int                @default(0)
  createdCount       Int                @default(0)
  updatedCount       Int                @default(0)
  skippedCount       Int                @default(0)
  failedCount        Int                @default(0)
  errorReport        Json?
  summary            Json?
  createdById        String
  committedById      String?
  validatedAt        DateTime?
  committedAt        DateTime?
  expiresAt          DateTime?
  createdAt          DateTime           @default(now())
  updatedAt          DateTime           @updatedAt
  tenant             Tenant             @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  createdBy          User               @relation("TenantImportBatchCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)
  committedBy        User?              @relation("TenantImportBatchCommittedBy", fields: [committedById], references: [id], onDelete: SetNull)
  rows               TenantImportRow[]

  @@unique([tenantId, kind, fileHash])
  @@index([tenantId, status, updatedAt])
  @@index([createdById])
  @@index([committedById])
}

model TenantImportRow {
  id               String                @id @default(cuid())
  tenantId         String
  batchId          String
  rowNumber        Int
  naturalKey       String                @db.VarChar(255)
  payload          Json
  status           TenantImportRowStatus @default(VALID)
  errors           Json?
  createdEntityId  String?
  createdAt        DateTime              @default(now())
  updatedAt        DateTime              @updatedAt
  tenant           Tenant                @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  batch            TenantImportBatch     @relation(fields: [batchId], references: [id], onDelete: Cascade)

  @@unique([batchId, rowNumber])
  @@index([tenantId, batchId, status])
  @@index([tenantId, naturalKey])
}

model TenantModuleEntitlement {`,
  "onboarding models",
);

if (after === before) throw new Error("Onboarding schema patch made no changes.");
await writeFile(file, after);
console.log("onboarding Prisma schema applied");
