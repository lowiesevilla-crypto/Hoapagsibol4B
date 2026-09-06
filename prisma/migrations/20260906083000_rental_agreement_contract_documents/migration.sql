-- Rental agreement contract documents: immutable generated snapshot plus optional signed upload metadata.
-- Generated binaries are rendered on demand from the snapshot; signed files remain tenant-scoped in storage.

CREATE TABLE `RentalAgreementDocument` (
  `tenantId` VARCHAR(191) NOT NULL,
  `id` VARCHAR(191) NOT NULL,
  `agreementId` VARCHAR(191) NOT NULL,
  `version` INT NOT NULL DEFAULT 1,
  `contractNumber` VARCHAR(80) NOT NULL,
  `snapshot` JSON NOT NULL,
  `generatedById` VARCHAR(191) NULL,
  `generatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `signedOriginalName` VARCHAR(255) NULL,
  `signedStoredName` VARCHAR(255) NULL,
  `signedContentType` VARCHAR(120) NULL,
  `signedFileSize` INT NULL,
  `signedSha256` VARCHAR(64) NULL,
  `signedUploadedById` VARCHAR(191) NULL,
  `signedUploadedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `RentalAgreementDocument_tenantId_id_key` (`tenantId`,`id`),
  UNIQUE INDEX `RentalAgreementDocument_tenantId_agreementId_version_key` (`tenantId`,`agreementId`,`version`),
  UNIQUE INDEX `RentalAgreementDocument_tenantId_contractNumber_key` (`tenantId`,`contractNumber`),
  INDEX `RentalAgreementDocument_tenantId_agreementId_generatedAt_idx` (`tenantId`,`agreementId`,`generatedAt`),
  INDEX `RentalAgreementDocument_signedUploadedById_idx` (`signedUploadedById`),
  CONSTRAINT `RentalAgreementDocument_tenantId_agreementId_fkey`
    FOREIGN KEY (`tenantId`,`agreementId`) REFERENCES `RentalAgreement`(`tenantId`,`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `RentalAgreementDocument_generatedById_fkey`
    FOREIGN KEY (`generatedById`) REFERENCES `User`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `RentalAgreementDocument_signedUploadedById_fkey`
    FOREIGN KEY (`signedUploadedById`) REFERENCES `User`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Backfill all existing agreements so currently active/ended contracts become immediately downloadable.
INSERT INTO `RentalAgreementDocument`
  (`tenantId`,`id`,`agreementId`,`version`,`contractNumber`,`snapshot`,`generatedAt`,`createdAt`,`updatedAt`)
SELECT
  a.`tenantId`,
  UUID(),
  a.`id`,
  1,
  CONCAT('RA-', DATE_FORMAT(a.`startDate`, '%Y'), '-', UPPER(RIGHT(REPLACE(a.`id`, '-', ''), 12))),
  JSON_OBJECT(
    'agreementId', a.`id`,
    'associationName', t.`name`,
    'associationShortName', t.`shortName`,
    'associationAddress', t.`address`,
    'associationContactNumber', t.`contactNumber`,
    'associationEmail', t.`email`,
    'associationSecRegistrationNumber', t.`secRegistrationNumber`,
    'associationTinNumber', t.`tinNumber`,
    'renterName', r.`fullName`,
    'renterEmail', r.`email`,
    'renterPhone', r.`phone`,
    'renterAddress', r.`address`,
    'homeownerId', r.`homeownerId`,
    'homeownerName', u.`name`,
    'homeownerAccountNumber', h.`accountNumber`,
    'homeownerBlock', h.`block`,
    'homeownerLot', h.`lot`,
    'assetCode', ra.`code`,
    'assetName', ra.`name`,
    'assetType', ra.`type`,
    'assetLocation', ra.`location`,
    'startDate', DATE_FORMAT(a.`startDate`, '%Y-%m-%d'),
    'endDate', IF(a.`endDate` IS NULL, NULL, DATE_FORMAT(a.`endDate`, '%Y-%m-%d')),
    'monthlyRate', CAST(a.`monthlyRate` AS CHAR),
    'securityDeposit', CAST(a.`securityDeposit` AS CHAR),
    'billingDay', a.`billingDay`,
    'dueDay', a.`dueDay`,
    'notes', a.`notes`
  ),
  a.`createdAt`,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM `RentalAgreement` a
JOIN `RentalAsset` ra ON ra.`tenantId`=a.`tenantId` AND ra.`id`=a.`assetId`
JOIN `Renter` r ON r.`tenantId`=a.`tenantId` AND r.`id`=a.`renterId`
JOIN `Tenant` t ON t.`id`=a.`tenantId`
LEFT JOIN `HomeownerProfile` h ON h.`tenantId`=r.`tenantId` AND h.`id`=r.`homeownerId`
LEFT JOIN `User` u ON u.`id`=h.`userId`;

-- Every newly activated agreement is born with a frozen contract snapshot, even if a caller
-- bypasses the normal server action. RentalAgreement is created ACTIVE in the current workflow.
CREATE TRIGGER `RentalAgreement_contract_document_after_insert`
AFTER INSERT ON `RentalAgreement`
FOR EACH ROW
INSERT INTO `RentalAgreementDocument`
  (`tenantId`,`id`,`agreementId`,`version`,`contractNumber`,`snapshot`,`generatedAt`,`createdAt`,`updatedAt`)
SELECT
  NEW.`tenantId`,
  UUID(),
  NEW.`id`,
  1,
  CONCAT('RA-', DATE_FORMAT(NEW.`startDate`, '%Y'), '-', UPPER(RIGHT(REPLACE(NEW.`id`, '-', ''), 12))),
  JSON_OBJECT(
    'agreementId', NEW.`id`,
    'associationName', t.`name`,
    'associationShortName', t.`shortName`,
    'associationAddress', t.`address`,
    'associationContactNumber', t.`contactNumber`,
    'associationEmail', t.`email`,
    'associationSecRegistrationNumber', t.`secRegistrationNumber`,
    'associationTinNumber', t.`tinNumber`,
    'renterName', r.`fullName`,
    'renterEmail', r.`email`,
    'renterPhone', r.`phone`,
    'renterAddress', r.`address`,
    'homeownerId', r.`homeownerId`,
    'homeownerName', u.`name`,
    'homeownerAccountNumber', h.`accountNumber`,
    'homeownerBlock', h.`block`,
    'homeownerLot', h.`lot`,
    'assetCode', ra.`code`,
    'assetName', ra.`name`,
    'assetType', ra.`type`,
    'assetLocation', ra.`location`,
    'startDate', DATE_FORMAT(NEW.`startDate`, '%Y-%m-%d'),
    'endDate', IF(NEW.`endDate` IS NULL, NULL, DATE_FORMAT(NEW.`endDate`, '%Y-%m-%d')),
    'monthlyRate', CAST(NEW.`monthlyRate` AS CHAR),
    'securityDeposit', CAST(NEW.`securityDeposit` AS CHAR),
    'billingDay', NEW.`billingDay`,
    'dueDay', NEW.`dueDay`,
    'notes', NEW.`notes`
  ),
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM `RentalAsset` ra
JOIN `Renter` r ON r.`tenantId`=NEW.`tenantId` AND r.`id`=NEW.`renterId`
JOIN `Tenant` t ON t.`id`=NEW.`tenantId`
LEFT JOIN `HomeownerProfile` h ON h.`tenantId`=r.`tenantId` AND h.`id`=r.`homeownerId`
LEFT JOIN `User` u ON u.`id`=h.`userId`
WHERE ra.`tenantId`=NEW.`tenantId` AND ra.`id`=NEW.`assetId`;
