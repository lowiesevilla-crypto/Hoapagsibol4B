ALTER TABLE `Tenant`
  ADD COLUMN `locale` VARCHAR(20) NOT NULL DEFAULT 'en-PH',
  ADD COLUMN `timezone` VARCHAR(80) NOT NULL DEFAULT 'Asia/Manila',
  ADD COLUMN `currency` VARCHAR(3) NOT NULL DEFAULT 'PHP',
  ADD COLUMN `fiscalYearStartMonth` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `defaultBillingDay` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `defaultDueDay` INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN `supportEmail` VARCHAR(191) NULL,
  ADD COLUMN `supportPhone` VARCHAR(50) NULL;

CREATE TABLE `TenantOnboarding` (
  `tenantId` VARCHAR(191) NOT NULL,
  `status` ENUM('NOT_STARTED', 'IN_PROGRESS', 'READY', 'COMPLETE') NOT NULL DEFAULT 'NOT_STARTED',
  `currentStep` VARCHAR(40) NOT NULL DEFAULT 'PROFILE',
  `completedSteps` JSON NULL,
  `privacyNoticeVersion` VARCHAR(40) NULL,
  `privacyAcceptedAt` DATETIME(3) NULL,
  `privacyAcceptedById` VARCHAR(191) NULL,
  `lastSavedById` VARCHAR(191) NULL,
  `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `TenantOnboarding_status_updatedAt_idx`(`status`, `updatedAt`),
  PRIMARY KEY (`tenantId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `TenantImportBatch` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `kind` ENUM('HOMEOWNERS_PROPERTIES') NOT NULL,
  `templateVersion` VARCHAR(20) NOT NULL,
  `originalFileName` VARCHAR(255) NOT NULL,
  `fileHash` VARCHAR(64) NOT NULL,
  `status` ENUM('VALIDATING', 'INVALID', 'READY', 'COMMITTING', 'COMMITTED', 'FAILED') NOT NULL DEFAULT 'VALIDATING',
  `rowCount` INTEGER NOT NULL DEFAULT 0,
  `validCount` INTEGER NOT NULL DEFAULT 0,
  `invalidCount` INTEGER NOT NULL DEFAULT 0,
  `createdCount` INTEGER NOT NULL DEFAULT 0,
  `updatedCount` INTEGER NOT NULL DEFAULT 0,
  `skippedCount` INTEGER NOT NULL DEFAULT 0,
  `failedCount` INTEGER NOT NULL DEFAULT 0,
  `errorReport` JSON NULL,
  `summary` JSON NULL,
  `createdById` VARCHAR(191) NOT NULL,
  `committedById` VARCHAR(191) NULL,
  `validatedAt` DATETIME(3) NULL,
  `committedAt` DATETIME(3) NULL,
  `expiresAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `TenantImportBatch_tenantId_kind_fileHash_key`(`tenantId`, `kind`, `fileHash`),
  INDEX `TenantImportBatch_tenantId_status_updatedAt_idx`(`tenantId`, `status`, `updatedAt`),
  INDEX `TenantImportBatch_createdById_idx`(`createdById`),
  INDEX `TenantImportBatch_committedById_idx`(`committedById`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `TenantImportRow` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `batchId` VARCHAR(191) NOT NULL,
  `rowNumber` INTEGER NOT NULL,
  `naturalKey` VARCHAR(255) NOT NULL,
  `payload` JSON NOT NULL,
  `status` ENUM('VALID', 'INVALID', 'CREATED', 'SKIPPED', 'FAILED') NOT NULL DEFAULT 'VALID',
  `errors` JSON NULL,
  `createdEntityId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `TenantImportRow_batchId_rowNumber_key`(`batchId`, `rowNumber`),
  INDEX `TenantImportRow_tenantId_batchId_status_idx`(`tenantId`, `batchId`, `status`),
  INDEX `TenantImportRow_tenantId_naturalKey_idx`(`tenantId`, `naturalKey`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `TenantOnboarding`
  ADD CONSTRAINT `TenantOnboarding_tenantId_fkey`
  FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `TenantOnboarding_privacyAcceptedById_fkey`
  FOREIGN KEY (`privacyAcceptedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `TenantOnboarding_lastSavedById_fkey`
  FOREIGN KEY (`lastSavedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `TenantImportBatch`
  ADD CONSTRAINT `TenantImportBatch_tenantId_fkey`
  FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `TenantImportBatch_createdById_fkey`
  FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `TenantImportBatch_committedById_fkey`
  FOREIGN KEY (`committedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `TenantImportRow`
  ADD CONSTRAINT `TenantImportRow_tenantId_fkey`
  FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `TenantImportRow_batchId_fkey`
  FOREIGN KEY (`batchId`) REFERENCES `TenantImportBatch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
