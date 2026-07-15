-- Preserve Payment as the transaction header and receipt entity while adding
-- tenant-safe allocation rows for one-to-many bill coverage.

ALTER TABLE `Payment`
  DROP FOREIGN KEY `Payment_billId_fkey`;

ALTER TABLE `Payment`
  MODIFY `billId` VARCHAR(191) NULL,
  ADD COLUMN `idempotencyKey` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `Payment_tenantId_idempotencyKey_key`
  ON `Payment`(`tenantId`, `idempotencyKey`);
CREATE UNIQUE INDEX `Payment_tenantId_id_key`
  ON `Payment`(`tenantId`, `id`);
CREATE UNIQUE INDEX `Bill_tenantId_id_key`
  ON `Bill`(`tenantId`, `id`);

CREATE TABLE `PaymentAllocation` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `paymentId` VARCHAR(191) NOT NULL,
  `billId` VARCHAR(191) NOT NULL,
  `amount` DECIMAL(12, 2) NOT NULL,
  `coverageYear` INTEGER NULL,
  `coverageMonth` INTEGER NULL,
  `coverageLabel` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `PaymentAllocation_paymentId_billId_key`
  ON `PaymentAllocation`(`paymentId`, `billId`);
CREATE INDEX `PaymentAllocation_tenantId_paymentId_idx`
  ON `PaymentAllocation`(`tenantId`, `paymentId`);
CREATE INDEX `PaymentAllocation_tenantId_billId_idx`
  ON `PaymentAllocation`(`tenantId`, `billId`);

ALTER TABLE `Payment`
  ADD CONSTRAINT `Payment_billId_fkey`
    FOREIGN KEY (`billId`) REFERENCES `Bill`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `PaymentAllocation`
  ADD CONSTRAINT `PaymentAllocation_tenantId_fkey`
    FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `PaymentAllocation_tenantId_paymentId_fkey`
    FOREIGN KEY (`tenantId`, `paymentId`) REFERENCES `Payment`(`tenantId`, `id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `PaymentAllocation_tenantId_billId_fkey`
    FOREIGN KEY (`tenantId`, `billId`) REFERENCES `Bill`(`tenantId`, `id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Historical rows remain separate payment headers and keep their original IDs,
-- amounts, batch IDs, and receipt numbers. Each receives one allocation only.
INSERT INTO `PaymentAllocation` (
  `id`,
  `tenantId`,
  `paymentId`,
  `billId`,
  `amount`,
  `coverageYear`,
  `coverageMonth`,
  `coverageLabel`,
  `createdAt`
)
SELECT
  CONCAT('legacy_', payment.`id`),
  payment.`tenantId`,
  payment.`id`,
  payment.`billId`,
  payment.`amount`,
  bill.`coverageYear`,
  bill.`coverageMonth`,
  DATE_FORMAT(bill.`billingMonth`, '%M %Y'),
  payment.`createdAt`
FROM `Payment` AS payment
INNER JOIN `Bill` AS bill
  ON bill.`id` = payment.`billId`
 AND bill.`tenantId` = payment.`tenantId`
WHERE payment.`billId` IS NOT NULL;
