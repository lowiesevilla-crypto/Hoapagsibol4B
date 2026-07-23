-- Extend legacy compatibility templates with the same explicit ownership model.
-- Existing legacy templates remain tenant-owned and keep their content/version.

ALTER TABLE `DocumentTemplate`
  ADD COLUMN `ownershipType` ENUM('CERTIFIED', 'TENANT', 'CUSTOM') NOT NULL DEFAULT 'TENANT',
  ADD COLUMN `certifiedKey` VARCHAR(191) NULL,
  ADD COLUMN `sourceTemplateId` VARCHAR(191) NULL,
  ADD COLUMN `sourceTemplateVersion` INTEGER NULL,
  ADD COLUMN `clonedAt` DATETIME(3) NULL,
  ADD COLUMN `upgradeCompatible` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `restorable` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `editable` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `createdById` VARCHAR(191) NULL;

CREATE INDEX `DocumentTemplate_tenantId_ownershipType_active_idx`
  ON `DocumentTemplate`(`tenantId`, `ownershipType`, `active`);
CREATE INDEX `DocumentTemplate_tenantId_sourceTemplateId_idx`
  ON `DocumentTemplate`(`tenantId`, `sourceTemplateId`);
CREATE INDEX `DocumentTemplate_certifiedKey_idx`
  ON `DocumentTemplate`(`certifiedKey`);
