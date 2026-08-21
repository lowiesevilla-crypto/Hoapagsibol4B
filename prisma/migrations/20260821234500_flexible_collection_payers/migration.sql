-- Flexible collection payer metadata.
-- Keep the legacy Prisma PayerType column intact for compatibility while making
-- payerCategory the authoritative business category for collections.
ALTER TABLE `Collection`
  ADD COLUMN `payerCategory` VARCHAR(20) NULL AFTER `payerType`,
  ADD COLUMN `payerName` VARCHAR(191) NULL AFTER `payerCategory`;

UPDATE `Collection`
SET `payerCategory` = CAST(`payerType` AS CHAR)
WHERE `payerCategory` IS NULL;

ALTER TABLE `Collection`
  MODIFY `payerCategory` VARCHAR(20) NOT NULL;

CREATE INDEX `Collection_tenantId_payerCategory_collectionDate_idx`
  ON `Collection`(`tenantId`, `payerCategory`, `collectionDate`);
