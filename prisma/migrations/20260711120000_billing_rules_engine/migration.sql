-- Sprint 2.2A: tenant-scoped resolution-based billing rules and period exemptions.

ALTER TABLE `Bill`
  ADD COLUMN `recurringChargeType` ENUM('MONTHLY_DUES', 'SECURITY_FEE', 'MAINTENANCE_FEE', 'GARBAGE_FEE', 'OTHER') NOT NULL DEFAULT 'MONTHLY_DUES',
  ADD COLUMN `coverageYear` INTEGER NULL,
  ADD COLUMN `coverageMonth` INTEGER NULL,
  ADD COLUMN `billingRuleId` VARCHAR(191) NULL,
  ADD COLUMN `billingRuleSnapshot` JSON NULL,
  ADD COLUMN `resolutionReference` VARCHAR(191) NULL;

UPDATE `Bill`
SET
  `coverageYear` = YEAR(`billingMonth`),
  `coverageMonth` = MONTH(`billingMonth`)
WHERE `coverageYear` IS NULL OR `coverageMonth` IS NULL;

ALTER TABLE `Bill`
  MODIFY `coverageYear` INTEGER NOT NULL,
  MODIFY `coverageMonth` INTEGER NOT NULL;

CREATE TABLE `BillingRule` (
  `tenantId` VARCHAR(191) NOT NULL,
  `id` VARCHAR(191) NOT NULL,
  `recurringChargeType` ENUM('MONTHLY_DUES', 'SECURITY_FEE', 'MAINTENANCE_FEE', 'GARBAGE_FEE', 'OTHER') NOT NULL DEFAULT 'MONTHLY_DUES',
  `amount` DECIMAL(12, 2) NOT NULL,
  `billingFrequency` ENUM('MONTHLY', 'QUARTERLY', 'ANNUAL') NOT NULL DEFAULT 'MONTHLY',
  `generationMode` ENUM('MANUAL', 'AUTOMATIC') NOT NULL DEFAULT 'MANUAL',
  `billingDay` INTEGER NOT NULL DEFAULT 1,
  `dueDay` INTEGER NOT NULL DEFAULT 15,
  `gracePeriodDays` INTEGER NOT NULL DEFAULT 0,
  `penaltyType` ENUM('NONE', 'FIXED', 'PERCENTAGE') NOT NULL DEFAULT 'NONE',
  `penaltyValue` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `penaltyFrequency` ENUM('NONE', 'MONTHLY') NOT NULL DEFAULT 'NONE',
  `effectiveStartYear` INTEGER NOT NULL,
  `effectiveStartMonth` INTEGER NOT NULL,
  `effectiveEndYear` INTEGER NULL,
  `effectiveEndMonth` INTEGER NULL,
  `resolutionReference` VARCHAR(191) NOT NULL,
  `resolutionDate` DATE NULL,
  `notes` TEXT NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `createdById` VARCHAR(191) NULL,
  `updatedById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `DuesExemption`
  ADD COLUMN `recurringChargeType` ENUM('MONTHLY_DUES', 'SECURITY_FEE', 'MAINTENANCE_FEE', 'GARBAGE_FEE', 'OTHER') NOT NULL DEFAULT 'MONTHLY_DUES',
  ADD COLUMN `startYear` INTEGER NULL,
  ADD COLUMN `startMonth` INTEGER NULL,
  ADD COLUMN `endYear` INTEGER NULL,
  ADD COLUMN `endMonth` INTEGER NULL,
  ADD COLUMN `resolutionReference` VARCHAR(191) NULL,
  ADD COLUMN `approvedBy` VARCHAR(191) NULL,
  ADD COLUMN `active` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `updatedById` VARCHAR(191) NULL,
  ADD COLUMN `deactivatedAt` DATETIME(3) NULL,
  ADD COLUMN `deactivatedById` VARCHAR(191) NULL;

UPDATE `DuesExemption`
SET
  `startYear` = YEAR(`billingMonth`),
  `startMonth` = MONTH(`billingMonth`),
  `endYear` = YEAR(`billingMonth`),
  `endMonth` = MONTH(`billingMonth`)
WHERE `startYear` IS NULL
   OR `startMonth` IS NULL
   OR `endYear` IS NULL
   OR `endMonth` IS NULL;

ALTER TABLE `DuesExemption`
  MODIFY `startYear` INTEGER NOT NULL,
  MODIFY `startMonth` INTEGER NOT NULL,
  MODIFY `endYear` INTEGER NOT NULL,
  MODIFY `endMonth` INTEGER NOT NULL;

CREATE UNIQUE INDEX `Bill_charge_coverage_key`
  ON `Bill`(`tenantId`, `homeownerId`, `recurringChargeType`, `coverageYear`, `coverageMonth`);
CREATE INDEX `Bill_charge_coverage_idx`
  ON `Bill`(`tenantId`, `recurringChargeType`, `coverageYear`, `coverageMonth`);
CREATE INDEX `Bill_rule_idx`
  ON `Bill`(`billingRuleId`);

CREATE INDEX `BillingRule_effective_start_idx`
  ON `BillingRule`(`tenantId`, `recurringChargeType`, `active`, `effectiveStartYear`, `effectiveStartMonth`);
CREATE INDEX `BillingRule_effective_end_idx`
  ON `BillingRule`(`tenantId`, `recurringChargeType`, `effectiveEndYear`, `effectiveEndMonth`);
CREATE INDEX `BillingRule_createdBy_idx`
  ON `BillingRule`(`createdById`);
CREATE INDEX `BillingRule_updatedBy_idx`
  ON `BillingRule`(`updatedById`);

CREATE INDEX `DuesExemption_period_idx`
  ON `DuesExemption`(`tenantId`, `homeownerId`, `recurringChargeType`, `active`, `startYear`, `startMonth`, `endYear`, `endMonth`);

ALTER TABLE `Bill`
  ADD CONSTRAINT `Bill_billingRuleId_fkey` FOREIGN KEY (`billingRuleId`) REFERENCES `BillingRule`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `BillingRule`
  ADD CONSTRAINT `BillingRule_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `BillingRule_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `BillingRule_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
