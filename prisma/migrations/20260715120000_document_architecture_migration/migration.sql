-- Additive document architecture migration for tenant-scoped document catalogs,
-- household/family subjects, request snapshots, fees, approval modes, and edit audit.

-- Composite tenant-safe keys used by new relations. These are additive because
-- the id columns are already globally unique.
CREATE UNIQUE INDEX `HomeownerProfile_tenantId_id_key` ON `HomeownerProfile`(`tenantId`, `id`);
CREATE UNIQUE INDEX `DocumentTemplate_tenantId_id_key` ON `DocumentTemplate`(`tenantId`, `id`);
CREATE UNIQUE INDEX `OrganizationOfficer_tenantId_id_key` ON `OrganizationOfficer`(`tenantId`, `id`);

ALTER TABLE `DocumentRequest`
  ADD COLUMN `configurationId` VARCHAR(191) NULL,
  ADD COLUMN `configurationVersion` INTEGER NULL,
  ADD COLUMN `templateIdSnapshot` VARCHAR(191) NULL,
  ADD COLUMN `templateVersionSnapshot` INTEGER NULL,
  ADD COLUMN `subjectType` ENUM('SELF', 'HOUSEHOLD_MEMBER') NOT NULL DEFAULT 'SELF',
  ADD COLUMN `subjectMemberId` VARCHAR(191) NULL,
  ADD COLUMN `subjectSnapshot` JSON NULL,
  ADD COLUMN `requestDataSnapshot` JSON NULL,
  ADD COLUMN `reviewedDataSnapshot` JSON NULL,
  ADD COLUMN `deliveryModeSnapshot` ENUM('INSTANT_DOWNLOAD', 'APPROVAL_REQUIRED', 'PAYMENT_REQUIRED', 'PAYMENT_AND_APPROVAL_REQUIRED', 'REQUEST_ONLY') NULL,
  ADD COLUMN `approvalRequiredSnapshot` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `paymentRequiredSnapshot` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `feeAmountSnapshot` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `numberOfCopies` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `issueDate` DATE NULL,
  ADD COLUMN `readyForDownloadAt` DATETIME(3) NULL,
  MODIFY `status` ENUM('DRAFT', 'SUBMITTED', 'PAYMENT_PENDING', 'PENDING_APPROVAL', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'READY_FOR_DOWNLOAD', 'GENERATED', 'DOWNLOADED', 'CANCELLED') NOT NULL DEFAULT 'SUBMITTED';

ALTER TABLE `DocumentRequestHistory`
  MODIFY `status` ENUM('DRAFT', 'SUBMITTED', 'PAYMENT_PENDING', 'PENDING_APPROVAL', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'READY_FOR_DOWNLOAD', 'GENERATED', 'DOWNLOADED', 'CANCELLED') NOT NULL;

CREATE TABLE `HouseholdMember` (
  `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default',
  `id` VARCHAR(191) NOT NULL,
  `homeownerId` VARCHAR(191) NOT NULL,
  `fullName` VARCHAR(191) NOT NULL,
  `relationship` VARCHAR(191) NOT NULL,
  `birthDate` DATE NULL,
  `civilStatus` VARCHAR(191) NULL,
  `nationality` VARCHAR(191) NULL,
  `address` VARCHAR(191) NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `HouseholdMember_tenantId_id_key`(`tenantId`, `id`),
  INDEX `HouseholdMember_tenantId_homeownerId_active_idx`(`tenantId`, `homeownerId`, `active`),
  INDEX `HouseholdMember_tenantId_idx`(`tenantId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `DocumentTypeConfiguration` (
  `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default',
  `id` VARCHAR(191) NOT NULL,
  `type` ENUM('CERTIFICATE_OF_RESIDENCY', 'CERTIFICATE_OF_GOOD_STANDING', 'CLEARANCE_CERTIFICATE', 'PAYMENT_CERTIFICATION', 'CONSTRUCTION_BOND_CERTIFICATION', 'CONTRACTOR_BOND_CERTIFICATION', 'GATE_PASS', 'MOVE_IN_OUT_PASS') NOT NULL,
  `displayName` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `templateId` VARCHAR(191) NULL,
  `deliveryMode` ENUM('INSTANT_DOWNLOAD', 'APPROVAL_REQUIRED', 'PAYMENT_REQUIRED', 'PAYMENT_AND_APPROVAL_REQUIRED', 'REQUEST_ONLY') NOT NULL DEFAULT 'APPROVAL_REQUIRED',
  `approvalRequired` BOOLEAN NOT NULL DEFAULT true,
  `paymentRequired` BOOLEAN NOT NULL DEFAULT false,
  `paymentBeforeApproval` BOOLEAN NOT NULL DEFAULT false,
  `allowImmediateDownload` BOOLEAN NOT NULL DEFAULT false,
  `allowRegeneration` BOOLEAN NOT NULL DEFAULT true,
  `requiresAdminReview` BOOLEAN NOT NULL DEFAULT true,
  `homeownerDownloadEnabled` BOOLEAN NOT NULL DEFAULT true,
  `validityDays` INTEGER NULL,
  `maxCopies` INTEGER NOT NULL DEFAULT 1,
  `feeAmount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `allowPayLater` BOOLEAN NOT NULL DEFAULT false,
  `signatoryOfficerId` VARCHAR(191) NULL,
  `version` INTEGER NOT NULL DEFAULT 1,
  `updatedById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `DocumentTypeConfiguration_tenantId_id_key`(`tenantId`, `id`),
  UNIQUE INDEX `DocumentTypeConfiguration_tenantId_type_key`(`tenantId`, `type`),
  INDEX `DocumentTypeConfiguration_tenantId_active_idx`(`tenantId`, `active`),
  INDEX `DocumentTypeConfiguration_templateId_idx`(`templateId`),
  INDEX `DocumentTypeConfiguration_signatoryOfficerId_idx`(`signatoryOfficerId`),
  INDEX `DocumentTypeConfiguration_updatedById_idx`(`updatedById`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `DocumentFieldConfiguration` (
  `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default',
  `id` VARCHAR(191) NOT NULL,
  `configId` VARCHAR(191) NOT NULL,
  `key` VARCHAR(191) NOT NULL,
  `label` VARCHAR(191) NOT NULL,
  `fieldType` ENUM('TEXT', 'TEXTAREA', 'DATE', 'NUMBER', 'MONEY', 'SELECT', 'CHECKBOX') NOT NULL,
  `required` BOOLEAN NOT NULL DEFAULT false,
  `options` JSON NULL,
  `validation` JSON NULL,
  `displayOrder` INTEGER NOT NULL DEFAULT 0,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `DocumentFieldConfiguration_tenantId_configId_key_key`(`tenantId`, `configId`, `key`),
  INDEX `DocumentFieldConfiguration_tenantId_configId_active_displayO_idx`(`tenantId`, `configId`, `active`, `displayOrder`),
  INDEX `DocumentFieldConfiguration_tenantId_idx`(`tenantId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `DocumentRequestEditAudit` (
  `tenantId` VARCHAR(191) NOT NULL DEFAULT 'tenant_pagsibol4b_default',
  `id` VARCHAR(191) NOT NULL,
  `requestId` VARCHAR(191) NOT NULL,
  `actorId` VARCHAR(191) NULL,
  `fieldName` VARCHAR(191) NOT NULL,
  `previousValue` JSON NULL,
  `newValue` JSON NULL,
  `note` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `DocumentRequestEditAudit_tenantId_requestId_createdAt_idx`(`tenantId`, `requestId`, `createdAt`),
  INDEX `DocumentRequestEditAudit_actorId_idx`(`actorId`),
  INDEX `DocumentRequestEditAudit_tenantId_idx`(`tenantId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `DocumentRequest_tenantId_configurationId_idx` ON `DocumentRequest`(`tenantId`, `configurationId`);
CREATE INDEX `DocumentRequest_tenantId_subjectMemberId_idx` ON `DocumentRequest`(`tenantId`, `subjectMemberId`);
CREATE UNIQUE INDEX `DocumentRequest_tenantId_id_key` ON `DocumentRequest`(`tenantId`, `id`);

ALTER TABLE `HouseholdMember`
  ADD CONSTRAINT `HouseholdMember_tenantId_homeownerId_fkey`
  FOREIGN KEY (`tenantId`, `homeownerId`) REFERENCES `HomeownerProfile`(`tenantId`, `id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `DocumentTypeConfiguration`
  ADD CONSTRAINT `DocumentTypeConfiguration_tenantId_templateId_fkey`
  FOREIGN KEY (`tenantId`, `templateId`) REFERENCES `DocumentTemplate`(`tenantId`, `id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `DocumentTypeConfiguration`
  ADD CONSTRAINT `DocumentTypeConfiguration_tenantId_signatoryOfficerId_fkey`
  FOREIGN KEY (`tenantId`, `signatoryOfficerId`) REFERENCES `OrganizationOfficer`(`tenantId`, `id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `DocumentTypeConfiguration`
  ADD CONSTRAINT `DocumentTypeConfiguration_updatedById_fkey`
  FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `DocumentFieldConfiguration`
  ADD CONSTRAINT `DocumentFieldConfiguration_tenantId_configId_fkey`
  FOREIGN KEY (`tenantId`, `configId`) REFERENCES `DocumentTypeConfiguration`(`tenantId`, `id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `DocumentRequest`
  ADD CONSTRAINT `DocumentRequest_tenantId_configurationId_fkey`
  FOREIGN KEY (`tenantId`, `configurationId`) REFERENCES `DocumentTypeConfiguration`(`tenantId`, `id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `DocumentRequest`
  ADD CONSTRAINT `DocumentRequest_tenantId_subjectMemberId_fkey`
  FOREIGN KEY (`tenantId`, `subjectMemberId`) REFERENCES `HouseholdMember`(`tenantId`, `id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `DocumentRequestEditAudit`
  ADD CONSTRAINT `DocumentRequestEditAudit_tenantId_requestId_fkey`
  FOREIGN KEY (`tenantId`, `requestId`) REFERENCES `DocumentRequest`(`tenantId`, `id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `DocumentRequestEditAudit`
  ADD CONSTRAINT `DocumentRequestEditAudit_actorId_fkey`
  FOREIGN KEY (`actorId`) REFERENCES `User`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Tenant catalog backfill: one configuration per supported type per tenant.
INSERT INTO `DocumentTypeConfiguration` (
  `id`, `tenantId`, `type`, `displayName`, `description`, `active`, `templateId`,
  `deliveryMode`, `approvalRequired`, `paymentRequired`, `paymentBeforeApproval`,
  `allowImmediateDownload`, `allowRegeneration`, `requiresAdminReview`,
  `homeownerDownloadEnabled`, `validityDays`, `maxCopies`, `feeAmount`,
  `allowPayLater`, `version`, `createdAt`, `updatedAt`
)
SELECT
  CONCAT('dtc_', REPLACE(UUID(), '-', '')),
  t.`id`,
  dt.`type`,
  dt.`displayName`,
  dt.`description`,
  CASE WHEN tpl.`id` IS NULL THEN false ELSE tpl.`active` END,
  tpl.`id`,
  'APPROVAL_REQUIRED',
  true,
  false,
  false,
  false,
  true,
  true,
  true,
  dt.`validityDays`,
  1,
  0,
  false,
  1,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM `Tenant` t
JOIN (
  SELECT 'CERTIFICATE_OF_RESIDENCY' AS `type`, 'Certificate of Residency' AS `displayName`, 'Proof of residency for a homeowner or registered household member.' AS `description`, 365 AS `validityDays`
  UNION ALL SELECT 'CERTIFICATE_OF_GOOD_STANDING', 'Certificate of Good Standing', 'Account and HOA standing certification.', 365
  UNION ALL SELECT 'CLEARANCE_CERTIFICATE', 'Clearance Certificate', 'HOA clearance for transfer, move-out, or official use.', 365
  UNION ALL SELECT 'PAYMENT_CERTIFICATION', 'Payment Certification', 'Certification of recorded HOA payments.', 365
  UNION ALL SELECT 'CONSTRUCTION_BOND_CERTIFICATION', 'Construction Bond Certification', 'Certification related to refundable construction bonds.', 365
  UNION ALL SELECT 'CONTRACTOR_BOND_CERTIFICATION', 'Contractor Bond Certification', 'Certification related to contractor bond records.', 365
  UNION ALL SELECT 'GATE_PASS', 'Gate Pass', 'Gate pass for visitors, deliveries, vehicles, or contractors.', 7
  UNION ALL SELECT 'MOVE_IN_OUT_PASS', 'Move In / Move Out Pass', 'Gate authorization for move-in or move-out activity.', 7
) dt
LEFT JOIN `DocumentTemplate` tpl ON tpl.`tenantId` = t.`id` AND tpl.`type` = dt.`type`
LEFT JOIN `DocumentTypeConfiguration` existing ON existing.`tenantId` = t.`id` AND existing.`type` = dt.`type`
WHERE existing.`id` IS NULL;

-- Default tenant-configurable field definitions. Administrators may revise
-- these after migration; requests snapshot the active definitions at submit time.
INSERT INTO `DocumentFieldConfiguration` (
  `id`, `tenantId`, `configId`, `key`, `label`, `fieldType`, `required`, `options`,
  `displayOrder`, `active`, `createdAt`, `updatedAt`
)
SELECT CONCAT('dfc_', REPLACE(UUID(), '-', '')), c.`tenantId`, c.`id`, f.`key`, f.`label`, f.`fieldType`, f.`required`, f.`options`, f.`displayOrder`, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `DocumentTypeConfiguration` c
JOIN (
  SELECT 'ALL' AS `appliesTo`, 'purpose' AS `key`, 'Purpose' AS `label`, 'TEXTAREA' AS `fieldType`, true AS `required`, NULL AS `options`, 10 AS `displayOrder`
  UNION ALL SELECT 'ALL', 'remarks', 'Additional remarks', 'TEXTAREA', false, NULL, 20
  UNION ALL SELECT 'CERTIFICATE_OF_RESIDENCY', 'residencyStartDate', 'Residency start date', 'DATE', false, NULL, 30
  UNION ALL SELECT 'CONTRACTOR_BOND_CERTIFICATION', 'contractorDetails', 'Contractor details', 'TEXTAREA', true, NULL, 30
  UNION ALL SELECT 'GATE_PASS', 'scheduledDate', 'Valid date', 'DATE', true, NULL, 30
  UNION ALL SELECT 'GATE_PASS', 'startTime', 'Start time', 'TEXT', true, NULL, 40
  UNION ALL SELECT 'GATE_PASS', 'endTime', 'End time', 'TEXT', true, NULL, 50
  UNION ALL SELECT 'GATE_PASS', 'partyName', 'Authorized person or party', 'TEXT', true, NULL, 60
  UNION ALL SELECT 'GATE_PASS', 'destination', 'Destination', 'TEXT', false, NULL, 70
  UNION ALL SELECT 'GATE_PASS', 'vehicleDetails', 'Item, vehicle, or cargo details', 'TEXTAREA', false, NULL, 80
  UNION ALL SELECT 'MOVE_IN_OUT_PASS', 'passType', 'Pass type', 'SELECT', true, JSON_ARRAY('MOVE_IN', 'MOVE_OUT'), 30
  UNION ALL SELECT 'MOVE_IN_OUT_PASS', 'scheduledDate', 'Valid date', 'DATE', true, NULL, 40
  UNION ALL SELECT 'MOVE_IN_OUT_PASS', 'startTime', 'Start time', 'TEXT', true, NULL, 50
  UNION ALL SELECT 'MOVE_IN_OUT_PASS', 'endTime', 'End time', 'TEXT', true, NULL, 60
  UNION ALL SELECT 'MOVE_IN_OUT_PASS', 'partyName', 'Authorized person or moving party', 'TEXT', true, NULL, 70
  UNION ALL SELECT 'MOVE_IN_OUT_PASS', 'representativeName', 'Driver or representative', 'TEXT', false, NULL, 80
  UNION ALL SELECT 'MOVE_IN_OUT_PASS', 'contractorDetails', 'Contractor or mover', 'TEXTAREA', false, NULL, 90
  UNION ALL SELECT 'MOVE_IN_OUT_PASS', 'propertyDetails', 'Property or unit details', 'TEXT', false, NULL, 100
  UNION ALL SELECT 'MOVE_IN_OUT_PASS', 'vehicleDetails', 'Vehicle, truck, item, or cargo details', 'TEXTAREA', false, NULL, 110
) f ON f.`appliesTo` = 'ALL' OR f.`appliesTo` = c.`type`
LEFT JOIN `DocumentFieldConfiguration` existing ON existing.`tenantId` = c.`tenantId` AND existing.`configId` = c.`id` AND existing.`key` = f.`key`
WHERE existing.`id` IS NULL;

-- Existing request compatibility backfill. Legacy generated documents and
-- approval outcomes remain unchanged; these columns only snapshot what was
-- already present at the time of migration.
UPDATE `DocumentRequest` r
LEFT JOIN `DocumentTypeConfiguration` c ON c.`tenantId` = r.`tenantId` AND c.`type` = r.`type`
LEFT JOIN `DocumentTemplate` tpl ON tpl.`tenantId` = r.`tenantId` AND tpl.`type` = r.`type`
LEFT JOIN `HomeownerProfile` h ON h.`id` = r.`homeownerId`
LEFT JOIN `User` u ON u.`id` = h.`userId`
SET
  r.`configurationId` = COALESCE(r.`configurationId`, c.`id`),
  r.`configurationVersion` = COALESCE(r.`configurationVersion`, c.`version`, 1),
  r.`templateIdSnapshot` = COALESCE(r.`templateIdSnapshot`, tpl.`id`),
  r.`templateVersionSnapshot` = COALESCE(r.`templateVersionSnapshot`, r.`templateVersion`, tpl.`version`),
  r.`subjectType` = COALESCE(r.`subjectType`, 'SELF'),
  r.`subjectSnapshot` = COALESCE(
    r.`subjectSnapshot`,
    r.`homeownerSnapshot`,
    JSON_OBJECT(
      'type', 'SELF',
      'fullName', COALESCE(u.`name`, ''),
      'relationship', 'Homeowner',
      'address', COALESCE(h.`address`, ''),
      'block', COALESCE(h.`block`, ''),
      'lot', COALESCE(h.`lot`, ''),
      'phone', COALESCE(h.`phone`, ''),
      'birthDate', h.`birthDate`,
      'civilStatus', h.`civilStatus`,
      'nationality', h.`citizenship`
    )
  ),
  r.`requestDataSnapshot` = COALESCE(
    r.`requestDataSnapshot`,
    JSON_OBJECT(
      'purpose', r.`purpose`,
      'remarks', r.`remarks`,
      'validityDate', r.`validityDate`,
      'scheduledDate', r.`scheduledDate`,
      'startTime', r.`startTime`,
      'endTime', r.`endTime`,
      'passType', r.`passType`,
      'vehicleDetails', r.`vehicleDetails`,
      'partyName', r.`partyName`,
      'contractorDetails', r.`contractorDetails`,
      'representativeName', r.`representativeName`,
      'propertyDetails', r.`propertyDetails`
    )
  ),
  r.`deliveryModeSnapshot` = COALESCE(r.`deliveryModeSnapshot`, 'APPROVAL_REQUIRED'),
  r.`approvalRequiredSnapshot` = true,
  r.`paymentRequiredSnapshot` = false,
  r.`feeAmountSnapshot` = COALESCE(r.`feeAmountSnapshot`, 0),
  r.`numberOfCopies` = COALESCE(r.`numberOfCopies`, 1),
  r.`issueDate` = COALESCE(r.`issueDate`, DATE(r.`approvedAt`), DATE(r.`generatedAt`)),
  r.`readyForDownloadAt` = COALESCE(r.`readyForDownloadAt`, r.`generatedAt`)
WHERE r.`configurationId` IS NULL OR r.`subjectSnapshot` IS NULL OR r.`requestDataSnapshot` IS NULL;
