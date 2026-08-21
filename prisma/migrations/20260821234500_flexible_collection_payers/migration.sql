-- Flexible collection payer metadata.
-- Keep the legacy Prisma PayerType column intact for compatibility while making
-- payerCategory authoritative when a flexible collection writes it. The column
-- remains nullable so existing collection writers that still rely on payerType
-- continue to work; readers fall back to payerType when payerCategory is NULL.
ALTER TABLE `Collection`
  ADD COLUMN `payerCategory` VARCHAR(20) NULL AFTER `payerType`,
  ADD COLUMN `payerName` VARCHAR(191) NULL AFTER `payerCategory`;

UPDATE `Collection`
SET `payerCategory` = CAST(`payerType` AS CHAR)
WHERE `payerCategory` IS NULL;

CREATE INDEX `Collection_tenantId_payerCategory_collectionDate_idx`
  ON `Collection`(`tenantId`, `payerCategory`, `collectionDate`);
