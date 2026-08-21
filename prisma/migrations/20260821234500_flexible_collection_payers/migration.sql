-- Extend Collection payer authority for renter and other external payers.
-- Existing HOMEOWNER/CONTRACTOR values remain valid and unchanged.
ALTER TABLE `Collection`
  MODIFY COLUMN `payerType` ENUM('HOMEOWNER','CONTRACTOR','RENTER','OTHER') NOT NULL,
  ADD COLUMN `payerName` VARCHAR(191) NULL AFTER `payerType`;

CREATE INDEX `Collection_tenantId_payerType_collectionDate_idx`
  ON `Collection`(`tenantId`, `payerType`, `collectionDate`);
