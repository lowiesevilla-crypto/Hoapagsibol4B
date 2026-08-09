-- HOAHub tenant Document Management repository foundation.
-- Uploaded tenant files are intentionally separated from generated DocumentVersion records.
-- Multi-tenant isolation is reinforced with tenantId on every tenant-owned row and
-- composite foreign keys on repository relationships.

CREATE TABLE `SubscriptionPlanFeatureEntitlement` (
  `planId` VARCHAR(191) NOT NULL,
  `featureCode` VARCHAR(80) NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT false,
  `storageLimitMb` INTEGER NULL,
  `maxFileSizeMb` INTEGER NULL DEFAULT 25,
  `retainRevisionBinaries` BOOLEAN NOT NULL DEFAULT false,
  `maxRevisionBinaries` INTEGER NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`planId`, `featureCode`),
  INDEX `PlanFeature_code_enabled_idx` (`featureCode`, `enabled`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `TenantFeatureEntitlement` (
  `tenantId` VARCHAR(191) NOT NULL,
  `featureCode` VARCHAR(80) NOT NULL,
  `enabledOverride` BOOLEAN NULL,
  `storageLimitMbOverride` INTEGER NULL,
  `maxFileSizeMbOverride` INTEGER NULL,
  `retainRevisionBinariesOverride` BOOLEAN NULL,
  `maxRevisionBinariesOverride` INTEGER NULL,
  `updatedById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`tenantId`, `featureCode`),
  INDEX `TenantFeature_tenant_updated_idx` (`tenantId`, `updatedAt`),
  INDEX `TenantFeature_code_enabled_idx` (`featureCode`, `enabledOverride`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RepositoryDocumentCategory` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `code` VARCHAR(100) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `categoryGroup` VARCHAR(60) NOT NULL,
  `description` TEXT NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `systemDefault` BOOLEAN NOT NULL DEFAULT false,
  `governanceControlled` BOOLEAN NOT NULL DEFAULT false,
  `createdById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `RepositoryCategory_tenant_id_key` (`tenantId`, `id`),
  UNIQUE INDEX `RepositoryCategory_tenant_code_key` (`tenantId`, `code`),
  INDEX `RepositoryCategory_active_sort_idx` (`tenantId`, `active`, `sortOrder`),
  INDEX `RepositoryCategory_governance_idx` (`tenantId`, `governanceControlled`, `active`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RepositoryDocument` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `categoryId` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `documentReference` VARCHAR(120) NULL,
  `visibility` ENUM('INTERNAL', 'TENANT_PUBLIC', 'RESTRICTED') NOT NULL DEFAULT 'INTERNAL',
  `status` ENUM('DRAFT', 'PUBLISHED', 'INACTIVE', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  `currentRevision` INTEGER NOT NULL DEFAULT 1,
  `revisionPolicy` ENUM('REPLACE_CURRENT', 'KEEP_HISTORY') NOT NULL DEFAULT 'REPLACE_CURRENT',
  `originalFileName` VARCHAR(191) NOT NULL,
  `storageKey` VARCHAR(500) NOT NULL,
  `contentType` VARCHAR(160) NOT NULL,
  `fileExtension` VARCHAR(20) NOT NULL,
  `fileSizeBytes` BIGINT NOT NULL,
  `checksumSha256` VARCHAR(64) NOT NULL,
  `malwareScanStatus` ENUM('NOT_CONFIGURED', 'PENDING', 'PASSED', 'FAILED', 'BLOCKED') NOT NULL DEFAULT 'NOT_CONFIGURED',
  `issuingBody` VARCHAR(191) NULL,
  `approvalDate` DATE NULL,
  `effectiveAt` DATETIME(3) NULL,
  `expiresAt` DATETIME(3) NULL,
  `publishedAt` DATETIME(3) NULL,
  `resolutionNumber` VARCHAR(120) NULL,
  `memoNumber` VARCHAR(120) NULL,
  `policyOwner` VARCHAR(191) NULL,
  `remarks` TEXT NULL,
  `searchableKeywords` TEXT NULL,
  `uploadedById` VARCHAR(191) NOT NULL,
  `updatedById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `RepositoryDocument_tenant_id_key` (`tenantId`, `id`),
  UNIQUE INDEX `RepositoryDocument_tenant_storage_key` (`tenantId`, `storageKey`),
  INDEX `RepositoryDocument_status_visibility_idx` (`tenantId`, `status`, `visibility`, `updatedAt`),
  INDEX `RepositoryDocument_category_status_idx` (`tenantId`, `categoryId`, `status`),
  INDEX `RepositoryDocument_reference_idx` (`tenantId`, `documentReference`),
  INDEX `RepositoryDocument_effective_expiry_idx` (`tenantId`, `effectiveAt`, `expiresAt`),
  INDEX `RepositoryDocument_uploader_created_idx` (`tenantId`, `uploadedById`, `createdAt`),
  CONSTRAINT `RepositoryDocument_category_fkey`
    FOREIGN KEY (`tenantId`, `categoryId`) REFERENCES `RepositoryDocumentCategory` (`tenantId`, `id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RepositoryDocumentRevision` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `documentId` VARCHAR(191) NOT NULL,
  `revision` INTEGER NOT NULL,
  `revisionLabel` VARCHAR(60) NULL,
  `originalFileName` VARCHAR(191) NOT NULL,
  `storageKey` VARCHAR(500) NULL,
  `contentType` VARCHAR(160) NOT NULL,
  `fileExtension` VARCHAR(20) NOT NULL,
  `fileSizeBytes` BIGINT NOT NULL,
  `checksumSha256` VARCHAR(64) NOT NULL,
  `malwareScanStatus` ENUM('NOT_CONFIGURED', 'PENDING', 'PASSED', 'FAILED', 'BLOCKED') NOT NULL DEFAULT 'NOT_CONFIGURED',
  `reason` TEXT NULL,
  `createdById` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `RepositoryRevision_tenant_id_key` (`tenantId`, `id`),
  UNIQUE INDEX `RepositoryRevision_document_revision_key` (`tenantId`, `documentId`, `revision`),
  INDEX `RepositoryRevision_document_created_idx` (`tenantId`, `documentId`, `createdAt`),
  INDEX `RepositoryRevision_storage_idx` (`tenantId`, `storageKey`),
  CONSTRAINT `RepositoryRevision_document_fkey`
    FOREIGN KEY (`tenantId`, `documentId`) REFERENCES `RepositoryDocument` (`tenantId`, `id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RepositoryDocumentTag` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `RepositoryTag_tenant_id_key` (`tenantId`, `id`),
  UNIQUE INDEX `RepositoryTag_tenant_name_key` (`tenantId`, `name`),
  INDEX `RepositoryTag_tenant_updated_idx` (`tenantId`, `updatedAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RepositoryDocumentTagAssignment` (
  `tenantId` VARCHAR(191) NOT NULL,
  `documentId` VARCHAR(191) NOT NULL,
  `tagId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`tenantId`, `documentId`, `tagId`),
  INDEX `RepositoryTagAssignment_tag_document_idx` (`tenantId`, `tagId`, `documentId`),
  CONSTRAINT `RepositoryTagAssignment_document_fkey`
    FOREIGN KEY (`tenantId`, `documentId`) REFERENCES `RepositoryDocument` (`tenantId`, `id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `RepositoryTagAssignment_tag_fkey`
    FOREIGN KEY (`tenantId`, `tagId`) REFERENCES `RepositoryDocumentTag` (`tenantId`, `id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Register the feature against existing plans without silently changing commercial
-- inclusions. Platform Administration can enable it per plan in the commercialization UI.
INSERT INTO `SubscriptionPlanFeatureEntitlement` (
  `planId`, `featureCode`, `enabled`, `storageLimitMb`, `maxFileSizeMb`,
  `retainRevisionBinaries`, `maxRevisionBinaries`, `createdAt`, `updatedAt`
)
SELECT
  `id`, 'DOCUMENT_MANAGEMENT', false, `maximumStorageMb`, 25,
  false, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `SubscriptionPlan`;
