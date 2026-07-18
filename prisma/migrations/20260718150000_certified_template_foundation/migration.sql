-- Additive certified/tenant/custom template ownership metadata.
-- Existing rows are tenant-owned and retain their current versions and content.

ALTER TABLE `DocumentTemplateSet`
  ADD COLUMN `ownershipType` ENUM('CERTIFIED', 'TENANT', 'CUSTOM') NOT NULL DEFAULT 'TENANT',
  ADD COLUMN `certifiedKey` VARCHAR(191) NULL,
  ADD COLUMN `sourceTemplateSetId` VARCHAR(191) NULL,
  ADD COLUMN `sourceTemplateVersionId` VARCHAR(191) NULL,
  ADD COLUMN `upgradeCompatible` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `restorable` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `editable` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `createdById` VARCHAR(191) NULL,
  ADD COLUMN `updatedById` VARCHAR(191) NULL;

ALTER TABLE `DocumentTemplateVersion`
  ADD COLUMN `ownershipType` ENUM('CERTIFIED', 'TENANT', 'CUSTOM') NOT NULL DEFAULT 'TENANT',
  ADD COLUMN `sourceVersionId` VARCHAR(191) NULL,
  ADD COLUMN `cloneSourceVersion` INTEGER NULL,
  ADD COLUMN `clonedAt` DATETIME(3) NULL,
  ADD COLUMN `upgradeCompatible` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `restorable` BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX `DocumentTemplateSet_tenantId_ownershipType_active_idx`
  ON `DocumentTemplateSet`(`tenantId`, `ownershipType`, `active`);
CREATE INDEX `DocumentTemplateSet_tenantId_sourceTemplateSetId_idx`
  ON `DocumentTemplateSet`(`tenantId`, `sourceTemplateSetId`);
CREATE INDEX `DocumentTemplateSet_tenantId_sourceTemplateVersionId_idx`
  ON `DocumentTemplateSet`(`tenantId`, `sourceTemplateVersionId`);
CREATE INDEX `DocumentTemplateSet_certifiedKey_idx`
  ON `DocumentTemplateSet`(`certifiedKey`);

CREATE INDEX `DocumentTemplateVersion_tenantId_ownershipType_status_idx`
  ON `DocumentTemplateVersion`(`tenantId`, `ownershipType`, `status`);
CREATE INDEX `DocumentTemplateVersion_tenantId_sourceVersionId_idx`
  ON `DocumentTemplateVersion`(`tenantId`, `sourceVersionId`);
