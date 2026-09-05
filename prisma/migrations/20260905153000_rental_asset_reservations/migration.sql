-- Rental Asset Reservations: tenant-scoped homeowner holds on AVAILABLE rental inventory.
-- The generated activeAssetKey plus tenant-scoped unique index is the database-level
-- concurrency backstop: terminal history rows resolve to NULL and do not block later holds.

CREATE TABLE `RentalAssetReservation` (
  `tenantId` VARCHAR(191) NOT NULL,
  `id` VARCHAR(191) NOT NULL,
  `assetId` VARCHAR(191) NOT NULL,
  `homeownerId` VARCHAR(191) NOT NULL,
  `status` ENUM('ACTIVE','CANCELLED','FULFILLED') NOT NULL DEFAULT 'ACTIVE',
  `reservedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `cancelledAt` DATETIME(3) NULL,
  `fulfilledAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `activeAssetKey` VARCHAR(191) GENERATED ALWAYS AS (
    CASE WHEN `status` = 'ACTIVE' THEN `assetId` ELSE NULL END
  ) STORED,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `RentalAssetReservation_tenantId_id_key` (`tenantId`,`id`),
  UNIQUE INDEX `RentalAssetReservation_tenantId_activeAssetKey_key` (`tenantId`,`activeAssetKey`),
  INDEX `RentalAssetReservation_tenantId_assetId_status_idx` (`tenantId`,`assetId`,`status`),
  INDEX `RentalAssetReservation_tenantId_homeownerId_status_idx` (`tenantId`,`homeownerId`,`status`),
  INDEX `RentalAssetReservation_tenantId_reservedAt_idx` (`tenantId`,`reservedAt`),
  CONSTRAINT `RentalAssetReservation_tenantId_assetId_fkey`
    FOREIGN KEY (`tenantId`,`assetId`) REFERENCES `RentalAsset`(`tenantId`,`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `RentalAssetReservation_tenantId_homeownerId_fkey`
    FOREIGN KEY (`tenantId`,`homeownerId`) REFERENCES `HomeownerProfile`(`tenantId`,`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;