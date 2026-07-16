-- Sprint 6B-1A additive migration for the Enterprise Document Definition Platform.
-- This migration preserves all legacy DocumentType enum fields, existing request
-- snapshots, generated content, and document numbers.

CREATE TABLE `DocumentDefinition` (
  `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default',
  `id` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  `displayName` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `category` VARCHAR(191) NULL,
  `status` ENUM('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  `active` BOOLEAN NOT NULL DEFAULT false,
  `archivedAt` DATETIME(3) NULL,
  `displayOrder` INTEGER NOT NULL DEFAULT 0,
  `systemKey` VARCHAR(191) NULL,
  `legacyType` ENUM('CERTIFICATE_OF_RESIDENCY', 'CERTIFICATE_OF_GOOD_STANDING', 'CLEARANCE_CERTIFICATE', 'PAYMENT_CERTIFICATION', 'CONSTRUCTION_BOND_CERTIFICATION', 'CONTRACTOR_BOND_CERTIFICATION', 'GATE_PASS', 'MOVE_IN_OUT_PASS') NULL,
  `deliveryMode` ENUM('INSTANT_DOWNLOAD', 'APPROVAL_REQUIRED', 'PAYMENT_REQUIRED', 'PAYMENT_AND_APPROVAL_REQUIRED', 'REQUEST_ONLY') NOT NULL DEFAULT 'APPROVAL_REQUIRED',
  `approvalRequired` BOOLEAN NOT NULL DEFAULT true,
  `paymentRequired` BOOLEAN NOT NULL DEFAULT false,
  `paymentBeforeApproval` BOOLEAN NOT NULL DEFAULT false,
  `allowImmediateDownload` BOOLEAN NOT NULL DEFAULT false,
  `requiresAdminReview` BOOLEAN NOT NULL DEFAULT true,
  `releaseRequired` BOOLEAN NOT NULL DEFAULT false,
  `homeownerDownloadEnabled` BOOLEAN NOT NULL DEFAULT true,
  `walkInEnabled` BOOLEAN NOT NULL DEFAULT false,
  `householdMemberEnabled` BOOLEAN NOT NULL DEFAULT true,
  `manualSubjectEnabled` BOOLEAN NOT NULL DEFAULT false,
  `allowRegeneration` BOOLEAN NOT NULL DEFAULT true,
  `allowPayLater` BOOLEAN NOT NULL DEFAULT false,
  `feeAmount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `currency` VARCHAR(191) NOT NULL DEFAULT 'PHP',
  `receiptRequired` BOOLEAN NOT NULL DEFAULT false,
  `financeClassification` VARCHAR(191) NULL,
  `numberingFormat` VARCHAR(191) NOT NULL DEFAULT '{PREFIX}-{YYYY}-{SEQUENCE:6}',
  `sequenceScope` ENUM('ANNUAL', 'CONTINUOUS') NOT NULL DEFAULT 'ANNUAL',
  `validityDays` INTEGER NULL,
  `maxCopies` INTEGER NOT NULL DEFAULT 1,
  `qrEnabled` BOOLEAN NOT NULL DEFAULT true,
  `watermarkEnabled` BOOLEAN NOT NULL DEFAULT false,
  `signatoryOfficerId` VARCHAR(191) NULL,
  `assignedTemplateVersionId` VARCHAR(191) NULL,
  `version` INTEGER NOT NULL DEFAULT 1,
  `createdById` VARCHAR(191) NULL,
  `updatedById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `DocumentDefinition_tenantId_id_key`(`tenantId`, `id`),
  UNIQUE INDEX `DocumentDefinition_tenantId_code_key`(`tenantId`, `code`),
  INDEX `DocumentDefinition_tenantId_status_active_archivedAt_idx`(`tenantId`, `status`, `active`, `archivedAt`),
  INDEX `DocumentDefinition_tenantId_legacyType_idx`(`tenantId`, `legacyType`),
  INDEX `DocumentDefinition_tenantId_displayOrder_displayName_idx`(`tenantId`, `displayOrder`, `displayName`),
  INDEX `DocumentDefinition_tenantId_signatoryOfficerId_idx`(`tenantId`, `signatoryOfficerId`),
  INDEX `DocumentDefinition_tenantId_assignedTemplateVersionId_idx`(`tenantId`, `assignedTemplateVersionId`),
  INDEX `DocumentDefinition_createdById_idx`(`createdById`),
  INDEX `DocumentDefinition_updatedById_idx`(`updatedById`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `DocumentDefinitionField` (
  `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default',
  `id` VARCHAR(191) NOT NULL,
  `definitionId` VARCHAR(191) NOT NULL,
  `key` VARCHAR(191) NOT NULL,
  `label` VARCHAR(191) NOT NULL,
  `fieldType` ENUM('TEXT', 'TEXTAREA', 'DATE', 'NUMBER', 'MONEY', 'SELECT', 'CHECKBOX') NOT NULL,
  `required` BOOLEAN NOT NULL DEFAULT false,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `displayOrder` INTEGER NOT NULL DEFAULT 0,
  `options` JSON NULL,
  `validation` JSON NULL,
  `defaultValue` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `DocumentDefinitionField_tenantId_id_key`(`tenantId`, `id`),
  UNIQUE INDEX `DocumentDefinitionField_tenantId_definitionId_key_key`(`tenantId`, `definitionId`, `key`),
  INDEX `DocumentDefinitionField_scope_order_idx`(`tenantId`, `definitionId`, `active`, `displayOrder`),
  INDEX `DocumentDefinitionField_tenantId_idx`(`tenantId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `DocumentTemplateSet` (
  `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default',
  `id` VARCHAR(191) NOT NULL,
  `definitionId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `DocumentTemplateSet_tenantId_id_key`(`tenantId`, `id`),
  INDEX `DocumentTemplateSet_tenantId_definitionId_active_idx`(`tenantId`, `definitionId`, `active`),
  INDEX `DocumentTemplateSet_tenantId_idx`(`tenantId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `DocumentTemplateVersion` (
  `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default',
  `id` VARCHAR(191) NOT NULL,
  `templateSetId` VARCHAR(191) NOT NULL,
  `version` INTEGER NOT NULL,
  `status` ENUM('DRAFT', 'PUBLISHED', 'RETIRED') NOT NULL DEFAULT 'DRAFT',
  `schemaVersion` INTEGER NOT NULL DEFAULT 1,
  `definitionJson` JSON NOT NULL,
  `previewMetadata` JSON NULL,
  `publishedAt` DATETIME(3) NULL,
  `publishedById` VARCHAR(191) NULL,
  `createdById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `DocumentTemplateVersion_tenantId_id_key`(`tenantId`, `id`),
  UNIQUE INDEX `DocumentTemplateVersion_tenantId_templateSetId_version_key`(`tenantId`, `templateSetId`, `version`),
  INDEX `DocumentTemplateVersion_tenantId_templateSetId_status_idx`(`tenantId`, `templateSetId`, `status`),
  INDEX `DocumentTemplateVersion_tenantId_status_idx`(`tenantId`, `status`),
  INDEX `DocumentTemplateVersion_publishedById_idx`(`publishedById`),
  INDEX `DocumentTemplateVersion_createdById_idx`(`createdById`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `DocumentDefinitionCounter` (
  `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default',
  `definitionId` VARCHAR(191) NOT NULL,
  `sequenceScope` ENUM('ANNUAL', 'CONTINUOUS') NOT NULL,
  `year` INTEGER NOT NULL DEFAULT 0,
  `lastNumber` INTEGER NOT NULL DEFAULT 0,
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `DocumentDefinitionCounter_tenantId_definitionId_idx`(`tenantId`, `definitionId`),
  INDEX `DocumentDefinitionCounter_tenantId_idx`(`tenantId`),
  PRIMARY KEY (`tenantId`, `definitionId`, `sequenceScope`, `year`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `DocumentVerificationToken` (
  `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default',
  `id` VARCHAR(191) NOT NULL,
  `requestId` VARCHAR(191) NOT NULL,
  `documentVersionId` VARCHAR(191) NULL,
  `definitionId` VARCHAR(191) NULL,
  `tokenHash` VARCHAR(191) NOT NULL,
  `status` ENUM('VALID', 'REVOKED') NOT NULL DEFAULT 'VALID',
  `expiresAt` DATETIME(3) NULL,
  `revokedAt` DATETIME(3) NULL,
  `revokedById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `DocumentVerificationToken_tenantId_id_key`(`tenantId`, `id`),
  UNIQUE INDEX `DocumentVerificationToken_tokenHash_key`(`tokenHash`),
  INDEX `DocumentVerificationToken_tenantId_requestId_status_idx`(`tenantId`, `requestId`, `status`),
  INDEX `DocumentVerificationToken_tenantId_documentVersionId_status_idx`(`tenantId`, `documentVersionId`, `status`),
  INDEX `DocumentVerificationToken_tenantId_definitionId_idx`(`tenantId`, `definitionId`),
  INDEX `DocumentVerificationToken_revokedById_idx`(`revokedById`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `DocumentTypeConfiguration`
  ADD COLUMN `definitionId` VARCHAR(191) NULL,
  ADD INDEX `DocumentTypeConfiguration_tenantId_definitionId_idx`(`tenantId`, `definitionId`);

ALTER TABLE `DocumentFieldConfiguration`
  ADD COLUMN `definitionFieldId` VARCHAR(191) NULL,
  ADD INDEX `DocumentFieldConfiguration_tenantId_definitionFieldId_idx`(`tenantId`, `definitionFieldId`);

ALTER TABLE `DocumentTemplate`
  ADD COLUMN `definitionId` VARCHAR(191) NULL,
  ADD COLUMN `templateSetId` VARCHAR(191) NULL,
  ADD COLUMN `publishedTemplateVersionId` VARCHAR(191) NULL,
  ADD INDEX `DocumentTemplate_tenantId_definitionId_idx`(`tenantId`, `definitionId`),
  ADD INDEX `DocumentTemplate_tenantId_templateSetId_idx`(`tenantId`, `templateSetId`),
  ADD INDEX `DocumentTemplate_tenantId_publishedTemplateVersionId_idx`(`tenantId`, `publishedTemplateVersionId`);

ALTER TABLE `DocumentRequest`
  ADD COLUMN `definitionId` VARCHAR(191) NULL,
  ADD COLUMN `definitionVersionSnapshot` INTEGER NULL,
  ADD COLUMN `definitionSnapshot` JSON NULL,
  ADD COLUMN `templateVersionIdSnapshot` VARCHAR(191) NULL,
  ADD COLUMN `templateDefinitionSnapshot` JSON NULL,
  ADD INDEX `DocumentRequest_tenantId_definitionId_idx`(`tenantId`, `definitionId`);

ALTER TABLE `DocumentVersion`
  ADD COLUMN `definitionId` VARCHAR(191) NULL,
  ADD COLUMN `templateVersionId` VARCHAR(191) NULL,
  ADD COLUMN `definitionSnapshot` JSON NULL,
  ADD COLUMN `templateDefinitionSnapshot` JSON NULL,
  ADD UNIQUE INDEX `DocumentVersion_tenantId_id_key`(`tenantId`, `id`),
  ADD INDEX `DocumentVersion_tenantId_definitionId_idx`(`tenantId`, `definitionId`),
  ADD INDEX `DocumentVersion_tenantId_templateVersionId_idx`(`tenantId`, `templateVersionId`);

ALTER TABLE `DocumentDefinition`
  ADD CONSTRAINT `DocumentDefinition_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `DocumentDefinition_tenantId_signatoryOfficerId_fkey` FOREIGN KEY (`tenantId`, `signatoryOfficerId`) REFERENCES `OrganizationOfficer`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `DocumentDefinition_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `DocumentDefinition_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `DocumentDefinitionField`
  ADD CONSTRAINT `DocumentDefinitionField_tenantId_definitionId_fkey` FOREIGN KEY (`tenantId`, `definitionId`) REFERENCES `DocumentDefinition`(`tenantId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `DocumentTemplateSet`
  ADD CONSTRAINT `DocumentTemplateSet_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `DocumentTemplateSet_tenantId_definitionId_fkey` FOREIGN KEY (`tenantId`, `definitionId`) REFERENCES `DocumentDefinition`(`tenantId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `DocumentTemplateVersion`
  ADD CONSTRAINT `DocumentTemplateVersion_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `DocumentTemplateVersion_tenantId_templateSetId_fkey` FOREIGN KEY (`tenantId`, `templateSetId`) REFERENCES `DocumentTemplateSet`(`tenantId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `DocumentTemplateVersion_publishedById_fkey` FOREIGN KEY (`publishedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `DocumentTemplateVersion_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `DocumentDefinition`
  ADD CONSTRAINT `DocumentDefinition_tenantId_assignedTemplateVersionId_fkey` FOREIGN KEY (`tenantId`, `assignedTemplateVersionId`) REFERENCES `DocumentTemplateVersion`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `DocumentDefinitionCounter`
  ADD CONSTRAINT `DocumentDefinitionCounter_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `DocumentDefinitionCounter_tenantId_definitionId_fkey` FOREIGN KEY (`tenantId`, `definitionId`) REFERENCES `DocumentDefinition`(`tenantId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `DocumentTypeConfiguration`
  ADD CONSTRAINT `DocumentTypeConfiguration_tenantId_definitionId_fkey` FOREIGN KEY (`tenantId`, `definitionId`) REFERENCES `DocumentDefinition`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `DocumentFieldConfiguration`
  ADD CONSTRAINT `DocumentFieldConfiguration_tenantId_definitionFieldId_fkey` FOREIGN KEY (`tenantId`, `definitionFieldId`) REFERENCES `DocumentDefinitionField`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `DocumentTemplate`
  ADD CONSTRAINT `DocumentTemplate_tenantId_definitionId_fkey` FOREIGN KEY (`tenantId`, `definitionId`) REFERENCES `DocumentDefinition`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `DocumentTemplate_tenantId_templateSetId_fkey` FOREIGN KEY (`tenantId`, `templateSetId`) REFERENCES `DocumentTemplateSet`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `DocumentTemplate_tenantId_publishedTemplateVersionId_fkey` FOREIGN KEY (`tenantId`, `publishedTemplateVersionId`) REFERENCES `DocumentTemplateVersion`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `DocumentRequest`
  ADD CONSTRAINT `DocumentRequest_tenantId_definitionId_fkey` FOREIGN KEY (`tenantId`, `definitionId`) REFERENCES `DocumentDefinition`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `DocumentVersion`
  ADD CONSTRAINT `DocumentVersion_tenantId_definitionId_fkey` FOREIGN KEY (`tenantId`, `definitionId`) REFERENCES `DocumentDefinition`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `DocumentVersion_tenantId_templateVersionId_fkey` FOREIGN KEY (`tenantId`, `templateVersionId`) REFERENCES `DocumentTemplateVersion`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `DocumentVerificationToken`
  ADD CONSTRAINT `DocumentVerificationToken_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `DocumentVerificationToken_tenantId_requestId_fkey` FOREIGN KEY (`tenantId`, `requestId`) REFERENCES `DocumentRequest`(`tenantId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `DocumentVerificationToken_tenantId_documentVersionId_fkey` FOREIGN KEY (`tenantId`, `documentVersionId`) REFERENCES `DocumentVersion`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `DocumentVerificationToken_tenantId_definitionId_fkey` FOREIGN KEY (`tenantId`, `definitionId`) REFERENCES `DocumentDefinition`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `DocumentVerificationToken_revokedById_fkey` FOREIGN KEY (`revokedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill one tenant-owned DocumentDefinition per existing tenant/legacy type
-- that appears in configurations, templates, or requests.
INSERT INTO `DocumentDefinition` (
  `id`, `tenantId`, `code`, `displayName`, `description`, `category`, `status`, `active`,
  `displayOrder`, `systemKey`, `legacyType`, `deliveryMode`, `approvalRequired`,
  `paymentRequired`, `paymentBeforeApproval`, `allowImmediateDownload`, `requiresAdminReview`,
  `homeownerDownloadEnabled`, `walkInEnabled`, `householdMemberEnabled`, `manualSubjectEnabled`,
  `allowRegeneration`, `allowPayLater`, `feeAmount`, `currency`, `receiptRequired`,
  `numberingFormat`, `sequenceScope`, `validityDays`, `maxCopies`, `qrEnabled`, `watermarkEnabled`,
  `signatoryOfficerId`, `version`, `createdAt`, `updatedAt`
)
SELECT
  CONCAT('dd_', REPLACE(UUID(), '-', '')),
  pairs.`tenantId`,
  pairs.`type`,
  COALESCE(c.`displayName`, labels.`displayName`),
  COALESCE(c.`description`, labels.`description`),
  labels.`category`,
  CASE WHEN COALESCE(c.`active`, tpl.`active`, true) THEN 'ACTIVE' ELSE 'INACTIVE' END,
  COALESCE(c.`active`, tpl.`active`, true),
  labels.`displayOrder`,
  pairs.`type`,
  pairs.`type`,
  COALESCE(c.`deliveryMode`, 'APPROVAL_REQUIRED'),
  COALESCE(c.`approvalRequired`, true),
  COALESCE(c.`paymentRequired`, false),
  COALESCE(c.`paymentBeforeApproval`, false),
  COALESCE(c.`allowImmediateDownload`, false),
  COALESCE(c.`requiresAdminReview`, true),
  COALESCE(c.`homeownerDownloadEnabled`, true),
  false,
  true,
  false,
  COALESCE(c.`allowRegeneration`, true),
  COALESCE(c.`allowPayLater`, false),
  COALESCE(c.`feeAmount`, 0),
  'PHP',
  COALESCE(c.`paymentRequired`, false),
  labels.`numberingFormat`,
  'ANNUAL',
  COALESCE(c.`validityDays`, labels.`validityDays`),
  COALESCE(c.`maxCopies`, 1),
  true,
  false,
  c.`signatoryOfficerId`,
  COALESCE(c.`version`, 1),
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM (
  SELECT `tenantId`, `type` FROM `DocumentTypeConfiguration`
  UNION
  SELECT `tenantId`, `type` FROM `DocumentTemplate`
  UNION
  SELECT `tenantId`, `type` FROM `DocumentRequest`
) pairs
JOIN (
  SELECT 'CERTIFICATE_OF_RESIDENCY' AS `type`, 'Certificate of Residency' AS `displayName`, 'Proof of residency for a homeowner or registered household member.' AS `description`, 'Certificate' AS `category`, 10 AS `displayOrder`, 365 AS `validityDays`, 'CR-{YYYY}-{SEQUENCE:6}' AS `numberingFormat`
  UNION ALL SELECT 'CERTIFICATE_OF_GOOD_STANDING', 'Certificate of Good Standing', 'Account and HOA standing certification.', 'Certificate', 20, 365, 'DOC-CGS-{YYYY}-{SEQUENCE:6}'
  UNION ALL SELECT 'CLEARANCE_CERTIFICATE', 'Clearance Certificate', 'HOA clearance for transfer, move-out, or official use.', 'Certificate', 30, 365, 'DOC-CLR-{YYYY}-{SEQUENCE:6}'
  UNION ALL SELECT 'PAYMENT_CERTIFICATION', 'Payment Certification', 'Certification of recorded HOA payments.', 'Certificate', 40, 365, 'DOC-PAY-{YYYY}-{SEQUENCE:6}'
  UNION ALL SELECT 'CONSTRUCTION_BOND_CERTIFICATION', 'Construction Bond Certification', 'Certification related to refundable construction bonds.', 'Certificate', 50, 365, 'DOC-CB-{YYYY}-{SEQUENCE:6}'
  UNION ALL SELECT 'CONTRACTOR_BOND_CERTIFICATION', 'Contractor Bond Certification', 'Certification related to contractor bond records.', 'Certificate', 60, 365, 'DOC-CTB-{YYYY}-{SEQUENCE:6}'
  UNION ALL SELECT 'GATE_PASS', 'Gate Pass', 'Gate pass for visitors, deliveries, vehicles, or contractors.', 'Pass', 70, 7, 'DOC-GP-{YYYY}-{SEQUENCE:6}'
  UNION ALL SELECT 'MOVE_IN_OUT_PASS', 'Move In / Move Out Pass', 'Gate authorization for move-in or move-out activity.', 'Pass', 80, 7, 'DOC-MIO-{YYYY}-{SEQUENCE:6}'
) labels ON labels.`type` = pairs.`type`
LEFT JOIN `DocumentTypeConfiguration` c ON c.`tenantId` = pairs.`tenantId` AND c.`type` = pairs.`type`
LEFT JOIN `DocumentTemplate` tpl ON tpl.`tenantId` = pairs.`tenantId` AND tpl.`type` = pairs.`type`;

UPDATE `DocumentTypeConfiguration` c
JOIN `DocumentDefinition` d ON d.`tenantId` = c.`tenantId` AND d.`legacyType` = c.`type`
SET c.`definitionId` = d.`id`;

INSERT INTO `DocumentDefinitionField` (
  `id`, `tenantId`, `definitionId`, `key`, `label`, `fieldType`, `required`, `active`,
  `displayOrder`, `options`, `validation`, `createdAt`, `updatedAt`
)
SELECT
  CONCAT('ddf_', REPLACE(UUID(), '-', '')),
  f.`tenantId`,
  c.`definitionId`,
  f.`key`,
  f.`label`,
  f.`fieldType`,
  f.`required`,
  f.`active`,
  f.`displayOrder`,
  f.`options`,
  f.`validation`,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM `DocumentFieldConfiguration` f
JOIN `DocumentTypeConfiguration` c ON c.`tenantId` = f.`tenantId` AND c.`id` = f.`configId`
WHERE c.`definitionId` IS NOT NULL;

UPDATE `DocumentFieldConfiguration` f
JOIN `DocumentTypeConfiguration` c ON c.`tenantId` = f.`tenantId` AND c.`id` = f.`configId`
JOIN `DocumentDefinitionField` df ON df.`tenantId` = f.`tenantId` AND df.`definitionId` = c.`definitionId` AND df.`key` = f.`key`
SET f.`definitionFieldId` = df.`id`;

INSERT INTO `DocumentTemplateSet` (`id`, `tenantId`, `definitionId`, `name`, `description`, `active`, `createdAt`, `updatedAt`)
SELECT
  CONCAT('dts_', REPLACE(UUID(), '-', '')),
  tpl.`tenantId`,
  d.`id`,
  tpl.`title`,
  CONCAT('Legacy template set for ', tpl.`title`),
  tpl.`active`,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM `DocumentTemplate` tpl
JOIN `DocumentDefinition` d ON d.`tenantId` = tpl.`tenantId` AND d.`legacyType` = tpl.`type`;

INSERT INTO `DocumentTemplateVersion` (
  `id`, `tenantId`, `templateSetId`, `version`, `status`, `schemaVersion`,
  `definitionJson`, `previewMetadata`, `publishedAt`, `publishedById`, `createdById`,
  `createdAt`, `updatedAt`
)
SELECT
  CONCAT('dtv_', REPLACE(UUID(), '-', '')),
  tpl.`tenantId`,
  ts.`id`,
  GREATEST(COALESCE(tpl.`version`, 1), 1),
  'PUBLISHED',
  1,
  JSON_OBJECT(
    'schemaVersion', 1,
    'page', JSON_OBJECT('format', 'A4', 'orientation', 'portrait'),
    'blocks', JSON_ARRAY(
      JSON_OBJECT(
        'id', 'legacy-body',
        'type', 'text',
        'label', 'Legacy template body',
        'text', tpl.`body`,
        'order', 10,
        'visible', true,
        'style', JSON_OBJECT('align', 'left', 'fontFamily', 'Arial', 'fontSize', 11)
      )
    )
  ),
  JSON_OBJECT('source', 'legacy-document-template', 'legacyTemplateId', tpl.`id`, 'legacyType', tpl.`type`),
  CURRENT_TIMESTAMP(3),
  tpl.`updatedById`,
  tpl.`updatedById`,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM `DocumentTemplate` tpl
JOIN `DocumentDefinition` d ON d.`tenantId` = tpl.`tenantId` AND d.`legacyType` = tpl.`type`
JOIN `DocumentTemplateSet` ts ON ts.`tenantId` = tpl.`tenantId` AND ts.`definitionId` = d.`id`;

UPDATE `DocumentTemplate` tpl
JOIN `DocumentDefinition` d ON d.`tenantId` = tpl.`tenantId` AND d.`legacyType` = tpl.`type`
JOIN `DocumentTemplateSet` ts ON ts.`tenantId` = tpl.`tenantId` AND ts.`definitionId` = d.`id`
JOIN `DocumentTemplateVersion` tv ON tv.`tenantId` = tpl.`tenantId` AND tv.`templateSetId` = ts.`id` AND tv.`status` = 'PUBLISHED'
SET tpl.`definitionId` = d.`id`,
    tpl.`templateSetId` = ts.`id`,
    tpl.`publishedTemplateVersionId` = tv.`id`;

UPDATE `DocumentDefinition` d
JOIN `DocumentTemplateSet` ts ON ts.`tenantId` = d.`tenantId` AND ts.`definitionId` = d.`id`
JOIN `DocumentTemplateVersion` tv ON tv.`tenantId` = ts.`tenantId` AND tv.`templateSetId` = ts.`id` AND tv.`status` = 'PUBLISHED'
SET d.`assignedTemplateVersionId` = tv.`id`;

UPDATE `DocumentRequest` r
JOIN `DocumentDefinition` d ON d.`tenantId` = r.`tenantId` AND d.`legacyType` = r.`type`
LEFT JOIN `DocumentTemplate` tpl ON tpl.`tenantId` = r.`tenantId` AND tpl.`type` = r.`type`
LEFT JOIN `DocumentTemplateVersion` tv ON tv.`tenantId` = tpl.`tenantId` AND tv.`id` = tpl.`publishedTemplateVersionId`
SET r.`definitionId` = d.`id`,
    r.`definitionVersionSnapshot` = COALESCE(r.`definitionVersionSnapshot`, d.`version`),
    r.`definitionSnapshot` = COALESCE(r.`definitionSnapshot`, JSON_OBJECT(
      'id', d.`id`, 'code', d.`code`, 'displayName', d.`displayName`, 'legacyType', d.`legacyType`,
      'deliveryMode', d.`deliveryMode`, 'approvalRequired', d.`approvalRequired`,
      'paymentRequired', d.`paymentRequired`, 'feeAmount', CAST(d.`feeAmount` AS CHAR),
      'numberingFormat', d.`numberingFormat`, 'version', d.`version`
    )),
    r.`templateVersionIdSnapshot` = COALESCE(r.`templateVersionIdSnapshot`, tv.`id`),
    r.`templateDefinitionSnapshot` = COALESCE(r.`templateDefinitionSnapshot`, tv.`definitionJson`);

UPDATE `DocumentVersion` v
JOIN `DocumentRequest` r ON r.`id` = v.`requestId`
LEFT JOIN `DocumentDefinition` d ON d.`tenantId` = r.`tenantId` AND d.`id` = r.`definitionId`
LEFT JOIN `DocumentTemplateVersion` tv ON tv.`tenantId` = r.`tenantId` AND tv.`id` = r.`templateVersionIdSnapshot`
SET v.`definitionId` = r.`definitionId`,
    v.`templateVersionId` = tv.`id`,
    v.`definitionSnapshot` = COALESCE(v.`definitionSnapshot`, r.`definitionSnapshot`),
    v.`templateDefinitionSnapshot` = COALESCE(v.`templateDefinitionSnapshot`, r.`templateDefinitionSnapshot`);
